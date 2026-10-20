/**
 * The seam between storage and the wire.
 *
 * TWO kinds of file, and the split is the whole design (docs/p1-findings.md):
 *
 *   editing surfaces   `<DSH_HOME>/yiklek/mcp.json`
 *                      `<workspace>/.dsh/yiklek/mcp.json`      (per project)
 *   effective surface  `<profile>/cordis.patch.yml`
 *
 * Only a real profile entry reaches an agent's tool table, so editing surfaces
 * alone change nothing. Saving materialises every enabled server into a managed
 * region of the patch file, and every read folds that region back.
 *
 * Project isolation happens on TOP of that (docs/project-scope-plan.md): every
 * project's servers are materialised machine-wide, and each session then has the
 * other projects' tools DENIED via `agent.ctx.tools.restrict({ deny })`. That
 * keeps process count proportional to the number of projects, not sessions.
 */
import {
  toolPrefixOf,
  type Issue,
  type ListPayload,
  type McpDocument,
  MAX_PROJECT_SERVERS,
  type McpServerEntry,
  type ProjectView,
  type SyncState,
  type ImportPreview,
  type ServerStatus,
  emptyDocument,
} from '../shared.js'
import { existsSync } from 'node:fs'
import { globalConfigFile, projectConfigFile } from './paths.js'
import { adoptFromPatch, readPatchFile, writePatchFile, type PatchReadResult } from './patcher.js'
import {
  applyImport,
  exportConfig,
  previewImport as preview,
  type ExportResult,
} from './transfer.js'
import {
  denyToolsFor,
  denyToolsFromPatch,
  planEntries,
  workspaceIdFromServerName,
  type NamingPlan,
} from './naming.js'
import { sanitizeError } from './sanitize.js'
import { readDocument, revisionOf, writeDocument } from './store.js'
import { hasBlocking, validateDocument } from './validate.js'
import {
  canonicalPath,
  enabledWorkspaces,
  findWorkspace,
  workspaceIdOf,
  readState,
  registerWorkspace,
  setWorkspaceEnabled,
  writeState,
  type StateFile,
  type WorkspaceRecord,
} from './workspaces.js'

export interface ControllerOptions {
  /** The profile's `cordis.patch.yml`, from the host's `profileContext`. */
  patchPath?: string
  /** Reads the tool names currently visible in the global view. */
  listTools?: () => string[]
  log?: (message: string) => void
}

export type SaveScope = 'global' | 'project'

export interface SaveInput {
  scope: SaveScope
  /** Required for `project`. */
  workspaceRoot?: string
  servers: McpServerEntry[]
  /**
   * The revision the caller read.
   *
   * Several seats can be open at once (the plugin page, the sidebar page, a
   * session tab), each holding its own copy of the list. Without this check the
   * later save silently discarded the other one's change.
   */
  revision?: string
}

export interface SaveResult {
  ok: boolean
  /** Set when the file changed since the caller read it. */
  conflict?: boolean
  issues: Issue[]
  file?: string
  patch?: { file: string; changed: boolean }
}

export class Controller {
  private readonly patchPath?: string
  private readonly listTools: () => string[]
  private readonly log: (message: string) => void

  private globalDoc: McpDocument = emptyDocument()
  private globalError: string | undefined
  private projects = new Map<string, McpDocument>()
  private state: StateFile = { version: 1, workspaces: [] }
  private sync: SyncState = { materialized: [], adopted: [], renamed: [], skipped: [], drift: [] }
  private plan: NamingPlan = { materialized: [], renamed: [], shadowed: [], invalid: [] }
  /** Entries declared directly in the patch file; never adopted, never duplicated. */
  private externals: Array<{ serverName: string; entry: McpServerEntry }> = []
  /** Whether the last materialisation actually rewrote the patch file. */
  private lastWriteChanged = false

  constructor(options: ControllerOptions = {}) {
    this.patchPath = options.patchPath
    this.listTools = options.listTools ?? (() => [])
    this.log = options.log ?? (() => {})
  }

  get patchFile(): string | undefined {
    return this.patchPath
  }

  get loadError(): string | undefined {
    return this.sync.error
  }

  /** Registered workspaces, in registry order. */
  workspaces(): WorkspaceRecord[] {
    return this.state.workspaces
  }

  /**
   * Read every editing surface and converge with the effective one.
   *
   * Order: adopt first (so a hand-written patch entry appears in a panel), then
   * materialise (so what the panels hold is what runs). Adoption is idempotent,
   * so repeated calls settle.
   */
  /**
   * Adopt workspaces that hold a project config but were never registered.
   *
   * Registration used to happen only when the panel saved a project config, which
   * made a hand-written `<workspace>/.dsh/yiklek/mcp.json` invisible AND inert —
   * the exact complaint that produced this method. The candidate paths come from
   * the client, which is the only side that knows the Workspace list.
   */
  private adoptCandidates(candidates: readonly string[]): void {
    let changed = false
    for (const candidate of candidates) {
      if (candidate === '' || !existsSync(projectConfigFile(candidate))) continue
      const registered = registerWorkspace(this.state, candidate)
      if (!registered.added) continue
      this.state = registered.state
      changed = true
      this.log(`mcp-panel: adopted workspace ${registered.record.root} (it has a project config)`)
    }
    if (changed) writeState(this.state)
  }

  async refresh(candidates: readonly string[] = []): Promise<void> {
    this.state = readState()
    if (candidates.length > 0) this.adoptCandidates(candidates)
    const read = readDocument(globalConfigFile())
    this.globalDoc = read.document
    this.globalError = read.error

    this.projects = new Map()
    for (const record of this.state.workspaces) {
      this.projects.set(record.root, readDocument(projectConfigFile(record.root)).document)
    }

    if (this.patchPath === undefined) {
      this.sync = {
        materialized: [],
        adopted: [],
        renamed: [],
        skipped: [],
        drift: [],
        error: 'This profile exposes no patch file.',
      }
      return
    }

    const patch = readPatchFile(this.patchPath)
    if (patch.error !== undefined) {
      this.sync = { patchFile: this.patchPath, materialized: [], adopted: [], renamed: [], skipped: [], drift: [], error: patch.error }
      return
    }

    this.adopt(patch)
    await this.materialize()
  }

  /** Fold the patch file back into the editing surfaces. */
  private adopt(patch: PatchReadResult): void {
    const byId = new Map<string, string>()
    for (const record of this.state.workspaces) byId.set(record.id, record.root)

    const result = adoptFromPatch(this.globalDoc, this.projects, patch, byId)
    this.externals = result.externals
    if (result.changed) {
      writeDocument(globalConfigFile(), result.global, readDocument(globalConfigFile()).format ?? 'ours')
      this.globalDoc = result.global
      for (const [root, document] of result.projects) {
        writeDocument(projectConfigFile(root), document, readDocument(projectConfigFile(root)).format ?? 'ours')
        this.projects.set(root, document)
      }
      this.log(`mcp-panel: adopted ${result.adopted.map((item) => item.name).join(', ')} from the patch file`)
    }

    this.sync = {
      ...(this.patchPath === undefined ? {} : { patchFile: this.patchPath }),
      materialized: [],
      adopted: result.adopted,
      renamed: [],
      skipped: result.skipped,
      drift: result.adopted
        .filter((item) => item.scope === 'project' && item.workspaceRoot !== undefined)
        .map((item) => ({ root: item.workspaceRoot as string, message: `adopted ${item.name} from the profile patch file` })),
    }
  }

  /** Rewrite the managed region from the editing surfaces. */
  private async materialize(): Promise<void> {
    if (this.patchPath === undefined) return
    try {
      // A disabled workspace contributes nothing, so its MCP processes never
      // start — that is the per-workspace off switch.
      this.plan = planEntries(
        this.globalDoc,
        enabledWorkspaces(this.state).map((record) => ({
          root: record.root,
          document: this.projects.get(record.root) ?? null,
        })),
      )
      // Never materialise a name an external entry already declares: two entries
      // with the same `serverName` make the loader reject the profile.
      const externalNames = new Set(this.externals.map((item) => item.serverName))
      const materialized = this.plan.materialized.filter((item) => !externalNames.has(item.serverName))
      const result = writePatchFile(this.patchPath, materialized)
      const blocked = this.plan.materialized.length - materialized.length
      if (blocked > 0) {
        this.log(`mcp-panel: ${blocked} server(s) left alone because the patch file already declares them`)
      }
      this.sync.materialized = materialized.map((item) => item.serverName)
      this.sync.renamed = this.plan.renamed
      delete this.sync.error
      if (result.changed) {
        this.log(`mcp-panel: materialised ${this.plan.materialized.length} server(s) into ${result.file}`)
      }
    } catch (error) {
      this.sync.error = `Could not write the profile patch file: ${sanitizeError(error)}`
      this.sync.materialized = []
    }
  }

  /** Validate, write one editing surface, then materialise. */
  async save(input: SaveInput): Promise<SaveResult> {
    if (input.scope === 'project' && (input.workspaceRoot === undefined || input.workspaceRoot === '')) {
      return {
        ok: false,
        issues: [
          { level: 'blocking', path: '', code: 'workspace-required', message: 'Select a workspace first.' },
        ],
      }
    }

    const document: McpDocument = { version: 1, servers: input.servers }
    const issues = validateDocument(document)
    if (hasBlocking(issues)) return { ok: false, issues }

    // Optimistic concurrency: refuse to overwrite a file somebody else wrote.
    const target = input.scope === 'global' ? globalConfigFile() : projectConfigFile(canonicalPath(input.workspaceRoot as string))
    if (input.revision !== undefined && input.revision !== revisionOf(target)) {
      return {
        ok: false,
        conflict: true,
        issues: [
          {
            level: 'blocking',
            path: '',
            code: 'revision-conflict',
            message: 'This configuration changed in another window. Reloading is the safe next step.',
          },
        ],
      }
    }

    if (input.scope === 'global') {
      // Write back in the shape the file already had: it may be shared with
      // another client (a `.mcp.json` that Claude Code also reads), and rewriting
      // it in this plugin's own shape silently breaks that client.
      writeDocument(globalConfigFile(), document, readDocument(globalConfigFile()).format ?? 'ours')
      this.globalDoc = document
      this.globalError = undefined
      await this.materialize()
      return {
        ok: true,
        issues,
        file: globalConfigFile(),
        ...(this.patchPath === undefined ? {} : { patch: { file: this.patchPath, changed: this.lastWriteChanged } }),
      }
    }

    // A per-workspace cap: every project server becomes a profile entry and runs,
    // so the count is children spawned at every boot, not a display detail.
    if (input.servers.length > MAX_PROJECT_SERVERS) {
      return {
        ok: false,
        issues: [
          {
            level: 'blocking',
            path: '',
            code: 'too-many-servers',
            message: `A workspace may declare at most ${MAX_PROJECT_SERVERS} servers (this one has ${input.servers.length}). Every project server runs on every boot.`,
            params: { max: String(MAX_PROJECT_SERVERS), count: String(input.servers.length) },
          },
        ],
      }
    }

    const root = canonicalPath(input.workspaceRoot as string)
    const registered = registerWorkspace(this.state, root)
    if (registered.added) {
      this.state = registered.state
      writeState(this.state)
      this.log(`mcp-panel: registered workspace ${root}`)
    }
    writeDocument(projectConfigFile(root), document, readDocument(projectConfigFile(root)).format ?? 'ours')
    this.projects.set(root, document)
    await this.materialize()
    return {
      ok: true,
      issues,
      file: projectConfigFile(root),
      ...(this.patchPath === undefined ? {} : { patch: { file: this.patchPath, changed: this.lastWriteChanged } }),
    }
  }

  /** Turn a workspace's servers on or off (off means its processes never start). */
  async setWorkspaceEnabled(root: string, enabled: boolean): Promise<void> {
    this.state = setWorkspaceEnabled(this.state, root, enabled)
    writeState(this.state)
    await this.materialize()
  }

  /**
   * Tool names to deny for a session born in `cwd`.
   *
   * Everything belonging to a DIFFERENT workspace is denied; global servers and
   * this workspace's own stay. Built-in tools are never listed, and `deny` removes
   * exactly the names it carries (P2-a verified).
   */
  denyToolsFor(cwd: string | undefined): string[] {
    const root = cwd === undefined || cwd === '' ? undefined : canonicalPath(cwd)
    const tools = this.listTools()

    // Compute from the profile file when it is readable: it is what the loader
    // actually loaded. The cached plan is only a fallback, because it lags behind
    // an edit made outside the panel.
    if (this.patchPath !== undefined) {
      const patch = readPatchFile(this.patchPath)
      if (patch.error === undefined && patch.entries.length > 0) {
        const entries = patch.entries.map((item) => ({
          serverName: item.serverName,
          ...(item.origin?.scope === 'project' && item.origin.workspaceId !== undefined
            ? { workspaceId: item.origin.workspaceId }
            : {}),
        }))
        const workspaceId = root === undefined ? undefined : workspaceIdOf(root)
        return denyToolsFromPatch(entries, tools, workspaceId)
      }
    }

    return denyToolsFor(this.plan, tools, root)
  }

  /**
   * Parse an import without writing anything.
   *
   * Returns the parsed servers plus what applying them would do to the target
   * document, so the UI can show "new / replaced / skipped" before committing —
   * an import that silently overwrote a server would be a bad surprise.
   */
  /** What importing would do to one surface. Delegates to `transfer`. */
  previewImport(input: { json: unknown; scope: SaveScope; workspaceRoot?: string }): ImportPreview {
    return preview(this.documentFor(input.scope, input.workspaceRoot), input.json)
  }

  /** Apply an import: replace same-named servers, append the rest. */
  async applyImport(input: {
    json: unknown
    scope: SaveScope
    workspaceRoot?: string
    allowSseAsHttp?: boolean
  }): Promise<SaveResult> {
    const plan = applyImport(this.documentFor(input.scope, input.workspaceRoot), input.json, input.allowSseAsHttp === true)
    if (!plan.ok) return { ok: false, issues: plan.issues }
    return this.save({
      scope: input.scope,
      ...(input.workspaceRoot === undefined ? {} : { workspaceRoot: input.workspaceRoot }),
      servers: plan.servers,
    })
  }

  /** Serialize one editing surface for export. Redacted unless asked otherwise. */
  exportConfig(input: { scope: SaveScope; workspaceRoot?: string; redact?: boolean }): ExportResult {
    return exportConfig(this.documentFor(input.scope, input.workspaceRoot), input.redact !== false)
  }

  /** The editing document for a scope. */
  private documentFor(scope: SaveScope, workspaceRoot?: string): McpDocument {
    if (scope === 'global') return this.globalDoc
    if (workspaceRoot === undefined) return emptyDocument()
    return this.projects.get(canonicalPath(workspaceRoot)) ?? emptyDocument()
  }

  /** Per-server status, derived from what the loader actually registered. */
  statusSnapshot(): Record<string, ServerStatus> {
    const names = this.listTools()
    const now = Date.now()
    const statuses: Record<string, ServerStatus> = {}

    for (const item of this.plan.materialized) {
      const tools = names.filter((name) => name.startsWith(item.toolPrefix))
      statuses[item.serverName] =
        tools.length > 0 ? { state: 'connected', tools, at: now } : { state: 'connecting', tools: [], at: now }
    }


    // A project entry shadowed by a global name never reaches the plan, so it
    // gets an explicit "inert" row instead.
    for (const item of this.plan.shadowed) {
      if (statuses[item.entry.name] !== undefined) continue
      statuses[item.entry.name] = { state: 'disabled', tools: [], at: now }
    }

    // A server that exists in an editing surface but was not materialised (for
    // instance because it is disabled) still needs a row in the panel.
    for (const entry of this.globalDoc.servers) {
      const key = entry.name
      if (statuses[key] !== undefined) continue
      statuses[key] = { state: 'disabled', tools: [], at: now }
    }
    return statuses
  }

  /** Everything the client needs to render the panel. */
  list(): ListPayload {
    // Grouped FIRST: the projects below read it. Declaring it after them was a
    // temporal-dead-zone crash (`Cannot access 'shadowedByWorkspace' before
    // initialization`) that only shows up at runtime, never at typecheck.
    const shadowedByWorkspace = new Map<string, Array<{ name: string; reason: string }>>()
    for (const item of this.plan.shadowed) {
      const list = shadowedByWorkspace.get(item.workspaceRoot) ?? []
      list.push({ name: item.entry.name, reason: item.reason })
      shadowedByWorkspace.set(item.workspaceRoot, list)
    }

    const projects: ProjectView[] = this.state.workspaces.map((record) => {
      const document = this.projects.get(record.root) ?? emptyDocument()
      return {
        root: record.root,
        file: projectConfigFile(record.root),
        revision: revisionOf(projectConfigFile(record.root)),
        enabled: record.enabled !== false,
        exists: document.servers.length > 0,
        servers: document.servers,
        renamed: this.plan.renamed
          .filter((item) => item.scope === 'project' && item.workspaceRoot === record.root)
          .map((item) => ({ name: item.name, serverName: item.serverName })),
        shadowed: shadowedByWorkspace.get(record.root) ?? [],
      }
    })

    const issues: Issue[] = [
      ...validateDocument(this.globalDoc),
      ...(this.globalError === undefined
        ? []
        : [{ level: 'blocking' as const, path: '', code: 'file-invalid', message: this.globalError }]),
      ...(this.sync.error === undefined
        ? []
        : [{ level: 'warning' as const, path: '', code: 'patch-unsynced', message: this.sync.error }]),
      ...this.plan.invalid.map((item) => ({
        level: 'blocking' as const,
        path: '',
        code: 'name-invalid',
        message: `${item.name}: ${item.reason}`,
      })),
    ]

    return {
      global: {
        file: globalConfigFile(),
        exists: this.globalDoc.servers.length > 0,
        servers: this.globalDoc.servers,
        revision: revisionOf(globalConfigFile()),
      },
      projects,
      ...(this.patchPath === undefined ? {} : { patchFile: this.patchPath }),
      names: this.plan.materialized.map((item) => ({
        scope: item.scope,
        ...(item.workspaceRoot === undefined ? {} : { workspaceRoot: item.workspaceRoot }),
        name: item.entry.name,
        serverName: item.serverName,
      })),
      status: this.statusSnapshot(),
      issues,
      sync: this.syncState(),
      externals: this.externals.map((item) => ({
        serverName: item.serverName,
        transport: item.entry.transport,
        command: item.entry.transport === 'stdio' ? item.entry.command : item.entry.url,
      })),
    }
  }

  syncState(): SyncState {
    return { ...this.sync }
  }

  async dispose(): Promise<void> {
    // Nothing to release: the loader owns the mounts, and sessions own their
    // restrictions. Disposing this plugin deliberately leaves MCP servers
    // running, because they are independent profile entries.
  }
}

export { workspaceIdFromServerName, toolPrefixOf, findWorkspace }
