/**
 * Controller integration tests.
 *
 * These exist because `tsc` cannot see a temporal dead zone. A `const` used before
 * its declaration type-checks fine and crashes at runtime — which is exactly how
 * `Cannot access 'shadowedByWorkspace' before initialization` shipped. Every test
 * here calls the real `list()`/`refresh()` path rather than a helper.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, lstatSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = () => mkdtempSync(join(tmpdir(), 'mcp-ctl-'))

/** A server entry, matching what the panel sends. */
const server = (name, over = {}) => ({
  name,
  enabled: true,
  transport: 'stdio',
  command: 'node',
  args: ['x.mjs'],
  env: {},
  cwd: '',
  url: '',
  headers: {},
  ...over,
})

/** Fresh DSH_HOME, a global config, and one project config. */
function setup({ global = [], project = [], workspace = 'proj' } = {}) {
  const home = dir()
  const root = join(home, 'ws', workspace)
  mkdirSync(join(home, 'yiklek'), { recursive: true })
  mkdirSync(join(root, '.dsh', 'yiklek'), { recursive: true })
  writeFileSync(join(home, 'yiklek', 'mcp.json'), JSON.stringify({ version: 1, servers: global }, null, 2))
  if (project.length > 0) {
    writeFileSync(join(root, '.dsh', 'yiklek', 'mcp.json'), JSON.stringify({ version: 1, servers: project }, null, 2))
  }
  // The registry lists the workspace, the way the panel would have.
  writeFileSync(
    join(home, 'yiklek', 'state.json'),
    JSON.stringify({ version: 1, workspaces: [{ root, addedAt: 1, enabled: true }] }, null, 2),
  )
  process.env.DSH_HOME = home
  const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true })
  writeFileSync(patchPath, '# template\n[]\n')
  return { home, root, patchPath }
}

async function loadController() {
  // Fresh import per test: the modules read DSH_HOME at call time, but a clean
  // module cache keeps the tests independent.
  return import(`../../lib/host.mjs?t=${Date.now()}${Math.random()}`)
}

test('list() does not throw when a project entry is shadowed by a global name', async () => {
  // The regression: `shadowedByWorkspace` was declared AFTER the project mapping
  // that reads it, so this exact call threw a TDZ ReferenceError.
  const { patchPath } = setup({ global: [server('api', { command: 'g' })], project: [server('api', { command: 'p' })] })
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const payload = controller.list()
  assert.equal(payload.projects.length, 1)
  assert.deepEqual(payload.projects[0].shadowed.map((s) => s.name), ['api'])
  assert.equal(payload.projects[0].shadowed[0].reason, 'global-name-taken')
  assert.equal(payload.global.servers[0].command, 'g', 'the global definition is the one in force')
})

test('a project config is materialised into the patch file', async () => {
  const { patchPath } = setup({ global: [server('shared')], project: [server('onlyhere')] })
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => ['mcp__shared__t', 'mcp__onlyhere__t'] })
  await controller.refresh()
  const text = readFileSync(patchPath, 'utf8')
  assert.ok(text.includes('serverName: shared'))
  assert.ok(text.includes('serverName: onlyhere'))
  assert.equal(controller.list().sync.materialized.length, 2)
})

test('two projects with the same name both run, the later one suffixed', async () => {
  const { home, root, patchPath } = setup({ project: [server('api')] })
  const second = join(home, 'ws', 'proj-b')
  mkdirSync(join(second, '.dsh', 'yiklek'), { recursive: true })
  writeFileSync(join(second, '.dsh', 'yiklek', 'mcp.json'), JSON.stringify({ version: 1, servers: [server('api')] }))
  writeFileSync(
    join(home, 'yiklek', 'state.json'),
    JSON.stringify({
      version: 1,
      workspaces: [
        { root, addedAt: 1, enabled: true },
        { root: second, addedAt: 2, enabled: true },
      ],
    }),
  )
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const names = controller.list().sync.materialized
  assert.equal(names.length, 2)
  assert.notEqual(names[0], names[1], 'both are materialised under distinct names')
})

test('a disabled workspace contributes nothing, so its processes never start', async () => {
  const { home, root, patchPath } = setup({ project: [server('api')] })
  writeFileSync(
    join(home, 'yiklek', 'state.json'),
    JSON.stringify({ version: 1, workspaces: [{ root, addedAt: 1, enabled: false }] }),
  )
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  assert.deepEqual(controller.list().sync.materialized, [])
  assert.equal(readFileSync(patchPath, 'utf8').includes('serverName: api'), false)
})

test('denyToolsFor hides other projects and keeps globals', async () => {
  const { home, root, patchPath } = setup({ global: [server('shared')], project: [server('api')] })
  const other = join(home, 'ws', 'other')
  mkdirSync(join(other, '.dsh', 'yiklek'), { recursive: true })
  writeFileSync(join(other, '.dsh', 'yiklek', 'mcp.json'), JSON.stringify({ version: 1, servers: [server('db')] }))
  writeFileSync(
    join(home, 'yiklek', 'state.json'),
    JSON.stringify({
      version: 1,
      workspaces: [
        { root, addedAt: 1, enabled: true },
        { root: other, addedAt: 2, enabled: true },
      ],
    }),
  )
  const tools = ['mcp__shared__t', 'mcp__api__t', 'mcp__db__t', 'bash', 'read']
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => tools })
  await controller.refresh()
  const denied = controller.denyToolsFor(root)
  assert.deepEqual(denied, ['mcp__db__t'], 'only the other workspace is hidden')
  assert.equal(controller.denyToolsFor(other).length, 1)
  assert.deepEqual(controller.denyToolsFor(undefined).length, 2, 'no workspace hides both projects')
})

test('a project config behind a symlink is written THROUGH, not replaced', async () => {
  // A workspace may point `.dsh/yiklek/mcp.json` at a file it already had.
  const { root, patchPath } = setup({})
  const outside = join(root, '.mcp.json')
  writeFileSync(outside, JSON.stringify({ mcpServers: { viv: { command: 'node', args: ['v.mjs'] } } }, null, 2))
  symlinkSync(outside, join(root, '.dsh', 'yiklek', 'mcp.json'))

  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  await controller.save({ scope: 'project', workspaceRoot: root, servers: [server('viv'), server('added')] })

  const target = join(root, '.dsh', 'yiklek', 'mcp.json')
  assert.ok(lstatSync(target).isSymbolicLink(), 'the symlink must survive')
  const written = JSON.parse(readFileSync(outside, 'utf8'))
  // The target was a Claude-shaped `.mcp.json`, which another client may also
  // read, so the save keeps that shape instead of switching to this plugin's.
  assert.deepEqual(Object.keys(written), ['mcpServers'], 'the file keeps the shape it had')
  assert.deepEqual(Object.keys(written.mcpServers).sort(), ['added', 'viv'], 'the real file got the write')
})

test('refresh() adopts a workspace that has a config but was never registered', async () => {
  const { home, root } = setup({ project: [server('api')] })
  const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
  // Drop the registry: this is the "I wrote the file by hand" case.
  writeFileSync(join(home, 'yiklek', 'state.json'), JSON.stringify({ version: 1, workspaces: [] }))

  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh([root])

  assert.equal(controller.workspaces().length, 1, 'the workspace got registered')
  assert.deepEqual(controller.list().projects[0].servers.map((s) => s.name), ['api'])
  assert.ok(existsSync(patchPath))
  assert.ok(readFileSync(patchPath, 'utf8').includes('serverName: api'), 'and its server is materialised')
})

test('an empty materialisation never leaves a non-array patch file', async () => {
  // The failure mode: a comments-only document makes DSH refuse to boot.
  const { home } = setup({})
  const { parse } = await import('yaml')
  const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
  writeFileSync(patchPath, '# template\n[]\n')

  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()

  const parsed = parse(readFileSync(patchPath, 'utf8'))
  assert.ok(Array.isArray(parsed), 'still an array: ' + JSON.stringify(parsed))
})

test('the import preview reports what the save step would reject', async () => {
  // The preview used to say "will be added" for entries the save then refused —
  // an import that reports success and does nothing.
  const { patchPath } = setup({})
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()

  const bad = controller.previewImport({ json: { mcpServers: { 'bad name!': { command: 'npx' } } }, scope: 'global' })
  assert.deepEqual(bad.added, ['bad name!'], 'the parse still recognises it')
  assert.equal(bad.blocking.length, 1, 'but the preview says it will be refused')

  const empty = controller.previewImport({ json: { mcpServers: { nocommand: {} } }, scope: 'global' })
  assert.equal(empty.blocking.length, 1)

  const good = controller.previewImport({ json: { mcpServers: { ok: { command: 'npx', args: ['-y', 'x'] } } }, scope: 'global' })
  assert.deepEqual(good.blocking, [], 'a valid entry reports nothing')
})

test('the import preview counts a replaced name and leaves the rest alone', async () => {
  const { patchPath } = setup({ global: [server('existing')] })
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const preview = controller.previewImport({
    json: { mcpServers: { existing: { command: 'npx' }, fresh: { command: 'npx' } } },
    scope: 'global',
  })
  assert.deepEqual(preview.added, ['fresh'])
  assert.deepEqual(preview.replaced, ['existing'])
})

test('denials follow an edit made to the profile file outside the panel', async () => {
  // The cached plan is refreshed on boot and on panel reads. A session started
  // after someone hand-edited the patch — without opening the panel — computed its
  // denials from that stale plan, so the new entries' tools were visible in every
  // workspace: the exact isolation leak this project exists to prevent.
  const { root, patchPath } = setup({ global: [server('shared')] })
  const other = 'deadbeef'
  const host = await loadController()
  const tools = [
    'mcp__shared__t',
    `mcp__other--${other}__t`,
    'bash',
  ]
  const controller = new host.Controller({ patchPath, listTools: () => tools })
  await controller.refresh()
  assert.deepEqual(controller.denyToolsFor(root), [], 'nothing foreign is materialised yet')

  // Inject a project entry from ANOTHER workspace, straight into the patch file.
  const fs = await import('node:fs')
  fs.writeFileSync(
    patchPath,
    fs.readFileSync(patchPath, 'utf8').trimEnd() +
      '\n' +
      [
        '- insert:',
        `    - id: mcp-panel-${other}--other`,
        '      name: "@deepseek-ai/dsh-mcp-client"',
        '      config:',
        `        serverName: other--${other}`,
        '        transport: stdio',
        '        command: n',
        '',
      ].join('\n'),
  )

  assert.deepEqual(controller.denyToolsFor(root), [`mcp__other--${other}__t`], 'no panel read needed')
})

test('a save from a stale read is refused instead of discarding the other change', async () => {
  // Several seats can be open at once (plugin page, sidebar page, session tab),
  // each holding its own copy. Without a revision check the later save silently
  // dropped the other one's edit — verified as real data loss before this test.
  const { patchPath } = setup({})
  const host = await loadController()
  const a = new host.Controller({ patchPath, listTools: () => [] })
  const b = new host.Controller({ patchPath, listTools: () => [] })
  await a.refresh()
  await b.refresh()

  const revisionA = a.list().global.revision
  const revisionB = b.list().global.revision
  assert.equal(revisionA, revisionB, 'both read the same bytes')

  const first = await a.save({ scope: 'global', servers: [server('from-a')], revision: revisionA })
  assert.equal(first.ok, true)

  const second = await b.save({ scope: 'global', servers: [server('from-b')], revision: revisionB })
  assert.equal(second.ok, false)
  assert.equal(second.conflict, true, 'the stale writer is told why')

  await b.refresh()
  assert.deepEqual(b.list().global.servers.map((s) => s.name), ['from-a'], 'the first write survived')

  const retry = await b.save({
    scope: 'global',
    servers: [...b.list().global.servers, server('from-b')],
    revision: b.list().global.revision,
  })
  assert.equal(retry.ok, true)
  assert.deepEqual(b.list().global.servers.map((s) => s.name).sort(), ['from-a', 'from-b'])
})

test('a save without a revision still works (older callers, imports)', async () => {
  const { patchPath } = setup({})
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const result = await controller.save({ scope: 'global', servers: [server('x')] })
  assert.equal(result.ok, true)
})

test('the revision changes when the file changes', async () => {
  const { patchPath } = setup({})
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const before = controller.list().global.revision
  await controller.save({ scope: 'global', servers: [server('x')] })
  assert.notEqual(controller.list().global.revision, before)
})

test('export reports what its format cannot carry', async () => {
  // A round trip through the mainstream shapes drops `enabled: false` and the
  // timeout field — both silently, before this. Backup, edit, re-import and those
  // settings were gone with no warning.
  const { patchPath } = setup({
    global: [
      server('live'),
      server('off', { enabled: false }),
      server('timed', { toolCallTimeoutMs: 45000 }),
    ],
  })
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()

  const exported = controller.exportConfig({ scope: 'global' })
  assert.equal(exported.format, 'claude')
  assert.deepEqual(exported.omitted, { disabled: 1, timeouts: 1 }, 'the caller can warn about both')
  assert.equal(exported.text.includes('"off"'), false, 'the disabled entry really is left out')
})

test('a clean configuration has nothing to omit', async () => {
  const { patchPath } = setup({ global: [server('plain')] })
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  assert.deepEqual(controller.exportConfig({ scope: 'global' }).omitted, { disabled: 0, timeouts: 0 })
})

test('a workspace may not declare more servers than the cap', async () => {
  // Every project server becomes a profile entry and runs on every boot, so this
  // is a hard limit rather than advice — the README states it, so it has to hold.
  const { patchPath } = setup({})
  const host = await loadController()
  const controller = new host.Controller({ patchPath, listTools: () => [] })
  await controller.refresh()
  const root = (await import('node:fs')).realpathSync(join(patchPath, '../../..', 'ws', 'proj'))
  const many = (count) => Array.from({ length: count }, (_, i) => server('srv-' + i))

  const atCap = await controller.save({ scope: 'project', workspaceRoot: root, servers: many(host.MAX_PROJECT_SERVERS) })
  assert.equal(atCap.ok, true, 'exactly at the cap is allowed')

  const overCap = await controller.save({ scope: 'project', workspaceRoot: root, servers: many(host.MAX_PROJECT_SERVERS + 1) })
  assert.equal(overCap.ok, false)
  assert.equal(overCap.issues[0].code, 'too-many-servers')

  // The global file is the place where "more" is a deliberate choice.
  const global = await controller.save({ scope: 'global', servers: many(host.MAX_PROJECT_SERVERS + 4) })
  assert.equal(global.ok, true, 'the global file is not capped')
})
