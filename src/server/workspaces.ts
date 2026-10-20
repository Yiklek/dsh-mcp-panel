/**
 * The registry of workspaces this plugin materialises.
 *
 * Why a registry at all: a project's servers must become profile entries, and
 * those are machine-wide. To materialise them we need to know which workspaces
 * exist — but DSH exposes no host-side registry we can query (only
 * `workspaceChanges`), and a session's header carries just `cwd`. So the plugin
 * remembers what it has seen, in `<DSH_HOME>/yiklek/state.json`.
 *
 * Two invariants this module exists to keep:
 *
 *   1. **Canonical paths.** Every root is stored as `fs.realpath`. On macOS
 *      `/tmp/x` and `/private/tmp/x` are the same directory; without
 *      normalisation one workspace would be two entries with two different name
 *      suffixes, and its servers would be materialised twice.
 *   2. **Stable naming.** The suffix derived from a root never changes, so the
 *      model-facing tool names are stable across restarts.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { NAMESPACE_DIR } from '../shared.js'
import { dshHome } from './paths.js'

/** One workspace the plugin knows about. */
export interface WorkspaceRecord {
  /** Canonical (`fs.realpath`) absolute path. */
  root: string
  /** Stable 8-hex identity, derived from `root`. */
  id: string
  /** 8-hex name suffix; empty while the workspace holds no colliding server. */
  suffix?: string
  /** Epoch ms of first registration; ordering here decides who keeps a bare name. */
  addedAt: number
  /**
   * Whether this workspace's servers are materialised at all.
   *
   * Off means the workspace contributes NO profile entry, so its MCP processes
   * never start — the escape hatch for "I do not want this project's servers
   * running right now". Sessions in a disabled workspace see only the global
   * servers.
   */
  enabled: boolean
}

export interface StateFile {
  version: number
  workspaces: WorkspaceRecord[]
}

/**
 * Canonicalise a path.
 *
 * `realpathSync` throws for a missing path, and a session may legitimately start
 * in a directory that no longer exists, so fall back to the raw value.
 */
export function canonicalPath(input: string): string {
  try {
    return realpathSync(input)
  } catch {
    return input
  }
}

/** Stable 8-hex identity for a canonical root. */
export function workspaceIdOf(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 8)
}

/** `<DSH_HOME>/yiklek/state.json` */
export function stateFile(): string {
  return join(dshHome(), NAMESPACE_DIR, 'state.json')
}

function emptyState(): StateFile {
  return { version: 1, workspaces: [] }
}

/** Read the registry. A missing or broken file is an empty registry, never a throw. */
export function readState(file = stateFile()): StateFile {
  if (!existsSync(file)) return emptyState()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<StateFile>
    const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : []
    return {
      version: typeof raw.version === 'number' ? raw.version : 1,
      // Recompute identity from the root so a hand-edited file still behaves.
      // Dedupe by canonical root: two rows for the same directory (a hand edit, two
      // concurrent registrations) would materialise that workspace's servers twice,
      // so the same MCP server would run as two processes and appear under two names.
      workspaces: [
        ...workspaces
          .filter((item): item is WorkspaceRecord => typeof item?.root === 'string' && item.root !== '')
          .map((item) => ({
            // Canonicalise on READ, not only on register: a hand-edited registry may
            // hold `/var/...` where the session reports `/private/var/...`, and the
            // mismatch would make `denyToolsFor` silently deny nothing.
            root: canonicalPath(item.root),
            id: workspaceIdOf(canonicalPath(item.root)),
            ...(item.suffix === undefined ? {} : { suffix: item.suffix }),
            addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
            // A registry written before this flag existed counts as enabled.
            enabled: item.enabled !== false,
          }))
          .reduce<WorkspaceRecord[]>((unique, record) => {
            if (!unique.some((seen) => seen.root === record.root)) unique.push(record)
            return unique
          }, []),
      ],
    }
  } catch {
    return emptyState()
  }
}

/** Write the registry atomically, 0600 like the other two files. */
export function writeState(state: StateFile, file = stateFile()): void {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, file)
  } catch (error) {
    try {
      unlinkSync(temp)
    } catch {
      /* already gone */
    }
    throw error
  }
}

/**
 * Add a workspace if it is not already known, and return the resulting registry.
 *
 * The path is canonicalised first, so registering `/tmp/x` twice — once directly
 * and once as `/private/tmp/x` — is a no-op the second time.
 */
export function registerWorkspace(
  state: StateFile,
  root: string,
  now = Date.now(),
): { state: StateFile; record: WorkspaceRecord; added: boolean } {
  const canonical = canonicalPath(root)
  const existing = state.workspaces.find((item) => item.root === canonical)
  if (existing !== undefined) return { state, record: existing, added: false }

  const record: WorkspaceRecord = { root: canonical, id: workspaceIdOf(canonical), addedAt: now, enabled: true }
  const next: StateFile = { version: state.version, workspaces: [...state.workspaces, record] }
  return { state: next, record, added: true }
}

/** Find a registered workspace by path. */
export function findWorkspace(state: StateFile, root: string): WorkspaceRecord | undefined {
  const canonical = canonicalPath(root)
  return state.workspaces.find((item) => item.root === canonical)
}

/**
 * The project root for a session, from its working directory.
 *
 * `header.cwd` is the directory the session was created in — stable for the
 * session's lifetime, unlike the mutable working-directory projection. It is
 * already a realpath in practice, and canonicalising again is cheap.
 */
export function sessionWorkspaceRoot(cwd: string | undefined): string | undefined {
  if (cwd === undefined || cwd === '') return undefined
  return canonicalPath(cwd)
}

/** Turn one workspace's materialisation on or off. */
export function setWorkspaceEnabled(state: StateFile, root: string, enabled: boolean): StateFile {
  const canonical = canonicalPath(root)
  return {
    version: state.version,
    workspaces: state.workspaces.map((item) => (item.root === canonical ? { ...item, enabled } : item)),
  }
}

/** The workspaces whose servers should be materialised. */
export function enabledWorkspaces(state: StateFile): WorkspaceRecord[] {
  return state.workspaces.filter((item) => item.enabled !== false)
}
