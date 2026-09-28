# Setup

Steps 1–5 get the app running. Steps 6–10 add the two Sanity Context endpoints, which is what makes it a Path One submission. The app works without them and says on the page that it is working without them, so do 1–5 first and confirm it runs before going near the beta.

Everything here needs your own Sanity account, so these are the steps that cannot be automated.

---

## 1. Create the Sanity project

1. Sign in at **[sanity.io/manage](https://www.sanity.io/manage)** (GitHub or Google is fastest).
2. **Create new project.** Name it `gate-check`. Dataset `production`, **public**.
   Public matters: the challenge asks for a project id *or a public dataset URL*, and a public dataset lets judges read your content model without you issuing them a token.
3. Copy the **project ID** from the project's dashboard — eight characters, something like `7x2k9abc`.
4. Note your **organization ID** too (Manage → your organization → the URL contains it). Step 8 needs it.

## 2. Create a write token

Manage → your project → **API** → **Tokens** → **Add API token**.

- Name: `gate-check-seed`
- Permissions: **Editor**

Copy it once; it is not shown again. This is a *project* token and is used only for seeding and for server-side writes. It is **not** the token the Context endpoints need — that one is different and comes in step 7.

## 3. Fill in `.env`

```bash
cp .env.example .env
```

Set these four:

```
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_WRITE_TOKEN=your_editor_token
ANTHROPIC_API_KEY=your_anthropic_key
```

The Studio reads its own pair, so also create `apps/studio/.env`:

```
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
```

## 4. Seed the corpus

```bash
npm install
npm run seed
```

63 documents. The importer is idempotent — it uses `createOrReplace`, so run it as often as you like. It commits in one transaction, so a broken reference fails the whole import rather than leaving the dataset half-built.

No token to hand? `npm run seed:ndjson` writes `seed/dataset.ndjson`, which you can import with `npx sanity dataset import seed/dataset.ndjson production`.

## 5. Run it

```bash
npm run studio   # http://localhost:3333
npm run dev      # http://localhost:3000
```

Pick **JFK → ATL → TYS**, tick the **22 × 14 × 9 in roll-aboard** and the **16 Wh camera batteries × 4**, and press **Run the engine**. You should get `allowed` on the first segment, `prohibited` on the second, and an instruction to take the batteries out of the bag before it is gate-checked.

The provenance strip at the top will say *"GROQ mode off — reading dataset directly"*. That is correct so far. Everything below fixes it.

---

## 6. Deploy the schema

GROQ-mode Context endpoints read a **deployed** schema. Without one, the endpoint fails with JSON-RPC error `-32004`.

```bash
npm run schema:deploy -w @gate-check/studio
```

## 7. Turn on Context and mint the organization token

Context is an opt-in beta and an **organization admin** has to enable it.

1. Manage → your **organization** (not the project) → **Labs** → enable **Context**.
2. Still at organization level: **API** → **Tokens** → **Add API token**.
   - Name: `gate-check-context`
   - Permissions: **Context Viewer** (the least privilege that works; Editor also works)

This must be an **organization** token. A project token is refused no matter how broad its project permissions are — you get `403 contextGrantRequired`. This is the single most common way to lose an hour here.

## 8. Create the GROQ-mode endpoint

Dashboard → **Context** → MCP endpoints → new endpoint.

- Title: `Gate Check — claims`
- Name: `gate-check-claims` (lowercase, hyphens; **immutable once saved**)
- Source: **Dataset** → `YOUR_PROJECT_ID.production`
- GROQ filter (worth setting — it keeps the agent out of the app's own check-run records while leaving it everything it needs, including the itinerary and item ids that `resolve_verdicts` takes):
  ```
  _type in ["claim", "ruling", "sourceDoc", "carrier", "aircraftType", "jurisdiction", "itinerary", "bagItem"]
  ```
- Instructions (optional): *Claims are sourced assertions, not facts. Never report a claim's value without its source document and its scope. bindingMode 'floor' means operators may be stricter.*

Its URL is:

```
https://api.sanity.io/v1/context/organizations/YOUR_ORG_ID/mcp/gate-check-claims
```

## 9. Create the Knowledge Base, then its endpoint

**The Knowledge Base** can be made from the CLI, which is how this project's was made (`kbJyVg8R8nIJ`):

```bash
npx sanity context create --organization YOUR_ORG_ID --title "Gate Check - carrier and regulator rules" --description "..."
npx sanity context imports create KB_ID --sanity-project YOUR_PROJECT_ID --sanity-dataset production --query '*[_type == "sourceDoc"]{title, url, publisherName, docType, excerpt, effectiveFrom, retrievedAt, "claimsReadFromThisDocument": *[_type == "claim" && references(^._id)]{subject, bindingMode, confidence, quote, note, "value": coalesce(numberValue, massKgValue, booleanValue, dimensionsValue)}}'
npx sanity context build KB_ID --watch
```

Each source document is indexed together with the claims read out of it, so the Knowledge Base gets the notes explaining *why* a reading is uncertain, not just a two-line excerpt.

Or from the dashboard: Context → **New knowledge base**.

- Title: `Gate Check — carrier and regulator prose`
- Purpose: *Help a traveller understand cabin baggage and lithium battery rules in the words the carrier and the regulator actually used, including rules too vague to turn into a number.*
- Add source → **Dataset** → GROQ query:
  ```
  *[_type == "sourceDoc"]
  ```
  This indexes the nine source documents — the excerpts, publishers and document classes — which is the prose half of the corpus. Dataset sources read published documents only and allow up to 5,000 per query, so nine is comfortable.
- **Build entries**, and wait for *Entries up to date*. Check the **Entries** tab for sensible topics and the **Issues** tab for flagged conflicts.
- Copy the Knowledge Base's **public id**.

**Its endpoint:** new MCP endpoint, exactly as in step 8 but:

- Title: `Gate Check — prose`
- Name: `gate-check-prose`
- Source: **Knowledge Base** → the id you just copied

Do **not** add both a dataset and a Knowledge Base source to one endpoint. If an endpoint has both, the dataset wins and the Knowledge Bases are silently ignored — which is exactly why this project runs two endpoints.

## 10. Wire them up

```
SANITY_ORGANIZATION_TOKEN=your_org_context_token
SANITY_CONTEXT_GROQ_URL=https://api.sanity.io/v1/context/organizations/YOUR_ORG_ID/mcp/gate-check-claims
SANITY_CONTEXT_KB_URL=https://api.sanity.io/v1/context/organizations/YOUR_ORG_ID/mcp/gate-check-prose
```

Restart `npm run dev`. The strip at the top of the page should now read **Context MCP · GROQ mode** and **Context MCP · Knowledge Base mode** in green. Press **Ask the agent** and open the *tool calls* disclosure — you should see `content_initial_context`, `content_groq_query`, `resolve_verdicts` and at least one `kb_` call.

---

## Deploying

**Studio** — `npm run deploy -w @gate-check/studio` puts it on `your-project.sanity.studio`. Worth doing: it gives judges a URL where they can read the content model directly.

**App** — Vercel, root directory `apps/web`, with every variable from `.env` set in the project settings. `maxDuration` on the agent route is 120s, which needs a paid Vercel plan; on hobby, the engine route still works and the agent may time out on long runs.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403 contextGrantRequired` | Project token instead of an organization token, or Context Viewer not granted |
| JSON-RPC `-32004` | Schema not deployed. Step 6 |
| Knowledge Base tools missing | The endpoint has a dataset source on it, so it is serving GROQ mode |
| Both endpoints show the same tools | Both endpoints point at a dataset. One of them should have a knowledge-base source only |
| `Configuration must contain projectId` | `.env` not picked up — restart the dev server |
| The page says "dataset is empty" | Step 4 |
