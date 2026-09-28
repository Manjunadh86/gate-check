---
title: "Gate Check: the same battery, allowed and refused on the same flight"
published: false
description: An agent that answers cabin-baggage and lithium-battery questions per flight segment, from sourced claims in Sanity, read through two Context MCP endpoints.
tags: sanitychallenge, ai, sanity, webdev
---

> **Before publishing, replace:** `<<DEMO_URL>>`, `<<AGENT_SESSION_EMBED>>`. Then delete this line.

Delta will let you carry a 137 Wh cine battery. It will refuse the identical 137 Wh power bank. Same flight, same cell, same watt-hours — different answer, because one is a camera battery and the other is a power bank, and Delta files a stricter figure for power banks than the FAA requires.

No search result tells you that. The FAA page says 160 Wh with approval. Delta's battery page says 160 Wh in one sentence and 100 Wh for power banks in another. Whichever you land on, you get a number that is true about something other than what you are holding.

**Gate Check** is an agent that resolves the whole mess against one specific itinerary, and shows you the sentence each answer came from — including the ones it decided against.

## What I built

An agent over a Sanity dataset in which **nothing is a fact**.

There is no `carryOnMaxWeight: 7` anywhere. There is a `claim` document that says *this page, published by this carrier, on this date, said 7 kg, about these situations*. The number a traveller is shown is **computed**, never stored — because there is no such thing as "the" cabin bag limit until you know who is flying the aeroplane.

That matters because one ticket routinely carries three different sets of rules:

| Question | Decided by |
|---|---|
| How big may the bag be? | The carrier **operating** the segment — not the one that sold you the ticket |
| May this battery fly? | The **regulator** that carrier answers to, plus any stricter rule the carrier files on top |
| Will it actually fit? | The **aeroplane** |

Here is the case the whole project exists for. Book JFK → ATL → TYS, one ticket, Delta the whole way. Pack a 22 × 14 × 9 inch roll-aboard — exactly Delta's published allowance — and four spare camera batteries.

Gate Check says:

- **JFK → ATL, Boeing 737-900 — allowed.** Inside the published allowance.
- **ATL → TYS, operated by Endeavor Air, CRJ-200, 50 seats — prohibited.** Delta's own carry-on page: *"Passengers traveling on Delta Connection flights, including flights with 50 seats or less, are only permitted to carry personal items on board."*
- **And then: take the batteries out before you hand the bag over.** The FAA requires spare cells to stay with the passenger when a bag is checked at the gate.

**No page in the corpus says that third thing.** It requires three documents lining up at once: this aircraft has 50 seats, this carrier restricts 50-seat Connection flights to personal items, and 49 CFR 175.10(a)(18) says spares may not travel in a bag that leaves your hands. That is not retrieval. That is a join.

## Demo

**<<DEMO_URL>>** — no login. The **Run the engine** button needs no model key at all.

Or run it yourself in about thirty seconds, with no Sanity account and no credentials:

```bash
npm install && GATE_CHECK_OFFLINE=1 npm run dev
```

That reads the same corpus out of the repo instead of over the network, and the strip at the top of the page says so in as many words — it is there so this is quick to look at, not to blur where the content lives.

Try this first: pick *JFK → ATL → TYS*, tick the **22 × 14 × 9 in roll-aboard** and the **16 Wh camera batteries × 4**, press **Run the engine**. Then open a verdict card — every finding shows the governing claim with its publisher, document class, quoted clause and link, and beneath it the claims that were considered and *not used*.

Then press **Ask the agent** and open the *tool calls* disclosure to see it move between the two Context endpoints.

Three more things worth clicking:

- **A 137 Wh power bank vs a 137 Wh cine battery** on the SEA → AMS trip. Refused and approval-required respectively.
- **The portable power station on the American trip.** American's notice bans *"large portable power banks"* and never defines large. There is no number to compute with, so the structured claims are silent and the regulatory ceiling answers instead — while the carrier's actual wording comes out of the Knowledge Base.
- **The small case on the CRJ-200.** Two traveller reports of the bin size are 21 × 14 × 7 and 18 × 13 × 8 inches. Neither fits inside the other — one is longer, one is deeper. The engine **refuses to pick**, returns no size verdict, and flags it for a human ruling.

## Code

**https://github.com/Manjunadh86/gate-check**

```bash
npm install
npm test      # 47 tests: 26 resolver, 8 MCP wiring, 3 agent loop, 10 GROQ parity and seed integrity
npm run eval  # 11 known-answer cases against the real corpus
```

All of it runs on a fresh clone with **no credentials and no Sanity account**. Every correctness claim in this post is checkable in about thirty seconds, which felt like the least I could do given that the app's whole pitch is "don't take anyone's word for it".

## How I used Sanity

### Three fields carry the model

**`scope`** — the situation a claim applies to: operating carrier, aircraft type or family, **seat count**, cabin class, fare brand, loyalty tier, jurisdiction, item category, battery state, **watt-hour band**. An empty facet means *any*, which is why a regulator's claim with an entirely empty scope becomes the universal floor instead of matching nothing. The resolver counts populated facets to decide which of two competing claims is narrower.

Two of those facets exist because the sources are written that way and I refused to hardcode around it:

- Delta writes its restriction as *"flights with 50 seats or less"*, so the scope has `appliesAtOrBelowSeats` and the claim is a faithful translation of the sentence. Add a new 50-seat aircraft to the dataset and it inherits the rule instead of quietly escaping it.
- The FAA's two-spare limit applies *only above 100 Wh* — the same page says there is no quantity limit for ordinary cells. Without `appliesAboveWh`, an unscoped version of that claim would have told travellers they may carry two phone batteries. There is an eval case guarding exactly this.

**`bindingMode`** — `floor` | `override` | `ceiling`. This field exists because of one sentence on the FAA's own page:

> "Many airlines, both domestic and international, may have stricter quantity and Wh limits … regardless of Wh capacity."

A regulator publishing 100 Wh is not *contradicted* by a carrier publishing 100 Wh for power banks. It is being *implemented*. So resolving by authority is wrong — and authority was exactly what my first version did. **The FAA outranks Delta on every measure and has to lose anyway.** `floor` and `override` combine by taking the stricter of the two; `ceiling` is an absolute maximum applied last, so no carrier can resolve to more than the law permits.

That was the moment the schema stopped being a spreadsheet with extra steps.

**`ruling`** — a human decision about a contradiction, stored as content. The agent may draft one; it lands as `proposed` and **changes nothing**. Only a `signed` ruling with a named person on it overrides the engine's own tie-break, and the schema enforces that: you cannot set `status: signed` without `decidedBy`. Once signed, it applies to every future question inside its scope, so the same argument is never had twice. Both rulings in the seeded dataset are unsigned on purpose — the backlog is part of the demo.

### Two Context MCP endpoints, one per job

Sanity derives an endpoint's mode from its sources, and if an endpoint has both a dataset source and a Knowledge Base source, **the dataset wins and the Knowledge Bases are ignored**. You *can* flip one endpoint per request with `?mode=knowledge_base&knowledgeBases=…`, but then one configuration has to serve two jobs that want opposite things — the GROQ side wants a tight `groqFilter` and instructions about scopes and binding modes, the prose side wants neither. So there are two, each configured for what it is for:

- `gate-check-claims` — dataset source, GROQ mode, with a `groqFilter` so the agent cannot wander into the app's own check-run records. Serves `initial_context`, `schema_explorer`, `groq_query`.
- `gate-check-prose` — knowledge-base source, KB mode. Serves `knowledge_base_read` over a Knowledge Base built from the nine source documents, each carrying the claims read out of it and the notes explaining why a reading is uncertain.

The Knowledge Base build came back with **no open issues**, and that is the right answer rather than a miss. Delta capping power banks at 100 Wh does not contradict the FAA's 160 Wh — it tightens it, which the FAA's own page invites. In prose they read as consistent. Telling a tightening from a genuine disagreement is exactly the job `bindingMode` does on the structured side, which is a fair summary of why this needs both halves.

Tool names get namespaced (`content_*`, `kb_*`) on the way in, because **both modes expose a tool called `initial_context`** and merging them unprefixed silently drops one. That took an embarrassingly long time to notice, so there is now a test whose only job is to fail if it ever regresses.

That test is one of seven that talk JSON-RPC to a local server impersonating a Context endpoint — `apps/web/lib/fakeContextServer.ts`, a real Streamable HTTP server the unmodified client connects to. They cover the things you cannot reason about from the source: whether the client actually connects, whether both `initial_context` tools survive the merge, whether the double-wrapped `groq_query` payload comes back as rows, and whether one dead endpoint takes the other down with it. Worth building because the alternative was finding out on demo day.

**The corpus is what justifies the split.** American's *"large portable power banks"* has no number in it, so it carries no structured claim at all — it is precisely the prose the Knowledge Base exists to return. The FAA's 160 Wh ceiling *is* a number and belongs in GROQ mode where the engine can compare against it. I did not decide to use both modes and then look for a reason; the content split first.

### The model does not do arithmetic

Threshold comparison, scope matching and conflict resolution all run in a pure, dependency-free package with 26 unit tests. The agent reads the question, picks the itinerary and items, pulls prose, and writes the explanation. The system prompt is blunt about it:

> If you find yourself reasoning "137 is more than 100, so…", stop and call the tool.

"Is 137 above 100" is not a job for a language model, and an answer someone acts on at an airport has to be reproducible. There is a second route that runs the engine with **no model in the loop at all** — same inputs, same verdicts, every time — which is both the honest demonstration that the logic is deterministic and the reason the demo still works when I hit a rate limit.

### Writes happen after the agent, server-side

Context MCP is read-only by design, so the agent never holds a write credential. When it finishes, a server route writes a `checkRun` with the verdicts **denormalised into the document** — because when a carrier edits a page next week, that row still has to show what the traveller was told today. `propose_ruling` writes an unsigned ruling the same way.

### The GROQ is under test as well

The evaluation suite reads the seed documents through a TypeScript stand-in so it runs with no Sanity account, which is duplication, which drifts. If it drifted, the suite proving the engine correct would be feeding it a shape the live app never sees.

So the real query strings also run through **`groq-js` — Sanity's own GROQ implementation** — against the real documents, with the results asserted equal to the stand-in. Same query text Context MCP will execute, same evaluator, no credentials needed.

It found two genuine bugs in the first run:

- **`third-party` had no case in my authority `select()`**, so traveller-report claims scored 2 — identical to a marketing page — while the TypeScript constant said 1. Authority breaks ties between conflicting claims, so that could have changed a verdict. The fallback is now 1 instead of a middling value, because an unrecognised document class should be trusted least, not averagely.
- **Raw object projections were leaking `_type` and `_key`** into results typed as plain value objects.

Neither was visible from reading the code. Both would have surfaced during a demo, which is a worse place to find them.

The third defect only showed up against the live project. The first import used ids like `clm.faa.cabinonly`, and **Sanity treats any document id containing a period as private** — hidden from anonymous reads even in a public dataset. The dataset held 63 documents and an unauthenticated query returned zero. Judges opening the public dataset would have seen nothing, and the app's direct reader would have silently disagreed with Context MCP, which reads with a token. The ids are hyphenated now, a test fails the build if a dotted id ever comes back, and a second parity suite runs the real queries against the Content Lake itself (`npm run test:live`) and asserts the results match what the offline tests assume.

## What it refuses to do

Most of the work here went into *not* answering.

- **A 99 Wh laptop battery comes back `unknown`, not `allowed`.** Neither FAA page sets a ceiling for a battery installed in a device — both defer to the spare-battery entries. The corpus is genuinely silent, so the engine says so. There is an eval case whose only purpose is to fail if that ever becomes `allowed`, because that would mean the engine had started asserting things no source says.
- **Unorderable conflicts stay unresolved.** The CRJ-200 bin reports cannot be ordered, so no value is returned and it goes on the backlog. Splitting the difference would have invented a measurement that appears in no source.
- **When it does fall back, it labels itself.** Equal authority, equal date, nobody has ruled → the tighter figure, marked `most-restrictive`, with both claims side by side.
- **Losing claims are always shown**, and so are the rules that never applied in the first place. Every finding can list each claim that was read and set aside with the facet that excluded it — *"applies only to aircraft of 50 seats or fewer, and the Boeing 737-900 has 180 seats"*. The scope matcher already knows which facet failed, so this was free; I had just been throwing it away. For the traveller who says *"but I read 160 Wh somewhere"*, it is the entire answer, and it makes the scope machinery visible instead of magic.

  Travellers get turned away by gate agents reading the other page. Hiding the other page would be the cruellest possible UX.

## Honest limits

- **Not travel advice.** Policies change — two of these pages changed in 2026 alone — and `retrievedAt` is the expiry date on every row. Anything approval-related, get in writing from the operating carrier.
- **One airline group, properly.** Delta and its regional partners are modelled from their own pages. American appears only as prose. The model scales; 21 claims is a demonstration, not coverage.
- **Mainline bin dimensions are absent, not estimated.** No manufacturer figure was findable, and a guessed number would silently become a verdict, so the geometry check simply does not run on mainline metal.
- **The offline projection stand-in is still duplication.** The parity test keeps it honest, but a new projection has to be written twice. Generating it from the query text would be the real fix.
- **Interline allowance is unmodelled.** IATA Resolution 302 makes the *marketing* carrier the Most Significant Carrier for checked baggage, which pulls directly against the operating-carrier rule this app applies to cabin baggage. The scope object already has the facets to express it. That is the next thing I would build, and I would rather say so than quietly imply the problem is solved.

## Sanity Project Details

- **Project ID:** `6bjkg0ul`
- **Dataset:** `production` (public — read it without a token: [`count(*)`](https://6bjkg0ul.api.sanity.io/v2021-06-07/data/query/production?query=count(*)))
- **Studio:** https://gate-check.sanity.studio
- **Public dataset export:** `seed/dataset.ndjson` in the repo — all 63 documents, importable with `npx sanity dataset import`

**What to look at, if you are judging the content model:** open the Studio and go to **Needs a decision → Proposed rulings**, then **Claims by binding mode**. The Studio structure is organised around the questions an auditor asks — which claims disagree, which sources are weak, what decisions are outstanding — rather than around document types. Vision is left enabled so you can run the app's own GROQ queries against the live dataset.

The corpus is 63 documents: 9 source documents, 21 claims, 2 proposed rulings, 3 itineraries, 15 items, 4 carriers, 6 aircraft types, 3 jurisdictions. Every source document is a page I opened and read on 2026-09-26, with its URL, its class, and the clause each claim was read out of. Where the wording is genuinely ambiguous — Delta's *"an aggregate total of 100 Wh each"* can mean per unit or combined — the claim is marked `confidence: 'uncertain'`, the note explains the ambiguity, and a proposed ruling asks a human to settle it rather than pretending the sentence is clear.

## Agent Session

<<AGENT_SESSION_EMBED>>
