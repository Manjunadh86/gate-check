/**
 * Push the seeded dataset into Sanity.
 *
 * Uses `createOrReplace` so the script is idempotent — run it as often as you
 * like. Documents go in dependency order inside one transaction, so a broken
 * reference fails the whole import rather than leaving the dataset half-built.
 *
 *   SANITY_WRITE_TOKEN=... npm run seed
 *
 * `--ndjson` writes seed/dataset.ndjson instead, for `sanity dataset import`
 * or for publishing a public dataset URL alongside the challenge submission.
 */
import {writeFileSync} from 'node:fs'
import {createClient} from '@sanity/client'
import {allDocuments} from './content.ts'

const ndjsonOnly = process.argv.includes('--ndjson')
const out = new URL('./dataset.ndjson', import.meta.url)

if (ndjsonOnly) {
  writeFileSync(out, allDocuments.map((d) => JSON.stringify(d)).join('\n') + '\n')
  console.log(`wrote ${allDocuments.length} documents to ${out.pathname}`)
  process.exit(0)
}

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'
const token = process.env.SANITY_WRITE_TOKEN

if (!projectId || !token) {
  console.error(
    'Set NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_WRITE_TOKEN first (see .env.example).\n' +
      'To produce an importable file without a token instead: npm run seed -- --ndjson',
  )
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2026-09-01', useCdn: false})

const tx = allDocuments.reduce((t, doc) => t.createOrReplace(doc as never), client.transaction())
const result = await tx.commit({visibility: 'sync'})

const counts = allDocuments.reduce<Record<string, number>>((acc, d) => {
  acc[d._type] = (acc[d._type] ?? 0) + 1
  return acc
}, {})

console.log(`committed ${result.results.length} documents to ${projectId}/${dataset}`)
for (const [type, n] of Object.entries(counts).sort()) console.log(`  ${n.toString().padStart(3)} ${type}`)
