/**
 * Deciding the profile-level `serverName` for every server.
 *
 * The official client requires `serverName` to be globally unique because it
 * becomes part of the model-facing tool name (`mcp__<serverName>__<tool>`), and
 * it must match `SERVER_NAME_PATTERN` (`/^[A-Za-z0-9_-]{1,32}$/`).
 *
 * But `mcp.json` names are only unique WITHIN a file — two projects may both
 * define `api`. So project servers that collide get a deterministic suffix:
 *
 *   global  api              → api                  tools mcp__api__*
 *   proj A  api              → api--a1b2c3d4        tools mcp__api--a1b2c3d4__*
 *   proj B  api              → api--e5f6a7b8        tools mcp__api--e5f6a7b8__*
 *
 * A non-colliding project server keeps its bare name, so the common case stays
 * clean. Who keeps the bare name on a collision is decided by registry order
 * (oldest workspace first), which is stable on this machine.
 */
import { SERVER_NAME_PATTERN, type McpDocument, type McpServerEntry } from '../shared.js'
import { workspaceIdOf } from './workspaces.js'

export const MAX_SERVER_NAME = 32

export interface WorkspaceInput {
  root: string
  document: McpDocument | null
}

export interface Materialized {
  entry: McpServerEntry
  scope: 'global' | 'project'
  /** Present for project entries. */
  workspaceRoot?: string
  /** Present for project entries; also encoded in `id`. */
  workspaceId?: string
  /** The profile-level name: may carry a workspace suffix. */
  serverName: string
  /** Profile entry id — the ONLY place a project entry's origin is recorded. */
  id: string
  /** `mcp__<serverName>__` */
  toolPrefix: string
}

export interface Rename {
  name: string
  serverName: string
  scope: 'global' | 'project'
  workspaceRoot?: string
}

/** A project entry that does NOT take effect, with the reason. */
export interface Shadowed {
  entry: McpServerEntry
  workspaceRoot: string
  /** `global-name-taken`: a global server already owns that name. */
  reason: 'global-name-taken'
}

export interface NamingPlan {
  materialized: Materialized[]
  /** Servers whose profile name differs from their `mcp.json` name. */
  renamed: Rename[]
  /**
   * Project entries that are defined but inert.
   *
   * A collision with a GLOBAL server does not get a suffix: the decision was
   * "global wins, the project entry does not take effect, and the panel says so".
   * Suffixing there would silently run a second server under a name the user
   * never wrote. A collision between two PROJECTS is different — neither is more
   * authoritative, so those get a workspace suffix instead.
   */
  shadowed: Shadowed[]
  /** Servers that could not be named within the pattern. */
  invalid: Array<{ name: string; reason: string }>
}

const ID_PREFIX = 'mcp-panel-'

/**
 * Profile entry id for a global server.
 *
 * A project entry uses {@link projectEntryId} instead, because its id must record
 * which workspace owns it: the visible `serverName` may be a bare, non-unique
 * name (`api`), and folding the patch file back needs to know that it is proj-a's
 * `api` rather than a global one. Encoding it in the id avoids guessing from the
 * name — a guess that once moved a project server into the global file.
 */
export function entryIdFor(serverName: string): string {
  return `${ID_PREFIX}${serverName}`
}

/** Profile entry id for a project server: `<prefix><workspaceId>--<local name>`. */
export function projectEntryId(workspaceId: string, name: string): string {
  return `${ID_PREFIX}${workspaceId}--${name}`
}

export interface ParsedEntryId {
  scope: 'global' | 'project'
  /** Present for project entries. */
  workspaceId?: string
  /** The name as written in the owning `mcp.json`. */
  name: string
}

/** Decode an entry id produced by this module, or undefined when it is foreign. */
export function parseEntryId(id: string): ParsedEntryId | undefined {
  if (!id.startsWith(ID_PREFIX)) return undefined
  const rest = id.slice(ID_PREFIX.length)
  const match = /^([0-9a-f]{8})--(.+)$/.exec(rest)
  const workspaceId = match?.[1]
  const localName = match?.[2]
  if (workspaceId !== undefined && localName !== undefined) {
    return { scope: 'project', workspaceId, name: localName }
  }
  return { scope: 'global', name: rest }
}

/**
 * Append a workspace suffix, staying inside the 32-character budget.
 *
 * The suffix is trimmed, never the hash: the hash is what makes the name unique.
 */
export function withSuffix(name: string, workspaceId: string): string {
  const suffix = `--${workspaceId}`
  const budget = MAX_SERVER_NAME - suffix.length
  return `${name.slice(0, Math.max(1, budget))}${suffix}`
}

/**
 * Plan every profile entry: the global servers plus every registered workspace's.
 *
 * Order is global first, then workspaces in the order given (callers pass the
 * registry order), and within a file the declaration order.
 */
export function planEntries(global: McpDocument, workspaces: readonly WorkspaceInput[]): NamingPlan {
  const claimed = new Set<string>()
  const globalNames = new Set<string>()
  const materialized: Materialized[] = []
  const renamed: Rename[] = []
  const shadowed: Shadowed[] = []
  const invalid: NamingPlan['invalid'] = []

  const add = (
    entry: McpServerEntry,
    scope: 'global' | 'project',
    workspaceRoot: string | undefined,
    serverName: string,
  ): void => {
    if (!SERVER_NAME_PATTERN.test(serverName)) {
      invalid.push({ name: entry.name, reason: `"${serverName}" does not match the server-name pattern` })
      return
    }
    claimed.add(serverName)
    const workspaceId = workspaceRoot === undefined ? undefined : workspaceIdOf(workspaceRoot)
    materialized.push({
      entry,
      scope,
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
      ...(workspaceId === undefined ? {} : { workspaceId }),
      serverName,
      id: workspaceId === undefined ? entryIdFor(serverName) : projectEntryId(workspaceId, entry.name),
      toolPrefix: `mcp__${serverName}__`,
    })
    if (serverName !== entry.name) {
      renamed.push({ name: entry.name, serverName, scope, ...(workspaceRoot === undefined ? {} : { workspaceRoot }) })
    }
  }

  // 1) Global servers keep their names unless they are themselves duplicated
  //    (which validation rejects before we ever get here).
  for (const entry of global.servers) {
    if (entry.enabled === false) continue
    globalNames.add(entry.name)
    add(entry, 'global', undefined, entry.name)
  }

  // 2) Project servers take a bare name when it is free, else a suffixed one.
  for (const workspace of workspaces) {
    if (workspace.document === null) continue
    const workspaceId = workspaceIdOf(workspace.root)
    for (const entry of workspace.document.servers) {
      if (entry.enabled === false) continue
      if (globalNames.has(entry.name)) {
        // Global wins; the project entry stays in its file but is inert.
        shadowed.push({ entry, workspaceRoot: workspace.root, reason: 'global-name-taken' })
        continue
      }
      if (!claimed.has(entry.name)) {
        add(entry, 'project', workspace.root, entry.name)
        continue
      }
      // Collision with ANOTHER PROJECT: neither is authoritative, so both keep
      // running and the later one gets a workspace suffix.
      // If even that is taken (an astronomically unlikely hash prefix clash),
      // widen with a counter so the result stays deterministic.
      const candidate = withSuffix(entry.name, workspaceId)
      if (!claimed.has(candidate)) {
        add(entry, 'project', workspace.root, candidate)
        continue
      }
      const widened = `${candidate.slice(0, MAX_SERVER_NAME - 3)}_x1`
      add(entry, 'project', workspace.root, widened)
    }
  }

  return { materialized, renamed, shadowed, invalid }
}

/**
 * Tool names that must be DENIED to a session in `workspaceRoot`.
 *
 * Everything that belongs to a DIFFERENT workspace is hidden; global servers and
 * this workspace's own servers stay visible. Built-in tools are never named here,
 * because `tools.restrict` applies to global tools and `deny` removes exactly the
 * names it lists (P2-a verified).
 */
export function denyToolsFor(plan: NamingPlan, knownTools: readonly string[], workspaceRoot: string | undefined): string[] {
  const denied: string[] = []
  for (const item of plan.materialized) {
    if (item.scope === 'global') continue
    if (workspaceRoot !== undefined && item.workspaceRoot === workspaceRoot) continue
    denied.push(...knownTools.filter((name) => name.startsWith(item.toolPrefix)))
  }
  return [...new Set(denied)]
}

/**
 * The workspace id encoded in a server name, when it carries a suffix.
 *
 * Used when folding the profile patch file back into `mcp.json`: an entry named
 * `api--a1b2c3d4` belongs to the workspace whose id is `a1b2c3d4`.
 */
export function workspaceIdFromServerName(serverName: string): string | undefined {
  const match = /--([0-9a-f]{8})$/.exec(serverName)
  return match === null ? undefined : match[1]
}

/**
 * Tool names to deny, computed from what the PROFILE FILE says rather than from a
 * cached plan.
 *
 * The cache was refreshed on boot and on every panel read, so a session started
 * after someone edited the patch file by hand — without opening the panel —
 * computed its denials from a stale plan: the new entries' tools were visible in
 * every workspace, which is exactly the isolation this project exists to provide.
 * The patch file is what the loader loaded, so it is the honest source.
 */
export function denyToolsFromPatch(
  entries: ReadonlyArray<{ serverName: string; workspaceId?: string }>,
  knownTools: readonly string[],
  workspaceId: string | undefined,
): string[] {
  const denied: string[] = []
  for (const entry of entries) {
    // A global entry has no workspaceId; it applies everywhere and is never denied.
    if (entry.workspaceId === undefined) continue
    if (workspaceId !== undefined && entry.workspaceId === workspaceId) continue
    const prefix = `mcp__${entry.serverName}__`
    denied.push(...knownTools.filter((name) => name.startsWith(prefix)))
  }
  return [...new Set(denied)]
}
