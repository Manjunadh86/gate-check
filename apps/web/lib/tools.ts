import {tool} from 'ai'
import {z} from 'zod'
import {evaluateItinerary, tripOutcome, type Verdict} from '@gate-check/resolver'
import {loadBagItems, loadClaimsAndRulings, loadItinerary} from './content.ts'
import type {McpBundle} from './mcp.ts'
import {writeClient} from './sanity.ts'
import {env} from './env.ts'

/**
 * The boundary between what the model decides and what the code decides.
 *
 * The model reads the question, picks the itinerary and the items, pulls prose out
 * of the Knowledge Base and writes the explanation. It does not do the arithmetic.
 * Threshold comparisons, scope matching and conflict resolution run in
 * `@gate-check/resolver`, which is pure, deterministic and covered by tests —
 * because "is 137 above 100" is not a job for a language model, and an answer a
 * traveller acts on should be reproducible.
 */
export function localTools(bundle: McpBundle | null, collect: (v: Verdict[]) => void) {
  return {
    resolve_verdicts: tool({
      description:
        'Run the deterministic compliance engine for one itinerary and a set of items. Reads every claim and every signed ruling through the Sanity Context GROQ endpoint, matches each claim scope against each segment, resolves contradictions, and returns a verdict per item per segment with the governing claim and its source. Call this before answering any question about whether something can be carried — do not compute limits yourself.',
      inputSchema: z.object({
        itineraryId: z.string().describe('The _id of the itinerary document.'),
        itemIds: z.array(z.string()).min(1).describe('The _id of each bagItem the traveller is carrying.'),
      }),
      execute: async ({itineraryId, itemIds}) => {
        const [itinerary, allItems, content] = await Promise.all([
          loadItinerary(itineraryId),
          loadBagItems(),
          loadClaimsAndRulings(bundle),
        ])
        if (!itinerary) return {error: `No itinerary with _id "${itineraryId}".`}

        const items = allItems.filter((i) => itemIds.includes(i._id))
        const missing = itemIds.filter((id) => !items.some((i) => i._id === id))
        if (items.length === 0) return {error: `None of those item ids exist. Missing: ${missing.join(', ')}`}

        const verdicts = evaluateItinerary(itinerary, items, content.claims, content.rulings)
        collect(verdicts)

        return {
          itinerary: {label: itinerary.label, travelDate: itinerary.travelDate},
          contentSource: content.source,
          claimsConsidered: content.claims.length,
          signedRulings: content.rulings.length,
          missingItems: missing,
          tripOutcome: tripOutcome(verdicts),
          verdicts: verdicts.map((v) => ({
            segment: v.segmentLabel,
            item: v.itemLabel,
            outcome: v.outcome,
            headline: v.headline,
            unresolvedConflict: v.unresolvedConflict,
            findings: v.findings.map((f) => ({
              test: f.test,
              outcome: f.outcome,
              detail: f.detail,
              value: f.resolution.formatted,
              method: f.resolution.method,
              why: f.resolution.explanation,
              governingSource: f.resolution.governing?.source
                ? {
                    publisher: f.resolution.governing.source.publisherName,
                    docType: f.resolution.governing.source.docType,
                    url: f.resolution.governing.source.url,
                    quote: f.resolution.governing.quote ?? null,
                    confidence: f.resolution.governing.confidence,
                  }
                : null,
              alsoConsidered: f.resolution.considered
                .filter((c) => c.claim._id !== f.resolution.governing?._id)
                .map((c) => ({
                  publisher: c.claim.source?.publisherName,
                  docType: c.claim.source?.docType,
                  quote: c.claim.quote ?? null,
                  url: c.claim.source?.url,
                })),
              // Rules that were read and set aside, with the facet that ruled each
              // one out. Capped: a traveller asking "but I read 160 Wh somewhere"
              // needs the two or three that look relevant, not the whole corpus.
              ruledOut: f.resolution.excluded.slice(0, 4).map((x) => ({
                publisher: x.claim.source?.publisherName,
                quote: x.claim.quote ?? null,
                whyNotApplied: x.reason,
              })),
            })),
          })),
        }
      },
    }),

    propose_ruling: tool({
      description:
        'Record a proposed ruling when two claims contradict each other and nothing in the dataset settles it. The ruling lands with status "proposed" and changes no answers until a named person signs it in the Studio. Use this instead of picking a winner yourself.',
      inputSchema: z.object({
        subject: z.string().describe('The claim subject the conflict is about.'),
        conflictingClaimIds: z.array(z.string()).min(2),
        chosenClaimId: z.string().describe('The claim you would recommend, which must be one of the conflicting ones.'),
        rationale: z.string().min(20).describe('Why, written for the person who has to sign it.'),
      }),
      execute: async ({subject, conflictingClaimIds, chosenClaimId, rationale}) => {
        if (!conflictingClaimIds.includes(chosenClaimId)) {
          return {error: 'chosenClaimId must be one of conflictingClaimIds.'}
        }
        if (!env.writeToken) {
          return {error: 'No write token configured, so the proposal was not saved. Report the conflict in your answer instead.'}
        }
        const doc = await writeClient().create({
          _type: 'ruling',
          subject,
          status: 'proposed',
          proposedByAgent: true,
          rationale,
          chosen: {_type: 'reference', _ref: chosenClaimId},
          conflicting: conflictingClaimIds.map((id) => ({_type: 'reference', _ref: id, _key: id.replace(/\./g, '_')})),
          scope: {_type: 'scope'},
        })
        return {
          saved: true,
          rulingId: doc._id,
          status: 'proposed',
          note: 'Unsigned, so it binds nothing yet. Its scope was left empty — a person must narrow it before signing.',
        }
      },
    }),
  }
}
