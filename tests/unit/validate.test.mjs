import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyEntry, hasBlocking, validateDocument, validateEntry } from '../../lib/host.mjs'

const entry = (over = {}) => ({ ...emptyEntry('ok'), transport: 'stdio', command: 'node', ...over })

test('a valid stdio entry has no findings', () => {
  assert.deepEqual(validateEntry(entry(), 'servers[0]'), [])
})

test('name must satisfy the official pattern (it becomes a tool name)', () => {
  for (const bad of ['', 'has space', 'a'.repeat(33), 'emoji😀', 'slash/name']) {
    const issues = validateEntry(entry({ name: bad }), 'servers[0]')
    assert.ok(issues.some((i) => i.code === 'name-invalid' && i.level === 'blocking'), `expected blocking for ${JSON.stringify(bad)}`)
  }
  for (const good of ['a', 'github', 'my-server_2', 'a'.repeat(32)]) {
    assert.equal(validateEntry(entry({ name: good }), 'x').some((i) => i.code === 'name-invalid'), false, good)
  }
})

test('stdio requires a command; http requires a URL', () => {
  assert.ok(validateEntry(entry({ command: '' }), 'x').some((i) => i.code === 'command-required'))
  assert.ok(
    validateEntry(entry({ transport: 'streamable-http', url: '' }), 'x').some((i) => i.code === 'url-required'),
  )
  assert.ok(
    validateEntry(entry({ transport: 'streamable-http', url: 'ftp://x' }), 'x').some((i) => i.code === 'url-invalid'),
  )
  assert.equal(validateEntry(entry({ transport: 'streamable-http', url: 'https://x' }), 'x').length, 0)
})

test('an inline secret is a warning, not a blocker', () => {
  const issues = validateEntry(entry({ env: { GITHUB_TOKEN: process.env.MCP_TEST_TOKEN ?? 'placeholder-not-a-token' } }), 'x')
  const secret = issues.find((i) => i.code === 'secret-inline')
  assert.ok(secret)
  assert.equal(secret.level, 'warning')
  assert.equal(hasBlocking(issues), false, 'a warning must still allow the save')
})

test('an env placeholder is not flagged as a secret', () => {
  const issues = validateEntry(entry({ env: { GITHUB_TOKEN: '${env:GITHUB_TOKEN}' } }), 'x')
  assert.equal(issues.some((i) => i.code === 'secret-inline'), false)
})

test('a relative-looking command warns', () => {
  assert.ok(validateEntry(entry({ command: './bin/server' }), 'x').some((i) => i.code === 'command-relative'))
  assert.equal(validateEntry(entry({ command: 'npx' }), 'x').some((i) => i.code === 'command-relative'), false, 'a PATH name is fine')
})

test('same-file duplicate names are blocking and name the earlier index', () => {
  const issues = validateDocument({ version: 1, servers: [entry({ name: 'dup' }), entry({ name: 'dup' })] })
  const duplicate = issues.find((i) => i.code === 'name-duplicate')
  assert.ok(duplicate)
  assert.equal(duplicate.level, 'blocking')
  assert.equal(duplicate.params.previous, '0')
  assert.equal(hasBlocking(issues), true)
})

test('different names do not collide', () => {
  assert.equal(hasBlocking(validateDocument({ version: 1, servers: [entry({ name: 'a' }), entry({ name: 'b' })] })), false)
})

// ── localization alignment ───────────────────────────────────────────────────
// `validate.ts` runs on the host, which has no locale, so its messages are
// English and the panel renders them through `issue.<code>` dictionary keys. A
// template whose `{placeholder}` has no matching `params` field prints the
// placeholder literally — `「{name}」` instead of `「API_KEY」` — and nothing in
// either layer notices.
import { readFileSync } from 'node:fs'

const DICTIONARIES = ['zh', 'en'].map((name) => ({
  name,
  issue: JSON.parse(readFileSync(new URL(`../../locale/${name}.json`, import.meta.url), 'utf8')).issue,
}))

/** One entry per validation code, chosen so the rule actually fires. */
const TRIGGERS = {
  'name-invalid': { name: 'bad name!' },
  'name-duplicate': null, // needs two entries; handled below
  'command-required': { command: '' },
  'command-relative': { command: './run.sh' },
  'url-required': { transport: 'streamable-http', url: '' },
  'url-invalid': { transport: 'streamable-http', url: 'ftp://x' },
  'secret-inline': { env: { API_KEY: 'placeholder-not-a-token' } },
  'timeout-odd': { toolCallTimeoutMs: 0 },
}

const entryOf = (over) => ({ ...emptyEntry('x'), command: 'n', ...over })

/** Collect one issue per code. */
function sampleIssues() {
  const issues = []
  for (const [code, over] of Object.entries(TRIGGERS)) {
    if (over === null) {
      issues.push(...validateDocument({ version: 1, servers: [emptyEntry('dup', { command: 'n' }), emptyEntry('dup', { command: 'n' })] }))
      continue
    }
    if (code === 'name-invalid') {
      issues.push(...validateDocument({ version: 1, servers: [entryOf({ name: 'bad name!' })] }))
      continue
    }
    issues.push(...validateDocument({ version: 1, servers: [entryOf(over)] }))
  }
  return issues
}

test('every localized issue template has the params its message carries', () => {
  const issues = sampleIssues()
  const codes = new Set(issues.map((issue) => issue.code))
  for (const code of Object.keys(TRIGGERS)) {
    assert.ok(codes.has(code), `no sample issue produced the code "${code}" — update TRIGGERS`)
  }

  for (const dictionary of DICTIONARIES) {
    assert.ok(dictionary.issue !== undefined, `${dictionary.name} has no "issue" section`)
    for (const code of codes) {
      const template = dictionary.issue[code]
      if (template === undefined) continue // not every code needs a translation
      const placeholders = [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
      const issue = issues.find((candidate) => candidate.code === code)
      const params = Object.keys(issue.params ?? {})
      for (const placeholder of placeholders) {
        assert.ok(
          params.includes(placeholder),
          `${dictionary.name}: "${code}" uses {${placeholder}} but the issue carries ${JSON.stringify(params)}`,
        )
      }
    }
  }
})

test('every validation code has a translation in both dictionaries', () => {
  // A missing key renders as the key itself ("issue.name-invalid") in the banner.
  const codes = new Set(sampleIssues().map((issue) => issue.code))
  for (const dictionary of DICTIONARIES) {
    for (const code of codes) {
      assert.ok(dictionary.issue[code] !== undefined, `${dictionary.name} is missing issue.${code}`)
    }
  }
})
