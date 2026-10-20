/**
 * Bidirectional management of the profile's `cordis.patch.yml`.
 *
 * Why this file exists at all: P1 proved that a dynamically mounted
 * `@deepseek-ai/dsh-mcp-client` connects fine but its tools never reach the
 * model's tool table. Only a real profile entry does (see docs/p1-findings.md).
 * So `mcp.json` is the EDITING surface and this file is the EFFECTIVE surface.
 *
 * Two properties the implementation must have:
 *
 *   1. **Never damage the rest of the file.** Users keep their own patch entries
 *      and comments there. This module edits by splicing a delimited text region
 *      and leaves every other byte alone — it never re-serialises the document.
 *   2. **Reading is tolerant.** The other direction parses the whole file with a
 *      real YAML parser, so hand-written entries in any valid style are seen.
 *
 * Applying is free: `@deepseek-ai/dsh-hmr` watches this file and reconciles the
 * loader on change, so a write takes effect without a restart (verified).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { type McpDocument, type McpServerEntry, type Transport } from '../shared.js'
import { entryIdFor, parseEntryId, type Materialized } from './naming.js'

/** The official client's package name — the entry `name` we generate. */
export const CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** Delimiters of the region this plugin owns. Anything outside is untouched. */
export const REGION_START =
  '# >>> dsh-mcp-panel: managed block — generated from mcp.json. Edits here are read back and overwritten; use the MCP panel.'
export const REGION_END = '# <<< dsh-mcp-panel: managed block'

export { entryIdFor }

export interface PatchEntry {
  /** Profile-level name (may carry a workspace suffix). */
  serverName: string
  id: string
  entry: McpServerEntry
  /** True when the id follows our convention. */
  ours: boolean
  /** Decoded from the id: which workspace owns it, and the name it had there. */
  origin?: { scope: 'global' | 'project'; workspaceId?: string; name: string }
}

export interface PatchReadResult {
  exists: boolean
  text: string
  /** Set when the file exists but is not parseable as YAML. */
  error?: string
  entries: PatchEntry[]
}

/** Locate the managed region in the raw text. */
export function findRegion(text: string): { start: number; end: number } | undefined {
  const start = text.indexOf(REGION_START)
  if (start === -1) return undefined
  const endMarker = text.indexOf(REGION_END, start)
  if (endMarker === -1) return undefined
  return { start, end: endMarker + REGION_END.length }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item)
  }
  return out
}

/** Convert one profile patch config into our entry shape, or undefined when unreadable. */
function configToEntry(config: unknown): McpServerEntry | undefined {
  if (config === null || typeof config !== 'object') return undefined
  const raw = config as Record<string, unknown>
  const transport: Transport =
    raw.transport === 'streamable-http' || raw.transport === 'http' ? 'streamable-http' : 'stdio'
  const name = typeof raw.serverName === 'string' ? raw.serverName : ''
  if (name === '') return undefined

  const entry: McpServerEntry = {
    // `name` is set by the caller from the profile name minus any suffix.
    name,
    enabled: true,
    transport,
    command: typeof raw.command === 'string' ? raw.command : '',
    args: Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string') : [],
    env: asStringRecord(raw.env),
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    url: typeof raw.url === 'string' ? raw.url : '',
    headers: asStringRecord(raw.headers),
  }
  if (typeof raw.toolCallTimeoutMs === 'number') entry.toolCallTimeoutMs = raw.toolCallTimeoutMs
  if (typeof raw.failOnStartupError === 'boolean') entry.failOnStartupError = raw.failOnStartupError
  return entry
}

/** Read the patch file and every MCP entry it declares. */
export function readPatchFile(file: string): PatchReadResult {
  if (!existsSync(file)) return { exists: false, text: '', entries: [] }
  const text = readFileSync(file, 'utf8')

  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch (error) {
    return { exists: true, text, error: `Invalid YAML: ${String(error)}`, entries: [] }
  }

  const entries: PatchEntry[] = []
  const seen = new Set<string>()

  const list = Array.isArray(parsed) ? parsed : []
  for (const row of list) {
    if (row === null || typeof row !== 'object') continue
    const inserts = Array.isArray((row as Record<string, unknown>).insert)
      ? ((row as Record<string, unknown>).insert as unknown[])
      : []
    for (const inserted of inserts) {
      if (inserted === null || typeof inserted !== 'object') continue
      const item = inserted as Record<string, unknown>
      if (item.name !== CLIENT_PACKAGE) continue
      const entry = configToEntry(item.config)
      if (entry === undefined) continue
      if (seen.has(entry.name)) continue
      seen.add(entry.name)
      const id = typeof item.id === 'string' ? item.id : ''
      entries.push({
        serverName: entry.name,
        id,
        entry,
        ours: id.startsWith('mcp-panel-'),
        origin: parseEntryId(id),
      })
    }
  }

  return { exists: true, text, entries }
}

/* ── rendering ─────────────────────────────────────────────────────────────── */

/** Group entries for the emitted block: globals first, then one group per workspace. */
function groupsOf(materialized: readonly Materialized[]): Array<{ label: string; items: Materialized[] }> {
  const groups: Array<{ label: string; items: Materialized[] }> = []
  const globals = materialized.filter((item) => item.scope === 'global')
  if (globals.length > 0) groups.push({ label: 'global', items: globals })

  const byRoot = new Map<string, Materialized[]>()
  for (const item of materialized) {
    if (item.scope !== 'project' || item.workspaceRoot === undefined) continue
    const list = byRoot.get(item.workspaceRoot) ?? []
    list.push(item)
    byRoot.set(item.workspaceRoot, list)
  }
  for (const [root, items] of byRoot) groups.push({ label: `project: ${root}`, items })
  return groups
}

/** Render the managed block body (no markers). */
export function renderManagedBlock(materialized: readonly Materialized[]): string {
  const lines: string[] = []
  for (const group of groupsOf(materialized)) {
    lines.push(`# ${group.label}`)
    lines.push('- insert:')
    for (const item of group.items) {
      lines.push(`    - id: ${scalar(item.id)}`)
      lines.push(`      name: ${scalar(CLIENT_PACKAGE)}`)
      lines.push('      config:')
      lines.push(...emitConfig(configOf(item)))
    }
  }
  return lines.join('\n')
}

/** The official client's `Config` for one server. */
function configOf(item: Materialized): Record<string, unknown> {
  const entry = item.entry
  const config: Record<string, unknown> = { transport: entry.transport, serverName: item.serverName }
  if (entry.transport === 'streamable-http') {
    config.url = entry.url
    if (Object.keys(entry.headers).length > 0) config.headers = entry.headers
  } else {
    config.command = entry.command
    if (entry.args.length > 0) config.args = entry.args
    if (Object.keys(entry.env).length > 0) config.env = entry.env
    if (entry.cwd !== '') config.cwd = entry.cwd
  }
  if (entry.toolCallTimeoutMs !== undefined) config.toolCallTimeoutMs = entry.toolCallTimeoutMs
  config.failOnStartupError = true
  return config
}

function emitConfig(config: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(config)) {
    if (Array.isArray(value)) {
      lines.push(`        ${key}:`)
      for (const item of value) lines.push(`          - ${scalar(item)}`)
    } else if (value !== null && typeof value === 'object') {
      lines.push(`        ${key}:`)
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`          ${scalar(k)}: ${scalar(v)}`)
      }
    } else {
      lines.push(`        ${key}: ${scalar(value)}`)
    }
  }
  return lines
}

/**
 * YAML scalar quoting.
 *
 * A plain scalar may not START with a YAML indicator; `@` is reserved outright,
 * which is why `@deepseek-ai/dsh-mcp-client` must be quoted even though every
 * character in it is otherwise safe.
 */
function scalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const text = String(value)
  if (text === '') return '""'
  const plainSafe = /^[A-Za-z0-9_./-][A-Za-z0-9_./@-]*$/.test(text)
  const ambiguous = /^(true|false|null|yes|no|on|off|~)$/i.test(text) || /^[-+]?[0-9.]/.test(text)
  if (plainSafe && !ambiguous) return text
  return JSON.stringify(text)
}

/* ── writing ───────────────────────────────────────────────────────────────── */

/**
 * Drop a lone `[]` placeholder line.
 *
 * The shipped profile template is a comment header followed by `[]`. Appending a
 * list item after that `[]` produces invalid YAML and the profile will not boot —
 * which is exactly what happened the first time this ran against a real template.
 */
function stripEmptyArray(text: string): string {
  const lines = text.split('\n')
  const meaningful = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((item) => item.line !== '' && !item.line.startsWith('#'))
  const only = meaningful[0]
  if (meaningful.length === 1 && only !== undefined && only.line === '[]') {
    lines.splice(only.index, 1)
    return lines.join('\n').replace(/\s*$/, '')
  }
  return text
}

/** Replace (or append) the managed region. Every byte outside it is preserved. */
export function buildPatchedText(existing: string, materialized: readonly Materialized[]): string {
  const region = findRegion(existing)

  // Nothing to materialise: never touch the file's array-ness.
  //
  // An empty managed region is comments only. Emitting it into a template that is
  // just `[]` would strip that `[]` (to avoid `[]` followed by list items) and
  // leave a comments-only document — which is not a YAML array, and DSH refuses to
  // boot on it. So an empty result removes any stale region and leaves the rest of
  // the file byte for byte as it was.
  if (materialized.length === 0) {
    if (region === undefined) return existing
    const head = existing.slice(0, region.start)
    const tail = existing.slice(region.end)
    let text = `${head}${tail}`.replace(/\n{3,}/g, '\n\n')
    // If the region was the whole array, removing it would leave a comments-only
    // document, which the loader rejects. Put an empty array back.
    if (parseYaml(text) === null || parseYaml(text) === undefined) {
      text = `${text.replace(/\s*$/, '')}\n[]\n`
    }
    return text
  }

  const block = [REGION_START, renderManagedBlock(materialized), REGION_END].join('\n')

  if (region !== undefined) {
    const live = existing.slice(0, region.start) + block + existing.slice(region.end)
    // Remove any FURTHER region. A file with two of them (a hand-merged copy, a
    // botched cherry-pick) would otherwise keep the stale one, and two entries with
    // the same `serverName` make the loader reject the whole profile.
    return dropExtraRegions(live)
  }

  const base = stripEmptyArray(existing.replace(/\s*$/, ''))

  // A trailing `...` is YAML's document-end marker. Appending after it starts a
  // SECOND document, which the loader refuses, so the block goes before it.
  const documentEnd = /(^|\n)\.\.\.\s*$/
  if (documentEnd.test(base)) {
    const head = base === '' ? '' : base + '\n'
    return head.replace(documentEnd, `\n${block}\n...\n`).replace(/^\n/, '')
  }

  const head = base === '' ? '' : base + '\n'
  return `${head}${block}\n`
}

/** Keep only the first managed region. */
function dropExtraRegions(text: string): string {
  let remaining = text
  for (;;) {
    const first = findRegion(remaining)
    if (first === undefined) return remaining
    const rest = remaining.slice(first.end)
    const again = findRegion(rest)
    if (again === undefined) return remaining
    // Cut the second region out, including the newline that introduced it.
    const cutFrom = first.end + again.start
    const cutTo = first.end + again.end
    remaining = (remaining.slice(0, cutFrom) + remaining.slice(cutTo)).replace(/\n{3,}/g, '\n\n')
  }
}

/**
 * Refuse to write a patch file DSH cannot load.
 *
 * The failure mode this prevents is severe and silent until the next start: a
 * profile whose patch file is not a top-level array will not boot at all. Checking
 * here means a bug in the emitter surfaces as an error in this plugin instead of
 * as an unexplainable dead DSH.
 */
function assertLoadable(text: string): void {
  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch (error) {
    throw new Error(`refusing to write a patch file that is not valid YAML: ${String(error)}`)
  }
  // An empty or comments-only document parses as null, which the loader rejects.
  if (parsed === null || parsed === undefined) {
    throw new Error('refusing to write a patch file with no top-level YAML array')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('refusing to write a patch file that is not a top-level YAML array')
  }
}

export interface WriteResult {
  file: string
  created: boolean
  changed: boolean
}

/** Write the managed region atomically, 0600 (the patch can carry credentials). */
export function writePatchFile(file: string, materialized: readonly Materialized[]): WriteResult {
  const present = existsSync(file)
  // Nothing to materialise and no file to fix: leave the profile untouched rather
  // than creating a patch file it never had.
  if (!present && materialized.length === 0) return { file, created: false, changed: false }

  const existing = present ? readFileSync(file, 'utf8') : ''
  const next = buildPatchedText(existing, materialized)
  assertLoadable(next)
  if (next === existing) return { file, created: false, changed: false }

  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(temp, next, { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, file)
  } catch (error) {
    try {
      unlinkSync(temp)
    } catch {
      /* already gone */
    }
    throw error
  }
  return { file, created: existing === '', changed: true }
}

/* ── reconciliation ────────────────────────────────────────────────────────── */

export interface Adoption {
  name: string
  scope: 'global' | 'project'
  workspaceRoot?: string
}

export interface AdoptResult {
  global: McpDocument
  /** Only workspaces that actually changed. */
  projects: Map<string, McpDocument>
  adopted: Adoption[]
  skipped: Array<{ name: string; reason: string }>
  /**
   * Entries declared directly in the patch file, outside our managed block.
   *
   * Reported, never adopted and never duplicated: a second entry with the same
   * `serverName` would make the loader reject the whole profile.
   */
  externals: Array<{ serverName: string; entry: McpServerEntry }>
  changed: boolean
}

/**
 * Fold the patch file back into the editing surfaces.
 *
 * The rule is one-directional per entry, which keeps the sync loop-free:
 *
 *   - a server present only in the patch file is ADOPTED into the matching
 *     `mcp.json` (the workspace is recovered from the name suffix);
 *   - a server present in `mcp.json` keeps its `mcp.json` definition, because
 *     that is the editing surface;
 *   - a server in `mcp.json` but not in the patch is materialised on write.
 *
 * Adoption is idempotent: once the name is in a document, later runs skip it, so
 * read → reconcile → write converges instead of oscillating.
 */
export function adoptFromPatch(
  global: McpDocument,
  projects: ReadonlyMap<string, McpDocument>,
  patch: PatchReadResult,
  workspaceById: ReadonlyMap<string, string>,
): AdoptResult {
  const globalNames = new Set(global.servers.map((entry) => entry.name))
  const projectNames = new Map<string, Set<string>>()
  for (const [root, document] of projects) projectNames.set(root, new Set(document.servers.map((e) => e.name)))

  let globalDocument = global
  const projectDocuments = new Map(projects)
  const adopted: Adoption[] = []
  const skipped: AdoptResult['skipped'] = []
  const externals: AdoptResult['externals'] = []

  for (const item of patch.entries) {
    // A `dsh-mcp-client` entry the user wrote DIRECTLY in the patch file is left
    // alone and never adopted. Adopting it would make us materialise a second
    // entry with the same `serverName`, and the loader would refuse the profile.
    // Those entries are surfaced read-only instead (see `externals` in the
    // controller payload).
    if (!item.ours) {
      externals.push({ serverName: item.serverName, entry: item.entry })
      continue
    }

    // Ownership comes from the entry id, never from the visible name: a project
    // server may legitimately hold a bare name (`api`), and guessing from that
    // once moved it into the global document.
    const origin = item.origin
    const root =
      origin?.scope === 'project' && origin.workspaceId !== undefined
        ? workspaceById.get(origin.workspaceId)
        : undefined

    if (root !== undefined && origin !== undefined) {
      const names = projectNames.get(root) ?? new Set<string>()
      const localName = origin.name
      if (!names.has(localName)) {
        names.add(localName)
        projectNames.set(root, names)
        const document = projectDocuments.get(root) ?? { version: 1, servers: [] }
        // Keep the entry's own settings but restore the local name.
        const entry: McpServerEntry = { ...item.entry, name: localName }
        projectDocuments.set(root, { version: document.version, servers: [...document.servers, entry] })
        adopted.push({ name: localName, scope: 'project', workspaceRoot: root })
      }
      continue
    }

    if (globalNames.has(item.entry.name)) continue
    globalNames.add(item.entry.name)
    globalDocument = { version: global.version, servers: [...globalDocument.servers, item.entry] }
    adopted.push({ name: item.entry.name, scope: 'global' })
  }

  return {
    global: globalDocument,
    projects: projectDocuments,
    adopted,
    skipped,
    externals,
    changed: adopted.length > 0,
  }
}
