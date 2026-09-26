export interface WireState {
  groqMcp: boolean
  kbMcp: boolean
  model: boolean
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
