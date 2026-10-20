/**
 * HTTP surface for the browser half.
 *
 * Routes are registered on the host `webServer` service and the plugin keeps the
 * disposers, so uninstalling the plugin removes its routes. The browser calls
 * these with a plain `fetch` (same origin, no extra header — that is how the web
 * profile authenticates its own pages).
 *
 * Every handler answers JSON, including failures, so the client never has to
 * parse an HTML error page.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { API_PREFIX, type McpServerEntry } from '../shared.js'
import type { Controller } from './controller.js'

interface Route {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

/** Read a JSON request body, with a hard cap so a malformed client cannot exhaust memory. */
async function readJson(req: IncomingMessage, limitBytes = 2_000_000): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limitBytes) throw new Error('Request body too large.')
    chunks.push(buffer)
  }
  if (size === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export interface ApiDeps {
  controller: Controller
  /** Run before serving a read, so outside file edits show up. */
  /** Called before every read; `candidates` are workspace paths the client knows. */
  beforeRead?: (candidates?: readonly string[]) => Promise<void>
  log?: (message: string) => void
}

/** Build every route this plugin owns. */
export function buildRoutes({ controller, beforeRead, log }: ApiDeps): Route[] {
  const guard =
    (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Route['handler'] =>
    async (req, res) => {
      try {
        await handler(req, res)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log?.(`mcp-panel: ${message}`)
        if (!res.headersSent) sendJson(res, 500, { error: message })
        else res.end()
      }
    }

  return [
    {
      kind: 'exact',
      path: `${API_PREFIX}/list`,
      handler: guard(async (req, res) => {
        // The CLIENT is the only side that knows the Workspace list, so it sends
        // the candidate paths and the host adopts any that hold a project config.
        // Without this a hand-written `<workspace>/.dsh/yiklek/mcp.json` was both
        // invisible and inert.
        const url = new URL(req.url ?? '/', 'http://localhost')
        const candidates = url.searchParams.getAll('workspace').filter((item) => item !== '')
        await beforeRead?.(candidates)
        sendJson(res, 200, controller.list())
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/status`,
      handler: guard(async (_req, res) => {
        await beforeRead?.()
        sendJson(res, 200, {
          status: controller.statusSnapshot(),
          loadError: controller.loadError ?? null,
        })
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/sync`,
      handler: guard(async (_req, res) => {
        await beforeRead?.()
        sendJson(res, 200, { sync: controller.syncState() })
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/workspace`,
      handler: guard(async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'POST required.' })
          return
        }
        const body = (await readJson(req)) as { root?: unknown; enabled?: unknown } | undefined
        if (body === undefined || typeof body.root !== 'string' || body.root === '') {
          sendJson(res, 400, { error: '`root` must be a non-empty string.' })
          return
        }
        if (typeof body.enabled !== 'boolean') {
          sendJson(res, 400, { error: '`enabled` must be a boolean.' })
          return
        }
        // Off = the workspace contributes no profile entry, so its MCP processes
        // never start. That is the only way to stop a server: `deny` only hides
        // tools, it cannot stop the process the loader owns.
        await controller.setWorkspaceEnabled(body.root, body.enabled)
        sendJson(res, 200, { ok: true, root: body.root, enabled: body.enabled })
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/import`,
      handler: guard(async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'POST required.' })
          return
        }
        const body = (await readJson(req)) as
          | { json?: unknown; scope?: unknown; workspaceRoot?: unknown; commit?: unknown; allowSseAsHttp?: unknown }
          | undefined
        if (body === undefined || (body.scope !== 'global' && body.scope !== 'project')) {
          sendJson(res, 400, { error: '`scope` must be "global" or "project".' })
          return
        }
        const scope = body.scope
        const workspaceRoot = typeof body.workspaceRoot === 'string' ? body.workspaceRoot : undefined

        // `commit` is a separate round trip on purpose: the UI shows the preview
        // (new / replaced / skipped) and only then writes.
        if (body.commit === true) {
          const result = await controller.applyImport({
            json: body.json,
            scope,
            ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
            ...(body.allowSseAsHttp === true ? { allowSseAsHttp: true } : {}),
          })
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        sendJson(res, 200, {
          preview: controller.previewImport({
            json: body.json,
            scope,
            ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
          }),
        })
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/export`,
      handler: guard(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const scope = url.searchParams.get('scope') === 'project' ? 'project' : 'global'
        const workspaceRoot = url.searchParams.get('workspace') ?? undefined
        const redact = url.searchParams.get('redact') !== 'false'
        sendJson(res, 200, {
          export: controller.exportConfig({
            scope,
            ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
            redact,
          }),
        })
      }),
    },

    {
      kind: 'exact',
      path: `${API_PREFIX}/save`,
      handler: guard(async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'POST required.' })
          return
        }
        const body = (await readJson(req)) as
          | { scope?: unknown; servers?: unknown; workspaceRoot?: unknown; revision?: unknown }
          | undefined
        if (body === undefined || (body.scope !== 'global' && body.scope !== 'project')) {
          sendJson(res, 400, { error: '`scope` must be "global" or "project".' })
          return
        }
        if (!Array.isArray(body.servers)) {
          sendJson(res, 400, { error: '`servers` must be an array.' })
          return
        }
        // Validation lives in the controller: it re-checks the same file it will
        // write, so the route cannot drift from the store's rules.
        // `workspaceRoot` is REQUIRED for a project save. Dropping it here made
        // every project-level add from the panel fail as "select a workspace",
        // which the route tests caught only once they existed.
        const result = await controller.save({
          scope: body.scope,
          servers: body.servers as McpServerEntry[],
          ...(typeof body.workspaceRoot === 'string' ? { workspaceRoot: body.workspaceRoot } : {}),
          ...(typeof body.revision === 'string' ? { revision: body.revision } : {}),
        })
        sendJson(res, result.ok ? 200 : 400, result)
      }),
    },
  ]
}
