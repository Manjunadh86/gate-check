export interface WireState {
  groqMcp: boolean
  kbMcp: boolean
  model: boolean
  offline: boolean
  project: string | null
  dataset: string
}

/**
 * The provenance strip.
 *
 * It says out loud which wire every figure on the page came down. If the Context
 * beta is not switched on, this is where it says so — a demo that looked identical
 * whether or not it was using Context would be a demo you could not trust.
 */
export function Wires({wires}: {wires: WireState}) {
  // Offline mode says so first and on its own. Everything else on the strip is
  // about which network path was used, and in offline mode there was not one.
  if (wires.offline) {
    return (
      <div className="wires">
        <span className="wire fallback">
          <span className="dot" />
          Offline — reading the seeded corpus from the repo, not from Sanity
        </span>
        <span className={`wire ${wires.model ? 'live' : 'fallback'}`}>
          <span className="dot" />
          {wires.model ? 'Agent available' : 'No model key — engine only'}
        </span>
      </div>
    )
  }

  return (
    <div className="wires">
      <span className={`wire ${wires.groqMcp ? 'live' : 'fallback'}`}>
        <span className="dot" />
        {wires.groqMcp ? 'Context MCP · GROQ mode' : 'GROQ mode off — reading dataset directly'}
      </span>
      <span className={`wire ${wires.kbMcp ? 'live' : 'fallback'}`}>
        <span className="dot" />
        {wires.kbMcp ? 'Context MCP · Knowledge Base mode' : 'Knowledge Base mode off'}
      </span>
      <span className={`wire ${wires.model ? 'live' : 'fallback'}`}>
        <span className="dot" />
        {wires.model ? 'Agent available' : 'No model key — engine only'}
      </span>
      {wires.project ? (
        <span className="wire">
          <span className="dot" />
          {wires.project} / {wires.dataset}
        </span>
      ) : null}
    </div>
  )
}
