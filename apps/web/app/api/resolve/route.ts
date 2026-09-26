import {NextResponse} from 'next/server'
import {evaluateItinerary, tripOutcome} from '@gate-check/resolver'
import {loadBagItems, loadClaimsAndRulings, loadItinerary} from '../../../lib/content.ts'
import {openMcp, closeMcp, type McpBundle} from '../../../lib/mcp.ts'

/**
 * The engine on its own, with no model in the loop.
 *
 * Worth having for two reasons. It is the honest demonstration that the compliance
 * logic is deterministic — same inputs, same verdicts, every time, no API key
 * involved. And it means the app still answers if the model is rate-limited, which
 * is exactly when someone is most likely to be clicking it.
 */
export async function POST(request: Request) {
  let itineraryId: string
  let itemIds: string[]
  try {
    const body = (await request.json()) as {itineraryId?: unknown; itemIds?: unknown}
    if (typeof body.itineraryId !== 'string' || !Array.isArray(body.itemIds)) {
      return NextResponse.json({error: 'Send {itineraryId: string, itemIds: string[]}.'}, {status: 400})
    }
    itineraryId = body.itineraryId
    itemIds = body.itemIds.filter((i): i is string => typeof i === 'string')
  } catch {
    return NextResponse.json({error: 'Body must be JSON.'}, {status: 400})
  }
  if (itemIds.length === 0) return NextResponse.json({error: 'Pick at least one item.'}, {status: 400})

  let bundle: McpBundle | null = null
  try {
    bundle = await openMcp()
    const [itinerary, allItems, content] = await Promise.all([
      loadItinerary(itineraryId),
      loadBagItems(),
      loadClaimsAndRulings(bundle),
    ])
    if (!itinerary) return NextResponse.json({error: `No itinerary "${itineraryId}".`}, {status: 404})

    const items = allItems.filter((i) => itemIds.includes(i._id))
    const verdicts = evaluateItinerary(itinerary, items, content.claims, content.rulings)

    return NextResponse.json({
      itinerary,
      verdicts,
      tripOutcome: tripOutcome(verdicts),
      contentSource: content.source,
      claimsConsidered: content.claims.length,
      signedRulings: content.rulings.length,
      mcp: {...bundle.connected, warnings: bundle.warnings},
    })
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : String(e)}, {status: 500})
  } finally {
    if (bundle) await closeMcp(bundle)
  }
}
