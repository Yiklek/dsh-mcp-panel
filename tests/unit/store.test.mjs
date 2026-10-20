import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyEntry, readDocument, serializeInFormat, writeDocument } from '../../lib/host.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'mcp-store-'))
const server = (name) => ({ ...emptyEntry(name), command: 'node' })

test('a missing file reads as an empty document, not an error', () => {
  const result = readDocument(join(dir(), 'nope.json'))
  assert.equal(result.exists, false)
  assert.equal(result.error, undefined)
  assert.deepEqual([...result.document.servers], [])
})

test('a malformed file reports the problem instead of throwing', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, '{ not json')
  const result = readDocument(file)
  assert.equal(result.exists, true)
  assert.match(result.error, /Invalid JSON/)
})

test('an unrecognised shape is reported', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, JSON.stringify({ hello: 'world' }))
  assert.match(readDocument(file).error, /Unrecognised/)
})

test('write then read round-trips', () => {
  const file = join(dir(), 'mcp.json')
  const document = { version: 1, servers: [server('a'), server('b')] }
  writeDocument(file, document)
  const back = readDocument(file)
  assert.deepEqual(back.document.servers.map((s) => s.name), ['a', 'b'])
  assert.equal(back.error, undefined)
})

test('the file is created 0600 because it holds credentials', () => {
  const file = join(dir(), 'mcp.json')
  writeDocument(file, { version: 1, servers: [server('a')] })
  assert.equal(statSync(file).mode & 0o777, 0o600)
})

test('an existing looser mode is tightened on write', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, serializeInFormat('ours', { version: 1, servers: [] }))
  chmodSync(file, 0o644)
  writeDocument(file, { version: 1, servers: [server('a')] })
  assert.equal(statSync(file).mode & 0o777, 0o600)
})

test('a hand-written mcpServers shape inside our own path still loads', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, JSON.stringify({ mcpServers: { legacy: { command: 'npx' } } }))
  const back = readDocument(file)
  assert.equal(back.document.servers[0].name, 'legacy')
})

test('writing leaves no temp files behind', () => {
  const base = dir()
  const file = join(base, 'mcp.json')
  writeDocument(file, { version: 1, servers: [server('a')] })
  const leftovers = readFileSync(file, 'utf8')
  assert.ok(leftovers.length > 0)
  assert.equal(existsSync(`${file}.tmp`), false)
})

test('the serialized shape is the documented one', () => {
  const text = serializeInFormat('ours', { version: 1, servers: [server('a')] })
  const parsed = JSON.parse(text)
  assert.deepEqual(Object.keys(parsed), ['version', 'servers'])
  assert.equal(parsed.version, 1)
  assert.ok(text.endsWith('\n'))
})

// ── format preservation ──────────────────────────────────────────────────────
// A workspace may point `<workspace>/.dsh/yiklek/mcp.json` at a `.mcp.json` that
// Claude Code or Cursor also reads. Writing this plugin's own document shape into
// that file leaves it parseable but no longer `mcpServers`-shaped, so the other
// client silently stops seeing its servers.
test('a Claude-shaped file is written back in the Claude shape', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, JSON.stringify({ mcpServers: { a: { command: 'node', args: ['x.js'] } } }))
  const read = readDocument(file)
  assert.equal(read.format, 'claude', 'the reader reports the shape it saw')

  writeDocument(file, read.document, read.format)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(after), ['mcpServers'])
  assert.ok(after.mcpServers.a)
})

test('a VS Code-shaped file keeps its `servers` map and `type` fields', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, JSON.stringify({ servers: { b: { type: 'stdio', command: 'node' } } }))
  const read = readDocument(file)
  assert.equal(read.format, 'vscode')
  writeDocument(file, read.document, read.format)
  const after = JSON.parse(readFileSync(file, 'utf8'))
  assert.deepEqual(Object.keys(after), ['servers'])
  assert.equal(after.servers.b.type, 'stdio')
})

test('a file this plugin wrote keeps its own shape', () => {
  const file = join(dir(), 'mcp.json')
  writeFileSync(file, JSON.stringify({ version: 1, servers: [{ name: 'a', transport: 'stdio', command: 'node' }] }))
  const read = readDocument(file)
  assert.equal(read.format, 'ours')
  writeDocument(file, read.document, read.format)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['version', 'servers'])
})

test('a new file defaults to this plugin own shape', () => {
  const file = join(dir(), 'mcp.json')
  writeDocument(file, { version: 1, servers: [] })
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['version', 'servers'])
})
