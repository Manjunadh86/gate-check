/**
 * Every GROQ query the app and the agent use, in one file.
 *
 * These are also the queries the agent is told about in its system prompt, so it
 * can ask `groq_query` for the same projections the app uses rather than
 * inventing a shape and then mis-reading it. Keeping them here means the agent
 * and the UI can never drift apart.
 */

const SOURCE_PROJECTION = /* groq */ `
  _id, title, url, publisherName, docType, retrievedAt, effectiveFrom, effectiveTo,
  // Derived here rather than stored, so a document cannot claim its own authority.
  // Must stay in step with DOC_TYPE_AUTHORITY in ../vocabulary.ts — there is a
  // parity test that fails if it drifts. The fallback is 1, not a middling value:
  // an unrecognised document class should be trusted least, not averagely.
  "authority": select(
    docType == "regulation" => 5,
    docType == "conditions-of-carriage" => 4,
    docType == "regulator-guidance" => 4,
    docType == "help-page" => 3,
    docType == "marketing-page" => 2,
    docType == "press-release" => 2,
    docType == "third-party" => 1,
    1
  ),
  "supersededById": supersededBy._ref
`

const SCOPE_PROJECTION = /* groq */ `
  "carrierIds": coalesce(scope.carriers[]._ref, []),
  "aircraftFamilies": coalesce(scope.aircraftFamilies, []),
  "aircraftTypeIds": coalesce(scope.aircraftTypes[]._ref, []),
  "cabinClasses": coalesce(scope.cabinClasses, []),
  "fareBrands": coalesce(scope.fareBrands, []),
  "minimumTier": scope.minimumTier{
    "carrierId": carrier._ref,
    tierName,
    "rank": *[_id == ^.carrier._ref][0].tiers[name == ^.^.tierName][0].rank
  },
  "jurisdictionIds": coalesce(scope.jurisdictions[]._ref, []),
  "itemCategories": coalesce(scope.itemCategories, []),
  "batteryStates": coalesce(scope.batteryStates, []),
  "appliesAtOrBelowSeats": scope.appliesAtOrBelowSeats,
  "appliesAboveWh": scope.appliesAboveWh,
  "appliesAtOrBelowWh": scope.appliesAtOrBelowWh
`

const DIMENSIONS_PROJECTION = /* groq */ `lengthMm, widthMm, heightMm, wheelsAndHandlesIncluded`

export const CLAIM_PROJECTION = /* groq */ `
  _id, subject, bindingMode, massKgValue, numberValue, booleanValue,
  "dimensionsValue": dimensionsValue{ ${DIMENSIONS_PROJECTION} },
  effectiveFrom, effectiveTo, quote, confidence, note,
  "supersedesId": supersedes._ref,
  "scope": { ${SCOPE_PROJECTION} },
  "source": source->{ ${SOURCE_PROJECTION} }
`

/**
 * All claims, unfiltered by situation.
 *
 * Deliberately not narrowed in GROQ. Scope matching involves wildcard semantics
 * ("an empty array means any") that a GROQ filter expresses badly and a tested
 * function expresses well, and the corpus is small enough that filtering in the
 * resolver is both faster to reason about and far easier to prove correct.
 */
export const ALL_CLAIMS = /* groq */ `*[_type == "claim"]{ ${CLAIM_PROJECTION} }`

export const CLAIMS_BY_SUBJECT = /* groq */ `
  *[_type == "claim" && subject in $subjects]{ ${CLAIM_PROJECTION} }
`

export const SIGNED_RULINGS = /* groq */ `
  *[_type == "ruling" && status == "signed"]{
    _id, subject, rationale, status, decidedBy, decidedAt,
    "conflictingIds": coalesce(conflicting[]._ref, []),
    "chosenId": chosen._ref,
    "scope": { ${SCOPE_PROJECTION} }
  }
`

const CARRIER_PROJECTION = /* groq */ `
  _id, name, iata, "countryId": country._ref, "tiers": coalesce(tiers[]{name, rank}, [])
`

const AIRCRAFT_PROJECTION = /* groq */ `
  _id, name, iataCode, family, seats, gateCheckLikely,
  "binOpening": binOpening{lengthMm, widthMm, heightMm, note}
`

export const ITINERARIES = /* groq */ `
  *[_type == "itinerary"] | order(label asc){
    _id, label, travelDate, teachingPoint,
    "tierHeld": tierHeld{
      "carrierId": carrier._ref,
      tierName,
      "rank": *[_id == ^.carrier._ref][0].tiers[name == ^.^.tierName][0].rank
    },
    segments[]{
      flightNumber, originIata, destinationIata, cabinClass, fareBrand,
      "jurisdictionIds": coalesce(jurisdictions[]._ref, []),
      "marketingCarrier": marketingCarrier->{ ${CARRIER_PROJECTION} },
      "operatingCarrier": operatingCarrier->{ ${CARRIER_PROJECTION} },
      "aircraftType": aircraftType->{ ${AIRCRAFT_PROJECTION} }
    }
  }
`

export const ITINERARY_BY_ID = /* groq */ `*[_type == "itinerary" && _id == $id][0]{
  _id, label, travelDate, teachingPoint,
  "tierHeld": tierHeld{
    "carrierId": carrier._ref, tierName,
    "rank": *[_id == ^.carrier._ref][0].tiers[name == ^.^.tierName][0].rank
  },
  segments[]{
    flightNumber, originIata, destinationIata, cabinClass, fareBrand,
    "jurisdictionIds": coalesce(jurisdictions[]._ref, []),
    "marketingCarrier": marketingCarrier->{ ${CARRIER_PROJECTION} },
    "operatingCarrier": operatingCarrier->{ ${CARRIER_PROJECTION} },
    "aircraftType": aircraftType->{ ${AIRCRAFT_PROJECTION} }
  }
}`

export const BAG_ITEMS = /* groq */ `
  *[_type == "bagItem"] | order(category asc, label asc){
    _id, label, category, massKg, wattHours, batteryState, quantity, carriedIn,
    "dimensionsMm": dimensionsMm{ ${DIMENSIONS_PROJECTION} }
  }
`

/** Content-health query: claims nobody has sourced properly, and conflicts nobody has ruled on. */
export const NEEDS_ATTENTION = /* groq */ `{
  "unsourced": *[_type == "claim" && !defined(source)]{_id, subject},
  "uncertain": *[_type == "claim" && confidence == "uncertain"]{_id, subject, note},
  "expired": *[_type == "claim" && defined(effectiveTo) && effectiveTo < $today]{_id, subject, effectiveTo},
  "proposedRulings": *[_type == "ruling" && status == "proposed"]{_id, subject, rationale}
}`
