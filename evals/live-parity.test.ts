import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {createClient} from '@sanity/client'
import {ALL_CLAIMS, BAG_ITEMS, ITINERARIES, SIGNED_RULINGS} from '@gate-check/content-model/queries'
import {
  projectedClaims,
  projectedItems,
  projectedItineraries,
  projectedSignedRulings,
} from '@gate-check/seed/projected'

/**
 * The same parity check as parity.test.ts, but against Sanity's real Content Lake
 * instead of groq-js.
 *
 * groq-js is Sanity's own evaluator, so the offline check is already strong. This
 * closes the last gap: that the documents actually stored in the project, read by
 * the production query engine, come back in exactly the shapes the resolver was
 * tested against. It runs anonymously, which also proves the dataset is public —
 * the thing judges need in order to inspect the content model.
 *
 * Skipped unless a project is configured, so a fresh clone stays green offline.
 */
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'

const normalise = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? null : x)))
const byId = <T extends {_id: string}>(rows: T[]) => [...rows].sort((a, b) => a._id.localeCompare(b._id))

describe('live Content Lake parity', {skip: !projectId && 'no Sanity project configured'}, () => {
  // No token: an anonymous read succeeding is the proof the dataset is public.
  const client = createClient({projectId, dataset, apiVersion: '2026-09-01', useCdn: false, perspective: 'published'})

  test('the dataset is publicly readable', async () => {
    const n = await client.fetch<number>('count(*[!(_id in path("_.**"))])')
    assert.ok(n > 0, 'anonymous read returned nothing — dataset private, or not seeded')
  })

  test('ALL_CLAIMS from the Content Lake matches the offline projection', async () => {
    const live = await client.fetch<{_id: string}[]>(ALL_CLAIMS)
    assert.deepEqual(normalise(byId(live)), normalise(byId(projectedClaims)))
  })

  test('ITINERARIES from the Content Lake matches the offline projection', async () => {
    const live = await client.fetch<{_id: string}[]>(ITINERARIES)
    assert.deepEqual(normalise(byId(live)), normalise(byId(projectedItineraries)))
  })

  test('BAG_ITEMS from the Content Lake matches the offline projection', async () => {
    const live = await client.fetch<{_id: string}[]>(BAG_ITEMS)
    assert.deepEqual(normalise(byId(live)), normalise(byId(projectedItems)))
  })

  test('SIGNED_RULINGS from the Content Lake matches — and is empty, because both are proposed', async () => {
    const live = await client.fetch<unknown[]>(SIGNED_RULINGS)
    assert.deepEqual(normalise(live), normalise(projectedSignedRulings))
  })
})
