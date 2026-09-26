import {Wires, type WireState} from './Wires.tsx'

const MESSAGES: Record<string, {title: string; body: React.ReactNode}> = {
  'no-project': {
    title: 'No Sanity project configured yet',
    body: (
      <>
        Put your project id in <code>NEXT_PUBLIC_SANITY_PROJECT_ID</code> and restart. Everything else in this app —
        the schema, the resolver, the seeded corpus — is already here and does not need a network call to read.
        Follow <code>SETUP.md</code> from step 2.
      </>
    ),
  },
  'empty-dataset': {
    title: 'The project is reachable but the dataset is empty',
    body: (
      <>
        Import the seeded corpus: <code>SANITY_WRITE_TOKEN=... npm run seed</code>. That writes 61 documents —
        nine source documents, twenty-one sourced claims, two proposed rulings, three itineraries and fifteen items.
      </>
    ),
  },
  'fetch-failed': {
    title: 'Could not read from Sanity',
    body: <>The project id or dataset name is probably wrong, or the dataset is private and needs a read token.</>,
  },
}

export function Setup({reason, wires, detail}: {reason: string; wires: WireState; detail?: string}) {
  const m = MESSAGES[reason] ?? MESSAGES['fetch-failed']!
  return (
    <main className="shell">
      <header className="masthead">
        <h1>
          Gate Check <span className="sub">setup</span>
        </h1>
        <Wires wires={wires} />
      </header>
      <div className="panel">
        <header>Not ready</header>
        <div className="body">
          <p style={{marginTop: 0, fontWeight: 600}}>{m.title}</p>
          <p style={{color: 'var(--ink-dim)'}}>{m.body}</p>
          {detail ? <pre className="trace" style={{whiteSpace: 'pre-wrap', marginBottom: 0}}>{detail}</pre> : null}
        </div>
      </div>
    </main>
  )
}
