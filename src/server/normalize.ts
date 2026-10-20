/**
 * Import/export for the mainstream MCP configuration shapes.
 *
 * Supported on import (auto-detected, no user choice):
 *
 *   ours      { version, servers: [ { name, transport, … } ] }
 *   claude    { mcpServers: { <name>: { command, args, env } } }        Claude Desktop, Cursor
 *   vscode    { servers:    { <name>: { type, command|url, … } } }      VS Code
 *   acp       { mcpServers: [ { name, command|url, … } ] }              DSH's own ACP reader
 *   bare      [ { name, … } ]
 *
 * Export writes the `claude` shape, because it is the de-facto standard.
 *
 * The field names in `McpServerEntry` were chosen to match these shapes, so a
 * round trip is lossless apart from fields a source format cannot express.
 */
import {
  DOC_VERSION,
  emptyDocument,
  emptyEntry,
  type Issue,
  type McpDocument,
  type McpServerEntry,
  type Transport,
} from '../shared.js'

export type SourceFormat = 'ours' | 'claude' | 'vscode' | 'acp' | 'bare' | 'unknown'

export interface ParseResult {
  document: McpDocument
  format: SourceFormat
  issues: Issue[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A string field, or `fallback` when absent/not a string. */
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

/** A string array; a bare string becomes a one-element array rather than being shell-split. */
function strArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value !== '') return [value]
  return []
}

/** A `Record<string, string>` from either a record or an array of ordered name/value entries (ACP). */
function strRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item) && typeof item.name === 'string' && typeof item.value === 'string') {
        out[item.name] = item.value
      }
    }
    return out
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') out[key] = item
      else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item)
    }
  }
  return out
}

const issue = (
  level: Issue['level'],
  path: string,
  code: string,
  message: string,
  params?: Record<string, string>,
): Issue => ({ level, path, code, message, ...(params === undefined ? {} : { params }) })

/**
 * Pick the transport from whichever marker the source uses.
 *
 * `type: 'sse'` is NOT silently mapped: the official client rejects anything but
 * stdio / streamable-http (P0-verified). It becomes a blocking issue so the
 * import preview can explain it, and `allowSseAsHttp` lets the user opt in for
 * endpoints that also speak streamable-http.
 */
function pickTransport(
  raw: Record<string, unknown>,
  allowSseAsHttp: boolean,
): { transport: Transport } | { skip: string } {
  const declared = str(raw.transport) !== '' ? str(raw.transport) : str(raw.type)
  switch (declared) {
    case '':
      // No marker: infer from what the entry actually carries.
      if (str(raw.url) !== '') return { transport: 'streamable-http' }
      return { transport: 'stdio' }
    case 'stdio':
      return { transport: 'stdio' }
    case 'http':
    case 'streamable-http':
    case 'streamableHttp':
      return { transport: 'streamable-http' }
    case 'sse':
      if (allowSseAsHttp) return { transport: 'streamable-http' }
      return { skip: 'sse' }
    default:
      return { skip: `unsupported transport "${declared}"` }
  }
}

/** One source entry → our shape. Returns `{ skip }` when the source cannot be expressed. */
export function normalizeEntry(
  name: string,
  raw: unknown,
  allowSseAsHttp: boolean,
): { entry: McpServerEntry } | { skip: string; reason: string } {
  if (!isRecord(raw)) {
    return { skip: name, reason: 'entry is not an object' }
  }
  const picked = pickTransport(raw, allowSseAsHttp)
  if ('skip' in picked) return { skip: name, reason: picked.skip }

  const entry = emptyEntry(name)
  entry.transport = picked.transport
  entry.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : !raw.disabled

  if (entry.transport === 'stdio') {
    // `command` may be a single string or an argv array. Some configs write
    // `"command": ["npx", "-y", "server"]`; reading only the string form silently
    // produced an empty command, and the breakage surfaced later as a validation
    // error with no hint about where the command went.
    if (Array.isArray(raw.command)) {
      const argv = strArray(raw.command)
      entry.command = argv[0] ?? ''
      entry.args = argv.slice(1)
    } else {
      entry.command = str(raw.command)
      entry.args = strArray(raw.args)
    }
    entry.env = strRecord(raw.env)
    entry.cwd = str(raw.cwd)
  } else {
    entry.url = str(raw.url)
    entry.headers = strRecord(raw.headers)
  }

  if (typeof raw.toolCallTimeoutMs === 'number') entry.toolCallTimeoutMs = raw.toolCallTimeoutMs
  if (typeof raw.failOnStartupError === 'boolean') entry.failOnStartupError = raw.failOnStartupError
  return { entry }
}

/** Detect the source shape without normalizing anything yet. */
function detect(raw: unknown): SourceFormat {
  if (Array.isArray(raw)) return 'bare'
  if (!isRecord(raw)) return 'unknown'
  if (Array.isArray(raw.mcpServers)) return 'acp'
  if (isRecord(raw.mcpServers)) return 'claude'
  if (isRecord(raw.servers)) return 'vscode'
  if (Array.isArray(raw.servers)) {
    // Ours and ACP both use an array here; ours is the one that carries `transport`.
    const first = raw.servers.find(isRecord)
    if (first !== undefined && (str(first.transport) !== '' || typeof raw.version === 'number')) {
      return 'ours'
    }
    return 'acp'
  }
  return 'unknown'
}

/** Every `[name, rawEntry]` pair the detected shape contains. */
function pairsOf(raw: unknown, format: SourceFormat): Array<[string, unknown]> {
  if (format === 'bare') {
    return (raw as unknown[]).map((item, index) => [
      isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
      item,
    ])
  }
  const record = raw as Record<string, unknown>
  if (format === 'claude') {
    return Object.entries(record.mcpServers as Record<string, unknown>)
  }
  if (format === 'vscode') {
    return Object.entries(record.servers as Record<string, unknown>)
  }
  // acp / ours: an array, each carrying its own name.
  return (record.servers as unknown[] | undefined)?.map((item, index) => [
    isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
    item,
  ]) ?? (record.mcpServers as unknown[]).map((item, index) => [
    isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
    item,
  ])
}

/**
 * Parse any supported shape into our document.
 *
 * Never throws on malformed input: everything unrepresentable comes back as an
 * issue, so the import preview can list exactly what will be skipped and why.
 */
export function parseDocument(raw: unknown, options: { allowSseAsHttp?: boolean } = {}): ParseResult {
  const allowSseAsHttp = options.allowSseAsHttp === true
  const format = detect(raw)
  const issues: Issue[] = []

  if (format === 'unknown') {
    return {
      document: emptyDocument(),
      format,
      issues: [
        issue(
          'blocking',
          '',
          'format-unknown',
          'Unrecognised MCP configuration: expected mcpServers, servers, or an array.',
        ),
      ],
    }
  }

  const document = emptyDocument()
  const seen = new Map<string, number>()

  pairsOf(raw, format).forEach(([name, value], index) => {
    const path = `servers[${index}]`
    const result = normalizeEntry(name.trim(), value, allowSseAsHttp)
    if ('skip' in result) {
      issues.push(issue('warning', path, 'entry-skipped', `Skipped "${name}": ${result.reason}`, {
        name,
        reason: result.reason,
      }))
      return
    }
    const previous = seen.get(result.entry.name)
    if (previous !== undefined) {
      issues.push(
        issue('blocking', `${path}.name`, 'name-duplicate', `Duplicate name: ${result.entry.name}`, {
          name: result.entry.name,
        }),
      )
      return
    }
    seen.set(result.entry.name, index)
    document.servers.push(result.entry)
  })

  const declaredVersion = (raw as Record<string, unknown>).version
  if (format === 'ours' && typeof declaredVersion === 'number') {
    document.version = declaredVersion
  }
  return { document, format, issues }
}

/* ── export ────────────────────────────────────────────────────────────────── */

/**
 * A `${env:KEY}` placeholder for a secret value.
 *
 * Keys are already SCREAMING_SNAKE in practice (`GITHUB_TOKEN`), so the round
 * trip through an export/import keeps working without the plugin ever writing a
 * secret to a shared file.
 */
export function envPlaceholder(key: string): string {
  const normalized = key.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `\${env:${normalized === '' ? 'VALUE' : normalized}}`
}

/** One entry in the exported `claude` shape. */
function toExportShape(entry: McpServerEntry, redact: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (entry.transport === 'streamable-http') {
    out.type = 'http'
    out.url = entry.url
    if (Object.keys(entry.headers).length > 0) {
      out.headers = Object.fromEntries(
        Object.entries(entry.headers).map(([key, value]) => [key, redact ? envPlaceholder(key) : value]),
      )
    }
    return out
  }
  out.command = entry.command
  if (entry.args.length > 0) out.args = entry.args
  if (Object.keys(entry.env).length > 0) {
    out.env = Object.fromEntries(
      Object.entries(entry.env).map(([key, value]) => [key, redact ? envPlaceholder(key) : value]),
    )
  }
  if (entry.cwd !== '') out.cwd = entry.cwd
  return out
}

export interface ExportOptions {
  /** Replace env/header values with `${env:KEY}` placeholders. Defaults to true. */
  redact?: boolean
  includeDisabled?: boolean
}

/** Serialize entries into the `claude` shape. */
export function exportDocument(
  entries: readonly McpServerEntry[],
  options: ExportOptions = {},
): { mcpServers: Record<string, Record<string, unknown>> } {
  const redact = options.redact !== false
  const mcpServers: Record<string, Record<string, unknown>> = {}
  for (const entry of entries) {
    if (entry.enabled === false && options.includeDisabled !== true) continue
    mcpServers[entry.name] = toExportShape(entry, redact)
  }
  return { mcpServers }
}

export { DOC_VERSION }

/**
 * Serialize a document back in the shape it was read from.
 *
 * `mcp.json` is not always OUR file. A workspace may point
 * `.dsh/yiklek/mcp.json` at a `.mcp.json` that Claude Code or Cursor also reads,
 * and rewriting it in this plugin's own shape silently breaks those tools — the
 * file still parses, it just no longer has `mcpServers` in it.
 *
 * Unknown or list-shaped formats fall back to this plugin's own document.
 */
export function serializeInFormat(
  format: SourceFormat,
  document: { version?: number; servers: readonly McpServerEntry[] },
): string {
  if (format === 'claude') {
    const mcpServers: Record<string, Record<string, unknown>> = {}
    for (const entry of document.servers) mcpServers[entry.name] = toExportShape(entry, false)
    return JSON.stringify({ mcpServers }, null, 2) + '\n'
  }
  if (format === 'vscode') {
    const servers: Record<string, Record<string, unknown>> = {}
    for (const entry of document.servers) {
      const shape = toExportShape(entry, false)
      // VS Code names the transport `type`, and calls http "http".
      if (shape.type !== undefined) delete shape.type
      servers[entry.name] = {
        type: entry.transport === 'stdio' ? 'stdio' : 'http',
        ...shape,
      }
    }
    return JSON.stringify({ servers }, null, 2) + '\n'
  }
  const out = {
    version: typeof document.version === 'number' ? document.version : DOC_VERSION,
    servers: document.servers,
  }
  return JSON.stringify(out, null, 2) + '\n'
}
