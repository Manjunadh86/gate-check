/**
 * The controlled vocabulary the whole system shares.
 *
 * Every one of these lists exists in exactly one place because the schema, the
 * resolver, the agent prompt and the seed data all have to agree on them. A
 * claim whose `subject` is a free-text string cannot be resolved against
 * another claim, so subjects are a closed set.
 */

/**
 * A `subject` is the normalised predicate a claim makes an assertion about.
 * Two claims can only contradict each other if they share a subject.
 */
export const CLAIM_SUBJECTS = [
  'carryOnMaxDimensionsMm',
  'carryOnMaxMassKg',
  'carryOnPieceCount',
  'personalItemAllowed',
  'personalItemMaxDimensionsMm',
  'spareBatteryMaxWh',
  'spareBatteryApprovalAboveWh',
  'spareBatteryMaxCount',
  'spareBatteryCabinOnly',
  'installedBatteryMaxWh',
  'powerBankCabinOnly',
  'powerBankTerminalProtectionRequired',
  'ecigCabinOnly',
  'smartBagBatteryMustBeRemovable',
  'spareMustLeaveGateCheckedBag',
] as const
export type ClaimSubject = (typeof CLAIM_SUBJECTS)[number]

/** Human labels, used in the Studio and in agent output. */
export const SUBJECT_LABELS: Record<ClaimSubject, string> = {
  carryOnMaxDimensionsMm: 'Cabin bag — maximum dimensions',
  carryOnMaxMassKg: 'Cabin bag — maximum mass',
  carryOnPieceCount: 'Cabin bag — number of pieces',
  personalItemAllowed: 'Personal item — allowed in addition',
  personalItemMaxDimensionsMm: 'Personal item — maximum dimensions',
  spareBatteryMaxWh: 'Spare battery — absolute Wh ceiling',
  spareBatteryApprovalAboveWh: 'Spare battery — Wh above which approval is required',
  spareBatteryMaxCount: 'Spare battery — maximum number carried',
  spareBatteryCabinOnly: 'Spare battery — cabin baggage only',
  installedBatteryMaxWh: 'Installed battery — Wh ceiling',
  powerBankCabinOnly: 'Power bank — cabin baggage only',
  powerBankTerminalProtectionRequired: 'Power bank — terminals must be protected',
  ecigCabinOnly: 'E-cigarette — cabin baggage only',
  smartBagBatteryMustBeRemovable: 'Smart bag — battery must be removable',
  spareMustLeaveGateCheckedBag: 'Spare battery — must be removed before a bag is gate-checked',
}

/**
 * What kind of value a subject carries. Stored on the claim so the Studio can
 * show one value field instead of fourteen, and so the resolver knows how to
 * compare two claims.
 */
export const VALUE_TYPES = ['dimensions', 'mass', 'number', 'boolean'] as const
export type ValueType = (typeof VALUE_TYPES)[number]

export const SUBJECT_VALUE_TYPE: Record<ClaimSubject, ValueType> = {
  carryOnMaxDimensionsMm: 'dimensions',
  carryOnMaxMassKg: 'mass',
  carryOnPieceCount: 'number',
  personalItemAllowed: 'boolean',
  personalItemMaxDimensionsMm: 'dimensions',
  spareBatteryMaxWh: 'number',
  spareBatteryApprovalAboveWh: 'number',
  spareBatteryMaxCount: 'number',
  spareBatteryCabinOnly: 'boolean',
  installedBatteryMaxWh: 'number',
  powerBankCabinOnly: 'boolean',
  powerBankTerminalProtectionRequired: 'boolean',
  ecigCabinOnly: 'boolean',
  smartBagBatteryMustBeRemovable: 'boolean',
  spareMustLeaveGateCheckedBag: 'boolean',
}

/**
 * Direction of safety for each subject. When sources disagree and no human has
 * ruled, the resolver falls back to the most restrictive claim — and it can
 * only know which one that is if the schema says which way is restrictive.
 */
export const SUBJECT_RESTRICTIVE_DIRECTION: Record<ClaimSubject, 'lower' | 'higher' | 'true'> = {
  carryOnMaxDimensionsMm: 'lower',
  carryOnMaxMassKg: 'lower',
  carryOnPieceCount: 'lower',
  personalItemAllowed: 'true', // "not allowed" is the restrictive reading
  personalItemMaxDimensionsMm: 'lower',
  spareBatteryMaxWh: 'lower',
  spareBatteryApprovalAboveWh: 'lower',
  spareBatteryMaxCount: 'lower',
  spareBatteryCabinOnly: 'true',
  installedBatteryMaxWh: 'lower',
  powerBankCabinOnly: 'true',
  powerBankTerminalProtectionRequired: 'true',
  ecigCabinOnly: 'true',
  smartBagBatteryMustBeRemovable: 'true',
  spareMustLeaveGateCheckedBag: 'true',
}

export const AIRCRAFT_FAMILIES = ['turboprop', 'regional-jet', 'narrowbody', 'widebody'] as const
export type AircraftFamily = (typeof AIRCRAFT_FAMILIES)[number]

export const CABIN_CLASSES = ['economy', 'premium-economy', 'business', 'first'] as const
export type CabinClass = (typeof CABIN_CLASSES)[number]

export const ITEM_CATEGORIES = [
  'cabin-bag',
  'personal-item',
  'power-bank',
  'laptop',
  'camera-battery',
  'drone-battery',
  'ecig',
  'medical-device',
  'mobility-battery',
  'smart-bag',
] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const BATTERY_STATES = ['none', 'installed', 'spare', 'in-power-bank'] as const
export type BatteryState = (typeof BATTERY_STATES)[number]

/**
 * Document class, in descending order of authority. This is the field that lets
 * a conflict be resolved by reason rather than by coin flip: a tariff filed as
 * part of the contract of carriage outranks a marketing page that summarises it.
 */
export const DOC_TYPES = [
  'regulation',            // 5 — binding law or ICAO/IATA technical instruction
  'conditions-of-carriage', // 4 — the contract
  'regulator-guidance',    // 4 — regulator's own plain-language guidance
  'help-page',             // 3 — carrier's own help centre
  'marketing-page',        // 2 — booking flow / landing page copy
  'press-release',         // 2
  'third-party',           // 1 — aggregator, forum, wiki
] as const
export type DocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_AUTHORITY: Record<DocType, number> = {
  regulation: 5,
  'conditions-of-carriage': 4,
  'regulator-guidance': 4,
  'help-page': 3,
  'marketing-page': 2,
  'press-release': 2,
  'third-party': 1,
}

/** How firmly the claim is attributable to its source. */
export const CONFIDENCE = ['stated', 'inferred', 'uncertain'] as const
export type Confidence = (typeof CONFIDENCE)[number]

/** A ruling is only binding once a named human signs it. */
export const RULING_STATUS = ['proposed', 'signed', 'retired'] as const
export type RulingStatus = (typeof RULING_STATUS)[number]

/**
 * How a claim interacts with other claims about the same subject.
 *
 * This field exists because of one sentence on the FAA's own page: "Many
 * airlines ... may have stricter quantity and Wh limits ... regardless of Wh
 * capacity." A regulator publishing 100 Wh is not contradicted by a carrier
 * publishing 100 Wh for power banks specifically — it is being implemented. So
 * authority alone is the wrong tie-break: the FAA outranks the airline and still
 * loses, on purpose.
 */
export const BINDING_MODES = ['floor', 'override', 'ceiling'] as const
export type BindingMode = (typeof BINDING_MODES)[number]

export const BINDING_MODE_LABELS: Record<BindingMode, string> = {
  floor:
    'Floor — a baseline that expressly allows operators to be stricter. A tighter carrier rule is an implementation of this, not a contradiction of it.',
  override:
    "Override — this source's own figure for its own operation. Two overrides disagreeing about the same situation is a real conflict.",
  ceiling:
    'Ceiling — an absolute maximum. No operator may permit more, so this caps whatever the overlays resolve to.',
}
