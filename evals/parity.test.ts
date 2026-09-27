import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {evaluate, parse} from 'groq-js'
import {
  ALL_CLAIMS,
  BAG_ITEMS,
  ITINERARIES,
  ITINERARY_BY_ID,
  NEEDS_ATTENTION,
  SIGNED_RULINGS,
} from '@gate-check/content-model/queries'
import {allDocuments} from '@gate-check/seed'
import {projectedClaims, projectedItems, projectedItineraries, projectedSignedRulings} from '@gate-check/seed/projected'

/**
 * Parity between the real GROQ projections and the offline stand-in.
 *
 * `project.ts` reshapes the seed documents in TypeScript so the evaluation suite
 * runs without a Sanity account. That is duplication, and duplication drifts —
 * which would be a quiet disaster, because it would mean the suite proving the
 * engine correct was feeding it a shape the live app never sees.
 *
 * So the queries are run here for real. `groq-js` is Sanity's own GROQ
 * implementation, the same evaluator semantics the Content Lake applies, so these
 * are the actual query strings the Context MCP endpoint will execute — parsed and
 * evaluated against the actual seeded documents. If a projection and its stand-in
 * disagree by so much as a null, this fails.
 *
 * It also means the GROQ in this repo is syntax-checked on every run, which is
 * worth having on its own: a typo in a projection would otherwise surface as an
 * empty result at demo time.
 */

const run = async <T>(query: string, params: Record<string, unknown> = {}): Promise<T> => {
  const tree = parse(query)
  const value = await evaluate(tree, {dataset: allDocuments, params})
  return (await value.get()) as T
}

/** JSON round-trip so `undefined` and a missing key compare equal to `null`. */
const normalise = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? null : x)))

const sortById = <T extends {_id: string}>(rows: T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id))

describe('GROQ projections parse and evaluate', () => {
  test('every shipped query is valid GROQ', () => {
    for (const [name, query] of Object.entries({
      ALL_CLAIMS,
      SIGNED_RULINGS,
      ITINERARIES,
      ITINERARY_BY_ID,
      BAG_ITEMS,
      NEEDS_ATTENTION,
    })) {
      assert.doesNotThrow(() => parse(query), `${name} is not valid GROQ`)
    }
  })

  test('ALL_CLAIMS matches the offline projection exactly', async () => {
    const live = await run<{_id: string}[]>(ALL_CLAIMS)
    assert.equal(live.length, projectedClaims.length, 'claim counts differ')
    assert.deepEqual(normalise(sortById(live)), normalise(sortById(projectedClaims)))
  })

  test('BAG_ITEMS matches the offline projection exactly', async () => {
    const live = await run<{_id: string}[]>(BAG_ITEMS)
    assert.deepEqual(normalise(sortById(live)), normalise(sortById(projectedItems)))
  })

  test('ITINERARIES matches the offline projection exactly, including the nested tier lookup', async () => {
    const live = await run<{_id: string}[]>(ITINERARIES)
    assert.deepEqual(normalise(sortById(live)), normalise(sortById(projectedItineraries)))
  })

  test('ITINERARY_BY_ID returns the same document as the list projection', async () => {
    const one = await run<{_id: string}>(ITINERARY_BY_ID, {id: 'itn.dl.regional'})
    const fromList = projectedItineraries.find((i) => i._id === 'itn.dl.regional')
    assert.deepEqual(normalise(one), normalise(fromList))
  })

  test('SIGNED_RULINGS excludes proposed rulings — the guard the resolver relies on', async () => {
    const live = await run<{_id: string; status: string}[]>(SIGNED_RULINGS)
    // Both seeded rulings are proposed on purpose, so the live query must be empty.
    assert.deepEqual(live, [])
    assert.deepEqual(normalise(live), normalise(projectedSignedRulings))

    // Sign one and confirm it appears, so the emptiness above is the filter working
    // rather than the query being broken.
    const signed = allDocuments.map((d) =>
      d._id === 'rul.pb.wh'
        ? {...(d as Record<string, unknown>), status: 'signed', decidedBy: 'Parity test', decidedAt: '2026-09-27T00:00:00Z'}
        : d,
    )
    const tree = parse(SIGNED_RULINGS)
    const withSigned = (await (await evaluate(tree, {dataset: signed})).get()) as {_id: string; chosenId: string}[]
    assert.equal(withSigned.length, 1)
    assert.equal(withSigned[0]!._id, 'rul.pb.wh')
    assert.equal(withSigned[0]!.chosenId, 'clm.dl.pb.wh', 'the chosen claim reference must project to a bare id')
  })

  test('authority is derived in GROQ, not stored, and ranks the corpus as intended', async () => {
    const claims = await run<{source: {publisherName: string; docType: string; authority: number}}[]>(ALL_CLAIMS)
    const byPublisher = new Map(claims.map((c) => [c.source.publisherName, c.source.authority]))
    assert.equal(byPublisher.get('Federal Aviation Administration'), 5, 'regulation')
    assert.equal(byPublisher.get('International Air Transport Association'), 4, 'regulator-guidance')
    assert.equal(byPublisher.get('Delta Air Lines'), 3, 'help-page')
    assert.equal(byPublisher.get('FlyerTalk forum contributors'), 1, 'third-party')
  })

  test('NEEDS_ATTENTION surfaces the corpus health the Studio is organised around', async () => {
    const health = await run<{
      unsourced: unknown[]
      uncertain: {_id: string}[]
      expired: unknown[]
      proposedRulings: {_id: string}[]
    }>(NEEDS_ATTENTION, {today: '2026-09-27'})

    assert.deepEqual(health.unsourced, [], 'every claim must cite a source')
    assert.deepEqual(health.expired, [], 'no seeded claim is past its effective window')
    assert.equal(health.proposedRulings.length, 2, 'both seeded rulings are unsigned on purpose')
    // Delta's "aggregate total of 100 Wh each" and the two CRJ bin reports.
    assert.equal(health.uncertain.length, 3)
  })
})
