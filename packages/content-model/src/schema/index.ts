import type {SchemaTypeDefinition} from 'sanity'

import {binOpening, dimensionsMm, scope, tierRequirement} from './objects.ts'
import {aircraftType, carrier, jurisdiction} from './carrier.ts'
import {sourceDoc} from './sourceDoc.ts'
import {claim} from './claim.ts'
import {ruling} from './ruling.ts'
import {bagItem, itinerary} from './travel.ts'
import {checkRun} from './checkRun.ts'

/** Objects first, then reference data, then the claim layer, then travel input, then output. */
export const schemaTypes: SchemaTypeDefinition[] = [
  dimensionsMm,
  binOpening,
  tierRequirement,
  scope,
  jurisdiction,
  carrier,
  aircraftType,
  sourceDoc,
  claim,
  ruling,
  itinerary,
  bagItem,
  checkRun,
]

export {
  aircraftType,
  bagItem,
  binOpening,
  carrier,
  checkRun,
  claim,
  dimensionsMm,
  itinerary,
  jurisdiction,
  ruling,
  scope,
  sourceDoc,
  tierRequirement,
}
