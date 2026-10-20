/**
 * Where the two `mcp.json` files live.
 *
 *   global   <DSH_HOME>/yiklek/mcp.json
 *   project  <workspace>/.dsh/yiklek/mcp.json
 *
 * The `yiklek` segment is a deliberate namespace: it is the plugin owner's bag,
 * not the package name, so other plugins by the same owner can share it later.
 * It also mirrors the existing convention on this machine
 * (`<DSH_HOME>/@wingsky-1/dsh-mcp-manager/mcp.json`).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CONFIG_FILE_NAME, NAMESPACE_DIR } from '../shared.js'

/** `DSH_HOME` when set and non-blank, else `~/.dsh`. Same rule as DSH itself. */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** `<DSH_HOME>/yiklek/mcp.json` — the global file. */
export function globalConfigFile(): string {
  return join(dshHome(), NAMESPACE_DIR, CONFIG_FILE_NAME)
}

/** `<workspace>/.dsh/yiklek/mcp.json` — the project file. */
export function projectConfigFile(workspaceRoot: string): string {
  return join(workspaceRoot, '.dsh', NAMESPACE_DIR, CONFIG_FILE_NAME)
}
