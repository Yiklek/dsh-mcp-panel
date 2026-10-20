/**
 * Browser-side access to the plugin's own HTTP surface.
 *
 * Routes are same-origin and the web profile authenticates its own pages, so a
 * plain `fetch` is enough — no token header (that is also what the other MCP
 * panels do).
 */
import {
  API_PREFIX,
  type ImportPreview,
  type ListPayload,
  type McpServerEntry,
  type ServerStatus,
  type SyncState,
} from '../shared.js'

/**
 * The preview as the browser needs it.
 *
 * Same shape the host produced — re-exported rather than re-declared, so the two
 * sides cannot drift apart.
 */
export type ImportPreviewView = ImportPreview

export interface ListResponse extends ListPayload {
  /** Same snapshot as the rest of the payload — see the note on `ListPayload.sync`. */
  sync?: SyncState

  /** Why nothing can be made effective, when that is the case. */
  loadError?: string | null
}

/**
 * Where a rejected request carries a payload the caller must read.
 *
 * `/save` and `/import` answer 400 with `{ ok: false, issues: [...] }` — the
 * validation messages. Throwing on `!response.ok` turned every one of those into
 * the string "HTTP 400", so the user never saw why a save was refused.
 */
interface RequestOptions {
  /** Return a 4xx body instead of throwing. 5xx still throws. */
  returnBody?: boolean
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_PREFIX}/${path}`, {
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    cache: 'no-store',
    ...init,
  })
  const text = await response.text()
  let body: unknown
  try {
    body = text === '' ? undefined : JSON.parse(text)
  } catch {
    throw new Error(`Unexpected response (HTTP ${response.status})`)
  }
  if (!response.ok) {
    // A server fault always throws; a rejected request whose payload IS the
    // answer goes back to the caller.
    if (options.returnBody === true && response.status < 500) return body as T
    const message =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`
    throw new Error(message)
  }
  return body as T
}

export const api = {
  list: (workspacePaths: readonly string[] = []) =>
    request<ListResponse>(
      'list' + (workspacePaths.length === 0 ? '' : '?' + workspacePaths
        .filter((path) => path !== '')
        .map((path) => 'workspace=' + encodeURIComponent(path))
        .join('&')),
    ),
  status: () => request<{ status: Record<string, ServerStatus>; loadError: string | null }>('status'),
  sync: () => request<{ sync: SyncState }>('sync'),
  save: (
    scope: 'global' | 'project',
    servers: McpServerEntry[],
    workspaceRoot?: string,
    revision?: string,
  ) =>
    request<{ ok: boolean; conflict?: boolean; issues: Array<{ message?: string }>; file?: string }>(
      'save',
      {
        method: 'POST',
        body: JSON.stringify({
          scope,
          servers,
          ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
          ...(revision === undefined ? {} : { revision }),
        }),
      },
      { returnBody: true },
    ),
  importPreview: (json: unknown, scope: 'global' | 'project', workspaceRoot?: string) =>
    request<{ preview: ImportPreviewView }>('import', {
      method: 'POST',
      body: JSON.stringify({ json, scope, ...(workspaceRoot === undefined ? {} : { workspaceRoot }) }),
    }),
  importCommit: (json: unknown, scope: 'global' | 'project', workspaceRoot?: string, allowSseAsHttp?: boolean) =>
    request<{ ok: boolean; issues: Array<{ message?: string }> }>(
      'import',
      {
        method: 'POST',
        body: JSON.stringify({
          json,
          scope,
          commit: true,
          ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
          ...(allowSseAsHttp === true ? { allowSseAsHttp: true } : {}),
        }),
      },
      { returnBody: true },
    ),
  exportConfig: (scope: 'global' | 'project', workspaceRoot?: string, redact = true) =>
    request<{ export: { format: string; text: string; omitted?: { disabled: number; timeouts: number } } }>(
      `export?scope=${scope}&redact=${redact}${workspaceRoot === undefined ? '' : `&workspace=${encodeURIComponent(workspaceRoot)}`}`,
    ),
  setWorkspaceEnabled: (root: string, enabled: boolean) =>
    request<{ ok: boolean }>('workspace', { method: 'POST', body: JSON.stringify({ root, enabled }) }),
}
