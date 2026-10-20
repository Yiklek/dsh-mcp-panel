import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canonicalPath,
  findWorkspace,
  readState,
  registerWorkspace,
  writeState,
  workspaceIdOf,
} from '../../lib/host.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'mcp-ws-'))
const empty = { version: 1, workspaces: [] }

test('a missing registry reads as empty', () => {
  assert.deepEqual(readState(join(dir(), 'nope.json')).workspaces, [])
})

test('registering adds a record with a stable id', () => {
  const root = dir()
  const { state, record, added } = registerWorkspace(empty, root)
  assert.equal(added, true)
  assert.equal(record.root, canonicalPath(root))
  assert.equal(record.id, workspaceIdOf(record.root))
  assert.equal(state.workspaces.length, 1)
})

test('registering the same directory twice is a no-op', () => {
  const root = dir()
  const first = registerWorkspace(empty, root)
  const second = registerWorkspace(first.state, root)
  assert.equal(second.added, false)
  assert.equal(second.state.workspaces.length, 1)
})

test('paths are canonicalised, so symlinked spellings collapse', () => {
  // /tmp and /private/tmp are the same directory on macOS; whichever spelling the
  // caller uses, one record must result.
  const root = dir()
  const viaReal = canonicalPath(root)
  const first = registerWorkspace(empty, root)
  const second = registerWorkspace(first.state, viaReal)
  assert.equal(second.added, false, 'the same directory under either spelling is one workspace')
  assert.equal(second.state.workspaces.length, 1)
})

test('a missing directory falls back to the raw path instead of throwing', () => {
  const ghost = join(dir(), 'does-not-exist')
  assert.equal(canonicalPath(ghost), ghost)
})

test('the registry round-trips through disk with 0600', () => {
  const file = join(dir(), 'state.json')
  const { state } = registerWorkspace(empty, dir())
  writeState(state, file)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(readState(file).workspaces.length, 1)
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).workspaces[0].root)
})

test('a corrupt registry reads as empty rather than crashing the plugin', () => {
  const file = join(dir(), 'state.json')
  writeState({ version: 1, workspaces: [] }, file)
  const broken = join(dir(), 'broken.json')
  writeFileSync(broken, '{not json')
  assert.deepEqual(readState(broken).workspaces, [])
})

test('finding uses the canonical path', () => {
  const root = dir()
  const { state } = registerWorkspace(empty, root)
  assert.ok(findWorkspace(state, canonicalPath(root)))
  assert.equal(findWorkspace(state, join(root, 'nope')), undefined)
})

test('a hand-edited registry is canonicalised on read', () => {
  // Roots are normalised on READ, not just on register: a hand-edited `/var/...`
  // against a session reporting `/private/var/...` would make denyToolsFor deny
  // nothing at all, silently.
  const file = join(dir(), 'state.json')
  const root = dir()
  writeFileSync(file, JSON.stringify({ version: 1, workspaces: [{ root }] }))
  const state = readState(file)
  assert.equal(state.workspaces[0].root, canonicalPath(root), 'root is canonical')
  assert.equal(state.workspaces[0].id, workspaceIdOf(canonicalPath(root)), 'id is recomputed from the canonical root')
  assert.equal(state.workspaces[0].enabled, true, 'a pre-flag registry counts as enabled')
})

test('a registry listing the same directory twice collapses to one row', () => {
  // Two rows for one directory would materialise its servers twice, so the same MCP
  // server would run as two processes and appear under two names.
  const file = join(dir(), 'state.json')
  const root = dir()
  writeFileSync(file, JSON.stringify({ version: 1, workspaces: [{ root, addedAt: 1 }, { root, addedAt: 2 }] }))
  const state = readState(file)
  assert.equal(state.workspaces.length, 1)
  assert.equal(state.workspaces[0].root, canonicalPath(root))
})
