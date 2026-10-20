/**
 * Moving configuration in and out of one editing surface.
 *
 * These are the parts of import/export that never needed the Controller: given a
 * document and a foreign payload, decide what would change and what would be
 * refused. Keeping them here means the transfer rules can be exercised without a
 * filesystem, and the Controller stays an orchestrator rather than a place where
 * three unrelated jobs accumulate.
 */
import {
  type ImportPreview,
  type Issue,
  type McpDocument,
  type McpServerEntry,
} from '../shared.js'
import { exportDocument, parseDocument } from './normalize.js'
import { validateDocument } from './validate.js'

/** What importing `json` into `existing` would do. Nothing is written. */
export function previewImport(existing: McpDocument, json: unknown): ImportPreview {
  const parsed = parseDocument(json, { allowSseAsHttp: false })
  const byName = new Map(existing.servers.map((entry) => [entry.name, entry]))

  const added: string[] = []
  const replaced: string[] = []
  for (const entry of parsed.document.servers) {
    if (byName.has(entry.name)) replaced.push(entry.name)
    else added.push(entry.name)
  }

  // Validate the RESULT, not just the parse. Without this the preview said
  // "will be added" for entries the save step then refused — an import that
  // reports success and does nothing is worse than one that says why.
  const merged = new Map(byName)
  for (const entry of parsed.document.servers) merged.set(entry.name, entry)
  const blocking = validateDocument({ version: 1, servers: [...merged.values()] })
    .filter((issue) => issue.level === 'blocking')
    .map((issue) => ({ path: issue.path, message: issue.message }))

  return {
    format: parsed.format,
    added,
    replaced,
    skipped: parsed.issues
      .filter((issue) => issue.code === 'entry-skipped' || issue.level === 'blocking')
      .map((issue) => ({ name: issue.params?.name ?? '', reason: issue.message })),
    blocking,
    servers: parsed.document.servers,
  }
}

export interface ImportPlan {
  /** False when the payload could not be recognised at all. */
  ok: boolean
  issues: Issue[]
  servers: McpServerEntry[]
}

/** The document an import would produce: same-named entries replaced, rest appended. */
export function applyImport(existing: McpDocument, json: unknown, allowSseAsHttp = false): ImportPlan {
  const parsed = parseDocument(json, { allowSseAsHttp })
  if (parsed.format === 'unknown') {
    return {
      ok: false,
      issues: [{ level: 'blocking', path: '', code: 'format-unknown', message: 'Unrecognised MCP configuration.' }],
      servers: existing.servers,
    }
  }
  const merged = new Map(existing.servers.map((entry) => [entry.name, entry]))
  for (const entry of parsed.document.servers) merged.set(entry.name, entry)
  return { ok: true, issues: [], servers: [...merged.values()] }
}

export interface ExportResult {
  format: 'claude'
  text: string
  /**
   * What the export shape cannot carry.
   *
   * The mainstream shapes have no `enabled` flag and no timeout field, so a round
   * trip silently dropped them — a user backing up, editing elsewhere and
   * re-importing lost every disabled server without a word. Reporting it is the
   * honest middle ground: keep the format compatible, say what it left out.
   */
  omitted: { disabled: number; timeouts: number }
}

/** Serialize one surface for export. Redacted unless asked otherwise. */
export function exportConfig(document: McpDocument, redact = true): ExportResult {
  const exported = exportDocument(document.servers, { redact })
  return {
    format: 'claude',
    text: JSON.stringify(exported, null, 2) + '\n',
    omitted: {
      disabled: document.servers.filter((entry) => entry.enabled === false).length,
      timeouts: document.servers.filter((entry) => entry.toolCallTimeoutMs !== undefined).length,
    },
  }
}
