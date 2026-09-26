import type {
  AircraftFamily,
  BatteryState,
  BindingMode,
  CabinClass,
  ClaimSubject,
  Confidence,
  DocType,
  ItemCategory,
  RulingStatus,
} from './vocabulary.ts'

/** Shapes as the GROQ projections in `./queries` return them — not raw documents. */

export interface Dimensions {
  lengthMm: number
  widthMm: number
  heightMm: number
  wheelsAndHandlesIncluded?: boolean
}

export interface ResolvedScope {
  carrierIds: string[]
  aircraftFamilies: AircraftFamily[]
  aircraftTypeIds: string[]
  cabinClasses: CabinClass[]
  fareBrands: string[]
  minimumTier?: {carrierId: string; tierName: string; rank: number | null} | null
  jurisdictionIds: string[]
  itemCategories: ItemCategory[]
  batteryStates: BatteryState[]
  appliesAboveWh?: number | null
  appliesAtOrBelowWh?: number | null
  appliesAtOrBelowSeats?: number | null
}

export interface SourceRef {
  _id: string
  title: string
  url: string
  publisherName: string
  docType: DocType
  authority: number
  retrievedAt: string
  effectiveFrom?: string | null
  effectiveTo?: string | null
  supersededById?: string | null
}

export interface Claim {
  _id: string
  subject: ClaimSubject
  bindingMode: BindingMode
  dimensionsValue?: Dimensions | null
  massKgValue?: number | null
  numberValue?: number | null
  booleanValue?: boolean | null
  scope: ResolvedScope
  effectiveFrom?: string | null
  effectiveTo?: string | null
  supersedesId?: string | null
  source: SourceRef
  quote?: string | null
  confidence: Confidence
  note?: string | null
}

export interface Ruling {
  _id: string
  subject: ClaimSubject
  scope: ResolvedScope
  conflictingIds: string[]
  chosenId: string
  rationale: string
  status: RulingStatus
  decidedBy?: string | null
  decidedAt?: string | null
}

export interface AircraftType {
  _id: string
  name: string
  iataCode?: string | null
  family: AircraftFamily
  seats?: number | null
  binOpening?: {lengthMm?: number | null; widthMm?: number | null; heightMm?: number | null; note?: string | null} | null
  gateCheckLikely?: boolean | null
}

export interface Carrier {
  _id: string
  name: string
  iata: string
  countryId: string
  tiers: {name: string; rank: number}[]
}

export interface Segment {
  marketingCarrier: Carrier
  operatingCarrier: Carrier
  flightNumber?: string | null
  aircraftType: AircraftType
  originIata: string
  destinationIata: string
  jurisdictionIds: string[]
  cabinClass: CabinClass
  fareBrand?: string | null
}

export interface Itinerary {
  _id: string
  label: string
  travelDate: string
  segments: Segment[]
  tierHeld?: {carrierId: string; tierName: string; rank: number | null} | null
  teachingPoint?: string | null
}

export interface BagItem {
  _id: string
  label: string
  category: ItemCategory
  dimensionsMm?: Dimensions | null
  massKg?: number | null
  wattHours?: number | null
  batteryState: BatteryState
  quantity: number
  carriedIn: 'cabin' | 'checked'
}

/** The situation a claim's scope is tested against. Derived, never stored. */
export interface Situation {
  travelDate: string
  operatingCarrierId: string
  marketingCarrierId: string
  aircraft: AircraftType
  jurisdictionIds: string[]
  cabinClass: CabinClass
  fareBrand?: string | null
  tierHeld?: {carrierId: string; rank: number} | null
  itemCategory?: ItemCategory
  batteryState?: BatteryState
  wattHours?: number | null
}
