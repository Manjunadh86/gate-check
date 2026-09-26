'use client'

import {useMemo, useState} from 'react'
import type {BagItem, Itinerary} from '@gate-check/content-model'
import type {Outcome, Verdict} from '@gate-check/resolver'
import {Wires, type WireState} from './Wires.tsx'

const OUTCOME: Record<Outcome, {mark: string; label: string}> = {
  allowed: {mark: '✓', label: 'allowed'},
  'allowed-with-conditions': {mark: '!', label: 'conditions'},
  'gate-check-likely': {mark: '↧', label: 'gate-check'},
  'approval-required': {mark: '⧉', label: 'approval'},
  prohibited: {mark: '✕', label: 'prohibited'},
  unknown: {mark: '?', label: 'unknown'},
}

const TRIP_LINE: Record<Outcome, string> = {
  allowed: 'Everything you have listed can travel as you have packed it.',
  'allowed-with-conditions': 'It can all travel, but some of it comes with conditions.',
  'gate-check-likely': 'Something will not make it into the cabin on at least one segment.',
  'approval-required': 'Something needs the operating carrier’s approval before you fly.',
  prohibited: 'Something here will be refused. Repack before you go to the airport.',
  unknown: 'Some of this is not covered by any sourced rule in the dataset.',
}

const CATEGORY_LABEL: Record<string, string> = {
  'cabin-bag': 'Cabin bags',
  'personal-item': 'Personal items',
  'power-bank': 'Power banks and power stations',
  laptop: 'Devices with batteries installed',
  'camera-battery': 'Camera batteries',
  'drone-battery': 'Drone batteries',
  ecig: 'Vapes',
  'smart-bag': 'Smart bags',
  'medical-device': 'Medical devices',
  'mobility-battery': 'Mobility batteries',
}

interface EngineResponse {
  itinerary: Itinerary
  verdicts: Verdict[]
  tripOutcome: Outcome
  contentSource: string
  claimsConsidered: number
  signedRulings: number
  mcp: {groq: boolean; kb: boolean; warnings: string[]}
}

interface AgentResponse extends Omit<EngineResponse, 'itinerary' | 'claimsConsidered' | 'signedRulings'> {
  answer: string
  steps: number
  toolCalls: {name: string; args: unknown}[]
  checkRunId: string | null
  model: string
}

export function CheckBoard({
  itineraries,
  items,
  wires,
}: {
  itineraries: Itinerary[]
  items: BagItem[]
  wires: WireState
}) {
  const [itineraryId, setItineraryId] = useState(itineraries[0]?._id ?? '')
  const [picked, setPicked] = useState<string[]>(() => items.slice(0, 2).map((i) => i._id))
  const [question, setQuestion] = useState('')
  const [engine, setEngine] = useState<EngineResponse | null>(null)
  const [agent, setAgent] = useState<AgentResponse | null>(null)
  const [busy, setBusy] = useState<null | 'engine' | 'agent'>(null)
  const [error, setError] = useState<string | null>(null)

  const itinerary = itineraries.find((i) => i._id === itineraryId)
  const grouped = useMemo(() => {
    const by = new Map<string, BagItem[]>()
    for (const i of items) by.set(i.category, [...(by.get(i.category) ?? []), i])
    return [...by.entries()]
  }, [items])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function post<T>(url: string, body: unknown, which: 'engine' | 'agent') {
    setBusy(which)
    setError(null)
    if (which === 'engine') setAgent(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as T & {error?: string}
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`)
      return json
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(null)
    }
  }

  const runEngine = async () => {
    const r = await post<EngineResponse>('/api/resolve', {itineraryId, itemIds: picked}, 'engine')
    if (r) setEngine(r)
  }

  const askAgent = async () => {
    const itemLabels = items.filter((i) => picked.includes(i._id)).map((i) => `${i.label} (${i._id})`)
    const framed =
      question.trim() ||
      `Can I take these into the cabin on "${itinerary?.label}" (itinerary id ${itineraryId})? Items: ${itemLabels.join('; ')}.`
    const r = await post<AgentResponse>('/api/check', {question: framed}, 'agent')
    if (r) {
      setAgent(r)
      if (r.verdicts.length > 0) {
        setEngine({
          itinerary: itinerary!,
          verdicts: r.verdicts,
          tripOutcome: r.tripOutcome,
          contentSource: r.contentSource,
          claimsConsidered: 0,
          signedRulings: 0,
          mcp: r.mcp,
        })
      }
    }
  }

  const warnings = engine?.mcp.warnings ?? agent?.mcp.warnings ?? []

  return (
    <main className="shell">
      <header className="masthead">
        <h1>
          Gate Check <span className="sub">cabin baggage · per segment · with receipts</span>
        </h1>
        <p>
          One ticket can carry three different sets of rules. The size allowance comes from the carrier operating the
          segment, the battery approval comes from the regulator that carrier answers to, and whether the bag fits
          comes from the aeroplane. Gate Check resolves all three against your itinerary and shows you the sentence
          each answer came from — including the ones it decided against.
        </p>
        <Wires wires={wires} />
      </header>

      <div className="board">
        <div className="stack">
          <section className="panel">
            <header>Itinerary</header>
            <div className="body">
              {itineraries.map((it) => (
                <button
                  key={it._id}
                  className="itin"
                  aria-pressed={it._id === itineraryId}
                  onClick={() => setItineraryId(it._id)}
                >
                  <div className="label">{it.label}</div>
                  <div className="date">{it.travelDate}</div>
                  <div className="legs">
                    {it.segments.map((s, i) => (
                      <span className="leg" key={i}>
                        <span>
                          {s.marketingCarrier.iata}
                          {s.flightNumber} {s.originIata}→{s.destinationIata}
                        </span>
                        {s.operatingCarrier._id !== s.marketingCarrier._id ? (
                          <span className="op">operated by {s.operatingCarrier.name}</span>
                        ) : null}
                        <span style={{color: 'var(--ink-faint)'}}>
                          {s.aircraftType.name}
                          {s.aircraftType.seats ? ` · ${s.aircraftType.seats} seats` : ''}
                        </span>
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              {itinerary?.teachingPoint ? (
                <p className="hint" style={{marginTop: 10}}>
                  {itinerary.teachingPoint}
                </p>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <header>
              <span>What you are carrying</span>
              <span>{picked.length} selected</span>
            </header>
            <div className="body">
              {grouped.map(([category, list]) => (
                <div key={category}>
                  <div className="group-label">{CATEGORY_LABEL[category] ?? category}</div>
                  {list.map((i) => (
                    <label className="opt" key={i._id}>
                      <input type="checkbox" checked={picked.includes(i._id)} onChange={() => toggle(i._id)} />
                      <span>
                        <span className="name">{i.label}</span>
                        <br />
                        <span className="meta">
                          {[
                            i.dimensionsMm
                              ? `${i.dimensionsMm.lengthMm}×${i.dimensionsMm.widthMm}×${i.dimensionsMm.heightMm} mm`
                              : null,
                            typeof i.massKg === 'number' ? `${i.massKg} kg` : null,
                            typeof i.wattHours === 'number' ? `${i.wattHours} Wh` : null,
                            i.quantity > 1 ? `×${i.quantity}` : null,
                            i.carriedIn === 'checked' ? 'in checked bag' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ))}

              <div className="actions">
                <button className="go" onClick={runEngine} disabled={busy !== null || picked.length === 0}>
                  {busy === 'engine' ? <span className="spin">◴</span> : null} Run the engine
                </button>
                <button
                  className="go ghost"
                  onClick={askAgent}
                  disabled={busy !== null || !wires.model || picked.length === 0}
                  title={wires.model ? undefined : 'Set ANTHROPIC_API_KEY to enable the agent'}
                >
                  {busy === 'agent' ? <span className="spin">◴</span> : null} Ask the agent
                </button>
              </div>
              <p className="hint">
                The engine is deterministic and needs no model key — same inputs, same verdicts. The agent adds natural
                language, pulls carrier prose out of the Knowledge Base, and proposes a ruling when sources cannot be
                reconciled.
              </p>
            </div>
          </section>

          <section className="panel">
            <header>Ask in your own words</header>
            <div className="body">
              <textarea
                className="ask"
                value={question}
                placeholder="e.g. I have a 137 Wh power bank and a 137 Wh cine battery. Can I take both?"
                onChange={(e) => setQuestion(e.target.value)}
              />
              <p className="hint">
                Leave it empty and the agent is asked about the itinerary and items selected above.
                {[
                  'Why can I take my roll-aboard out but not back?',
                  'Which of these has to come out of my bag if it gets gate-checked?',
                  'Is a 137 Wh power bank different from a 137 Wh camera battery?',
                ].map((q) => (
                  <button key={q} onClick={() => setQuestion(q)}>
                    {q}
                  </button>
                ))}
              </p>
            </div>
          </section>
        </div>

        <div>
          {error ? (
            <div className="err" style={{marginBottom: 16}}>
              <strong>That did not work.</strong> <code>{error}</code>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="flag" style={{marginBottom: 16}}>
              <strong>Reading path</strong>
              <ul style={{margin: '6px 0 0', paddingLeft: 18}}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {agent ? (
            <section className="panel" style={{marginBottom: 16}}>
              <header>
                <span>The agent’s answer</span>
                <span>
                  {agent.model} · {agent.steps} steps · {agent.toolCalls.length} tool calls
                </span>
              </header>
              <div className="body">
                <div className="answer">{agent.answer}</div>
                <details style={{marginTop: 14}}>
                  <summary className="trace" style={{cursor: 'pointer'}}>
                    tool calls
                  </summary>
                  <ol className="trace" style={{marginTop: 8}}>
                    {agent.toolCalls.map((c, i) => (
                      <li key={i}>{c.name}</li>
                    ))}
                  </ol>
                </details>
                {agent.checkRunId ? (
                  <p className="hint">
                    Written back to Sanity as checkRun <code>{agent.checkRunId}</code>. Context MCP is read-only, so
                    this happened server-side after the agent finished.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {engine ? <Verdicts result={engine} /> : !agent ? (
            <div className="panel">
              <header>Verdicts</header>
              <div className="body">
                <p className="empty">
                  Pick an itinerary and what you are carrying, then run the engine. Try the JFK→ATL→TYS trip with the
                  22 × 14 × 9 in roll-aboard — the interesting part is the second segment.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function Verdicts({result}: {result: EngineResponse}) {
  const bySegment = new Map<number, Verdict[]>()
  for (const v of result.verdicts) bySegment.set(v.segmentIndex, [...(bySegment.get(v.segmentIndex) ?? []), v])
  const trip = result.tripOutcome

  return (
    <>
      <div className={`banner o-${trip}`}>
        <span className={`chip o-${trip}`}>
          <span className="mark">{OUTCOME[trip].mark}</span>
          {OUTCOME[trip].label}
        </span>
        <span className="big">{TRIP_LINE[trip]}</span>
        {result.claimsConsidered > 0 ? (
          <span className="note">
            {result.claimsConsidered} claims and {result.signedRulings} signed rulings considered, via{' '}
            {result.contentSource === 'context-mcp-groq' ? 'Context MCP' : 'the direct client'}.
          </span>
        ) : null}
      </div>

      {[...bySegment.entries()].map(([index, verdicts]) => {
        const seg = result.itinerary?.segments?.[index]
        return (
          <section key={index}>
            <div className="seg-head">
              <span className="code">{verdicts[0]!.segmentLabel.split(' (')[0]}</span>
              {seg && seg.operatingCarrier._id !== seg.marketingCarrier._id ? (
                <span className="op">operated by {seg.operatingCarrier.name}</span>
              ) : null}
              {seg ? (
                <span className="ac">
                  {seg.aircraftType.name}
                  {seg.aircraftType.seats ? ` · ${seg.aircraftType.seats} seats` : ''}
                </span>
              ) : null}
            </div>

            {verdicts.map((v, i) => (
              <details className="card" key={`${v.itemId}-${i}`} open={v.outcome === 'prohibited' || v.unresolvedConflict}>
                <summary>
                  <span className={`chip o-${v.outcome}`}>
                    <span className="mark">{OUTCOME[v.outcome].mark}</span>
                    {OUTCOME[v.outcome].label}
                  </span>
                  <span className="item">{v.itemLabel}</span>
                  <span className="head">{v.headline}</span>
                </summary>
                <div className="findings">
                  {v.findings.length === 0 ? (
                    <p className="empty">No rule in the dataset applies to this item on this segment.</p>
                  ) : null}
                  {v.findings.map((f, j) => {
                    const gov = f.resolution.governing
                    const losers = f.resolution.considered.filter((c) => c.claim._id !== gov?._id)
                    return (
                      <div className="finding" key={j}>
                        <div className="row">
                          <span className={`chip o-${f.outcome}`}>
                            <span className="mark">{OUTCOME[f.outcome].mark}</span>
                            {OUTCOME[f.outcome].label}
                          </span>
                          <span className="test">{f.test}</span>
                          {f.resolution.formatted !== '—' ? (
                            <span className="value">{f.resolution.formatted}</span>
                          ) : null}
                          <span className="trace">{f.resolution.method}</span>
                        </div>
                        <p className="detail">{f.detail}</p>
                        <p className="why">{f.resolution.explanation}</p>

                        {gov?.source ? <Cite claim={gov} /> : null}
                        {losers.length > 0 ? (
                          <div style={{marginTop: 6}}>
                            {losers.map((c) => (
                              <Cite key={c.claim._id} claim={c.claim} loser />
                            ))}
                          </div>
                        ) : null}

                        {f.resolution.unresolved ? (
                          <div className="flag">
                            <strong>Nobody has ruled on this.</strong> The sources above disagree and nothing in the
                            dataset settles it, so the tighter reading is shown. A named person needs to sign a ruling
                            before this stops being a judgement call.
                          </div>
                        ) : null}
                        {f.resolution.appliedRuling ? (
                          <div className="flag">
                            <strong>Settled by a signed ruling.</strong>{' '}
                            {f.resolution.appliedRuling.decidedBy ?? 'A reviewer'}:{' '}
                            {f.resolution.appliedRuling.rationale}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </details>
            ))}
          </section>
        )
      })}
    </>
  )
}

function Cite({claim, loser}: {claim: {quote?: string | null; confidence: string; source?: {publisherName: string; docType: string; url: string; authority: number} | null}; loser?: boolean}) {
  const s = claim.source
  if (!s) return null
  return (
    <div className={`cite${loser ? ' loser' : ''}`}>
      <span className="pub">{s.publisherName}</span>
      <span className={`tag a${s.authority}`}>{s.docType}</span>
      {claim.confidence !== 'stated' ? <span className="tag">{claim.confidence}</span> : null}
      {loser ? <span className="tag">not used</span> : null}
      {claim.quote ? <span className="q">“{claim.quote}”</span> : null}
      <a href={s.url} target="_blank" rel="noreferrer noopener" style={{fontSize: 11.5}}>
        source ↗
      </a>
    </div>
  )
}
