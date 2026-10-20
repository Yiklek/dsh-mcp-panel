import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportDocument, envPlaceholder, parseDocument } from '../../lib/host.mjs'

test('claude shape: mcpServers as an object', () => {
  const { document, format } = parseDocument({
    mcpServers: {
      github: { command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: 'x' } },
      remote: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer y' } },
    },
  })
  assert.equal(format, 'claude')
  assert.equal(document.servers.length, 2)
  const [github, remote] = document.servers
  assert.equal(github.transport, 'stdio')
  assert.deepEqual([...github.args], ['-y', 'server-github'])
  assert.equal(github.env.GITHUB_TOKEN, 'x')
  assert.equal(remote.transport, 'streamable-http')
  assert.equal(remote.url, 'https://example.com/mcp')
})

test('vscode shape: servers as an object with type', () => {
  const { document, format } = parseDocument({
    servers: { fs: { type: 'stdio', command: 'npx', args: ['-y', 'fs'] } },
  })
  assert.equal(format, 'vscode')
  assert.equal(document.servers[0].name, 'fs')
  assert.equal(document.servers[0].transport, 'stdio')
})

test('acp shape: mcpServers as an array with name, plus ordered env entries', () => {
  const { document, format } = parseDocument({
    mcpServers: [{ name: 'a', command: 'run', env: [{ name: 'K', value: 'V' }] }],
  })
  assert.equal(format, 'acp')
  assert.equal(document.servers[0].name, 'a')
  assert.equal(document.servers[0].env.K, 'V')
})

test('bare array', () => {
  const { format, document } = parseDocument([{ name: 'x', command: 'c' }])
  assert.equal(format, 'bare')
  assert.equal(document.servers[0].name, 'x')
})

test('our own shape round-trips', () => {
  const original = parseDocument({ mcpServers: { x: { command: 'c' } } }).document
  const again = parseDocument(original)
  assert.equal(again.format, 'ours')
  assert.deepEqual(again.document.servers[0].name, 'x')
})

test('transport is inferred when no marker is present', () => {
  const { document } = parseDocument({ mcpServers: { a: { url: 'https://x/mcp' }, b: { command: 'c' } } })
  assert.equal(document.servers.find((s) => s.name === 'a').transport, 'streamable-http')
  assert.equal(document.servers.find((s) => s.name === 'b').transport, 'stdio')
})

test('sse is skipped by default and becomes a warning, not a silent drop', () => {
  const { document, issues } = parseDocument({ mcpServers: { s: { type: 'sse', url: 'https://x/sse' } } })
  assert.equal(document.servers.length, 0)
  assert.equal(issues.length, 1)
  assert.equal(issues[0].level, 'warning')
  assert.match(issues[0].message, /sse/)
})

test('sse is imported as streamable-http when explicitly allowed', () => {
  const { document } = parseDocument(
    { mcpServers: { s: { type: 'sse', url: 'https://x/sse' } } },
    { allowSseAsHttp: true },
  )
  assert.equal(document.servers[0].transport, 'streamable-http')
})

test('an unsupported transport is reported, not guessed', () => {
  const { document, issues } = parseDocument({ mcpServers: { w: { type: 'websocket', url: 'ws://x' } } })
  assert.equal(document.servers.length, 0)
  assert.match(issues[0].message, /unsupported transport/)
})

test('an unreadable shape is a blocking issue rather than a throw', () => {
  const { format, issues } = parseDocument({ nope: 1 })
  assert.equal(format, 'unknown')
  assert.equal(issues[0].level, 'blocking')
})

test('a duplicate name inside one source is blocking', () => {
  const { issues } = parseDocument({ mcpServers: [{ name: 'dup', command: 'a' }, { name: 'dup', command: 'b' }] })
  assert.ok(issues.some((i) => i.code === 'name-duplicate' && i.level === 'blocking'))
})

test('export redacts secrets by default and can opt out', () => {
  const { document } = parseDocument({
    mcpServers: { g: { command: 'npx', env: { GITHUB_TOKEN: process.env.MCP_TEST_TOKEN ?? 'placeholder-not-a-token' } } },
  })
  const redacted = exportDocument(document.servers)
  assert.equal(redacted.mcpServers.g.env.GITHUB_TOKEN, '${env:GITHUB_TOKEN}')
  const plain = exportDocument(document.servers, { redact: false })
  assert.equal(plain.mcpServers.g.env.GITHUB_TOKEN, process.env.MCP_TEST_TOKEN ?? 'placeholder-not-a-token')
})

test('export skips disabled entries unless asked', () => {
  const { document } = parseDocument({ mcpServers: { a: { command: 'c', enabled: false } } })
  assert.equal(Object.keys(exportDocument(document.servers).mcpServers).length, 0)
  assert.equal(Object.keys(exportDocument(document.servers, { includeDisabled: true }).mcpServers).length, 1)
})

test('envPlaceholder normalises the key', () => {
  assert.equal(envPlaceholder('my-token'), '${env:MY_TOKEN}')
  assert.equal(envPlaceholder(''), '${env:VALUE}')
})

test('a `command` written as an argv array is split, not dropped', () => {
  // Some configs write `"command": ["npx", "-y", "server"]`. Reading only the
  // string form produced an empty command, and the breakage surfaced later as a
  // validation error with no hint about where the command went.
  const result = parseDocument({ mcpServers: { x: { command: ['npx', '-y', 'server'] } } }, {})
  assert.equal(result.document.servers.length, 1)
  assert.equal(result.document.servers[0].command, 'npx')
  assert.deepEqual([...result.document.servers[0].args], ['-y', 'server'])
})

test('a single-word `command` array still works', () => {
  const result = parseDocument({ mcpServers: { x: { command: ['node'] } } }, {})
  assert.equal(result.document.servers[0].command, 'node')
  assert.deepEqual([...result.document.servers[0].args], [])
})

test('an explicit `args` wins over nothing when command is a string', () => {
  const result = parseDocument({ mcpServers: { x: { command: 'node', args: ['a.js'] } } }, {})
  assert.equal(result.document.servers[0].command, 'node')
  assert.deepEqual([...result.document.servers[0].args], ['a.js'])
})
