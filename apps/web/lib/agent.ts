import {createAnthropic} from '@ai-sdk/anthropic'
import {generateText, stepCountIs, type LanguageModel} from 'ai'
import {tripOutcome, type Verdict} from '@gate-check/resolver'
import {env, hasModel} from './env.ts'
import {closeMcp, openMcp, type McpBundle} from './mcp.ts'
import {localTools} from './tools.ts'
import {writeClient} from './sanity.ts'

const SYSTEM = `You are Gate Check. You answer one kind of question: may this traveller carry these items, on these flights, in the cabin.

HOW YOU WORK

You have two Sanity Context endpoints and one local engine.

- \`content_*\` tools read the structured corpus through a GROQ-mode Context endpoint: carriers, aircraft types, source documents, and the individual sourced claims those documents make. Start with \`content_initial_context\` to see the schema, \`content_schema_explorer\` for one type in detail, and \`content_groq_query\` to read documents.
- \`kb_*\` tools read a Knowledge-Base-mode Context endpoint: the same source material distilled into prose entries. Use \`kb_initial_context\` for the outline and \`kb_knowledge_base_read\` to pull entries. Go here for anything the structured claims cannot express — a carrier notice that bans "large" power banks without defining large, advice about how a rule is enforced in practice, wording a traveller might want to quote at a desk.
- \`resolve_verdicts\` is the compliance engine. It does all threshold comparison, scope matching and conflict resolution deterministically.

RULES

1. Never compute a limit yourself. Do not compare watt-hours, dimensions or counts in your head, and do not restate a threshold you have not seen in a tool result. Call \`resolve_verdicts\` and report what it returns. If you find yourself reasoning "137 is more than 100, so…", stop and call the tool.
2. Never invent a rule. If \`resolve_verdicts\` reports an outcome of "unknown" or a method of "no-rule", say plainly that no sourced rule in the dataset covers it, and say what a traveller should do instead — usually ring the operating carrier. A confident guess is the worst possible output here.
3. Cite everything. Every figure you give must name the publisher and the document class it came from, and link the URL. Prefer the exact quoted clause when the tool gives you one.
4. Use \`ruledOut\` when a traveller is confused. Each finding lists the rules that were read and set aside, with the reason. If someone says "but I read 160 Wh on the FAA site", the answer is in there: name the rule, and say which facet of their flight put it out of scope. This is usually the most useful sentence you can write.
5. Surface disagreement rather than hiding it. When a finding reports \`alsoConsidered\`, name the other figure and who publishes it, and say why the governing one won. Travellers get turned away by gate agents reading the other page; they need to know it exists.
6. Distinguish the ticket from the aeroplane. Baggage rules follow the carrier operating the segment and the equipment it is flown on, not the airline whose code is on the booking. When those differ on a segment, say so explicitly — it is usually the reason the answer is surprising.
7. Answer per segment, never per trip, whenever the segments differ.
8. When a conflict is genuinely unsettled — the engine reports \`unresolvedConflict\` or a method of "most-restrictive" or "unresolvable" — say so, explain that the tighter reading has been used so the answer is safe to act on, and call \`propose_ruling\` once so a person can settle it. Do not pick a winner on your own authority.
9. You are not the airline. Close anything approval-related by telling the traveller to get the approval in writing from the operating carrier before they fly.

STYLE

Lead with the answer. Then the reasoning, then the citations. Plain prose and short lists; no headings-as-decoration, no restating the question back. If something in the itinerary is going to ruin someone's day — a bag that cannot come into the cabin on the last leg, a battery that has to come out of a bag before it is gate-checked — put it first, not in a footnote.`

export interface CheckResult {
  answer: string
  verdicts: Verdict[]
  tripOutcome: ReturnType<typeof tripOutcome>
  contentSource: 'context-mcp-groq' | 'direct-client'
  mcp: {groq: boolean; kb: boolean; warnings: string[]}
  steps: number
  /** Every tool the agent was offered, so the interface can show what it had to work with. */
  toolNames: string[]
  toolCalls: {name: string; args: unknown}[]
  checkRunId: string | null
  model: string
}

/**
 * One question, one agent run.
 *
 * The MCP clients are opened per request and closed in a finally block. That costs
 * a handshake on every call and is the right trade for a request-scoped serverless
 * route: a long-lived client that dies quietly is much harder to diagnose than a
 * connection error you get on the request that caused it.
 */
export async function runCheck(question: string, opts: {model?: LanguageModel} = {}): Promise<CheckResult> {
  // `model` is an injection seam for tests. The agent loop — tool assembly across
  // two MCP endpoints plus the local tools, the step budget, the verdict
  // collection, the write-back — is otherwise only exercisable by spending money
  // on a live model, which means in practice it would not be exercised at all.
  if (!opts.model && !hasModel()) throw new Error('ANTHROPIC_API_KEY is not set, so the agent cannot run.')

  let bundle: McpBundle | null = null
  const collected: Verdict[] = []

  try {
    bundle = await openMcp()
    const model = opts.model ?? createAnthropic({apiKey: env.anthropicKey})(env.model)

    const tools = {...bundle.tools, ...localTools(bundle, (v) => collected.push(...v))}

    const result = await generateText({
      model,
      system: SYSTEM,
      prompt: question,
      tools,
      stopWhen: stepCountIs(14),
    })

    const toolCalls = result.steps.flatMap((s) =>
      s.toolCalls.map((c) => ({name: c.toolName, args: (c as {input?: unknown}).input})),
    )

    const contentSource = bundle.connected.groq ? 'context-mcp-groq' : 'direct-client'
    const checkRunId = await recordRun(question, collected, toolCalls.length).catch(() => null)

    return {
      answer: result.text,
      verdicts: collected,
      tripOutcome: tripOutcome(collected),
      contentSource,
      mcp: {...bundle.connected, warnings: bundle.warnings},
      steps: result.steps.length,
      toolNames: Object.keys(tools).sort(),
      toolCalls,
      checkRunId,
      model: env.model,
    }
  } finally {
    if (bundle) await closeMcp(bundle)
  }
}

/**
 * Persist what the traveller was told.
 *
 * Verdicts are denormalised into the document rather than referenced, because when
 * a carrier edits a page next week this row still has to show what was said today.
 * Written here, server-side, because Context MCP cannot write.
 */
async function recordRun(question: string, verdicts: Verdict[], toolCalls: number): Promise<string | null> {
  if (!env.writeToken || verdicts.length === 0) return null

  const open = new Set<string>()
  for (const v of verdicts) {
    for (const f of v.findings) {
      if (f.resolution.unresolved) for (const c of f.resolution.considered) open.add(c.claim._id)
    }
  }

  const doc = await writeClient().create({
    _type: 'checkRun',
    askedAt: new Date().toISOString(),
    question,
    model: env.model,
    toolCalls,
    verdicts: verdicts.map((v, i) => ({
      _key: `v${i}`,
      _type: 'verdictSnapshot',
      segmentLabel: v.segmentLabel,
      itemLabel: v.itemLabel,
      outcome: v.outcome,
      reason: v.headline,
      unresolvedConflict: v.unresolvedConflict,
      ...(v.findings[0]?.resolution.governing
        ? {governingClaim: {_type: 'reference', _ref: v.findings[0].resolution.governing._id}}
        : {}),
      ...(v.findings[0]?.resolution.appliedRuling
        ? {appliedRuling: {_type: 'reference', _ref: v.findings[0].resolution.appliedRuling._id}}
        : {}),
    })),
    openConflicts: [...open].map((id) => ({_type: 'reference', _ref: id, _key: id.replace(/\./g, '_')})),
  })
  return doc._id
}
