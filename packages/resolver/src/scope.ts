import type {ResolvedScope, Situation} from '@gate-check/content-model'

/**
 * Specificity weights.
 *
 * When two sourced claims disagree, the narrower one should normally win, and
 * "narrower" has to be defined rather than felt. The weights below say that
 * naming the exact aeroplane is a stronger commitment than naming a family,
 * which is stronger than naming a jurisdiction — because a regulator's rule is
 * the floor everyone builds on, while a claim about one aircraft type is someone
 * documenting one aeroplane's bins.
 *
 * Changing these numbers changes which figure a traveller is shown, so they are
 * covered by tests in ./resolve.test.ts rather than left as taste.
 */
export const SPECIFICITY_WEIGHTS = {
  aircraftTypeIds: 4,
  carrierIds: 3,
  fareBrands: 3,
  minimumTier: 3,
  aircraftFamilies: 2,
  appliesAtOrBelowSeats: 3,
  appliesAboveWh: 2,
  appliesAtOrBelowWh: 2,
  cabinClasses: 2,
  batteryStates: 2,
  itemCategories: 2,
  jurisdictionIds: 1,
} as const

export interface ScopeMatch {
  matched: boolean
  /** Sum of the weights of every facet this claim pinned down and matched on. */
  specificity: number
  /** Which facet ruled the claim out. Surfaced in the UI's "why not this rule" view. */
  failedOn?: keyof typeof SPECIFICITY_WEIGHTS
}

const NO_MATCH = (failedOn: keyof typeof SPECIFICITY_WEIGHTS): ScopeMatch => ({
  matched: false,
  specificity: 0,
  failedOn,
})

/**
 * Does this scope cover this situation?
 *
 * An empty facet means "any" — that is the convention the whole model rests on,
 * and it is why a regulator claim with a completely empty scope is the universal
 * fallback rather than a claim that matches nothing.
 */
export function scopeMatches(scope: ResolvedScope, situation: Situation): ScopeMatch {
  let specificity = 0

  // The carrier that flies the aeroplane, never the one that sold the ticket.
  if (scope.carrierIds.length > 0) {
    if (!scope.carrierIds.includes(situation.operatingCarrierId)) return NO_MATCH('carrierIds')
    specificity += SPECIFICITY_WEIGHTS.carrierIds
  }

  if (scope.aircraftTypeIds.length > 0) {
    if (!scope.aircraftTypeIds.includes(situation.aircraft._id)) return NO_MATCH('aircraftTypeIds')
    specificity += SPECIFICITY_WEIGHTS.aircraftTypeIds
  }

  if (scope.aircraftFamilies.length > 0) {
    if (!scope.aircraftFamilies.includes(situation.aircraft.family)) return NO_MATCH('aircraftFamilies')
    specificity += SPECIFICITY_WEIGHTS.aircraftFamilies
  }

  if (scope.cabinClasses.length > 0) {
    if (!scope.cabinClasses.includes(situation.cabinClass)) return NO_MATCH('cabinClasses')
    specificity += SPECIFICITY_WEIGHTS.cabinClasses
  }

  if (scope.fareBrands.length > 0) {
    const brand = situation.fareBrand?.trim().toLowerCase()
    if (!brand || !scope.fareBrands.some((b) => b.trim().toLowerCase() === brand)) return NO_MATCH('fareBrands')
    specificity += SPECIFICITY_WEIGHTS.fareBrands
  }

  // Status earns an allowance on the carrier that granted it. Holding gold with
  // the airline that sold the ticket buys nothing on the regional partner
  // actually operating the flight, which is a trap worth being exact about.
  if (scope.minimumTier) {
    const held = situation.tierHeld
    const requiredRank = scope.minimumTier.rank
    if (!held || held.carrierId !== scope.minimumTier.carrierId) return NO_MATCH('minimumTier')
    if (typeof requiredRank !== 'number' || held.rank < requiredRank) return NO_MATCH('minimumTier')
    specificity += SPECIFICITY_WEIGHTS.minimumTier
  }

  // A jurisdiction claim applies if the route touches it at all.
  if (scope.jurisdictionIds.length > 0) {
    if (!scope.jurisdictionIds.some((j) => situation.jurisdictionIds.includes(j))) return NO_MATCH('jurisdictionIds')
    specificity += SPECIFICITY_WEIGHTS.jurisdictionIds
  }

  if (scope.itemCategories.length > 0) {
    if (!situation.itemCategory || !scope.itemCategories.includes(situation.itemCategory)) {
      return NO_MATCH('itemCategories')
    }
    specificity += SPECIFICITY_WEIGHTS.itemCategories
  }

  if (scope.batteryStates.length > 0) {
    if (!situation.batteryState || !scope.batteryStates.includes(situation.batteryState)) {
      return NO_MATCH('batteryStates')
    }
    specificity += SPECIFICITY_WEIGHTS.batteryStates
  }

  // Seat count. Written this way because the carrier writes it this way.
  if (typeof scope.appliesAtOrBelowSeats === 'number') {
    const seats = situation.aircraft.seats
    if (typeof seats !== 'number' || seats > scope.appliesAtOrBelowSeats) return NO_MATCH('appliesAtOrBelowSeats')
    specificity += SPECIFICITY_WEIGHTS.appliesAtOrBelowSeats
  }

  // Watt-hour band. A rule written for the 101–160 Wh range must not be applied
  // to a phone battery, and a rule written for small cells must not license a
  // drone pack.
  if (typeof scope.appliesAboveWh === 'number') {
    if (typeof situation.wattHours !== 'number' || situation.wattHours <= scope.appliesAboveWh) {
      return NO_MATCH('appliesAboveWh')
    }
    specificity += SPECIFICITY_WEIGHTS.appliesAboveWh
  }
  if (typeof scope.appliesAtOrBelowWh === 'number') {
    if (typeof situation.wattHours !== 'number' || situation.wattHours > scope.appliesAtOrBelowWh) {
      return NO_MATCH('appliesAtOrBelowWh')
    }
    specificity += SPECIFICITY_WEIGHTS.appliesAtOrBelowWh
  }

  return {matched: true, specificity}
}

/**
 * Is a ruling's scope applicable to this situation?
 *
 * Same test, but a ruling must not be stretched: a ruling scoped to one carrier
 * has nothing to say about another, and `scopeMatches` already refuses that.
 */
export const rulingApplies = (scope: ResolvedScope, situation: Situation): boolean =>
  scopeMatches(scope, situation).matched

/**
 * Why a claim did not apply, in a sentence.
 *
 * The scope machinery is the most interesting thing in this system and it is
 * invisible when it works. Surfacing the facet that ruled a claim out turns "the
 * app gave me a number" into "the app can show me the rule it decided was about a
 * different aeroplane" — which is the difference between a verdict you trust and
 * one you take on faith.
 */
export function explainExclusion(
  scope: ResolvedScope,
  situation: Situation,
  failedOn: keyof typeof SPECIFICITY_WEIGHTS,
): string {
  switch (failedOn) {
    case 'carrierIds':
      return `written for a different operating carrier — this segment is flown by ${situation.operatingCarrierId}`
    case 'aircraftTypeIds':
      return `written for specific aircraft types, and this segment is a ${situation.aircraft.name}`
    case 'aircraftFamilies':
      return `written for ${scope.aircraftFamilies.join(' or ')} aircraft, and this is a ${situation.aircraft.family}`
    case 'appliesAtOrBelowSeats':
      return `applies only to aircraft of ${scope.appliesAtOrBelowSeats} seats or fewer, and the ${situation.aircraft.name} has ${situation.aircraft.seats ?? 'an unrecorded number of'} seats`
    case 'cabinClasses':
      return `written for ${scope.cabinClasses.join(' or ')}, and this segment is ${situation.cabinClass}`
    case 'fareBrands':
      return `written for the ${scope.fareBrands.join(' or ')} fare, and this ticket is ${situation.fareBrand ?? 'an unrecorded fare'}`
    case 'minimumTier':
      return situation.tierHeld
        ? `needs ${scope.minimumTier?.tierName} with the carrier that granted it, and the tier held does not qualify on this segment`
        : `needs ${scope.minimumTier?.tierName ?? 'a loyalty tier'}, and no tier is recorded for this traveller`
    case 'jurisdictionIds':
      return 'written for a jurisdiction this route does not touch'
    case 'itemCategories':
      return `written about ${scope.itemCategories.join(' or ')}, and this item is ${situation.itemCategory ?? 'uncategorised'}`
    case 'batteryStates':
      return `written about cells that are ${scope.batteryStates.join(' or ')}, and this one is ${situation.batteryState ?? 'not a battery'}`
    case 'appliesAboveWh':
      return `applies only above ${scope.appliesAboveWh} Wh, and this item is ${situation.wattHours ?? 'unrated'} Wh`
    case 'appliesAtOrBelowWh':
      return `applies only at or below ${scope.appliesAtOrBelowWh} Wh, and this item is ${situation.wattHours ?? 'unrated'} Wh`
  }
}
