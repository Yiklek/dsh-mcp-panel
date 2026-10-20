import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { dshHome, globalConfigFile, projectConfigFile } from '../../lib/host.mjs'

test('DSH_HOME wins when set and non-blank', () => {
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/some-home'
  assert.equal(dshHome(), '/tmp/some-home')
  process.env.DSH_HOME = '   '
  assert.equal(dshHome(), join(homedir(), '.dsh'), 'a blank DSH_HOME falls back to ~/.dsh')
  if (before === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = before
})

test('global config is <DSH_HOME>/yiklek/mcp.json', () => {
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/h'
  assert.equal(globalConfigFile(), join('/tmp/h', 'yiklek', 'mcp.json'))
  if (before === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = before
})

test('project config is <workspace>/.dsh/yiklek/mcp.json', () => {
  assert.equal(projectConfigFile('/w'), join('/w', '.dsh', 'yiklek', 'mcp.json'))
})
