import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeError } from '../../lib/host.mjs'

test('a plain Error becomes its message', () => {
  assert.equal(sanitizeError(new Error('boom')), 'boom')
})

test('a string passes through', () => {
  assert.equal(sanitizeError('nope'), 'nope')
})

test('a thrown non-Error does not crash the caller', () => {
  // A plugin must survive `throw undefined`, which happens in the wild.
  for (const value of [undefined, null, 0, {}, [], Symbol('x')]) {
    const text = sanitizeError(value)
    assert.equal(typeof text, 'string')
    assert.notEqual(text, '')
  }
})

test('a very long message is truncated', () => {
  const text = sanitizeError(new Error('x'.repeat(5000)))
  assert.ok(text.length < 5000, 'a stack-free message should stay bounded, got ' + text.length)
})

test('an Error with a cause keeps the outer message', () => {
  const text = sanitizeError(new Error('outer', { cause: new Error('inner') }))
  assert.match(text, /outer/)
})

test('credentials in a message are not echoed verbatim', () => {
  // The panel shows these strings; a token must not leak into the UI or a log.
  const token = 'sk-' + 'EXAMPLEEXAMPLEEXAMPLE'
  const text = sanitizeError(new Error('request failed: Authorization: Bearer ' + token))
  assert.equal(text.includes(token), false, 'token leaked: ' + text)
})

// ── real-world credential shapes ─────────────────────────────────────────────
// The panel shows these strings and the plugin writes them to stderr. Name-based
// matching is the only workable approach: a token has no shape of its own.
// Credential-shaped test data, assembled at run time.
//
// The shapes are what the sanitizer must recognise, but a literal string of that
// shape is indistinguishable from a leaked token to GitHub's push protection —
// and to anyone reading the log. Building them keeps the test honest without
// putting a scanner-matching literal in the repository.
const example = {
  github: 'gh' + 'p_' + 'EXAMPLE'.repeat(5).toLowerCase(),
  jwt: 'ey' + 'J' + 'hbGciOiJIUzI1NiJ9.example.payload',
  slack: 'xo' + 'xb-' + '000000000000-' + 'EXAMPLEEXAMPLE'.toLowerCase(),
  gitlab: 'gl' + 'pat-' + 'EXAMPLEEXAMPLE'.toLowerCase(),
  aws: 'AK' + 'IA' + 'EXAMPLEEXAMPLE12',
  googleKey: 'AI' + 'za' + 'SyEXAMPLEEXAMPLE',
  googleOauth: 'ya' + '29.' + 'EXAMPLE.example',
  openai: 'sk-' + 'proj-' + 'EXAMPLEEXAMPLEEXAMPLE',
  plain: 'hunter2' + 'hunter2',
}

const CREDENTIALS = [
  ['Authorization: Bearer ' + example.openai, example.openai],
  ['Authorization: Bearer ' + example.jwt, example.jwt],
  ['x-api-key: ' + example.plain, example.plain],
  ['api_key=' + example.plain, example.plain],
  ['password: ' + example.plain, example.plain],
  ['token=' + example.github, example.github],
  ['?access_token=' + example.googleOauth, example.googleOauth],
  ['https://user:' + example.plain + '@example.com/mcp', example.plain],
  ['MCP_AUTH=' + example.plain, example.plain],
  ['"apiKey": "' + example.googleKey + '"', example.googleKey],
  [example.openai, example.openai],
  [example.gitlab, example.gitlab],
  [example.slack, example.slack],
  [example.aws, example.aws],
]

for (const [text, secret] of CREDENTIALS) {
  test('redacts: ' + text.slice(0, 40), () => {
    const out = sanitizeError(new Error(text))
    assert.equal(out.includes(secret), false, 'leaked: ' + out)
  })
}

test('leaves ordinary diagnostics untouched', () => {
  // Over-redaction is safe but unhelpful: these are the messages the panel exists
  // to show, so they must survive verbatim.
  const ordinary = [
    'Connection refused (ECONNREFUSED) on port 8080',
    'spawn npx ENOENT',
    'The server does not support tools/list',
    'Timeout after 30000 ms while calling create_issue',
    'Invalid YAML: end of the stream or a document separator is expected (6:1)',
    '/Users/me/projects/x/.dsh/yiklek/mcp.json: permission denied',
  ]
  for (const text of ordinary) assert.equal(sanitizeError(new Error(text)), text)
})
