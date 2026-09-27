/**
 * The evaluation suite.
 *
 * Runs entirely offline against the seeded corpus, so anyone can check the claims
 * this project makes without a Sanity account or Context beta access:
 *
 *   npm run eval
 *
 * Exits non-zero on any failure, so it works in CI.
 */
import {evaluateItinerary, tripOutcome, type Verdict} from '@gate-check/resolver'
import {CASES} from './cases.ts'
import {item, itinerary, projectedClaims, projectedItems, projectedSignedRulings, proposedRulings} from '@gate-check/seed/projected'

const asJson = process.argv.includes('--json')
const worstPerSegment = (verdicts: Verdict[], index: number) =>
  tripOutcome(verdicts.filter((v) => v.segmentIndex === index))

const results = CASES.map((c) => {
  const trip = itinerary(c.itineraryId)
  const items = c.itemIds.map(item)
  const verdicts = evaluateItinerary(trip, items, projectedClaims, projectedSignedRulings)
  const failures: string[] = []
  const observed: Record<number, string> = {}

  for (const [idxRaw, expected] of Object.entries(c.expect)) {
    const idx = Number(idxRaw)
    const actual = worstPerSegment(verdicts, idx)
    observed[idx] = actual
    if (actual !== expected) failures.push(`segment ${idx}: expected ${expected}, got ${actual}`)
  }

  for (const idx of c.expectUnresolvedOn ?? []) {
    if (!verdicts.some((v) => v.segmentIndex === idx && v.unresolvedConflict)) {
      failures.push(`segment ${idx}: expected an unresolved conflict to be flagged, none was`)
    }
  }

  for (const idx of c.expectConditionOn ?? []) {
    if (!verdicts.some((v) => v.segmentIndex === idx && v.outcome === 'allowed-with-conditions')) {
      failures.push(`segment ${idx}: expected a conditions-level instruction, none was raised`)
    }
  }

  if (c.mustDifferAcrossSegments && new Set(Object.values(observed)).size < 2) {
    failures.push('expected the answer to differ between segments; it did not, so per-segment resolution is doing nothing')
  }

  return {id: c.id, passed: failures.length === 0, failures, observed, why: c.why}
})

const stats = {
  claims: projectedClaims.length,
  sources: new Set(projectedClaims.map((c) => c.source?._id)).size,
  signedRulings: projectedSignedRulings.length,
  proposedRulings: proposedRulings.length,
  items: projectedItems.length,
}
const passed = results.filter((r) => r.passed).length

if (asJson) {
  console.log(JSON.stringify({passed, total: results.length, corpus: stats, results}, null, 2))
} else {
  console.log(`Corpus: ${stats.claims} claims from ${stats.sources} sources | ${stats.signedRulings} signed rulings | ${stats.proposedRulings} proposed | ${stats.items} items`)
  console.log()
  for (const r of results) {
    console.log(`${r.passed ? '  PASS  ' : '  FAIL  '}${r.id}`)
    console.log(`        ${r.why}`)
    console.log(`        observed: ${Object.entries(r.observed).map(([k, v]) => `seg${k}=${v}`).join('  ')}`)
    for (const f of r.failures) console.log(`        >> ${f}`)
    console.log()
  }
  console.log(`${passed}/${results.length} cases passed`)
}

process.exit(passed === results.length ? 0 : 1)
