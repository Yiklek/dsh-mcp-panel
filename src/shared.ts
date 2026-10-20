/**
 * Types and constants shared by both halves.
 *
 * This module is bundled into BOTH `lib/host.mjs` and `lib/client.js`, so it must
 * stay free of Node-only and browser-only APIs — types and plain values only.
 */

/** The only two transports the official client supports (P0-verified). */
export type Transport = 'stdio' | 'streamable-http'

/** Where an entry is defined. */
export type Scope = 'global' | 'project'

/**
 * One MCP server.
 *
 * The field names deliberately match the mainstream `mcpServers` shape rather
 * than the official client's `Config` union, so import/export needs no field
 * renaming (see `normalize.ts`).
 */
export interface McpServerEntry {
  name: string
  enabled: boolean
  transport: Transport
  /** stdio only. */
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  /** streamable-http only. */
  url: string
  headers: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
}

/** One `mcp.json` file. */
export interface McpDocument {
  version: number
  servers: McpServerEntry[]
}



/** Where a server is in its connection lifecycle. */
export type ServerState = 'connecting' | 'connected' | 'failed' | 'disabled' | 'inactive'

/** Live status for one server, keyed by its effective name. */
export interface ServerStatus {
  state: ServerState
  /** Tool names this server registered, from the mounter's own ledger. */
  tools: string[]
  /** Last error, already sanitized for display. */
  error?: string
  /** ms since epoch of the last state change. */
  at: number
}

/** A validation finding. Blocking findings refuse the save; warnings are advisory. */
export interface Issue {
  level: 'blocking' | 'warning'
  /** Dotted path inside the document, e.g. `servers[1].command`. */
  path: string
  code: string
  message: string
  /** Set when `message` interpolates a value, for locales that need it. */
  params?: Record<string, string>
}

/** One workspace's project-level view. */
export interface ProjectView {
  /** Canonical workspace root. */
  root: string
  file: string
  /** Content revision at read time, for optimistic concurrency on save. */
  revision?: string
  /** When false the workspace contributes no profile entry, so no process starts. */
  enabled: boolean
  exists: boolean
  servers: McpServerEntry[]
  /** Servers whose profile name differs from their `mcp.json` name. */
  renamed: Array<{ name: string; serverName: string }>
  /**
   * Servers defined here that do NOT take effect because a global server owns
   * the same name. The panel says so on the row.
   */
  shadowed: Array<{ name: string; reason: string }>
}

/** Response of `GET /api/yiklek/mcp/list`. */
export interface ListPayload {
  global: { file: string; exists: boolean; servers: McpServerEntry[]; revision?: string }
  /** Every registered workspace, in registry order. */
  projects: ProjectView[]
  /** The profile patch file carrying the effective entries. */
  patchFile?: string
  /** Profile name per `mcp.json` name, for display. */
  names: Array<{ scope: 'global' | 'project'; workspaceRoot?: string; name: string; serverName: string }>
  status: Record<string, ServerStatus>
  issues: Issue[]
  /**
   * Reconciliation state, in the SAME response as the data it describes.
   *
   * It has to be one snapshot: adoption happens during the read, so fetching
   * `list` and then `sync` separately always reports an empty adoption — the
   * notice would never reach the user.
   */
  sync?: unknown
  /**
   * `dsh-mcp-client` entries written directly in the patch file. Shown read-only:
   * they are not ours, and materialising them again would duplicate a
   * `serverName` and break the profile.
   */
  externals?: Array<{ serverName: string; transport: string; command: string }>
}

/* ── constants ─────────────────────────────────────────────────────────────── */

/**
 * The official client's `SERVER_NAME_PATTERN`, because `serverName` becomes part
 * of the public tool name `mcp__<serverName>__<tool>`. Verified in P0.
 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export const TRANSPORTS: readonly Transport[] = ['stdio', 'streamable-http']

/** Namespace directory under DSH_HOME and under `<workspace>/.dsh`. */
export const NAMESPACE_DIR = 'yiklek'

export const CONFIG_FILE_NAME = 'mcp.json'

/** Bumped only when the on-disk shape changes incompatibly. */
export const DOC_VERSION = 1

/** Route prefix owned by this plugin. */
export const API_PREFIX = '/api/yiklek/mcp'

/** Matches the official client's default. */
export const DEFAULT_TOOL_TIMEOUT_MS = 60_000

/** Build an empty document. */
export function emptyDocument(): McpDocument {
  return { version: DOC_VERSION, servers: [] }
}

/** Build an entry with every field present, so the UI never sees `undefined`. */
export function emptyEntry(name = ''): McpServerEntry {
  return {
    name,
    enabled: true,
    transport: 'stdio',
    command: '',
    args: [],
    env: {},
    cwd: '',
    url: '',
    headers: {},
  }
}

/** The public tool-name prefix a server will own. */
export function toolPrefixOf(serverName: string): string {
  return `mcp__${serverName}__`
}

// ── wire contract ─────────────────────────────────────────────────────────────
// These cross the HTTP boundary, so they live here rather than next to the code
// that produces them: the browser half must not have to reach into the host half
// for its own payload types.

/** How the effective surface compares with the editing surfaces. */
export interface SyncState {
  patchFile?: string
  /** Profile names materialised on the last write. */
  materialized: string[]
  /** Servers folded back from the patch file into an editing surface. */
  adopted: Array<{ name: string; scope: 'global' | 'project'; workspaceRoot?: string }>
  /** Per-workspace drift notes, so the UI can explain a section on its own. */
  drift: Array<{ root: string; message: string }>
  /** Servers whose profile name carries a workspace suffix. */
  renamed: Array<{ name: string; serverName: string; scope: 'global' | 'project'; workspaceRoot?: string }>
  /** Patch entries that could not be adopted, with the reason. */
  skipped: Array<{ name: string; reason: string }>
  error?: string
}

/** What an import would do, before committing it. */
export interface ImportPreview {
  format: string
  added: string[]
  replaced: string[]
  skipped: Array<{ name: string; reason: string }>
  /** What the save step would reject — shown BEFORE the user commits. */
  blocking: Array<{ path: string; message: string }>
  /** The parsed servers, so the UI can show the details it recognised. */
  servers: McpServerEntry[]
}

/**
 * How many servers one workspace may declare.
 *
 * Every project's servers become profile entries, so they all run: the count is
 * per-workspace processes, not per-session. A runaway config would spawn that many
 * children on every boot, which is why this is a hard limit rather than advice.
 * The global file is not capped — it is the one place "more" is a deliberate choice.
 */
export const MAX_PROJECT_SERVERS = 8
