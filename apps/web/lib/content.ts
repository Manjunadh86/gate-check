import {ALL_CLAIMS, BAG_ITEMS, ITINERARIES, ITINERARY_BY_ID, SIGNED_RULINGS} from '@gate-check/content-model/queries'
import type {BagItem, Claim, Itinerary, Ruling} from '@gate-check/content-model'
import {projectedClaims, projectedItems, projectedItineraries, projectedSignedRulings} from '@gate-check/seed/projected'
import {env, type ContentSource} from './env.ts'
import {groqViaMcp, type McpBundle} from './mcp.ts'
import {readClient} from './sanity.ts'

/**
 * One loader, two transports.
 *
 * The same GROQ projections run either through the Context MCP endpoint or through
 * the ordinary client, and the `source` field records which. Keeping the queries
 * identical across both paths is what makes the fallback trustworthy: it is the
 * same content, read the same way, over a different wire.
 */
export interface LoadedContent {
  claims: Claim[]
  rulings: Ruling[]
  source: ContentSource
}

export async function loadClaimsAndRulings(bundle: McpBundle | null): Promise<LoadedContent> {
  if (env.offline) {
    return {claims: projectedClaims, rulings: projectedSignedRulings, source: 'offline-fixture'}
  }
  if (bundle?.connected.groq) {
    const [claims, rulings] = await Promise.all([
      groqViaMcp<Claim[]>(bundle, ALL_CLAIMS),
      groqViaMcp<Ruling[]>(bundle, SIGNED_RULINGS),
    ])
    return {claims: claims ?? [], rulings: rulings ?? [], source: 'context-mcp-groq'}
  }
  const [claims, rulings] = await Promise.all([
    readClient().fetch<Claim[]>(ALL_CLAIMS),
    readClient().fetch<Ruling[]>(SIGNED_RULINGS),
  ])
  return {claims, rulings, source: 'direct-client'}
}

/**
 * Itineraries and items are the app's own fixtures rather than the corpus under
 * test, so they are always read over the ordinary client — routing them through
 * Context would add a hop without adding meaning.
 */
export const loadItineraries = (): Promise<Itinerary[]> =>
  env.offline ? Promise.resolve(projectedItineraries) : readClient().fetch<Itinerary[]>(ITINERARIES)

export const loadItinerary = (id: string): Promise<Itinerary | null> =>
  env.offline
    ? Promise.resolve(projectedItineraries.find((i) => i._id === id) ?? null)
    : readClient().fetch<Itinerary | null>(ITINERARY_BY_ID, {id})

export const loadBagItems = (): Promise<BagItem[]> =>
  env.offline ? Promise.resolve(projectedItems) : readClient().fetch<BagItem[]>(BAG_ITEMS)
