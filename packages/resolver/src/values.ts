import {
  SUBJECT_RESTRICTIVE_DIRECTION,
  SUBJECT_VALUE_TYPE,
  type Claim,
  type ClaimSubject,
  type Dimensions,
} from '@gate-check/content-model'

/** The comparable payload of a claim, independent of which field it was stored in. */
export type ClaimValue =
  | {kind: 'dimensions'; dims: Dimensions}
  | {kind: 'number'; n: number}
  | {kind: 'boolean'; b: boolean}
  | {kind: 'missing'}

export function claimValue(claim: Claim): ClaimValue {
  switch (SUBJECT_VALUE_TYPE[claim.subject]) {
    case 'dimensions':
      return claim.dimensionsValue ? {kind: 'dimensions', dims: claim.dimensionsValue} : {kind: 'missing'}
    case 'mass':
      return typeof claim.massKgValue === 'number' ? {kind: 'number', n: claim.massKgValue} : {kind: 'missing'}
    case 'number':
      return typeof claim.numberValue === 'number' ? {kind: 'number', n: claim.numberValue} : {kind: 'missing'}
    case 'boolean':
      return typeof claim.booleanValue === 'boolean' ? {kind: 'boolean', b: claim.booleanValue} : {kind: 'missing'}
  }
}

/** Stable key for "are these two claims saying the same thing". */
export function valueKey(v: ClaimValue): string {
  switch (v.kind) {
    case 'dimensions':
      return `d:${v.dims.lengthMm}x${v.dims.widthMm}x${v.dims.heightMm}`
    case 'number':
      return `n:${v.n}`
    case 'boolean':
      return `b:${v.b}`
    case 'missing':
      return 'missing'
  }
}

export function formatValue(subject: ClaimSubject, v: ClaimValue): string {
  switch (v.kind) {
    case 'dimensions':
      return `${v.dims.lengthMm} × ${v.dims.widthMm} × ${v.dims.heightMm} mm`
    case 'number':
      return SUBJECT_VALUE_TYPE[subject] === 'mass' ? `${v.n} kg` : String(v.n)
    case 'boolean':
      return v.b ? 'yes' : 'no'
    case 'missing':
      return '—'
  }
}

/** Axes sorted longest-first, so a bag is measured the way it is actually turned to go in. */
export const sortedAxes = (d: Dimensions): [number, number, number] => {
  const a = [d.lengthMm, d.widthMm, d.heightMm].sort((x, y) => y - x)
  return [a[0]!, a[1]!, a[2]!]
}

/** True when `inner` fits inside `outer` in some orientation. */
export function fitsWithin(inner: Dimensions, outer: Dimensions): boolean {
  const i = sortedAxes(inner)
  const o = sortedAxes(outer)
  return i[0] <= o[0] && i[1] <= o[1] && i[2] <= o[2]
}

/**
 * Which of two competing claims is the more restrictive?
 *
 * Used only as the last resort, when sources disagree and nobody has ruled. We
 * would rather tell a traveller a limit that is tighter than the truth than
 * watch them hand a battery over at the gate — but the UI always says that is
 * what happened, because quietly choosing is how you lose someone's trust.
 *
 * Returns a negative number when `a` is more restrictive than `b`, positive when
 * `b` is, and `null` when the two genuinely cannot be ordered — two dimension
 * sets where each is larger on a different axis. An unorderable pair stays
 * unresolved rather than being forced.
 */
export function compareRestrictiveness(subject: ClaimSubject, a: ClaimValue, b: ClaimValue): number | null {
  const direction = SUBJECT_RESTRICTIVE_DIRECTION[subject]

  if (a.kind === 'boolean' && b.kind === 'boolean') {
    if (a.b === b.b) return 0
    // For these subjects the restrictive reading is the one that constrains:
    // "cabin only = yes" restricts more than "no"; "personal item allowed = no"
    // restricts more than "yes".
    const restrictiveIsTrue = direction === 'true' && subject !== 'personalItemAllowed'
    if (restrictiveIsTrue) return a.b ? -1 : 1
    return a.b ? 1 : -1
  }

  if (a.kind === 'number' && b.kind === 'number') {
    if (a.n === b.n) return 0
    return direction === 'lower' ? a.n - b.n : b.n - a.n
  }

  if (a.kind === 'dimensions' && b.kind === 'dimensions') {
    const fitsAInB = fitsWithin(a.dims, b.dims)
    const fitsBInA = fitsWithin(b.dims, a.dims)
    if (fitsAInB && fitsBInA) return 0
    if (fitsAInB) return -1 // a is the smaller allowance
    if (fitsBInA) return 1
    return null // larger on one axis, smaller on another — not orderable
  }

  return null
}

/** The claim whose value is most restrictive, or null if the set cannot be ordered. */
export function mostRestrictive(subject: ClaimSubject, claims: Claim[]): Claim | null {
  let winner: Claim | null = null
  for (const candidate of claims) {
    if (!winner) {
      winner = candidate
      continue
    }
    const cmp = compareRestrictiveness(subject, claimValue(candidate), claimValue(winner))
    if (cmp === null) return null
    if (cmp < 0) winner = candidate
  }
  return winner
}
