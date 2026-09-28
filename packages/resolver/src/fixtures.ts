/**
 * Test fixtures modelled on the real sources in ../../../seed.
 *
 * The figures here are the ones actually published by the FAA and Delta, because
 * a test suite built on invented numbers proves the code runs, not that it is
 * right. The scenarios are the ones in the README.
 */
import type {
  AircraftType,
  BagItem,
  Carrier,
  Claim,
  ClaimSubject,
  Itinerary,
  Ruling,
  Segment,
  SourceRef,
} from '@gate-check/content-model'
import type {BindingMode, ResolvedScope} from '@gate-check/content-model'

export const US = 'jur-us'

export const faa: SourceRef = {
  _id: 'src-faa-lithium',
  title: 'PackSafe — Lithium Batteries',
  url: 'https://www.faa.gov/hazmat/packsafe/lithium-batteries',
  publisherName: 'Federal Aviation Administration',
  docType: 'regulation',
  authority: 5,
  retrievedAt: '2026-09-26T00:00:00Z',
  effectiveFrom: '2026-08-11',
}

export const deltaBattery: SourceRef = {
  _id: 'src-dl-battery',
  title: 'Battery or Fuel-Powered Items',
  url: 'https://www.delta.com/us/en/baggage/prohibited-or-restricted-items/battery-or-fuel-powered',
  publisherName: 'Delta Air Lines',
  docType: 'help-page',
  authority: 3,
  retrievedAt: '2026-09-26T00:00:00Z',
}

export const deltaCarryOn: SourceRef = {
  _id: 'src-dl-carryon',
  title: 'Carry-On Baggage',
  url: 'https://www.delta.com/us/en/baggage/carry-on-baggage',
  publisherName: 'Delta Air Lines',
  docType: 'help-page',
  authority: 3,
  retrievedAt: '2026-09-26T00:00:00Z',
}

export const delta: Carrier = {
  _id: 'car-dl',
  name: 'Delta Air Lines',
  iata: 'DL',
  countryId: US,
  tiers: [
    {name: 'Silver', rank: 1},
    {name: 'Gold', rank: 2},
    {name: 'Platinum', rank: 3},
    {name: 'Diamond', rank: 4},
  ],
}

export const endeavor: Carrier = {
  _id: 'car-9e',
  name: 'Endeavor Air',
  iata: '9E',
  countryId: US,
  tiers: [],
}

export const b739: AircraftType = {
  _id: 'ac-739',
  name: 'Boeing 737-900',
  iataCode: '739',
  family: 'narrowbody',
  seats: 180,
  binOpening: {lengthMm: 610, widthMm: 400, heightMm: 300, note: null},
  gateCheckLikely: false,
}

export const crj200: AircraftType = {
  _id: 'ac-crj2',
  name: 'Bombardier CRJ-200',
  iataCode: 'CR2',
  family: 'regional-jet',
  seats: 50,
  binOpening: {lengthMm: 457, widthMm: 330, heightMm: 178, note: 'Figure from traveller reports, not the manufacturer.'},
  gateCheckLikely: true,
}

const emptyScope = (): ResolvedScope => ({
  carrierIds: [],
  aircraftFamilies: [],
  aircraftTypeIds: [],
  cabinClasses: [],
  fareBrands: [],
  minimumTier: null,
  jurisdictionIds: [],
  itemCategories: [],
  batteryStates: [],
  appliesAtOrBelowSeats: null,
  appliesAboveWh: null,
  appliesAtOrBelowWh: null,
})

let seq = 0
export function claim(
  subject: ClaimSubject,
  value: number | boolean | {l: number; w: number; h: number},
  opts: {
    bindingMode?: BindingMode
    source?: SourceRef
    scope?: Partial<ResolvedScope>
    effectiveFrom?: string
    effectiveTo?: string
    supersedesId?: string
    id?: string
  } = {},
): Claim {
  const base: Claim = {
    _id: opts.id ?? `clm-${++seq}`,
    subject,
    bindingMode: opts.bindingMode ?? 'override',
    scope: {...emptyScope(), ...opts.scope},
    source: opts.source ?? deltaBattery,
    confidence: 'stated',
    effectiveFrom: opts.effectiveFrom ?? null,
    effectiveTo: opts.effectiveTo ?? null,
    supersedesId: opts.supersedesId ?? null,
  }
  if (typeof value === 'number') {
    return subject === 'carryOnMaxMassKg' ? {...base, massKgValue: value} : {...base, numberValue: value}
  }
  if (typeof value === 'boolean') return {...base, booleanValue: value}
  return {...base, dimensionsValue: {lengthMm: value.l, widthMm: value.w, heightMm: value.h}}
}

export function segment(over: Partial<Segment> = {}): Segment {
  return {
    marketingCarrier: delta,
    operatingCarrier: delta,
    flightNumber: '1421',
    aircraftType: b739,
    originIata: 'JFK',
    destinationIata: 'ATL',
    jurisdictionIds: [US],
    cabinClass: 'economy',
    fareBrand: 'Main Cabin',
    ...over,
  }
}

export function itinerary(over: Partial<Itinerary> = {}): Itinerary {
  return {
    _id: 'itn-test',
    label: 'test',
    travelDate: '2026-10-20',
    segments: [segment()],
    tierHeld: null,
    ...over,
  }
}

export function item(over: Partial<BagItem> = {}): BagItem {
  return {
    _id: 'itm-test',
    label: 'test item',
    category: 'cabin-bag',
    batteryState: 'none',
    quantity: 1,
    carriedIn: 'cabin',
    ...over,
  }
}

export function ruling(over: Partial<Ruling> & Pick<Ruling, 'subject' | 'chosenId' | 'conflictingIds'>): Ruling {
  return {
    _id: 'rul-test',
    scope: emptyScope(),
    rationale: 'because a person decided',
    status: 'signed',
    decidedBy: 'Ops lead',
    decidedAt: '2026-09-20T00:00:00Z',
    ...over,
  }
}
