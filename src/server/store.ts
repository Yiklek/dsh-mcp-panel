/**
 * Reading and writing one `mcp.json`.
 *
 * Two properties matter here:
 *
 *   1. **Atomic.** A crash mid-write must not leave a truncated file that takes
 *      every MCP server down. Writes go to a sibling temp file and are renamed
 *      into place, which is atomic within one filesystem.
 *   2. **Private.** `env` and `headers` routinely hold tokens, so the file is
 *      created 0600 and an existing looser mode is tightened on write.
 *
 * Reads are tolerant: a missing file is an empty document (not an error), while
 * a malformed one reports the parse failure instead of throwing through the
 * caller.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { DOC_VERSION, emptyDocument, type McpServerEntry, type McpDocument } from '../shared.js'
import { parseDocument, serializeInFormat, type SourceFormat } from './normalize.js'

export interface ReadResult {
  document: McpDocument
  exists: boolean
  /** Set when the file exists but could not be understood. */
  error?: string
  /** The shape the file was written in, so a save can write it back unchanged. */
  format?: SourceFormat
}

/** Tighten an existing file to owner-only. Best effort: some filesystems ignore it. */
function enforcePrivateMode(file: string): void {
  try {
    const mode = statSync(file).mode & 0o777
    if (mode !== 0o600) chmodSync(file, 0o600)
  } catch {
    /* not fatal */
  }
}

/**
 * Read a config file.
 *
 * Accepts every shape `parseDocument` understands, so a hand-written
 * `{"mcpServers": {…}}` in the plugin's own path still loads.
 */
export function readDocument(file: string): ReadResult {
  if (!existsSync(file)) return { document: emptyDocument(), exists: false }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { document: emptyDocument(), exists: true, error: `Invalid JSON: ${String(error)}` }
  }

  const parsed = parseDocument(raw)
  if (parsed.format === 'unknown') {
    return { document: emptyDocument(), exists: true, error: 'Unrecognised MCP configuration shape.' }
  }
  // Reading is not the place to police naming: keep whatever the file holds so
  // the UI can show and fix it. Validation happens on save and in the list view.
  return { document: parsed.document, exists: true, format: parsed.format }
}

/** Serialize a document exactly as it is stored on disk. */
export interface WriteResult {
  file: string
  created: boolean
}

/**
 * Write a document atomically with 0600.
 *
 * The temp file lives beside the target so the rename stays within one
 * filesystem (a temp dir on another mount would make rename fail or copy).
 */
export function writeDocument(file: string, document: McpDocument, format: SourceFormat = 'ours'): WriteResult {
  const created = !existsSync(file)

  // Write THROUGH a symlink, never over it.
  //
  // A workspace may point its `.dsh/yiklek/mcp.json` at a file it already had
  // (a `.mcp.json` at the repository root, say). Renaming a temp file onto the
  // link path would replace the link with a regular file and silently cut the
  // user's own file loose.
  let target = file
  try {
    target = realpathSync(file)
  } catch {
    /* not a symlink, or it does not exist yet */
  }

  mkdirSync(dirname(target), { recursive: true })

  const temp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(temp, serializeInFormat(format, document), { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, target)
  } catch (error) {
    try {
      unlinkSync(temp)
    } catch {
      /* already gone */
    }
    throw error
  }
  enforcePrivateMode(target)
  return { file, created }
}

/** Content revision of a config file: changes whenever the bytes do. */
export function revisionOf(file: string): string {
  if (!existsSync(file)) return ''
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
}
