import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SERVER_NAME_PATTERN,
  denyToolsFor,
  emptyEntry,
  planEntries,
  withSuffix,
  workspaceIdFromServerName,
} from '../../lib/host.mjs'

const server = (name, over = {}) => ({ ...emptyEntry(name), command: 'node', ...over })
const doc = (...servers) => ({ version: 1, servers })

test('a lone global server keeps its bare name', () => {
  const plan = planEntries(doc(server('github')), [])
  assert.deepEqual(plan.materialized.map((m) => m.serverName), ['github'])
  assert.equal(plan.materialized[0].toolPrefix, 'mcp__github__')
  assert.deepEqual([...plan.renamed], [])
})

test('a non-colliding project server also keeps its bare name', () => {
  const plan = planEntries(doc(server('github')), [{ root: '/w/a', document: doc(server('db')) }])
  assert.deepEqual(plan.materialized.map((m) => m.serverName), ['github', 'db'])
  assert.deepEqual([...plan.renamed], [])
})

test('a collision with a GLOBAL name makes the project entry inert, NOT suffixed', () => {
  // The decision was "global wins, the project entry does not take effect, and the
  // panel says so". Suffixing here would silently run a second server under a
  // name the user never wrote.
  const plan = planEntries(doc(server('api')), [{ root: '/w/a', document: doc(server('api')) }])
  assert.equal(plan.materialized.filter((m) => m.scope === 'project').length, 0)
  assert.equal(plan.shadowed.length, 1)
  assert.equal(plan.shadowed[0].entry.name, 'api')
  assert.equal(plan.shadowed[0].reason, 'global-name-taken')
  assert.deepEqual([...plan.renamed], [], 'no rename: the entry simply does not run')
})

test('a global entry keeps the bare name when a project is shadowed', () => {
  const plan = planEntries(doc(server('api')), [{ root: '/w/a', document: doc(server('api')) }])
  assert.equal(plan.materialized[0].serverName, 'api')
  assert.equal(plan.materialized[0].scope, 'global')
})

test('two projects with the same server get DIFFERENT suffixes (neither is authoritative)', () => {
  const plan = planEntries(doc(), [
    { root: '/w/a', document: doc(server('api')) },
    { root: '/w/b', document: doc(server('api')) },
  ])
  const names = plan.materialized.filter((m) => m.scope === 'project').map((m) => m.serverName)
  assert.equal(names.length, 2)
  assert.equal(names[0], 'api', 'the first project keeps the bare name')
  assert.match(names[1], /^api--[0-9a-f]{8}$/, 'the second one is suffixed')
  for (const name of names) assert.equal(SERVER_NAME_PATTERN.test(name), true)
})

test('the first project to claim a free name keeps it (registry order)', () => {
  const plan = planEntries(doc(), [
    { root: '/w/a', document: doc(server('api')) },
    { root: '/w/b', document: doc(server('api')) },
  ])
  const [first, second] = plan.materialized
  assert.equal(first.serverName, 'api', 'no global api, so the first project takes the bare name')
  assert.match(second.serverName, /^api--[0-9a-f]{8}$/)
})

test('a suffix keeps the name inside the 32-character budget', () => {
  const long = 'a'.repeat(32)
  const withS = withSuffix(long, 'deadbeef')
  assert.equal(withS.length, 32)
  assert.ok(withS.endsWith('--deadbeef'))
  assert.equal(SERVER_NAME_PATTERN.test(withS), true)
})

test('disabled servers are not materialised', () => {
  const plan = planEntries(doc(server('a', { enabled: false }), server('b')), [])
  assert.deepEqual(plan.materialized.map((m) => m.serverName), ['b'])
})

test('the workspace id can be recovered from a suffixed name', () => {
  assert.equal(workspaceIdFromServerName('api--a1b2c3d4'), 'a1b2c3d4')
  assert.equal(workspaceIdFromServerName('api'), undefined)
  assert.equal(workspaceIdFromServerName('api--nothex12'), undefined)
})

test('denyToolsFor hides other projects but keeps globals and own tools', () => {
  const plan = planEntries(doc(server('github')), [
    { root: '/w/a', document: doc(server('api')) },
    { root: '/w/b', document: doc(server('api')) },
  ])
  const knownTools = [
    'mcp__github__issue',
    ...plan.materialized
      .filter((m) => m.scope === 'project')
      .flatMap((m) => [`${m.toolPrefix}call`]),
    'bash',
    'read',
  ]

  const aTools = plan.materialized.find((m) => m.workspaceRoot === '/w/a')
  const bTools = plan.materialized.find((m) => m.workspaceRoot === '/w/b')

  const deniedForA = denyToolsFor(plan, knownTools, '/w/a')
  assert.deepEqual(deniedForA, [`${bTools.toolPrefix}call`], 'only B is denied')
  assert.equal(deniedForA.some((n) => n.startsWith('mcp__github__')), false, 'globals never denied')
  assert.equal(deniedForA.some((n) => n === 'bash' || n === 'read'), false, 'built-ins never denied')
  assert.equal(deniedForA.some((n) => n === `${aTools.toolPrefix}call`), false, 'own tools never denied')
})

test('denyToolsFor with no workspace denies every project', () => {
  const plan = planEntries(doc(), [
    { root: '/w/a', document: doc(server('api')) },
    { root: '/w/b', document: doc(server('db')) },
  ])
  const knownTools = plan.materialized.flatMap((m) => [`${m.toolPrefix}x`])
  const denied = denyToolsFor(plan, knownTools, undefined)
  assert.equal(denied.length, 2)
})
