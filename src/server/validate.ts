/**
 * Two-level validation.
 *
 *   blocking  the save is refused, and the UI points at the field
 *   warning   the save proceeds; the row is flagged
 *
 * The split matters: a blocking issue is a configuration mistake (a name that
 * cannot become a tool name, a stdio entry with no command), whereas a warning
 * describes something that will work but probably should not ship — a secret
 * pasted inline, a command that depends on the current directory.
 *
 * Cross-scope name collisions are NOT validation errors; they are an effect rule
 * handled in `merge.ts`.
 */
import {
  SERVER_NAME_PATTERN,
  TRANSPORTS,
  type Issue,
  type McpDocument,
  type McpServerEntry,
} from '../shared.js'

const issue = (
  level: Issue['level'],
  path: string,
  code: string,
  message: string,
  params?: Record<string, string>,
): Issue => ({ level, path, code, message, ...(params === undefined ? {} : { params }) })

/** Keys whose value is worth a secret warning when it is not already a placeholder. */
const SECRET_KEY = /(token|secret|password|passwd|credential|api[_-]?key|auth)/i

/** A value that already reads as a ${…} reference rather than a literal. */
const PLACEHOLDER = /^\$\{/

/** Heuristic: long, high-entropy-ish, no spaces. Deliberately conservative. */
function looksLikeSecret(value: string): boolean {
  if (value.length < 16 || PLACEHOLDER.test(value)) return false
  if (/\s/.test(value)) return false
  return /^[A-Za-z0-9_\-./+=:]+$/.test(value)
}

/** Path style: absolute on POSIX or Windows, or something shell-resolvable like `npx`. */
function looksRelativeCommand(command: string): boolean {
  if (command === '') return false
  if (command.startsWith('/') || /^[A-Za-z]:[\\/]/.test(command)) return false
  if (command.startsWith('.')) return true
  // A bare name (`npx`, `uvx`, `node`) is resolved via PATH — that is normal.
  return command.includes('/') || command.includes('\\')
}

/** Validate one entry. `path` is the dotted path used in issue reports. */
export function validateEntry(entry: McpServerEntry, path: string): Issue[] {
  const issues: Issue[] = []

  if (!SERVER_NAME_PATTERN.test(entry.name)) {
    issues.push(
      issue(
        'blocking',
        `${path}.name`,
        'name-invalid',
        'Name must be 1–32 characters of letters, digits, underscore or hyphen.',
        { name: entry.name },
      ),
    )
  }

  if (!TRANSPORTS.includes(entry.transport)) {
    issues.push(
      issue('blocking', `${path}.transport`, 'transport-invalid', `Unsupported transport: ${String(entry.transport)}`),
    )
    return issues
  }

  if (entry.transport === 'stdio') {
    if (entry.command.trim() === '') {
      issues.push(issue('blocking', `${path}.command`, 'command-required', 'A stdio server needs a command.'))
    } else if (looksRelativeCommand(entry.command)) {
      issues.push(
        issue(
          'warning',
          `${path}.command`,
          'command-relative',
          'The command looks relative; it will only resolve from the matching directory.',
          { command: entry.command },
        ),
      )
    }
  } else {
    if (entry.url.trim() === '') {
      issues.push(issue('blocking', `${path}.url`, 'url-required', 'A streamable-http server needs a URL.'))
    } else if (!/^https?:\/\//i.test(entry.url)) {
      issues.push(issue('blocking', `${path}.url`, 'url-invalid', 'The URL must start with http:// or https://'))
    }
  }

  for (const [key, value] of [
    ...Object.entries(entry.env),
    ...Object.entries(entry.headers),
  ]) {
    if (SECRET_KEY.test(key) && looksLikeSecret(value)) {
      issues.push(
        issue(
          'warning',
          `${path}.env.${key}`,
          'secret-inline',
          `"${key}" looks like a literal secret. Prefer \${env:${key}} so it stays out of the file.`,
          { key },
        ),
      )
    }
  }

  if (entry.toolCallTimeoutMs !== undefined && (entry.toolCallTimeoutMs <= 0 || entry.toolCallTimeoutMs > 3_600_000)) {
    issues.push(
      issue(
        'warning',
        `${path}.toolCallTimeoutMs`,
        'timeout-odd',
        `Unusual tool-call timeout: ${entry.toolCallTimeoutMs} ms`,
        { timeout: String(entry.toolCallTimeoutMs) },
      ),
    )
  }

  return issues
}

/**
 * Validate a whole document, including the same-file duplicate rule.
 *
 * Two entries with the same name in ONE file is a blocking error — the effective
 * set could not tell them apart. The same collision across two files is the
 * shadowing rule instead (see `merge.ts`).
 */
export function validateDocument(document: McpDocument): Issue[] {
  const issues: Issue[] = []

  if (!Array.isArray(document.servers)) {
    return [issue('blocking', 'servers', 'servers-invalid', '`servers` must be an array.')]
  }

  const seen = new Map<string, number>()
  document.servers.forEach((entry, index) => {
    const path = `servers[${index}]`
    issues.push(...validateEntry(entry, path))

    const previous = seen.get(entry.name)
    if (previous !== undefined) {
      issues.push(
        issue(
          'blocking',
          `${path}.name`,
          'name-duplicate',
          `Duplicate name in this file: ${entry.name} (also at index ${previous})`,
          { name: entry.name, previous: String(previous) },
        ),
      )
    } else {
      seen.set(entry.name, index)
    }
  })

  return issues
}

/** True when any finding forbids the save. */
export function hasBlocking(issues: readonly Issue[]): boolean {
  return issues.some((finding) => finding.level === 'blocking')
}
