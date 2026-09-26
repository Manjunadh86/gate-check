# Gate Check

**An agent that tells you whether your bag and your batteries can travel — segment by segment, with the sentence each answer came from.**

Built for the [DEV × Sanity Challenge](https://dev.to/devteam/join-the-sanity-challenge-2500-in-prizes-for-five-winners-514m), Path One.

---

## The problem

You book one ticket. Three different authorities decide what you can carry.

| Question | Decided by |
|---|---|
| How big may the bag be? | The carrier **operating** the segment — not the one that sold you the ticket |
| May this battery fly? | The **regulator** that carrier answers to, then any stricter rule the carrier files on top |
| Will it actually fit? | The **aeroplane** |

None of those three agree with each other, and none of them are on the page you found by searching. Two verified examples from the corpus in this repo:

- The FAA permits spare lithium cells up to 160 Wh with airline approval. Delta's own page caps **power banks** at 100 Wh each. So a 137 Wh power bank is refused, while a **137 Wh cine battery is merely approval-required** — same cell, same flight, different answer, because the category is different.
- Delta advertises "1 carry-on bag and 1 personal item free of charge." Delta's own carry-on page also says that on Connection flights of 50 seats or fewer you may bring **personal items only**. So a bag that is perfectly legal on the way out cannot enter the cabin on the way home — and once it is gate-checked, the FAA requires every spare battery to come *out of it first*.

That last one is the point of the whole project. Nothing in the corpus states it. It falls out of three documents lining up: the aircraft, the carrier's regional policy, and 49 CFR 175.10(a)(18). No keyword search can assemble it.

## The idea: store claims, not facts

The load-bearing decision is that this dataset contains **no facts**.

There is no `carryOnMaxWeight: 7`. There is a `claim` document that says *this page, published by this carrier, on this date, said 7 kg, about these situations*. The number a traveller is finally shown is **computed**, never stored — because there is no such thing as "the" limit until you know who is flying the aeroplane.

Three fields make that work:

**`scope`** — the situation a claim applies to: operating carrier, aircraft type or family, seat count, cabin class, fare brand, loyalty tier, jurisdiction, item category, battery state, watt-hour band. An empty facet means *any*, which is why a regulator's claim with an entirely empty scope is the universal floor rather than a claim that matches nothing. The resolver counts populated facets to decide which of two competing claims is narrower.

**`bindingMode`** — `floor`, `override`, or `ceiling`. This field exists because of one sentence on the FAA's own page: *"Many airlines … may have stricter quantity and Wh limits … regardless of Wh capacity."* A regulator publishing 100 Wh is not *contradicted* by a carrier publishing 100 Wh for power banks — it is being *implemented*. So authority alone is the wrong tie-break: **the FAA outranks the airline and still loses, on purpose.**

**`ruling`** — a human decision about a contradiction, recorded as content. The agent may draft one; it lands as `proposed` and changes nothing. Only a `signed` ruling with a named person on it overrides the resolver's own tie-break. The decision then applies to every future question inside its scope, so the same argument is never had twice.

## How a question gets answered

```
question
   ↓
agent (Claude, via AI SDK)
   ├── content_* tools ─→ Context MCP, GROQ mode ──→ claims, rulings, schema
   ├── kb_*      tools ─→ Context MCP, KB mode  ──→ prose with no number in it
   └── resolve_verdicts ─→ @gate-check/resolver  ──→ deterministic verdicts
                                                     ↓
                          server-side write ──→ checkRun + proposed rulings
```

**Two Context endpoints, not one.** Sanity derives an endpoint's mode from its sources, and if an endpoint has both a dataset source and a Knowledge Base source, the dataset wins and the Knowledge Bases are ignored. An agent that needs structured claims *and* indexed prose therefore needs two endpoints. Tool names are namespaced on the way in, because both modes expose a tool called `initial_context` and merging them unprefixed silently drops one.

**The corpus justifies the split.** American Airlines' notice says *"Large portable power banks … are not allowed as carry-on or checked items"* and never defines "large". There is no number to compute with, so it carries no structured claim at all — it is exactly the prose the Knowledge Base exists to return. Meanwhile the FAA's 160 Wh ceiling is a number, and belongs in GROQ mode where the engine can compare against it.

**The model does not do arithmetic.** Threshold comparison, scope matching and conflict resolution run in `@gate-check/resolver` — pure functions, no I/O, 24 unit tests. The model reads the question, picks the itinerary and items, pulls prose, and writes the explanation. "Is 137 above 100" is not a job for a language model, and an answer a traveller acts on has to be reproducible. The system prompt says so explicitly: *"If you find yourself reasoning '137 is more than 100, so…', stop and call the tool."*

**Writes happen server-side.** Context MCP is read-only by design, so the agent never holds a write credential. Check runs and proposed rulings are written by a server route after the agent finishes.

## What it refuses to do

Most of the engineering here is about *not* answering.

- **No rule, no answer.** If nothing in the corpus covers a combination, the verdict is `unknown` and the app says so. A 99 Wh laptop battery comes back `unknown` — not `allowed` — because neither FAA page sets a ceiling for a battery installed in a device; both defer to the spare-battery entries. There is an eval case whose only job is to keep it that way.
- **Unorderable conflicts stay unresolved.** Two traveller reports of CRJ-200 bin size are 21×14×7 and 18×13×8 inches. Neither fits inside the other — one is longer, one is deeper. The resolver refuses to order them, returns no value, and flags it for a ruling rather than splitting the difference.
- **When it does fall back, it says so.** If sources of equal authority and date disagree and nobody has ruled, the tighter figure is used and the answer is labelled `most-restrictive` with the conflict shown. Both claims appear side by side, because travellers get turned away by gate agents reading the other page.
- **Losing claims are shown, not hidden.** Every finding lists what was considered and not used, with publisher, document class, quote and link.

## Layout

```
packages/content-model/   Schema, vocabulary, TS types, every GROQ query
packages/resolver/        Pure resolution + verdict engine. 24 unit tests, no I/O
apps/studio/              Sanity Studio, with a structure built for auditing claims
apps/web/                 Next.js app: the agent, the engine route, the interface
seed/                     The corpus, and the importer
evals/                    11 known-answer cases, runnable with no Sanity account
```

`packages/content-model` has two entry points on purpose. The root exports vocabulary and types only; the schema lives behind `/schema` because it imports `sanity`, which drags the entire Studio into anything that touches it.

## Running it

```bash
npm install
npm test          # 24 unit tests on the resolver
npm run eval      # 11 known-answer cases against the seeded corpus — no Sanity needed
```

Both of those work on a fresh clone with no credentials, which is the point: the correctness claims in this README are checkable in about thirty seconds.

For the app itself, see [SETUP.md](SETUP.md). Short version: `cp .env.example .env`, add a Sanity project id and a write token, `npm run seed`, `npm run studio`, `npm run dev`. The two Context MCP endpoints are optional — without them the app reads the same dataset over the ordinary client, runs the engine normally, and **says on the page** which wire every figure came down. A demo that looked identical whether or not it was using Context would be a demo you could not trust.

## The corpus

63 documents. Nine source documents, twenty-one sourced claims, two proposed rulings, three itineraries, fifteen items, four carriers, six aircraft types, three jurisdictions.

Every source document is a page that was opened and read on 2026-09-26, with its URL, its class, and the clause each claim was read out of. Where a page's wording is genuinely ambiguous — Delta's *"an aggregate total of 100 Wh each"* can mean per unit or combined — the claim is marked `confidence: 'uncertain'`, the note explains the ambiguity, and a proposed ruling asks a human to settle it. Where a figure comes from travellers rather than the carrier, it is classed `third-party`, which costs it authority in the resolver.

Deliberately small. Knowledge Bases are capped at 150 documents in beta, and 63 leaves room to grow without redesigning.

## Honest limits

- **Not travel advice.** Policies change; two of these pages changed in 2026 alone. `retrievedAt` is the expiry date on every row. Get anything approval-related in writing from the operating carrier.
- **One airline group, properly.** Delta and its regional partners are modelled from their own pages. American appears only as prose, because no watt-hour figure on their page was specific enough to compute with. The model scales; the corpus is a demonstration.
- **Mainline bin dimensions are absent, not estimated.** No manufacturer figure was found, and a guessed number would silently become a verdict. So the geometry check simply does not run on mainline metal, which is the honest failure rather than the convenient one.
- **`evals/project.ts` duplicates the GROQ projections** so the suite runs offline. Duplication drifts. It is the weakest seam in the repo and it is flagged in its own header comment.
- **Interline allowance is unmodelled.** IATA Resolution 302 makes the *marketing* carrier the Most Significant Carrier for checked baggage on a multi-carrier ticket, which pulls against the operating-carrier rule this app applies to cabin baggage. The `scope` object has the facets to express it and the corpus does not yet use them. That is the next thing I would build.
