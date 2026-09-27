import type {
  BagItem,
  Claim,
  ClaimSubject,
  Itinerary,
  Ruling,
  Segment,
  Situation,
} from '@gate-check/content-model'
import {resolveSubject, type Resolution} from './resolve.ts'
import {fitsWithin, sortedAxes} from './values.ts'

export const OUTCOMES = [
  'allowed',
  'allowed-with-conditions',
  'gate-check-likely',
  'approval-required',
  'prohibited',
  'unknown',
] as const
export type Outcome = (typeof OUTCOMES)[number]

/** Worst outcome wins. A bag that is legal but will not fit is not "allowed". */
const SEVERITY: Record<Outcome, number> = {
  allowed: 0,
  'allowed-with-conditions': 1,
  'gate-check-likely': 2,
  'approval-required': 3,
  prohibited: 4,
  unknown: 1,
}
const worst = (outcomes: Outcome[]): Outcome =>
  outcomes.length === 0 ? 'unknown' : outcomes.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a))

export interface Finding {
  /** What was tested, in words a traveller can repeat at the desk. */
  test: string
  outcome: Outcome
  detail: string
  resolution: Resolution
}

export interface Verdict {
  segmentIndex: number
  segmentLabel: string
  itemId: string
  itemLabel: string
  outcome: Outcome
  headline: string
  findings: Finding[]
  unresolvedConflict: boolean
}

export const segmentLabel = (s: Segment): string =>
  `${s.marketingCarrier.iata}${s.flightNumber ?? ''} ${s.originIata}→${s.destinationIata}` +
  (s.operatingCarrier._id !== s.marketingCarrier._id ? ` (operated by ${s.operatingCarrier.name})` : '')

export function buildSituation(itinerary: Itinerary, segment: Segment, item?: BagItem): Situation {
  return {
    travelDate: itinerary.travelDate,
    operatingCarrierId: segment.operatingCarrier._id,
    marketingCarrierId: segment.marketingCarrier._id,
    aircraft: segment.aircraftType,
    jurisdictionIds: segment.jurisdictionIds,
    cabinClass: segment.cabinClass,
    fareBrand: segment.fareBrand,
    tierHeld:
      itinerary.tierHeld && typeof itinerary.tierHeld.rank === 'number'
        ? {carrierId: itinerary.tierHeld.carrierId, rank: itinerary.tierHeld.rank}
        : null,
    itemCategory: item?.category,
    batteryState: item?.batteryState,
    wattHours: item?.wattHours ?? null,
  }
}

interface Ctx {
  claims: Claim[]
  rulings: Ruling[]
  situation: Situation
}

const resolve = (ctx: Ctx, subject: ClaimSubject): Resolution =>
  resolveSubject(subject, ctx.claims, ctx.rulings, ctx.situation)

const BATTERY_CATEGORIES = new Set(['power-bank', 'camera-battery', 'drone-battery', 'mobility-battery'])

/**
 * Battery findings.
 *
 * The three thresholds in the transport rules are not interchangeable: a cell
 * under the approval line needs nothing, a cell between the lines needs the
 * operator's consent in advance, and a cell above the ceiling cannot go at all.
 * Because all three come from claims rather than constants, a carrier that files
 * a stricter figure than the regulator's floor changes the answer without a code
 * change.
 */
function batteryFindings(ctx: Ctx, item: BagItem): Finding[] {
  const findings: Finding[] = []
  const wh = item.wattHours
  const isSpare = item.batteryState === 'spare' || item.batteryState === 'in-power-bank'

  if (isSpare) {
    const cabinOnlySubject: ClaimSubject =
      item.category === 'power-bank' ? 'powerBankCabinOnly' : 'spareBatteryCabinOnly'
    const cabinOnly = resolve(ctx, cabinOnlySubject)
    if (cabinOnly.value.kind === 'boolean' && cabinOnly.value.b) {
      findings.push({
        test: 'Where it may be carried',
        outcome: item.carriedIn === 'checked' ? 'prohibited' : 'allowed',
        detail:
          item.carriedIn === 'checked'
            ? 'Spare lithium cells must travel in the cabin. In checked baggage this is not permitted — move it to your cabin bag.'
            : 'Correctly in the cabin, which is where spare lithium cells must be.',
        resolution: cabinOnly,
      })
    }

    if (typeof wh === 'number') {
      const ceiling = resolve(ctx, 'spareBatteryMaxWh')
      const approval = resolve(ctx, 'spareBatteryApprovalAboveWh')

      if (ceiling.value.kind === 'number' && wh > ceiling.value.n) {
        findings.push({
          test: 'Watt-hour ceiling',
          outcome: 'prohibited',
          detail: `${wh} Wh is above the ${ceiling.value.n} Wh ceiling. No approval covers this — it cannot fly as baggage.`,
          resolution: ceiling,
        })
      } else if (approval.value.kind === 'number' && wh > approval.value.n) {
        findings.push({
          test: 'Operator approval',
          outcome: 'approval-required',
          detail: `${wh} Wh is above the ${approval.value.n} Wh line, so it needs the operating carrier's approval before you travel — arranged with ${ctx.situation.operatingCarrierId ? 'the carrier flying this segment' : 'the carrier'}, not the one that sold the ticket.`,
          resolution: approval,
        })
      } else if (approval.value.kind === 'number') {
        findings.push({
          test: 'Operator approval',
          outcome: 'allowed',
          detail: `${wh} Wh is under the ${approval.value.n} Wh line, so no advance approval is needed.`,
          resolution: approval,
        })
      }
    } else {
      findings.push({
        test: 'Watt-hour rating',
        outcome: 'unknown',
        detail: 'No watt-hour figure recorded for this item, so the thresholds cannot be applied. Check the cell marking.',
        resolution: resolve(ctx, 'spareBatteryApprovalAboveWh'),
      })
    }

    const count = resolve(ctx, 'spareBatteryMaxCount')
    if (count.value.kind === 'number' && item.quantity > count.value.n) {
      findings.push({
        test: 'Number carried',
        outcome: 'prohibited',
        detail: `${item.quantity} spares exceeds the limit of ${count.value.n} for this segment.`,
        resolution: count,
      })
    }

    if (item.category === 'power-bank') {
      const terminals = resolve(ctx, 'powerBankTerminalProtectionRequired')
      if (terminals.value.kind === 'boolean' && terminals.value.b) {
        findings.push({
          test: 'Terminal protection',
          outcome: 'allowed-with-conditions',
          detail: 'Terminals must be taped or the unit kept in its own pouch or retail packaging.',
          resolution: terminals,
        })
      }
    }
  }

  if (item.batteryState === 'installed' && typeof wh === 'number') {
    const installed = resolve(ctx, 'installedBatteryMaxWh')
    if (installed.value.kind === 'number' && wh > installed.value.n) {
      findings.push({
        test: 'Installed battery ceiling',
        outcome: 'approval-required',
        detail: `${wh} Wh installed in a device is above the ${installed.value.n} Wh line and needs approval from the operating carrier.`,
        resolution: installed,
      })
    }
  }

  return findings
}

/** Bag geometry and mass, plus the bit the published allowance never tells you. */
function bagFindings(ctx: Ctx, item: BagItem): Finding[] {
  const findings: Finding[] = []
  const isPersonal = item.category === 'personal-item'

  if (isPersonal) {
    const allowed = resolve(ctx, 'personalItemAllowed')
    if (allowed.value.kind === 'boolean' && !allowed.value.b) {
      findings.push({
        test: 'Second piece permitted',
        outcome: 'prohibited',
        detail: 'This fare does not include a personal item in addition to a cabin bag.',
        resolution: allowed,
      })
    }
  }

  // A zero allowance is the most important thing anyone can tell you about your
  // bag, so it belongs on the bag. Reporting it only as a separate segment-level
  // row left the bag itself reading "gate-check likely", which invites a traveller
  // to turn up with it.
  if (!isPersonal) {
    const pieces = resolve(ctx, 'carryOnPieceCount')
    if (pieces.value.kind === 'number' && pieces.value.n === 0) {
      findings.push({
        test: 'Cabin bags permitted at all',
        outcome: 'prohibited',
        detail: `This segment permits no cabin bag whatsoever \u2014 personal items only. It is not a question of size: there is no cabin bag allowance on the ${ctx.situation.aircraft.name}.`,
        resolution: pieces,
      })
    }
  }

  const dimsSubject: ClaimSubject = isPersonal ? 'personalItemMaxDimensionsMm' : 'carryOnMaxDimensionsMm'
  const dims = resolve(ctx, dimsSubject)

  // When the sources cannot be reconciled the resolver returns no value at all.
  // That must show up as a visible "we cannot tell you" rather than as a missing
  // row, or the interface would imply the size question had been checked and
  // passed.
  if (item.dimensionsMm && dims.value.kind !== 'dimensions') {
    findings.push({
      test: 'Published size allowance',
      outcome: 'unknown',
      detail:
        dims.method === 'no-rule'
          ? 'No sourced size allowance in the dataset covers this segment, so the bag has not been size-checked. Ring the operating carrier.'
          : 'The sources that cover this segment give sizes that cannot be ordered against one another, so no size verdict is given. The conflict is listed below and needs a ruling.',
      resolution: dims,
    })
  }

  if (item.dimensionsMm && dims.value.kind === 'dimensions') {
    const ok = fitsWithin(item.dimensionsMm, dims.value.dims)
    const [il, iw, ih] = sortedAxes(item.dimensionsMm)
    const [al, aw, ah] = sortedAxes(dims.value.dims)
    findings.push({
      test: 'Published size allowance',
      outcome: ok ? 'allowed' : 'prohibited',
      detail: ok
        ? `${il}×${iw}×${ih} mm is inside the ${al}×${aw}×${ah} mm allowance.`
        : `${il}×${iw}×${ih} mm exceeds the ${al}×${aw}×${ah} mm allowance for this segment.`,
      resolution: dims,
    })
  }

  // The finding the airline's own size chart cannot give you: policy permits the
  // bag, and the aeroplane still does not.
  const bin = ctx.situation.aircraft.binOpening
  if (
    item.dimensionsMm &&
    !isPersonal &&
    bin?.lengthMm &&
    bin.widthMm &&
    bin.heightMm &&
    !fitsWithin(item.dimensionsMm, {lengthMm: bin.lengthMm, widthMm: bin.widthMm, heightMm: bin.heightMm})
  ) {
    findings.push({
      test: 'Fits this aircraft’s bins',
      outcome: 'gate-check-likely',
      detail: `Within the published allowance, but the ${ctx.situation.aircraft.name} bins open to ${bin.lengthMm}×${bin.widthMm}×${bin.heightMm} mm. Expect to hand it over at the door.${bin.note ? ` ${bin.note}` : ''}`,
      resolution: dims,
    })
  } else if (!isPersonal && ctx.situation.aircraft.gateCheckLikely) {
    findings.push({
      test: 'Fits this aircraft’s bins',
      outcome: 'gate-check-likely',
      detail: `Roll-aboards are gate-checked as a matter of routine on the ${ctx.situation.aircraft.name}. Keep anything you need — and every spare battery — in a smaller bag you keep with you.`,
      resolution: dims,
    })
  }

  if (typeof item.massKg === 'number' && !isPersonal) {
    const mass = resolve(ctx, 'carryOnMaxMassKg')
    if (mass.value.kind === 'number') {
      const ok = item.massKg <= mass.value.n
      findings.push({
        test: 'Weight allowance',
        outcome: ok ? 'allowed' : 'prohibited',
        detail: ok
          ? `${item.massKg} kg is within the ${mass.value.n} kg limit.`
          : `${item.massKg} kg is over the ${mass.value.n} kg limit for this segment.`,
        resolution: mass,
      })
    }
  }

  if (item.category === 'smart-bag') {
    const removable = resolve(ctx, 'smartBagBatteryMustBeRemovable')
    if (removable.value.kind === 'boolean' && removable.value.b) {
      findings.push({
        test: 'Smart bag battery',
        outcome: 'allowed-with-conditions',
        detail: 'The battery must be removable, and removed if the bag ends up being checked.',
        resolution: removable,
      })
    }
  }

  return findings
}

function ecigFindings(ctx: Ctx, item: BagItem): Finding[] {
  const cabinOnly = resolve(ctx, 'ecigCabinOnly')
  if (cabinOnly.value.kind !== 'boolean' || !cabinOnly.value.b) return []
  return [
    {
      test: 'Where it may be carried',
      outcome: item.carriedIn === 'checked' ? 'prohibited' : 'allowed-with-conditions',
      detail:
        item.carriedIn === 'checked'
          ? 'Vapes may not go in checked baggage. Move it to the cabin.'
          : 'Cabin only, and it may not be charged or used on board.',
      resolution: cabinOnly,
    },
  ]
}

/** One item, one segment. */
export function evaluateItemOnSegment(
  itinerary: Itinerary,
  segment: Segment,
  segmentIndex: number,
  item: BagItem,
  claims: Claim[],
  rulings: Ruling[],
): Verdict {
  const ctx: Ctx = {claims, rulings, situation: buildSituation(itinerary, segment, item)}

  const findings = [
    ...(BATTERY_CATEGORIES.has(item.category) || item.batteryState !== 'none' ? batteryFindings(ctx, item) : []),
    ...(item.category === 'cabin-bag' || item.category === 'personal-item' || item.category === 'smart-bag'
      ? bagFindings(ctx, item)
      : []),
    ...(item.category === 'ecig' ? ecigFindings(ctx, item) : []),
  ]

  if (item.category === 'medical-device' || item.category === 'mobility-battery') {
    findings.push({
      test: 'Medical and mobility exemption',
      outcome: 'approval-required',
      detail:
        'Medical and mobility equipment is treated separately from ordinary electronics and is usually permitted above the normal limits, but only with the operating carrier notified in advance. Ring them; do not rely on this app.',
      resolution: resolve(ctx, 'spareBatteryApprovalAboveWh'),
    })
  }

  const outcome = worst(findings.map((f) => f.outcome))
  const blocking = findings.find((f) => f.outcome === outcome)

  return {
    segmentIndex,
    segmentLabel: segmentLabel(segment),
    itemId: item._id,
    itemLabel: item.label,
    outcome,
    headline:
      findings.length === 0
        ? 'No rule in the dataset applies to this item on this segment.'
        : (blocking?.detail ?? 'Checked against every rule that applies.'),
    findings,
    unresolvedConflict: findings.some((f) => f.resolution.unresolved),
  }
}

/**
 * The whole itinerary.
 *
 * Deliberately per segment rather than per trip. One bag can be legal on the
 * widebody out and gate-checked on the regional jet home, and collapsing that
 * into a single trip-level answer is exactly the mistake the airline's own size
 * chart makes.
 */
export function evaluateItinerary(
  itinerary: Itinerary,
  items: BagItem[],
  claims: Claim[],
  rulings: Ruling[],
): Verdict[] {
  const verdicts: Verdict[] = []
  itinerary.segments.forEach((segment, i) => {
    for (const item of items) {
      verdicts.push(evaluateItemOnSegment(itinerary, segment, i, item, claims, rulings))
    }
    // Piece count is a property of the segment, not of any one bag.
    // A smart bag occupies a bin like any other roll-aboard, so it counts as a
    // piece. Only its battery is special.
    const cabinBags = items.filter(
      (it) => (it.category === 'cabin-bag' || it.category === 'smart-bag') && it.carriedIn === 'cabin',
    )
    const pieces = resolve(
      {claims, rulings, situation: buildSituation(itinerary, segment)},
      'carryOnPieceCount',
    )
    const segSituation = buildSituation(itinerary, segment)

    // The zero case is reported on each bag above, so this row is only for carrying
    // more pieces than an existing allowance permits.
    if (pieces.value.kind === 'number' && pieces.value.n > 0 && cabinBags.length > pieces.value.n) {
      verdicts.push({
        segmentIndex: i,
        segmentLabel: segmentLabel(segment),
        itemId: '__pieces__',
        itemLabel: `${cabinBags.length} cabin bags`,
        outcome: 'prohibited',
        headline: `This segment allows ${pieces.value.n} cabin bag${pieces.value.n === 1 ? '' : 's'} and you are carrying ${cabinBags.length}.`,
        findings: [
          {
            test: 'Number of cabin pieces',
            outcome: 'prohibited',
            detail: `Allowance is ${pieces.value.n}; carrying ${cabinBags.length}.`,
            resolution: pieces,
          },
        ],
        unresolvedConflict: pieces.unresolved,
      })
    }

    // The interaction nobody tells you about at the desk.
    //
    // It needs three separate facts at once: that this aircraft and this carrier's
    // regional policy will take the bag off you, that you are carrying spare
    // cells, and that the regulator requires those cells to stay with you when a
    // bag is checked at the door. No single page in the corpus says this, and no
    // keyword search can assemble it — it falls out of the structure.
    const spares = items.filter(
      (it) => (it.batteryState === 'spare' || it.batteryState === 'in-power-bank') && it.carriedIn === 'cabin',
    )
    const bagsLeavingTheCabin = verdicts.filter(
      (v) =>
        v.segmentIndex === i &&
        (v.outcome === 'gate-check-likely' || v.outcome === 'prohibited') &&
        cabinBags.some((b) => b._id === v.itemId),
    )

    if (spares.length > 0 && bagsLeavingTheCabin.length > 0) {
      const rule = resolveSubject(
        'spareMustLeaveGateCheckedBag',
        claims,
        rulings,
        {...segSituation, batteryState: 'spare'},
      )
      if (rule.value.kind === 'boolean' && rule.value.b) {
        const names = spares.map((s) => s.label).join(', ')
        verdicts.push({
          segmentIndex: i,
          segmentLabel: segmentLabel(segment),
          itemId: '__gatecheck_spares__',
          itemLabel: 'Before you hand the bag over',
          outcome: 'allowed-with-conditions',
          headline: `Your cabin bag is not staying with you on this segment, so take the batteries out of it first: ${names}. They have to travel in the cabin with you, not in the bag.`,
          findings: [
            {
              test: 'Spares must leave a gate-checked bag',
              outcome: 'allowed-with-conditions',
              detail: `${bagsLeavingTheCabin.length === 1 ? 'A bag' : `${bagsLeavingTheCabin.length} bags`} will be taken from you at the door on this segment. Every spare cell and power bank has to come out and stay with you.`,
              resolution: rule,
            },
          ],
          unresolvedConflict: rule.unresolved,
        })
      }
    }
  })
  return verdicts
}

/** The trip-level line the UI leads with. */
export const tripOutcome = (verdicts: Verdict[]): Outcome => worst(verdicts.map((v) => v.outcome))
