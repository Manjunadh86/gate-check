import {test, describe} from 'node:test'
import assert from 'node:assert/strict'
import {buildSituation, evaluateItemOnSegment, evaluateItinerary} from './evaluate.ts'
import {currentClaims, resolveSubject} from './resolve.ts'
import {scopeMatches} from './scope.ts'
import {fitsWithin} from './values.ts'
import * as f from './fixtures.ts'

const sit = (over: Parameters<typeof f.segment>[0] = {}, item?: Parameters<typeof f.item>[0]) =>
  buildSituation(f.itinerary(), f.segment(over), item ? f.item(item) : undefined)

describe('scope matching', () => {
  test('an empty scope is a wildcard, which is what makes regulator claims the floor', () => {
    const c = f.claim('spareBatteryMaxWh', 160, {bindingMode: 'ceiling', source: f.faa})
    assert.equal(scopeMatches(c.scope, sit()).matched, true)
    assert.equal(scopeMatches(c.scope, sit()).specificity, 0)
  })

  test('a carrier-scoped claim follows the operating carrier, not the ticket', () => {
    const c = f.claim('carryOnMaxMassKg', 7, {scope: {carrierIds: [f.endeavor._id]}})
    // Ticketed DL, flown by DL: Endeavor's rule must not apply.
    assert.equal(scopeMatches(c.scope, sit()).matched, false)
    // Ticketed DL, flown by Endeavor: it must.
    assert.equal(scopeMatches(c.scope, sit({operatingCarrier: f.endeavor})).matched, true)
  })

  test('status earns nothing on a partner that did not grant it', () => {
    const c = f.claim('carryOnPieceCount', 2, {
      scope: {minimumTier: {carrierId: f.delta._id, tierName: 'Gold', rank: 2}},
    })
    const goldOnDelta = buildSituation(
      f.itinerary({tierHeld: {carrierId: f.delta._id, tierName: 'Gold', rank: 2}}),
      f.segment({operatingCarrier: f.endeavor}),
    )
    assert.equal(scopeMatches(c.scope, goldOnDelta).matched, true, 'tier is held with Delta, so a Delta-scoped tier rule applies')

    const goldOnEndeavor = buildSituation(
      f.itinerary({tierHeld: {carrierId: f.endeavor._id, tierName: 'Gold', rank: 2}}),
      f.segment(),
    )
    assert.equal(scopeMatches(c.scope, goldOnEndeavor).matched, false, 'tier held with the wrong carrier must not match')
  })

  test('a more specific claim scores higher, and aircraft type beats family', () => {
    const byFamily = f.claim('carryOnPieceCount', 1, {scope: {aircraftFamilies: ['regional-jet']}})
    const byType = f.claim('carryOnPieceCount', 0, {scope: {aircraftTypeIds: [f.crj200._id]}})
    const s = sit({aircraftType: f.crj200})
    assert.ok(scopeMatches(byType.scope, s).specificity > scopeMatches(byFamily.scope, s).specificity)
  })
})

describe('currency', () => {
  test('a claim outside its effective window is dropped', () => {
    const expired = f.claim('carryOnMaxMassKg', 10, {effectiveTo: '2026-01-01'})
    assert.equal(currentClaims([expired], '2026-10-20').length, 0)
    assert.equal(currentClaims([expired], '2025-06-01').length, 1)
  })

  test('a superseding claim removes the one it replaces without deleting it', () => {
    const old = f.claim('carryOnMaxMassKg', 10, {id: 'clm.old'})
    const next = f.claim('carryOnMaxMassKg', 7, {supersedesId: 'clm.old', effectiveFrom: '2026-03-01'})
    const live = currentClaims([old, next], '2026-10-20')
    assert.deepEqual(live.map((c) => c._id), [next._id])
  })
})

describe('resolution', () => {
  test('one claim is a sole source', () => {
    const r = resolveSubject('carryOnMaxMassKg', [f.claim('carryOnMaxMassKg', 7)], [], sit())
    assert.equal(r.method, 'sole-source')
    assert.equal(r.disagreement, false)
  })

  test('agreeing sources are unanimous, not a conflict', () => {
    const r = resolveSubject(
      'spareBatteryApprovalAboveWh',
      [
        f.claim('spareBatteryApprovalAboveWh', 100, {bindingMode: 'floor', source: f.faa}),
        f.claim('spareBatteryApprovalAboveWh', 100, {bindingMode: 'override'}),
      ],
      [],
      sit(),
    )
    assert.equal(r.disagreement, false)
    assert.ok(['unanimous', 'stricter-overlay'].includes(r.method))
  })

  /**
   * The case that forced `bindingMode` to exist. The FAA outranks Delta on every
   * authority measure and must still lose, because the FAA's own page says
   * airlines may be stricter.
   */
  test('a stricter carrier overlay beats a more authoritative regulatory floor', () => {
    const claims = [
      f.claim('spareBatteryMaxWh', 160, {bindingMode: 'floor', source: f.faa}),
      f.claim('spareBatteryMaxWh', 100, {
        bindingMode: 'override',
        source: f.deltaBattery,
        scope: {carrierIds: [f.delta._id], itemCategories: ['power-bank']},
      }),
    ]
    const r = resolveSubject('spareBatteryMaxWh', claims, [], sit({}, {category: 'power-bank', batteryState: 'in-power-bank'}))
    assert.equal(r.method, 'stricter-overlay')
    assert.equal(r.value.kind === 'number' && r.value.n, 100)
    assert.equal(r.unresolved, false, 'this is a defensible resolution, not an open question')
    assert.match(r.explanation, /stricter/i)
  })

  test('the same regulatory floor still governs an item the carrier overlay does not cover', () => {
    const claims = [
      f.claim('spareBatteryMaxWh', 160, {bindingMode: 'floor', source: f.faa}),
      f.claim('spareBatteryMaxWh', 100, {
        bindingMode: 'override',
        source: f.deltaBattery,
        scope: {carrierIds: [f.delta._id], itemCategories: ['power-bank']},
      }),
    ]
    const r = resolveSubject('spareBatteryMaxWh', claims, [], sit({}, {category: 'camera-battery', batteryState: 'spare'}))
    assert.equal(r.value.kind === 'number' && r.value.n, 160, 'a camera battery is not a power bank')
  })

  test('an absolute ceiling caps a carrier that tries to be more generous', () => {
    const claims = [
      f.claim('spareBatteryMaxWh', 160, {bindingMode: 'ceiling', source: f.faa}),
      f.claim('spareBatteryMaxWh', 200, {bindingMode: 'override', scope: {carrierIds: [f.delta._id]}}),
    ]
    const r = resolveSubject('spareBatteryMaxWh', claims, [], sit())
    assert.equal(r.method, 'capped-by-ceiling')
    assert.equal(r.value.kind === 'number' && r.value.n, 160)
  })

  test('two carrier rules of equal standing fall back to the tighter one and say so', () => {
    const a = f.claim('carryOnMaxMassKg', 7, {id: 'clm.a', scope: {carrierIds: [f.delta._id]}})
    const b = f.claim('carryOnMaxMassKg', 10, {id: 'clm.b', scope: {carrierIds: [f.delta._id]}})
    const r = resolveSubject('carryOnMaxMassKg', [a, b], [], sit())
    assert.equal(r.method, 'most-restrictive')
    assert.equal(r.unresolved, true, 'nobody has ruled, so this stays on the backlog')
    assert.equal(r.value.kind === 'number' && r.value.n, 7)
    assert.equal(r.considered.length, 2, 'both claims stay visible side by side')
  })

  test('a signed ruling settles a conflict and is preferred to the safety fallback', () => {
    const a = f.claim('carryOnMaxMassKg', 7, {id: 'clm.a', scope: {carrierIds: [f.delta._id]}})
    const b = f.claim('carryOnMaxMassKg', 10, {id: 'clm.b', scope: {carrierIds: [f.delta._id]}})
    const r = resolveSubject('carryOnMaxMassKg', [a, b], [
      f.ruling({subject: 'carryOnMaxMassKg', chosenId: 'clm.b', conflictingIds: ['clm.a', 'clm.b']}),
    ], sit())
    assert.equal(r.method, 'signed-ruling')
    assert.equal(r.value.kind === 'number' && r.value.n, 10)
    assert.equal(r.unresolved, false)
  })

  test('a proposed ruling is ignored — only a signed one binds', () => {
    const a = f.claim('carryOnMaxMassKg', 7, {id: 'clm.a', scope: {carrierIds: [f.delta._id]}})
    const b = f.claim('carryOnMaxMassKg', 10, {id: 'clm.b', scope: {carrierIds: [f.delta._id]}})
    // resolveSubject is only ever handed signed rulings, so the guard is at the
    // query boundary. This asserts the query contract rather than the function.
    const r = resolveSubject('carryOnMaxMassKg', [a, b], [], sit())
    assert.equal(r.method, 'most-restrictive')
  })

  test('dimension sets that are each larger on a different axis are left unresolved rather than averaged', () => {
    const wide = f.claim('carryOnMaxDimensionsMm', {l: 457, w: 356, h: 178}, {id: 'clm.wide'})
    const deep = f.claim('carryOnMaxDimensionsMm', {l: 406, w: 330, h: 203}, {id: 'clm.deep'})
    const r = resolveSubject('carryOnMaxDimensionsMm', [wide, deep], [], sit())
    assert.equal(r.method, 'unresolvable')
    assert.equal(r.unresolved, true)
    assert.equal(r.governing, null, 'refusing to answer is the correct answer here')
  })

  test('nothing applicable reports no-rule instead of inventing a limit', () => {
    const r = resolveSubject('carryOnMaxMassKg', [], [], sit())
    assert.equal(r.method, 'no-rule')
    assert.equal(r.governing, null)
    assert.match(r.explanation, /rather than guessed/)
  })
})

describe('geometry', () => {
  test('a bag fits if it fits in any orientation', () => {
    assert.equal(fitsWithin({lengthMm: 300, widthMm: 500, heightMm: 200}, {lengthMm: 550, widthMm: 350, heightMm: 230}), true)
    assert.equal(fitsWithin({lengthMm: 600, widthMm: 200, heightMm: 200}, {lengthMm: 550, widthMm: 350, heightMm: 230}), false)
  })
})

describe('verdicts on the real scenarios', () => {
  // The published figures, as verified on the carrier and regulator pages.
  const DL_CARRYON = f.claim('carryOnMaxDimensionsMm', {l: 559, w: 356, h: 229}, {
    source: f.deltaCarryOn,
    scope: {carrierIds: [f.delta._id]},
  })
  const FAA_CEILING = f.claim('spareBatteryMaxWh', 160, {bindingMode: 'ceiling', source: f.faa, scope: {batteryStates: ['spare', 'in-power-bank']}})
  const FAA_APPROVAL = f.claim('spareBatteryApprovalAboveWh', 100, {bindingMode: 'floor', source: f.faa, scope: {batteryStates: ['spare', 'in-power-bank']}})
  const FAA_CABIN_ONLY = f.claim('spareBatteryCabinOnly', true, {bindingMode: 'floor', source: f.faa, scope: {batteryStates: ['spare', 'in-power-bank']}})
  const DL_POWERBANK_WH = f.claim('spareBatteryMaxWh', 100, {
    source: f.deltaBattery,
    scope: {carrierIds: [f.delta._id], itemCategories: ['power-bank']},
  })
  const DL_CONNECTION_PIECES = f.claim('carryOnPieceCount', 0, {
    source: f.deltaCarryOn,
    scope: {carrierIds: [f.delta._id, f.endeavor._id], aircraftTypeIds: [f.crj200._id]},
  })
  const DL_MAINLINE_PIECES = f.claim('carryOnPieceCount', 1, {
    source: f.deltaCarryOn,
    scope: {carrierIds: [f.delta._id]},
  })
  const ALL = [DL_CARRYON, FAA_CEILING, FAA_APPROVAL, FAA_CABIN_ONLY, DL_POWERBANK_WH, DL_CONNECTION_PIECES, DL_MAINLINE_PIECES]

  test('a 137 Wh power bank is prohibited on Delta metal, though 137 Wh is inside the federal ceiling', () => {
    const v = evaluateItemOnSegment(
      f.itinerary(),
      f.segment(),
      0,
      f.item({label: '137 Wh power bank', category: 'power-bank', batteryState: 'in-power-bank', wattHours: 137}),
      ALL,
      [],
    )
    assert.equal(v.outcome, 'prohibited')
    assert.match(v.headline, /137 Wh is above the 100 Wh ceiling/)
  })

  test('the identical 137 Wh cell as a camera battery only needs approval — the category is what changes the answer', () => {
    const v = evaluateItemOnSegment(
      f.itinerary(),
      f.segment(),
      0,
      f.item({label: '137 Wh camera battery', category: 'camera-battery', batteryState: 'spare', wattHours: 137}),
      ALL,
      [],
    )
    assert.equal(v.outcome, 'approval-required')
  })

  test('a spare cell in checked baggage is prohibited, in the cabin it is fine', () => {
    const checked = evaluateItemOnSegment(
      f.itinerary(), f.segment(), 0,
      f.item({category: 'camera-battery', batteryState: 'spare', wattHours: 74, carriedIn: 'checked'}),
      ALL, [],
    )
    assert.equal(checked.outcome, 'prohibited')
    const cabin = evaluateItemOnSegment(
      f.itinerary(), f.segment(), 0,
      f.item({category: 'camera-battery', batteryState: 'spare', wattHours: 74, carriedIn: 'cabin'}),
      ALL, [],
    )
    assert.equal(cabin.outcome, 'allowed')
  })

  /**
   * The headline claim of the whole project: one bag, one trip, two different
   * answers, and no keyword search can produce the second one.
   */
  test('the same legal bag is allowed outbound and refused from the cabin on the regional segment home', () => {
    const bag = f.item({label: 'roll-aboard', category: 'cabin-bag', dimensionsMm: {lengthMm: 559, widthMm: 356, heightMm: 229}})
    const trip = f.itinerary({
      segments: [
        f.segment({aircraftType: f.b739, originIata: 'JFK', destinationIata: 'ATL'}),
        f.segment({operatingCarrier: f.endeavor, aircraftType: f.crj200, originIata: 'ATL', destinationIata: 'TYS', flightNumber: '4921'}),
      ],
    })
    const verdicts = evaluateItinerary(trip, [bag], ALL, [])

    const outbound = verdicts.filter((v) => v.segmentIndex === 0)
    const regional = verdicts.filter((v) => v.segmentIndex === 1)

    assert.ok(outbound.every((v) => v.outcome === 'allowed'), 'legal and it fits the 737 bins')
    assert.ok(regional.some((v) => v.outcome === 'prohibited'), 'the CRJ-200 segment allows zero cabin bags')
    assert.ok(
      regional.some((v) => v.segmentLabel.includes('operated by Endeavor Air')),
      'the label has to name the operator, because that is the thing that changed',
    )
  })

  test('the regional segment label credits the operating carrier even though the ticket says Delta', () => {
    const trip = f.itinerary({segments: [f.segment({operatingCarrier: f.endeavor, aircraftType: f.crj200})]})
    const v = evaluateItinerary(trip, [f.item({category: 'cabin-bag', dimensionsMm: {lengthMm: 400, widthMm: 300, heightMm: 150}})], ALL, [])
    assert.match(v[0]!.segmentLabel, /^DL1421 JFK→ATL \(operated by Endeavor Air\)$/)
  })
})

describe('watt-hour bands', () => {
  test('a rule written for the 101-160 Wh band does not touch a phone battery', () => {
    const twoSpares = f.claim('spareBatteryMaxCount', 2, {
      bindingMode: 'floor',
      source: f.faa,
      scope: {batteryStates: ['spare', 'in-power-bank'], appliesAboveWh: 100},
    })
    const phone = evaluateItemOnSegment(
      f.itinerary(), f.segment(), 0,
      f.item({label: '4 phone batteries', category: 'camera-battery', batteryState: 'spare', wattHours: 12, quantity: 4}),
      [twoSpares], [],
    )
    assert.notEqual(phone.outcome, 'prohibited', 'four small cells are fine; the two-spare limit is for large ones')

    const drones = evaluateItemOnSegment(
      f.itinerary(), f.segment(), 0,
      f.item({label: '3 drone packs', category: 'drone-battery', batteryState: 'spare', wattHours: 137, quantity: 3}),
      [twoSpares], [],
    )
    assert.equal(drones.outcome, 'prohibited', 'three spares above 100 Wh exceeds the limit of two')
  })
})

describe('seat-count scoping', () => {
  test('the 50-seat restriction binds the CRJ-200 and leaves the 737 alone', () => {
    const rule = f.claim('carryOnPieceCount', 0, {
      scope: {carrierIds: [f.delta._id, f.endeavor._id], appliesAtOrBelowSeats: 50},
    })
    const bag = f.item({category: 'cabin-bag', dimensionsMm: {lengthMm: 400, widthMm: 300, heightMm: 150}})
    const mainline = evaluateItinerary(f.itinerary({segments: [f.segment()]}), [bag], [rule], [])
    assert.ok(mainline.every((v) => v.outcome !== 'prohibited'), '180 seats, rule does not apply')

    const regional = evaluateItinerary(
      f.itinerary({segments: [f.segment({operatingCarrier: f.endeavor, aircraftType: f.crj200})]}),
      [bag], [rule], [],
    )
    assert.ok(regional.some((v) => v.outcome === 'prohibited'), '50 seats, no cabin bags')
  })
})
