import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  REGION_END,
  REGION_START,
  adoptFromPatch,
  buildPatchedText,
  emptyEntry,
  findRegion,
  readPatchFile,
  writePatchFile,
} from '../../lib/host.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'mcp-patch-'))
const server = (name, over = {}) => ({ ...emptyEntry(name), command: 'node', ...over })
const doc = (...servers) => ({ version: 1, servers })

/** Build the materialized shape the patcher now consumes. */
const mat = (name, over = {}) => ({
  entry: server(over.localName ?? name, over),
  scope: over.scope ?? 'global',
  ...(over.workspaceRoot === undefined ? {} : { workspaceRoot: over.workspaceRoot }),
  serverName: over.serverName ?? name,
  id: `mcp-panel-${over.serverName ?? name}`,
  toolPrefix: `mcp__${over.serverName ?? name}__`,
})

const USER_HEADER = `# Your patch layer for this dsh profile.
# Keep my comments!
- insert:
    - id: my-own-plugin
      name: something-else
      config:
        keep: me
`

test('an empty patch file becomes a managed block', () => {
  const text = buildPatchedText('[]', [mat('a')])
  assert.ok(text.includes(REGION_START))
  assert.ok(text.includes(REGION_END))
  assert.equal(text.includes('[]'), false)

  const parsed = parseYaml(text)
  assert.ok(Array.isArray(parsed))
  const inserted = parsed.flatMap((row) => (row && row.insert) || [])
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].name, '@deepseek-ai/dsh-mcp-client')
  assert.equal(inserted[0].id, 'mcp-panel-a')
  assert.equal(inserted[0].config.serverName, 'a')
  assert.equal(inserted[0].config.transport, 'stdio')
})

test('the SHIPPED profile template (comments then []) stays valid YAML', () => {
  const template = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`
  const text = buildPatchedText(template, [mat('a')])
  const parsed = parseYaml(text)
  assert.ok(Array.isArray(parsed), 'the whole file must still parse as one array')
  assert.equal(parsed.flatMap((row) => (row && row.insert) || []).length, 1)
  assert.ok(text.includes('# Your patch layer'), 'the template comments survive')
  assert.equal(/^\s*\[\]\s*$/m.test(text), false)
})

test('a missing file is created with the block', () => {
  const file = join(dir(), 'cordis.patch.yml')
  const result = writePatchFile(file, [mat('a')])
  assert.equal(result.created, true)
  assert.ok(readFileSync(file, 'utf8').includes('serverName: a'))
})

test('EVERY byte outside the managed block is preserved', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, USER_HEADER)
  writePatchFile(file, [mat('a'), mat('b')])
  const after = readFileSync(file, 'utf8')
  assert.ok(after.startsWith(USER_HEADER.trimEnd()), 'the user header survives verbatim')
  assert.ok(after.includes('# Keep my comments!'))
  assert.ok(after.includes('id: my-own-plugin'))
  assert.ok(after.includes('keep: me'))
})

test('rewriting replaces the block instead of appending a second one', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, USER_HEADER)
  writePatchFile(file, [mat('a')])
  writePatchFile(file, [mat('b')])
  const after = readFileSync(file, 'utf8')
  assert.equal(after.split(REGION_START).length - 1, 1)
  assert.ok(after.includes('serverName: b'))
  assert.equal(after.includes('serverName: a'), false)
})

test('a user entry added after the block survives later writes', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, USER_HEADER + '\n' + buildPatchedText('', [mat('a')]))
  writePatchFile(file, [mat('a'), mat('b')])
  const after = readFileSync(file, 'utf8')
  assert.ok(after.includes('id: my-own-plugin'))
  assert.ok(after.includes('serverName: b'))
})

test('the block is found again after writing (idempotent region detection)', () => {
  const text = buildPatchedText('', [mat('a')])
  assert.ok(findRegion(text))
  assert.equal(buildPatchedText(text, [mat('a')]), text, 're-writing identical content is a no-op')
})

test('project groups are labelled with their workspace root', () => {
  const text = buildPatchedText('', [
    mat('shared'),
    mat('api', { scope: 'project', workspaceRoot: '/w/a', serverName: 'api--aaaaaaaa' }),
  ])
  assert.ok(text.includes('# global'))
  assert.ok(text.includes('# project: /w/a'))
})

test('reading finds MCP entries and which are ours', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, buildPatchedText('', [mat('mine')]))
  const read = readPatchFile(file)
  assert.equal(read.error, undefined)
  assert.equal(read.entries.length, 1)
  assert.equal(read.entries[0].entry.name, 'mine')
  assert.equal(read.entries[0].id, 'mcp-panel-mine')
  assert.equal(read.entries[0].ours, true)
})

test('a hand-written MCP entry outside the block is read and marked foreign', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(
    file,
    `- insert:
    - id: hand-written
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: handwritten
        command: npx
        args:
          - -y
          - some-server
`,
  )
  const read = readPatchFile(file)
  assert.equal(read.entries.length, 1)
  assert.equal(read.entries[0].entry.name, 'handwritten')
  assert.equal(read.entries[0].ours, false)
  assert.deepEqual([...read.entries[0].entry.args], ['-y', 'some-server'])
})

test('a malformed patch file reports an error instead of throwing', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, '[]\n- insert:\n  oops')
  const read = readPatchFile(file)
  assert.match(read.error, /Invalid YAML/)
  assert.deepEqual([...read.entries], [])
})

test('adoption brings a patch-only global server into the editing surface', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, buildPatchedText('', [mat('fromPatch')]))
  const result = adoptFromPatch(doc(), new Map(), readPatchFile(file), new Map())
  assert.deepEqual(result.adopted.map((a) => a.name), ['fromPatch'])
  assert.equal(result.changed, true)
  assert.deepEqual(result.global.servers.map((s) => s.name), ['fromPatch'])
})

test('adoption routes a project entry by its ID, not by its visible name', () => {
  // Regression: a project server may hold a bare name (`api`), which used to be
  // guessed as a GLOBAL entry and moved into the global document — after which
  // the project had to be renamed. Ownership now comes from the entry id.
  const file = join(dir(), 'cordis.patch.yml')
  const idToRoot = new Map([['aaaaaaaa', '/w/a']])
  writeFileSync(
    file,
    buildPatchedText('', [
      {
        entry: server('api'),
        scope: 'project',
        workspaceRoot: '/w/a',
        workspaceId: 'aaaaaaaa',
        serverName: 'api',
        id: 'mcp-panel-aaaaaaaa--api',
        toolPrefix: 'mcp__api__',
      },
    ]),
  )
  const result = adoptFromPatch(doc(), new Map([['/w/a', doc()]]), readPatchFile(file), idToRoot)
  assert.deepEqual(result.adopted, [{ name: 'api', scope: 'project', workspaceRoot: '/w/a' }])
  assert.deepEqual(result.global.servers, [], 'the project server must NOT land in the global document')
  assert.deepEqual(result.projects.get('/w/a').servers.map((s) => s.name), ['api'])
})

test('a suffixed project name is restored to its local name on adoption', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(
    file,
    buildPatchedText('', [
      {
        entry: server('api--aaaaaaaa'),
        scope: 'project',
        workspaceRoot: '/w/a',
        workspaceId: 'aaaaaaaa',
        serverName: 'api--aaaaaaaa',
        id: 'mcp-panel-aaaaaaaa--api',
        toolPrefix: 'mcp__api--aaaaaaaa__',
      },
    ]),
  )
  const result = adoptFromPatch(doc(), new Map([['/w/a', doc()]]), readPatchFile(file), new Map([['aaaaaaaa', '/w/a']]))
  assert.deepEqual(result.projects.get('/w/a').servers.map((s) => s.name), ['api'], 'the local name, not the profile name')
})

test('adoption is idempotent — a settled pair reports no change', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, buildPatchedText('', [mat('a')]))
  const first = adoptFromPatch(doc(), new Map(), readPatchFile(file), new Map())
  const second = adoptFromPatch(first.global, new Map(), readPatchFile(file), new Map())
  assert.equal(second.changed, false)
  assert.deepEqual([...second.adopted], [])
})

test('mcp.json wins when a server exists on both sides inside our block', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, buildPatchedText('', [mat('a', { command: 'patch-version' })]))
  const result = adoptFromPatch(doc(server('a', { command: 'json-version' })), new Map(), readPatchFile(file), new Map())
  assert.equal(result.changed, false)
  assert.equal(result.global.servers[0].command, 'json-version')
})

test('a foreign entry that duplicates an mcp.json name is reported, not merged', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(
    file,
    `- insert:
    - id: hand-written
      name: '@deepseek-ai/dsh-mcp-client'
      config: { transport: stdio, serverName: dup, command: npx }
`,
  )
  const result = adoptFromPatch(doc(server('dup')), new Map(), readPatchFile(file), new Map())
  assert.equal(result.changed, false)
  assert.deepEqual(result.externals.map((e) => e.serverName), ['dup'])
  assert.equal(result.global.servers.length, 1, 'the mcp.json copy is untouched')
})

test('the write leaves no temp file behind', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writePatchFile(file, [mat('a')])
  assert.equal(existsSync(`${file}.tmp`), false)
  assert.ok(existsSync(file))
})

test('an externally declared entry is reported, never adopted', () => {
  // The real profile has a hand-written `playwright` entry. Adopting it would
  // make us materialise a second entry with the same serverName and the loader
  // would reject the whole profile.
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(
    file,
    `- insert:
    - id: hand-written
      name: '@deepseek-ai/dsh-mcp-client'
      config: { transport: stdio, serverName: playwright, command: playwright-mcp }
`,
  )
  const read = readPatchFile(file)
  const result = adoptFromPatch(doc(), new Map(), read, new Map())
  assert.deepEqual(result.externals.map((e) => e.serverName), ['playwright'], 'reported')
  assert.deepEqual(result.adopted, [], 'not adopted')
  assert.deepEqual(result.global.servers, [], 'not folded into mcp.json')
  assert.equal(result.changed, false)
})

test('writing never duplicates a serverName already present in the file', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(
    file,
    `- insert:
    - id: hand-written
      name: '@deepseek-ai/dsh-mcp-client'
      config: { transport: stdio, serverName: playwright, command: playwright-mcp }
`,
  )
  const before = readFileSync(file, 'utf8')
  const after = buildPatchedText(before, [])
  const names = [...after.matchAll(/serverName:\s*(\S+)/g)].map((m) => m[1])
  assert.equal(new Set(names).size, names.length, 'no duplicate serverName: ' + JSON.stringify(names))
})

test('an EMPTY materialisation leaves a `[]` template loadable', () => {
  // Regression, and the worst kind: an empty managed region is comments only, so
  // stripping the template's `[]` left a comments-only document. DSH refuses to
  // boot on that ("must be a top-level YAML array"), and it only shows up on the
  // NEXT start.
  const template = '# Your patch layer for this dsh profile:\n# a top-level YAML array.\n[]\n'
  const text = buildPatchedText(template, [])
  const parsed = parseYaml(text)
  assert.ok(Array.isArray(parsed), 'must still be an array, got: ' + JSON.stringify(parsed))
})

test('an empty materialisation never removes the array from a populated file', () => {
  const existing = '- insert:\n    - id: keep-me\n      name: x\n'
  const text = buildPatchedText(existing, [])
  assert.deepEqual(parseYaml(text), parseYaml(existing))
})

test('an empty materialisation removes a stale region without breaking the file', () => {
  const file = join(dir(), 'cordis.patch.yml')
  writeFileSync(file, '[]\n')
  writePatchFile(file, [mat('a')])
  writePatchFile(file, [])
  const after = readFileSync(file, 'utf8')
  assert.ok(Array.isArray(parseYaml(after)))
  assert.equal(after.includes('serverName'), false)
})

test('a CRLF file keeps its shape', () => {
  const crlf = '# header\r\n- insert:\r\n    - id: keep\r\n      name: x\r\n'
  const text = buildPatchedText(crlf, [mat('added')])
  assert.ok(Array.isArray(parseYaml(text)))
  assert.ok(text.includes('id: keep'), 'the user entry survives')
})

test('a file starting with a document-start marker still works', () => {
  const text = buildPatchedText('---\n- insert:\n    - id: keep\n      name: x\n', [mat('added')])
  assert.ok(Array.isArray(parseYaml(text)))
  assert.ok(text.includes('id: keep'))
})

test('a trailing document-end marker does not become a second document', () => {
  // `...` ends a YAML document. Appending after it starts another one, and the
  // loader refuses a multi-document overlay.
  const text = buildPatchedText('- insert:\n    - id: keep\n      name: x\n...\n', [mat('added')])
  const parsed = parseYaml(text)
  assert.ok(Array.isArray(parsed), 'one document, one array')
  assert.ok(text.includes('id: keep'), 'the user entry survives')
})

test('a duplicated managed region collapses to one', () => {
  // Two regions happen after a hand-merged copy. Keeping the stale one leaves two
  // entries with the same serverName, and the loader rejects the whole profile.
  const two = [REGION_START, '- insert:', '    - id: mcp-panel-old', '      name: x', '      config: { serverName: old }', REGION_END, '', REGION_START, '- insert:', '    - id: mcp-panel-old2', '      name: x', '      config: { serverName: old2 }', REGION_END, ''].join('\n')
  const text = buildPatchedText(two, [mat('added')])
  assert.equal(text.split(REGION_START).length - 1, 1, 'exactly one region remains')
  assert.equal(/old/.test(text), false, 'the stale entries are gone')
  assert.ok(Array.isArray(parseYaml(text)))
})

test('marker text inside a user comment does not confuse the region finder', () => {
  // Only a full start+end pair counts as a region.
  const text = buildPatchedText(`# 引用了 ${REGION_START} 这几个字\n- insert:\n    - id: keep\n      name: x\n`, [mat('added')])
  assert.ok(text.includes('id: keep'))
  assert.equal(text.split(REGION_START).length - 1, 2, 'the comment plus our real region')
  assert.ok(Array.isArray(parseYaml(text)))
})
