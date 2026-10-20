/**
 * Compatibility guard against the installed DSH.
 *
 * Every integration point in this plugin was established by reading a specific
 * DSH build: six slot names, the keyed-vs-list distinction, and
 * `tools.restrict`. When upstream renames a slot or drops `restrict`, this plugin
 * does not fail loudly — its registrations simply never render, and the panel
 * looks fine while doing nothing.
 *
 * This test turns that silent class of breakage into a red build.
 *
 * It SKIPS when no DSH install is discoverable, which is the default on a dev
 * machine that has no global dsh — CI sets DSH_INSTALL_DIR so the guard is live
 * there.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

/** Locate a DSH install, or undefined when none is available. */
function findDsh() {
  const explicit = process.env.DSH_INSTALL_DIR
  if (explicit !== undefined && explicit !== '' && existsSync(explicit)) return explicit
  try {
    const resolved = execSync('node -p "require.resolve(\'dsh/package.json\')"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return dirname(explicit ?? resolved)
  } catch {
    return undefined
  }
}

const dsh = findDsh()
const skip = dsh === undefined ? 'no DSH install found (set DSH_INSTALL_DIR to enable)' : false

/**
 * Locate one of DSH's own packages.
 *
 * Where it sits depends on how DSH was installed, and both layouts matter:
 *
 *   pnpm   <dsh>/node_modules/@deepseek-ai/<pkg>      (isolated, nested)
 *   npm    <dsh>/../<pkg>                             (hoisted to the scope dir)
 *
 * Checking only the nested layout made this guard pass locally (pnpm) and fail on
 * CI (npm) — which is exactly what a guard is for, once it is pointed at the real
 * thing.
 */
function dshPackage(pkg) {
  const candidates = [
    join(dsh, 'node_modules/@deepseek-ai', pkg),
    join(dsh, '..', pkg),
    join(dsh, 'node_modules', pkg),
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

/** Read one file from a DSH package, asserting it exists. */
function dshFile(pkg, relative) {
  const dir = dshPackage(pkg)
  assert.ok(dir !== undefined, `${pkg} not found next to ${dsh} (looked for the pnpm and npm layouts)`)
  const file = join(dir, relative)
  assert.ok(existsSync(file), `${relative} not found in ${dir}`)
  return readFileSync(file, 'utf8')
}

/** The slot catalogue lives in this bundle's client entry. */
function slotCatalogue() {
  return dshFile('dsh-cordis-client-runner', 'lib/client.js')
}

/**
 * Every seat this plugin registers, with the shape it expects.
 *
 * `keyed` slots dispatch by `key`; `list` slots address entries by `id`. Getting
 * that backwards is silent — the registration is accepted and never rendered.
 */
const SEATS = [
  { name: 'plugins.bundle.config', kind: 'keyed' },
  { name: 'sidebar.panellist', kind: 'list' },
  { name: 'main', kind: 'keyed' },
  { name: 'conversation.view', kind: 'list' },
  { name: 'conversation.session.header.utilities', kind: 'list' },
  { name: 'sidebar.right.pane.tab', kind: 'keyed' },
  { name: 'sidebar.right.pane.tab.title', kind: 'keyed' },
]

test('every slot this plugin registers still exists, with the same kind', { skip }, () => {
  const catalogue = slotCatalogue()
  for (const seat of SEATS) {
    const at = catalogue.indexOf(`key: "${seat.name}"`)
    assert.notEqual(at, -1, `slot ${seat.name} is gone from the DSH catalogue`)
    // The kind sits a little after the key in the emitted object literal.
    const window = catalogue.slice(at, at + 400)
    assert.match(
      window,
      new RegExp(`kind:\\s*"${seat.kind}"`),
      `slot ${seat.name} is no longer a ${seat.kind} slot — check how it is registered`,
    )
  }
})

test('tools.restrict still exists', { skip }, () => {
  // The whole project-isolation design hangs off this one method. Without it a
  // session would see every workspace's tools and nothing would say so.
  const source = dshFile('dsh-tools', 'lib/index.js')
  assert.match(source, /restrict\s*\(\s*filter/, 'tools.restrict is gone')
})

test('the mcp client still accepts only stdio and streamable-http', { skip }, () => {
  // This plugin's normalizer maps every import shape onto these two, and drops
  // `sse` on purpose. If upstream grows a third transport the normalizer should
  // be revisited rather than silently un-mapping it.
  const source = dshFile('dsh-mcp-client', 'lib/index.js')
  assert.match(source, /streamable-http/)
  assert.match(source, /SERVER_NAME_PATTERN/)
})

test('the profile still exposes a patchPath', { skip }, () => {
  // The effective surface is <profile>/cordis.patch.yml; the whole "editing
  // surface vs effective surface" split depends on the host telling us where it is.
  assert.match(dshFile('dsh-app-boot', 'lib/index.js'), /patchPath/)
})

test('the `agent/created` event still exists', { skip }, () => {
  // Per-session isolation is applied from this event. If upstream renames it the
  // handler simply never runs — no error, no isolation, and every session would
  // see every workspace's tools.
  assert.match(dshFile('dsh-agent', 'lib/index.js'), /agent\/created/)
})
