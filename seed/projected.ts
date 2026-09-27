/**
 * The seeded corpus, reshaped exactly as the GROQ projections in
 * `@gate-check/content-model/queries` would return it.
 *
 * Two callers depend on this. The evaluation suite uses it so the engine can be
 * checked by anyone who clones the repo — no Sanity account, no Context beta
 * access. And the app falls back to it in offline mode, so the interface can be
 * looked at in thirty seconds rather than after a ten-step setup.
 *
 * This is duplication, and duplication drifts. `evals/parity.test.ts` is the
 * mitigation: it runs the real query strings through groq-js, Sanity's own GROQ
 * implementation, against the same documents and asserts the results match this
 * file exactly. It has already caught two defects, so it is doing its job.
 */
import {DOC_TYPE_AUTHORITY, type Claim, type DocType, type Itinerary, type Ruling, type BagItem, type ResolvedScope} from '@gate-check/content-model'
import {aircraftTypes, bagItems, carriers, claims, itineraries, rulings, sourceDocs} from './content.ts'

type Raw = Record<string, any>

const byId = (docs: Raw[]) => new Map(docs.map((d) => [d._id as string, d]))
const SOURCES = byId(sourceDocs as Raw[])
const CARRIERS = byId(carriers as Raw[])
const AIRCRAFT = byId(aircraftTypes as Raw[])
const CLAIMS = byId(claims as Raw[])

const refIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((r) => (r as Raw)?._ref).filter((x): x is string => typeof x === 'string') : []

const scope = (s: Raw | undefined): ResolvedScope => ({
  carrierIds: refIds(s?.carriers),
  aircraftFamilies: s?.aircraftFamilies ?? [],
  aircraftTypeIds: refIds(s?.aircraftTypes),
  cabinClasses: s?.cabinClasses ?? [],
  fareBrands: s?.fareBrands ?? [],
  minimumTier: s?.minimumTier
    ? {
        carrierId: s.minimumTier.carrier._ref,
        tierName: s.minimumTier.tierName,
        rank:
          (CARRIERS.get(s.minimumTier.carrier._ref)?.tiers ?? []).find(
            (t: Raw) => t.name === s.minimumTier.tierName,
          )?.rank ?? null,
      }
    : null,
  jurisdictionIds: refIds(s?.jurisdictions),
  itemCategories: s?.itemCategories ?? [],
  batteryStates: s?.batteryStates ?? [],
  appliesAboveWh: s?.appliesAboveWh ?? null,
  appliesAtOrBelowWh: s?.appliesAtOrBelowWh ?? null,
  appliesAtOrBelowSeats: s?.appliesAtOrBelowSeats ?? null,
})

const source = (id: string | undefined) => {
  const d = id ? SOURCES.get(id) : undefined
  if (!d) return null
  return {
    _id: d._id,
    title: d.title,
    url: d.url,
    publisherName: d.publisherName,
    docType: d.docType as DocType,
    authority: DOC_TYPE_AUTHORITY[d.docType as DocType] ?? 2,
    retrievedAt: d.retrievedAt,
    effectiveFrom: d.effectiveFrom ?? null,
    effectiveTo: d.effectiveTo ?? null,
    supersededById: d.supersededBy?._ref ?? null,
  }
}

/**
 * Mirrors DIMENSIONS_PROJECTION in the real queries.
 *
 * An explicit GROQ projection always returns every key it names, `null` included,
 * whereas simply dropping `_type` from the stored object leaves optional keys
 * absent. The parity test caught exactly that difference, so the shape is spelled
 * out here rather than derived by subtraction.
 */
const dimensions = (o: Raw | undefined) =>
  o
    ? {
        lengthMm: o.lengthMm ?? null,
        widthMm: o.widthMm ?? null,
        heightMm: o.heightMm ?? null,
        wheelsAndHandlesIncluded: o.wheelsAndHandlesIncluded ?? null,
      }
    : null

/** Mirrors the binOpening projection. */
const binOpening = (o: Raw | undefined) =>
  o
    ? {
        lengthMm: o.lengthMm ?? null,
        widthMm: o.widthMm ?? null,
        heightMm: o.heightMm ?? null,
        note: o.note ?? null,
      }
    : null

export const projectedClaims: Claim[] = (claims as Raw[]).map((c) => ({
  _id: c._id,
  subject: c.subject,
  bindingMode: c.bindingMode,
  dimensionsValue: dimensions(c.dimensionsValue) as Claim['dimensionsValue'],
  massKgValue: c.massKgValue ?? null,
  numberValue: c.numberValue ?? null,
  booleanValue: c.booleanValue ?? null,
  scope: scope(c.scope),
  effectiveFrom: c.effectiveFrom ?? null,
  effectiveTo: c.effectiveTo ?? null,
  supersedesId: c.supersedes?._ref ?? null,
  source: source(c.source?._ref)!,
  quote: c.quote ?? null,
  confidence: c.confidence,
  note: c.note ?? null,
}))

/** Only signed rulings, exactly as the SIGNED_RULINGS query filters. */
export const projectedSignedRulings: Ruling[] = (rulings as Raw[])
  .filter((r) => r.status === 'signed')
  .map((r) => ({
    _id: r._id,
    subject: r.subject,
    scope: scope(r.scope),
    conflictingIds: refIds(r.conflicting),
    chosenId: r.chosen._ref,
    rationale: r.rationale,
    status: r.status,
    decidedBy: r.decidedBy ?? null,
    decidedAt: r.decidedAt ?? null,
  }))

export const proposedRulings = (rulings as Raw[]).filter((r) => r.status === 'proposed')

const carrier = (id: string) => {
  const c = CARRIERS.get(id)!
  return {_id: c._id, name: c.name, iata: c.iata, countryId: c.country._ref, tiers: (c.tiers ?? []).map((t: Raw) => ({name: t.name, rank: t.rank}))}
}

const aircraft = (id: string) => {
  const a = AIRCRAFT.get(id)!
  return {
    _id: a._id,
    name: a.name,
    iataCode: a.iataCode ?? null,
    family: a.family,
    seats: a.seats ?? null,
    binOpening: binOpening(a.binOpening),
    gateCheckLikely: a.gateCheckLikely ?? null,
  }
}

export const projectedItineraries: Itinerary[] = (itineraries as Raw[]).map((it) => ({
  _id: it._id,
  label: it.label,
  travelDate: it.travelDate,
  teachingPoint: it.teachingPoint ?? null,
  tierHeld: null,
  segments: (it.segments as Raw[]).map((s) => ({
    marketingCarrier: carrier(s.marketingCarrier._ref),
    operatingCarrier: carrier(s.operatingCarrier._ref),
    flightNumber: s.flightNumber ?? null,
    aircraftType: aircraft(s.aircraftType._ref),
    originIata: s.originIata,
    destinationIata: s.destinationIata,
    jurisdictionIds: refIds(s.jurisdictions),
    cabinClass: s.cabinClass,
    fareBrand: s.fareBrand ?? null,
  })),
})) as Itinerary[]

export const projectedItems: BagItem[] = (bagItems as Raw[]).map((i) => ({
  _id: i._id,
  label: i.label,
  category: i.category,
  dimensionsMm: dimensions(i.dimensionsMm) as BagItem['dimensionsMm'],
  massKg: i.massKg ?? null,
  wattHours: i.wattHours ?? null,
  batteryState: i.batteryState,
  quantity: i.quantity,
  carriedIn: i.carriedIn,
}))

export const itinerary = (id: string) => projectedItineraries.find((i) => i._id === id)!
export const item = (id: string) => projectedItems.find((i) => i._id === id)!
export const claimById = (id: string) => CLAIMS.get(id)
