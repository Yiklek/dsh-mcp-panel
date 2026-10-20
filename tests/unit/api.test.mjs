/**
 * Route tests.
 *
 * The HTTP layer had no coverage at all: every rule about methods, query
 * parameters, and error shapes lived only in the code. These drive the real
 * handlers with a fake request/response pair, so a change to the contract breaks
 * a test instead of a user's browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRoutes } from '../../lib/host.mjs'

const PREFIX = '/api/yiklek/mcp'

/** A fake ServerResponse that records what the handler wrote. */
function fakeResponse() {
  const res = {
    status: undefined,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    writeHead(status) {
      this.status = status
      this.headersSent = true
    },
    end(chunk) {
      if (chunk !== undefined) this.body += String(chunk)
      this.headersSent = true
    },
  }
  res.json = () => (res.body === '' ? undefined : JSON.parse(res.body))
  return res
}

/** A fake IncomingMessage carrying an optional JSON body and query string. */
function fakeRequest({ method = 'GET', url = PREFIX, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const iterator = chunks[Symbol.iterator]()
  return {
    method,
    url,
    headers: { host: '127.0.0.1' },
    [Symbol.asyncIterator]() {
      return iterator
    },
  }
}

/** Find one route and run it. */
async function call(controller, request, beforeRead) {
  const routes = buildRoutes({ controller, ...(beforeRead === undefined ? {} : { beforeRead }) })
  const route = routes.find((candidate) => candidate.kind === 'exact' && candidate.path === request.url.split('?')[0])
  assert.ok(route, 'no route for ' + request.url)
  const res = fakeResponse()
  await route.handler(request, res)
  return res
}

const server = (name) => ({
  name,
  enabled: true,
  transport: 'stdio',
  command: 'node',
  args: [],
  env: {},
  cwd: '',
  url: '',
  headers: {},
})

/** A controller stub with the shape the routes use. */
function stubController(over = {}) {
  const calls = []
  const controller = {
    calls,
    list: () => ({ global: { file: '/g', exists: false, servers: [] }, projects: [], status: {}, issues: [] }),
    statusSnapshot: () => ({}),
    loadError: undefined,
    syncState: () => ({ materialized: [], adopted: [], renamed: [], skipped: [], drift: [] }),
    save: async (input) => {
      calls.push({ kind: 'save', input })
      return { ok: true, issues: [] }
    },
    setWorkspaceEnabled: async (root, enabled) => {
      calls.push({ kind: 'enable', root, enabled })
    },
    previewImport: (input) => {
      calls.push({ kind: 'preview', input })
      return { format: 'claude', added: ['x'], replaced: [], skipped: [], servers: [] }
    },
    applyImport: async (input) => {
      calls.push({ kind: 'apply', input })
      return { ok: true, issues: [] }
    },
    exportConfig: (input) => {
      calls.push({ kind: 'export', input })
      return { format: 'claude', text: '{}\n' }
    },
    ...over,
  }
  return controller
}

test('GET /list answers with the controller payload', async () => {
  const controller = stubController()
  const res = await call(controller, fakeRequest({ url: `${PREFIX}/list` }))
  assert.equal(res.status, 200)
  assert.equal(res.json().global.file, '/g')
})

test('GET /list forwards every workspace candidate to beforeRead', async () => {
  // The client is the only side that knows the Workspace list; without these the
  // host cannot adopt a hand-written project config.
  const seen = []
  const res = await call(
    stubController(),
    fakeRequest({ url: `${PREFIX}/list?workspace=/a&workspace=/b` }),
    async (candidates) => {
      seen.push(...(candidates ?? []))
    },
  )
  assert.equal(res.status, 200)
  assert.deepEqual(seen, ['/a', '/b'])
})

test('GET /list tolerates no workspace candidates', async () => {
  const seen = []
  await call(stubController(), fakeRequest({ url: `${PREFIX}/list` }), async (candidates) => {
    seen.push(candidates)
  })
  assert.deepEqual(seen, [[]])
})

test('POST /save requires POST', async () => {
  const res = await call(stubController(), fakeRequest({ url: `${PREFIX}/save` }))
  assert.equal(res.status, 405)
})

test('POST /save passes the scope through', async () => {
  const controller = stubController()
  const res = await call(
    controller,
    fakeRequest({
      method: 'POST',
      url: `${PREFIX}/save`,
      body: { scope: 'project', workspaceRoot: '/w', servers: [server('a')] },
    }),
  )
  assert.equal(res.status, 200)
  assert.equal(controller.calls[0].input.scope, 'project')
  assert.equal(controller.calls[0].input.workspaceRoot, '/w')
})

test('POST /save reports a rejection with 400', async () => {
  const controller = stubController({
    save: async () => ({ ok: false, issues: [{ level: 'blocking', path: '', code: 'x', message: 'nope' }] }),
  })
  const res = await call(
    controller,
    fakeRequest({ method: 'POST', url: `${PREFIX}/save`, body: { scope: 'global', servers: [] } }),
  )
  assert.equal(res.status, 400)
  assert.equal(res.json().issues[0].message, 'nope')
})

test('POST /workspace toggles enabled', async () => {
  const controller = stubController()
  const res = await call(
    controller,
    fakeRequest({ method: 'POST', url: `${PREFIX}/workspace`, body: { root: '/w', enabled: false } }),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(controller.calls[0], { kind: 'enable', root: '/w', enabled: false })
})

test('POST /workspace validates its inputs', async () => {
  const res = await call(stubController(), fakeRequest({ method: 'POST', url: `${PREFIX}/workspace`, body: {} }))
  assert.equal(res.status, 400)
  const wrong = await call(
    stubController(),
    fakeRequest({ method: 'POST', url: `${PREFIX}/workspace`, body: { root: '/w', enabled: 'yes' } }),
  )
  assert.equal(wrong.status, 400, 'enabled must be a boolean, not a truthy string')
})

test('POST /workspace rejects an unknown action instead of guessing', async () => {
  // `forget` used to be here, but unregistering a workspace whose config still
  // exists was undone by the very next refresh — a silent no-op. Removal is gone;
  // "stop using it" is what `enabled: false` is for.
  const res = await call(
    stubController(),
    fakeRequest({ method: 'POST', url: `${PREFIX}/workspace`, body: { root: '/w', forget: true } }),
  )
  assert.equal(res.status, 400, 'a body with no boolean `enabled` must not be accepted')
})

test('POST /import previews without committing', async () => {
  const controller = stubController()
  const res = await call(
    controller,
    fakeRequest({ method: 'POST', url: `${PREFIX}/import`, body: { json: { mcpServers: {} }, scope: 'global' } }),
  )
  assert.equal(res.status, 200)
  assert.equal(res.json().preview.format, 'claude')
  assert.equal(controller.calls.filter((c) => c.kind === 'apply').length, 0, 'a preview must not write')
})

test('POST /import with commit applies', async () => {
  const controller = stubController()
  const res = await call(
    controller,
    fakeRequest({
      method: 'POST',
      url: `${PREFIX}/import`,
      body: { json: { mcpServers: {} }, scope: 'project', workspaceRoot: '/w', commit: true },
    }),
  )
  assert.equal(res.status, 200)
  assert.equal(controller.calls[0].kind, 'apply')
  assert.equal(controller.calls[0].input.workspaceRoot, '/w')
})

test('POST /import rejects an unknown scope', async () => {
  const res = await call(
    stubController(),
    fakeRequest({ method: 'POST', url: `${PREFIX}/import`, body: { json: {}, scope: 'nonsense' } }),
  )
  assert.equal(res.status, 400)
})

test('GET /export defaults to redaction', async () => {
  const controller = stubController()
  await call(controller, fakeRequest({ url: `${PREFIX}/export` }))
  assert.equal(controller.calls[0].input.redact, true, 'secrets are redacted unless asked otherwise')
})

test('GET /export can be asked for the raw values', async () => {
  const controller = stubController()
  await call(controller, fakeRequest({ url: `${PREFIX}/export?redact=false&scope=project&workspace=/w` }))
  assert.equal(controller.calls[0].input.redact, false)
  assert.equal(controller.calls[0].input.scope, 'project')
  assert.equal(controller.calls[0].input.workspaceRoot, '/w')
})

test('a handler that throws answers 500 rather than hanging', async () => {
  const controller = stubController({
    list: () => {
      throw new Error('boom')
    },
  })
  const res = await call(controller, fakeRequest({ url: `${PREFIX}/list` }))
  assert.equal(res.status, 500)
  assert.match(res.json().error, /boom/)
})

test('every route is namespaced under the plugin prefix', async () => {
  const routes = buildRoutes({ controller: stubController() })
  for (const route of routes) {
    assert.ok(route.path.startsWith(PREFIX), route.path + ' escapes the plugin namespace')
  }
})
