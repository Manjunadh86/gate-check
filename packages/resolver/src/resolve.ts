import type {Claim, ClaimSubject, Ruling, Situation} from '@gate-check/content-model'
import {explainExclusion, rulingApplies, scopeMatches} from './scope.ts'
import {claimValue, compareRestrictiveness, formatValue, mostRestrictive, valueKey, type ClaimValue} from './values.ts'

export type ResolutionMethod =
  | 'sole-source'       // only one claim covered the situation
  | 'unanimous'         // several claims, all saying the same thing
  | 'signed-ruling'     // a human had already settled this exact conflict
  | 'stricter-overlay'  // a carrier rule tightened a regulator's baseline
  | 'capped-by-ceiling' // an absolute maximum overrode what the overlays allowed
  | 'more-specific'     // the narrower claim won
  | 'higher-authority'  // the contract beat the help page
  | 'more-recent'       // same authority, newer wording
  | 'most-restrictive'  // nothing separated them, so we took the tighter number
  | 'unresolvable'      // sources disagree and cannot even be ordered
  | 'no-rule'

export interface ScoredClaim {
  claim: Claim
  specificity: number
}

/** A claim about this subject that was ruled out, and the facet that ruled it out. */
export interface ExcludedClaim {
  claim: Claim
  reason: string
}

export interface Resolution {
  subject: ClaimSubject
  /** The claim the answer was computed from. Null only when nothing covered the situation. */
  governing: Claim | null
  value: ClaimValue
  formatted: string
  method: ResolutionMethod
  /**
   * Every claim that covered the situation, most specific first — the losers
   * included. The UI shows them side by side, because a traveller arguing at a
   * gate needs the sentence the agent is reading, not only ours.
   */
  considered: ScoredClaim[]
  /** More than one distinct value survived filtering. */
  disagreement: boolean
  /**
   * The disagreement was not settled by a rule we can defend — not by a signed
   * ruling, not by a regulator's own invitation to be stricter, not by
   * specificity, authority or date. The answer is still safe to act on, but a
   * person owes a decision.
   */
  unresolved: boolean
  appliedRuling: Ruling | null
  explanation: string
  /**
   * Claims about this subject that were current but did not cover this situation.
   * Shown so a traveller can see that the rule they found online was read and set
   * aside for a stated reason, rather than never considered.
   */
  excluded: ExcludedClaim[]
}

const inWindow = (from: string | null | undefined, to: string | null | undefined, date: string): boolean =>
  !(from && date < from) && !(to && date > to)

/**
 * Drop claims that no longer speak for their source.
 *
 * Three ways a claim stops counting: its own window has closed, the document it
 * came from was superseded, or a later claim explicitly supersedes it. None of
 * them delete anything — the old rows stay queryable, which is how the app can
 * explain that the figure on a two-year-old forum post was once correct.
 */
export function currentClaims(claims: Claim[], onDate: string): Claim[] {
  const superseded = new Set<string>()
  for (const c of claims) {
    if (c.supersedesId && inWindow(c.effectiveFrom, c.effectiveTo, onDate)) superseded.add(c.supersedesId)
  }
  return claims.filter(
    (c) =>
      !superseded.has(c._id) &&
      inWindow(c.effectiveFrom, c.effectiveTo, onDate) &&
      inWindow(c.source?.effectiveFrom, c.source?.effectiveTo, onDate) &&
      !c.source?.supersededById,
  )
}

const distinct = (claims: ScoredClaim[]): number => new Set(claims.map((s) => valueKey(claimValue(s.claim)))).size

/**
 * Pick a winner among claims that are genuinely competing — same binding mode,
 * all covering the situation, disagreeing about the value.
 *
 * Ordered by how well each step can be defended to somebody standing at a
 * boarding gate: the narrower rule, then the more authoritative document, then
 * the newer wording, and only then a safety fallback we label as such.
 */
function ladder(
  subject: ClaimSubject,
  pool: ScoredClaim[],
): {winner: Claim | null; method: ResolutionMethod; unresolved: boolean} {
  if (pool.length === 0) return {winner: null, method: 'no-rule', unresolved: false}
  if (pool.length === 1) return {winner: pool[0]!.claim, method: 'sole-source', unresolved: false}
  if (distinct(pool) === 1) return {winner: pool[0]!.claim, method: 'unanimous', unresolved: false}

  const top = pool[0]!.specificity
  const atTop = pool.filter((s) => s.specificity === top)
  if (distinct(atTop) === 1) return {winner: atTop[0]!.claim, method: 'more-specific', unresolved: false}

  const maxAuthority = Math.max(...atTop.map((s) => s.claim.source?.authority ?? 0))
  const atAuthority = atTop.filter((s) => (s.claim.source?.authority ?? 0) === maxAuthority)
  if (distinct(atAuthority) === 1) return {winner: atAuthority[0]!.claim, method: 'higher-authority', unresolved: false}

  const dateOf = (s: ScoredClaim) => s.claim.effectiveFrom ?? s.claim.source?.effectiveFrom ?? null
  const dated = atAuthority.filter((s) => dateOf(s) !== null)
  if (dated.length > 0) {
    const newestDate = dated.reduce((d, s) => (dateOf(s)! > d ? dateOf(s)! : d), dateOf(dated[0]!)!)
    const atNewest = dated.filter((s) => dateOf(s) === newestDate)
    if (distinct(atNewest) === 1) return {winner: atNewest[0]!.claim, method: 'more-recent', unresolved: false}
  }

  const safest = mostRestrictive(
    subject,
    atAuthority.map((s) => s.claim),
  )
  return safest
    ? {winner: safest, method: 'most-restrictive', unresolved: true}
    : {winner: null, method: 'unresolvable', unresolved: true}
}

/**
 * Compute the governing value of one subject for one situation.
 *
 * The order of operations is the interesting part. A signed human decision comes
 * first. Then regulator baselines and carrier overlays are combined by taking the
 * stricter of the two — not by authority — because the regulator's own text
 * invites operators to tighten it. Only genuinely competing claims of the same
 * kind go through the tie-break ladder. An absolute ceiling is applied last, so
 * nothing can resolve to more than the law permits.
 */
export function resolveSubject(
  subject: ClaimSubject,
  allClaims: Claim[],
  signedRulings: Ruling[],
  situation: Situation,
): Resolution {
  const matched = currentClaims(
    allClaims.filter((c) => c.subject === subject),
    situation.travelDate,
  )
    .filter((c) => claimValue(c).kind !== 'missing')
    .map((claim) => ({claim, match: scopeMatches(claim.scope, situation)}))

  const scored: ScoredClaim[] = matched
    .filter((x) => x.match.matched)
    .map((x) => ({claim: x.claim, specificity: x.match.specificity}))
    .sort((a, b) => b.specificity - a.specificity)

  const excluded: ExcludedClaim[] = matched
    .filter((x) => !x.match.matched && x.match.failedOn)
    .map((x) => ({claim: x.claim, reason: explainExclusion(x.claim.scope, situation, x.match.failedOn!)}))

  const disagreement = distinct(scored) > 1
  const finish = (
    governing: Claim | null,
    method: ResolutionMethod,
    explanation: string,
    opts: {unresolved?: boolean; ruling?: Ruling} = {},
  ): Resolution => {
    const value = governing ? claimValue(governing) : ({kind: 'missing'} as ClaimValue)
    return {
      subject,
      considered: scored,
      excluded,
      governing,
      value,
      formatted: governing ? formatValue(subject, value) : '—',
      method,
      disagreement,
      unresolved: opts.unresolved ?? false,
      appliedRuling: opts.ruling ?? null,
      explanation,
    }
  }

  if (scored.length === 0) {
    return finish(
      null,
      'no-rule',
      'No sourced rule in the dataset covers this combination. Reported as unknown rather than guessed.',
    )
  }

  // A human already looked at this exact conflict. Nothing outranks that.
  if (disagreement) {
    const ids = new Set(scored.map((s) => s.claim._id))
    const ruling = signedRulings.find(
      (r) =>
        r.subject === subject &&
        rulingApplies(r.scope, situation) &&
        ids.has(r.chosenId) &&
        r.conflictingIds.some((id) => ids.has(id)),
    )
    const chosen = ruling && scored.find((s) => s.claim._id === ruling.chosenId)
    if (ruling && chosen) {
      return finish(
        chosen.claim,
        'signed-ruling',
        `${ruling.decidedBy ?? 'A reviewer'} already settled this: ${ruling.rationale}`,
        {ruling},
      )
    }
  }

  const ceilings = scored.filter((s) => s.claim.bindingMode === 'ceiling')
  const floors = scored.filter((s) => s.claim.bindingMode === 'floor')
  const overrides = scored.filter((s) => s.claim.bindingMode === 'override')

  // Resolve each kind on its own terms first, so a fight between two carriers is
  // not confused with a carrier tightening a regulator.
  const overridePick = ladder(subject, overrides)
  const floorPick = ladder(subject, floors)

  let governing: Claim | null
  let method: ResolutionMethod
  let unresolved: boolean
  let explanation: string

  if (overridePick.winner && floorPick.winner) {
    const cmp = compareRestrictiveness(subject, claimValue(overridePick.winner), claimValue(floorPick.winner))
    if (cmp === null) {
      governing = null
      method = 'unresolvable'
      unresolved = true
      explanation =
        'The operator rule and the regulatory baseline cannot be ordered against each other — each is more generous on a different axis. Not guessing.'
    } else if (cmp < 0) {
      governing = overridePick.winner
      method = 'stricter-overlay'
      unresolved = overridePickUnresolved(overridePick)
      explanation = `The regulator sets a baseline and the carrier operating this segment publishes a stricter figure, which is what binds you. The baseline (${formatValue(subject, claimValue(floorPick.winner))}, ${floorPick.winner.source?.publisherName}) is the looser number you will find quoted elsewhere.`
    } else if (cmp > 0) {
      governing = floorPick.winner
      method = 'stricter-overlay'
      unresolved = false
      explanation = `The regulatory baseline is the tighter of the two here, so it governs even though the carrier's own page is more generous.`
    } else {
      governing = overridePick.winner
      method = 'unanimous'
      unresolved = false
      explanation = 'The carrier restates the regulatory baseline. Same figure either way.'
    }
  } else if (overridePick.winner) {
    governing = overridePick.winner
    method = overridePick.method
    unresolved = overridePick.unresolved
    explanation = explain(overridePick.method, overridePick.winner, scored.length)
  } else if (floorPick.winner) {
    governing = floorPick.winner
    method = floorPick.method
    unresolved = floorPick.unresolved
    explanation = explain(floorPick.method, floorPick.winner, scored.length)
  } else if (ceilings.length > 0) {
    const cap = ladder(subject, ceilings)
    governing = cap.winner
    method = 'capped-by-ceiling'
    unresolved = cap.unresolved
    explanation = 'Only an absolute maximum applies here; no operator may permit more than this.'
  } else {
    governing = null
    method = 'unresolvable'
    unresolved = true
    explanation = 'Claims covered this situation but none of them could be ordered. A person needs to rule on this.'
  }

  // A ceiling is the last word, whatever the overlays said.
  if (governing && ceilings.length > 0) {
    const cap = mostRestrictive(
      subject,
      ceilings.map((s) => s.claim),
    )
    if (cap) {
      const cmp = compareRestrictiveness(subject, claimValue(cap), claimValue(governing))
      if (cmp !== null && cmp < 0) {
        return finish(
          cap,
          'capped-by-ceiling',
          `An absolute maximum of ${formatValue(subject, claimValue(cap))} applies and is tighter than what the carrier and regulator baselines resolved to. No operator may permit more.`,
          {unresolved: false},
        )
      }
    }
  }

  return finish(governing, method, explanation, {unresolved})
}

const overridePickUnresolved = (pick: {unresolved: boolean}) => pick.unresolved

function explain(method: ResolutionMethod, winner: Claim, considered: number): string {
  switch (method) {
    case 'sole-source':
      return `One sourced rule covered this situation (${winner.source?.publisherName}).`
    case 'unanimous':
      return `${considered} sources agree. Showing the most specific of them.`
    case 'more-specific':
      return 'Sources disagree, and this is the narrowest rule that covers this flight. The broader ones are listed beneath it.'
    case 'higher-authority':
      return `Sources disagree. Going with the more authoritative document (${winner.source?.docType}).`
    case 'more-recent':
      return `Equally authoritative sources disagree. Using the wording in force from ${winner.effectiveFrom ?? winner.source?.effectiveFrom}.`
    case 'most-restrictive':
      return 'Equally authoritative sources of the same date disagree and nobody has ruled. Showing the tighter figure so the answer is safe to act on, and flagging it for a decision.'
    default:
      return 'Resolved from the claims that cover this situation.'
  }
}
