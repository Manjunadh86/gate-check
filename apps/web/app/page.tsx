import {loadBagItems, loadItineraries} from '../lib/content.ts'
import {env, hasGroqMcp, hasKbMcp, hasModel} from '../lib/env.ts'
import {CheckBoard} from './CheckBoard.tsx'
import {Setup} from './Setup.tsx'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const wires = {
    groqMcp: hasGroqMcp(),
    kbMcp: hasKbMcp(),
    model: hasModel(),
    offline: env.offline,
    project: env.projectId || null,
    dataset: env.dataset,
  }

  if (!env.offline && !env.projectId) return <Setup reason="no-project" wires={wires} />

  let itineraries: Awaited<ReturnType<typeof loadItineraries>> = []
  let items: Awaited<ReturnType<typeof loadBagItems>> = []
  try {
    ;[itineraries, items] = await Promise.all([loadItineraries(), loadBagItems()])
  } catch (e) {
    return <Setup reason="fetch-failed" wires={wires} detail={e instanceof Error ? e.message : String(e)} />
  }
  if (itineraries.length === 0) return <Setup reason="empty-dataset" wires={wires} />

  return <CheckBoard itineraries={itineraries} items={items} wires={wires} />
}
