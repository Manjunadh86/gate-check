import {describe, test, after, before} from 'node:test'
import assert from 'node:assert/strict'
import {MockLanguageModelV4} from 'ai/test'
import {startFakeContextServer, type FakeContextServer} from './fakeContextServer.ts'
import {runCheck} from './agent.ts'

/**
 * The agent loop, without spending money on a live model.
 *
 * What this covers is the wiring nothing else reaches: that tools from two MCP
 * endpoints and the two local tools all land in one set the model can call, that a
 * `resolve_verdicts` call actually runs the engine and the verdicts are collected
 * off the tool call rather than parsed back out of prose, and that the step budget
 * and the tool-call trace come back intact.
 *
 * It deliberately does not assert anything about the model's wording. That is the
 * model's job and it is not what breaks.
 */

/** LanguageModelV4 nests usage and makes finishReason an object. */
const USAGE = {
  inputTokens: {total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0},
  outputTokens: {total: 10, text: 10, reasoning: 0},
}
const finish = (unified: 'stop' | 'tool-calls') => ({unified, raw: undefined})

/** Calls one tool on the first turn, then answers on the second. */
const toolCallThen = (toolName: string, input: unknown, thenText: string) => {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: async () => {
      call += 1
      return call === 1
        ? {
            content: [{type: 'tool-call' as const, toolCallId: 'c1', toolName, input: JSON.stringify(input)}],
            finishReason: finish('tool-calls'),
            usage: USAGE,
            warnings: [],
          }
        : {
            content: [{type: 'text' as const, text: thenText}],
            finishReason: finish('stop'),
            usage: USAGE,
            warnings: [],
          }
    },
  })
}

/** Answers immediately without calling anything. */
const answersAtOnce = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{type: 'text' as const, text}],
      finishReason: finish('stop'),
      usage: USAGE,
      warnings: [],
    }),
  })

describe('the agent loop', () => {
  let groqServer: FakeContextServer
  let kbServer: FakeContextServer

  before(async () => {
    groqServer = await startFakeContextServer('groq')
    kbServer = await startFakeContextServer('knowledge_base')
    // Offline content, live MCP tool surface: the agent still gets both endpoints'
    // tools to call, while the engine reads the corpus from the repo.
    process.env.GATE_CHECK_OFFLINE = '0'
    process.env.SANITY_ORGANIZATION_TOKEN = 'org-token-for-tests'
    process.env.SANITY_CONTEXT_GROQ_URL = groqServer.url
    process.env.SANITY_CONTEXT_KB_URL = kbServer.url
  })

  after(async () => {
    await Promise.all([groqServer.close(), kbServer.close()])
    for (const k of [
      'GATE_CHECK_OFFLINE',
      'SANITY_ORGANIZATION_TOKEN',
      'SANITY_CONTEXT_GROQ_URL',
      'SANITY_CONTEXT_KB_URL',
    ]) {
      delete process.env[k]
    }
  })

  test('assembles both endpoints and the local tools into one callable set', async () => {
    const result = await runCheck('anything', {model: answersAtOnce('no tools needed')})
    assert.deepEqual(result.toolNames, [
      'content_groq_query',
      'content_initial_context',
      'content_schema_explorer',
      'kb_initial_context',
      'kb_knowledge_base_read',
      'propose_ruling',
      'resolve_verdicts',
    ])
    // Seven tools from three places, and the two colliding `initial_context` tools
    // both present. Merging the endpoints unprefixed would have produced six.
    assert.equal(result.toolNames.length, 7)
  })

  test('a resolve_verdicts call runs the real engine and the verdicts are collected', async () => {
    process.env.GATE_CHECK_OFFLINE = '1'
    try {
      const model = toolCallThen(
        'resolve_verdicts',
        {itineraryId: 'itn-dl-regional', itemIds: ['itm-rollaboard', 'itm-cam16x4']},
        'Your bag is fine to Atlanta and cannot come into the cabin on the way home.',
      )
      const result = await runCheck('Can I take my roll-aboard and four camera batteries?', {model})

      assert.equal(result.steps, 2, 'one tool step, then the answer')
      assert.deepEqual(result.toolCalls.map((c) => c.name), ['resolve_verdicts'])
      assert.ok(result.answer.includes('cannot come into the cabin'))

      // The verdicts come off the tool call itself, not parsed back out of prose.
      assert.ok(result.verdicts.length > 0, 'no verdicts were collected from the tool call')
      assert.equal(result.tripOutcome, 'prohibited')

      const regional = result.verdicts.filter((v) => v.segmentIndex === 1)
      assert.ok(
        regional.some((v) => v.itemLabel.includes('Roll-aboard') && v.outcome === 'prohibited'),
        'the CRJ-200 refusal must survive the round trip through the tool',
      )
      assert.ok(
        regional.some((v) => v.itemLabel === 'Before you hand the bag over'),
        'so must the cross-document gate-check instruction',
      )

      // No write token in tests, so nothing was persisted — and that must not throw.
      assert.equal(result.checkRunId, null)
    } finally {
      process.env.GATE_CHECK_OFFLINE = '0'
    }
  })

  test('a bad itinerary id comes back as a tool error rather than an exception', async () => {
    process.env.GATE_CHECK_OFFLINE = '1'
    try {
      const model = toolCallThen(
        'resolve_verdicts',
        {itineraryId: 'itn-does-not-exist', itemIds: ['itm-rollaboard']},
        'I could not find that itinerary.',
      )
      const result = await runCheck('anything', {model})
      assert.equal(result.verdicts.length, 0)
      assert.equal(result.tripOutcome, 'unknown')
    } finally {
      process.env.GATE_CHECK_OFFLINE = '0'
    }
  })
})
