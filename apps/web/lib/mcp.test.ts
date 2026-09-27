import {after, before, describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {startFakeContextServer, type FakeContextServer} from './fakeContextServer.ts'
import {closeMcp, groqViaMcp, openMcp} from './mcp.ts'

/**
 * Integration tests for the two-endpoint wiring.
 *
 * These talk JSON-RPC to a local server over the real transport, so they cover the
 * parts that cannot be reasoned about from the source: whether the client actually
 * connects, whether the namespacing survives two tool sets with a colliding name,
 * and whether the double-wrapped `groq_query` payload comes back as an array.
 */
describe('Context MCP wiring', () => {
  let groqServer: FakeContextServer
  let kbServer: FakeContextServer

  before(async () => {
    groqServer = await startFakeContextServer('groq', (query) =>
      query.includes('"claim"') ? [{_id: 'clm.one', subject: 'spareBatteryMaxWh'}] : [],
    )
    kbServer = await startFakeContextServer('knowledge_base')
    process.env.SANITY_ORGANIZATION_TOKEN = 'org-token-for-tests'
    process.env.SANITY_CONTEXT_GROQ_URL = groqServer.url
    process.env.SANITY_CONTEXT_KB_URL = kbServer.url
  })

  after(async () => {
    await Promise.all([groqServer.close(), kbServer.close()])
    delete process.env.SANITY_ORGANIZATION_TOKEN
    delete process.env.SANITY_CONTEXT_GROQ_URL
    delete process.env.SANITY_CONTEXT_KB_URL
  })

  test('connects to both endpoints and namespaces the colliding tool name', async () => {
    const bundle = await openMcp()
    try {
      assert.deepEqual(bundle.connected, {groq: true, kb: true})

      const names = Object.keys(bundle.tools).sort()
      // The collision: both modes publish `initial_context`. Unprefixed merging
      // would silently drop one and the agent would lose a whole endpoint.
      assert.ok(names.includes('content_initial_context'), 'GROQ-mode initial_context must survive')
      assert.ok(names.includes('kb_initial_context'), 'KB-mode initial_context must survive')
      assert.ok(names.includes('content_groq_query'))
      assert.ok(names.includes('content_schema_explorer'))
      assert.ok(names.includes('kb_knowledge_base_read'))
      assert.equal(names.length, 5, `expected exactly 5 namespaced tools, got ${names.join(', ')}`)
      assert.equal(bundle.warnings.length, 0)
    } finally {
      await closeMcp(bundle)
    }
  })

  test('sends the organization token as a bearer credential to both endpoints', async () => {
    const bundle = await openMcp()
    await closeMcp(bundle)
    assert.ok(groqServer.authHeaders.length > 0, 'GROQ endpoint saw no Authorization header')
    assert.ok(kbServer.authHeaders.length > 0, 'KB endpoint saw no Authorization header')
    assert.ok(groqServer.authHeaders.every((h) => h === 'Bearer org-token-for-tests'))
    assert.ok(kbServer.authHeaders.every((h) => h === 'Bearer org-token-for-tests'))
  })

  test('unwraps the MCP content envelope and the groq_query result envelope', async () => {
    const bundle = await openMcp()
    try {
      const rows = await groqViaMcp<{_id: string; subject: string}[]>(bundle, '*[_type == "claim"]{_id, subject}')
      // Two envelopes deep: {content:[{text: JSON}]} then {meta, result}. A caller
      // must get the rows, not either wrapper.
      assert.ok(Array.isArray(rows), `expected an array, got ${typeof rows}`)
      assert.equal(rows.length, 1)
      assert.equal(rows[0]!._id, 'clm.one')
      assert.ok(groqServer.queries.some((q) => q.includes('_type == "claim"')))
    } finally {
      await closeMcp(bundle)
    }
  })

  test('the canonical projections the app ships are accepted verbatim', async () => {
    const {ALL_CLAIMS, SIGNED_RULINGS} = await import('@gate-check/content-model/queries')
    const bundle = await openMcp()
    try {
      await groqViaMcp(bundle, ALL_CLAIMS)
      await groqViaMcp(bundle, SIGNED_RULINGS)
      // Guards against the projections and the transport drifting apart: whatever
      // the query text is, it has to survive the round trip unchanged.
      assert.ok(groqServer.queries.includes(ALL_CLAIMS))
      assert.ok(groqServer.queries.includes(SIGNED_RULINGS))
    } finally {
      await closeMcp(bundle)
    }
  })
})

describe('Context MCP degradation', () => {
  test('one endpoint down leaves the other working and reports why', async () => {
    const groqServer = await startFakeContextServer('groq')
    process.env.SANITY_ORGANIZATION_TOKEN = 'org-token-for-tests'
    process.env.SANITY_CONTEXT_GROQ_URL = groqServer.url
    // A port nothing is listening on.
    process.env.SANITY_CONTEXT_KB_URL = 'http://127.0.0.1:1/mcp'

    const bundle = await openMcp()
    try {
      assert.equal(bundle.connected.groq, true, 'a dead KB endpoint must not take the GROQ endpoint down with it')
      assert.equal(bundle.connected.kb, false)
      assert.equal(bundle.warnings.length, 1)
      assert.match(bundle.warnings[0]!, /Knowledge-Base-mode Context endpoint failed to connect/)
      assert.ok(Object.keys(bundle.tools).every((n) => n.startsWith('content_')))
    } finally {
      await closeMcp(bundle)
      await groqServer.close()
      delete process.env.SANITY_ORGANIZATION_TOKEN
      delete process.env.SANITY_CONTEXT_GROQ_URL
      delete process.env.SANITY_CONTEXT_KB_URL
    }
  })

  test('nothing configured yields no tools and two plain-language warnings', async () => {
    // A configured project with no Context endpoints — the ordinary state of a
    // checkout before the beta is switched on. Distinct from offline mode, which
    // short-circuits before any of this.
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'test-project'
    const bundle = await openMcp()
    assert.deepEqual(bundle.connected, {groq: false, kb: false})
    assert.equal(Object.keys(bundle.tools).length, 0)
    assert.equal(bundle.warnings.length, 2)
    assert.match(bundle.warnings.join(' '), /reading the dataset over the ordinary client/)
    await closeMcp(bundle)
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  })

  test('groqViaMcp refuses rather than silently returning nothing when GROQ mode is absent', async () => {
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = 'test-project'
    const bundle = await openMcp()
    await assert.rejects(() => groqViaMcp(bundle, '*[_type == "claim"]'), /not available on the configured Context endpoint/)
    await closeMcp(bundle)
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
  })

  test('offline mode short-circuits before any connection is attempted', async () => {
    process.env.GATE_CHECK_OFFLINE = '1'
    // Deliberately pointing at a dead port: if offline mode tried to connect, this
    // would produce a warning instead of silence.
    process.env.SANITY_CONTEXT_GROQ_URL = 'http://127.0.0.1:1/mcp'
    process.env.SANITY_ORGANIZATION_TOKEN = 'unused'
    try {
      const bundle = await openMcp()
      assert.deepEqual(bundle.connected, {groq: false, kb: false})
      assert.deepEqual(bundle.warnings, [], 'offline mode has no network path to report on')
      await closeMcp(bundle)
    } finally {
      delete process.env.GATE_CHECK_OFFLINE
      delete process.env.SANITY_CONTEXT_GROQ_URL
      delete process.env.SANITY_ORGANIZATION_TOKEN
    }
  })
})
