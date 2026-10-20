/**
 * dsh-mcp-panel — host half.
 *
 * There are two files and the split is the design (docs/p1-findings.md):
 *
 *   - `<DSH_HOME>/yiklek/mcp.json` is the EDITING surface the panel edits;
 *   - the profile's `cordis.patch.yml` is the EFFECTIVE surface, because only a
 *     real profile entry reaches an agent's tool table. A dynamically mounted
 *     client connects but stays invisible to the model.
 *
 * So every save materialises the enabled servers into a managed block of the
 * patch file, and every read folds that block back. `@deepseek-ai/dsh-hmr`
 * watches the file, so applying needs no restart.
 *
 * The exported `Config` is what makes this entry a *configurable plugin*, which
 * is how the settings service resolves the `mcp-panel` namespace: it looks the id
 * up among the profile's configurable entries and reads their `Config`. Without
 * it the namespace does not exist and every browser write is rejected with
 * `settings/rejected`.
 */
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { buildRoutes } from './server/api.js'
import { Controller } from './server/controller.js'

export const name = 'mcp-panel'

/**
 * No hard service dependency — deliberately.
 *
 * Everything the plugin needs is optional: `profileContext` supplies the patch
 * path, `tools` supplies the tool list for status, `webServer` carries the
 * browser routes. Putting `webServer` in `inject` once left the plugin `pending`
 * in every profile without a webserver, so nothing loaded at all.
 */
export const inject: string[] = []

const configSchema = Schema.object({
  version: Schema.natural().default(1),
  /**
   * Import `type: "sse"` entries as streamable-http instead of skipping them.
   * Off by default: the official client has no SSE transport (P0-verified).
   */
  allowSseAsHttp: Schema.boolean().default(false),
})

// DSH marks its own schemas volatile by patching schemastery's prototype; the
// published package has `extra()` but types it too narrowly for this key, so the
// metadata is written directly. `volatile` keeps the field editable at runtime
// instead of being frozen into the composed profile config.
;(configSchema.meta as unknown as Record<string, unknown>).volatile = true

export const Config = configSchema

/** The slice of the host webserver service this plugin uses. */
interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
    ) => void | Promise<void>
  }): () => void
}

/** The slice of `profileContext` this plugin uses. */
interface ProfileContextService {
  dir: string
  patchPath: string
}

/** The slice of the tools service used for status and per-agent restriction. */
interface ToolsService {
  schemas(scope?: object): Array<{ name: string }>
  restrict(filter: { allow?: string[]; deny?: string[] }): () => void
}

/** The slice of an agent this half uses. */
interface AgentLike {
  id: string
  session?: { header?: { cwd?: string } }
  ctx: { tools: ToolsService }
}

export function apply(ctx: Context): void {
  // `ctx.logger` is filtered in the headless profile (nothing reaches the log),
  // so lifecycle diagnostics go to stderr directly — the same channel DSH's own
  // boot warnings use. Keeping these few lines visible is what makes an
  // acceptance run diagnosable at all.
  const log = (message: string): void => {
    try {
      process.stderr.write(`dsh-mcp-panel: ${message}\n`)
    } catch {
      /* stderr unavailable during teardown */
    }
  }

  const profile = ctx.get('profileContext') as unknown as ProfileContextService | undefined
  if (profile === undefined || typeof profile.patchPath !== 'string') {
    log('mcp-panel: no `profileContext` service, so the profile patch file is unknown; nothing can be made effective.')
  }

  const controller = new Controller({
    ...(profile === undefined ? {} : { patchPath: profile.patchPath }),
    // The tools service's no-argument `schemas()` is documented as the global
    // view, which is exactly what the loader-registered entries land in.
    listTools: () => {
      const tools = ctx.get('tools') as unknown as ToolsService | undefined
      if (tools === undefined || typeof tools.schemas !== 'function') return []
      try {
        return tools.schemas().map((schema) => schema.name)
      } catch {
        return []
      }
    },
    log,
  })

  // Converge the two surfaces on startup, and re-converge whenever the panel
  // asks for a read (see `beforeRead` below) so outside edits are picked up.
  ctx.effect(() => {
    void controller.refresh().catch((error: unknown) => {
      log(`mcp-panel: initial load failed: ${String(error)}`)
    })
    return () => {
      void controller.dispose()
    }
  }, 'dsh-mcp-panel: reconcile')

  // Project isolation (docs/project-scope-plan.md).
  //
  // Every project's servers are materialised machine-wide, so a session in one
  // project would see the others' tools too. Each session therefore has the
  // tools of the OTHER projects denied. `restrict` must be called on the agent's
  // own context — a context-global restriction would mask every agent, and the
  // service rejects that outright.
  //
  // `session.header.cwd` is the directory the session was created in; it is
  // stamped at creation, so it is stable for the session (unlike the mutable
  // working-directory projection).
  // `agent/created` is contributed by dsh-agent, so it is not in the base
  // cordis Events type. Narrow the call site rather than widening the context.
  const onAgentCreated = (ctx as unknown as {
    on(event: string, listener: (payload: { agent: AgentLike }) => undefined): () => void
  }).on

  onAgentCreated.call(ctx, 'agent/created', ({ agent }) => {
    try {
      const cwd = agent.session?.header?.cwd
      const denied = controller.denyToolsFor(cwd)
      if (denied.length > 0) {
        agent.ctx.tools.restrict({ deny: denied })
        log(`mcp-panel: hid ${denied.length} tool(s) from session ${agent.id} (${cwd ?? 'no cwd'})`)
      }
    } catch (error) {
      log(`mcp-panel: could not scope ${agent.id}: ${String(error)}`)
    }
    return undefined
  })

  // The routes are OPTIONAL: cordis refuses `ctx.webServer` unless it was
  // injected, so the browser transport is wired in a conditional scope. It
  // activates wherever a webserver exists and is simply absent elsewhere
  // (headless, tui) without blocking the reconciliation above.
  ctx.inject(['webServer'], (scoped) => {
    const webServer = (scoped as unknown as { webServer: WebServerService }).webServer
    if (webServer === undefined) return

    const routes = buildRoutes({
      controller,
      log,
      // Re-reading on every request keeps the panel honest after the user edits
      // the patch file by hand; the reconcile is idempotent and cheap.
      beforeRead: async (candidates) => {
        await controller.refresh(candidates ?? [])
      },
    })

    const disposers = routes.map((route) => webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  })
}

/**
 * Test seam.
 *
 * The host half is bundled into a single `lib/host.mjs`, so the pure helpers are
 * re-exported here for `node --test` to exercise without booting DSH. Importing
 * this module has no side effects: `apply` is only called by the host runtime.
 */
export { parseDocument, exportDocument, envPlaceholder } from './server/normalize.js'
export { hasBlocking, validateDocument, validateEntry } from './server/validate.js'
export { readDocument, writeDocument } from './server/store.js'
export { serializeInFormat } from './server/normalize.js'
export { dshHome, globalConfigFile, projectConfigFile } from './server/paths.js'
export { sanitizeError } from './server/sanitize.js'
export { MAX_PROJECT_SERVERS } from './shared.js'
export {
  denyToolsFor,
  denyToolsFromPatch,
  entryIdFor,
  planEntries,
  withSuffix,
  workspaceIdFromServerName,
} from './server/naming.js'
export {
  canonicalPath,
  findWorkspace,
  readState,
  registerWorkspace,
  sessionWorkspaceRoot,
  stateFile,
  workspaceIdOf,
  writeState,
} from './server/workspaces.js'
export {
  CLIENT_PACKAGE,
  REGION_END,
  REGION_START,
  adoptFromPatch,
  buildPatchedText,
  findRegion,
  readPatchFile,
  renderManagedBlock,
  writePatchFile,
} from './server/patcher.js'
// Shared values the tests need to build fixtures with.
export {
  API_PREFIX,
  CONFIG_FILE_NAME,
  DEFAULT_TOOL_TIMEOUT_MS,
  NAMESPACE_DIR,
  SERVER_NAME_PATTERN,
  TRANSPORTS,
  emptyDocument,
  emptyEntry,
  toolPrefixOf,
} from './shared.js'

// ── test seam ────────────────────────────────────────────────────────────────
// The HTTP routes are tested directly: the contract (methods, query parameters,
// error shapes) lives nowhere else.
export { buildRoutes } from './server/api.js'
// Exported for the unit tests, which drive the real controller instead of a
// helper: `tsc` cannot see a temporal dead zone, so a runtime path has to be
// exercised to catch one.
export { Controller } from './server/controller.js'
export type { SaveInput, SaveResult } from './server/controller.js'
export type { SyncState, ImportPreview } from './shared.js'
