import type {Outcome} from '@gate-check/resolver'

/**
 * Known-answer cases.
 *
 * Each expectation was worked out by hand from the quoted clauses in
 * `seed/content.ts` before the engine was run against it. Several are here
 * specifically to catch the failure modes that would make this app worse than a
 * search engine: answering the same question the same way on two different
 * aeroplanes, treating two identical cells alike by accident, or inventing a limit
 * where the corpus is silent.
 */
export interface Case {
  id: string
  why: string
  itineraryId: string
  itemIds: string[]
  /** Expected worst outcome per segment index. */
  expect: Record<number, Outcome>
  /** At least one finding on these segments must be flagged as an open conflict. */
  expectUnresolvedOn?: number[]
  /** The answer must differ between segments — the whole premise of the app. */
  mustDifferAcrossSegments?: boolean
  /** A conditions-level instruction must be raised on these segments. */
  expectConditionOn?: number[]
}

export const CASES: Case[] = [
  {
    id: 'roll-aboard-legal-out-refused-home',
    why: 'Delta permits a 22x14x9 in bag, and Delta’s own page permits no cabin bag at all on a 50-seat Connection flight. One ticket, two answers.',
    itineraryId: 'itn.dl.regional',
    itemIds: ['itm.rollaboard'],
    expect: {0: 'allowed', 1: 'prohibited'},
    mustDifferAcrossSegments: true,
  },
  {
    id: 'power-bank-137-refused',
    why: 'The FAA ceiling is 160 Wh, but Delta caps power banks at 100 Wh each. The stricter carrier overlay must win despite the FAA outranking it.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.pb137'],
    expect: {0: 'prohibited'},
  },
  {
    id: 'identical-cell-as-camera-battery-only-needs-approval',
    why: 'Same 137 Wh, different category, different answer. If these two agree, the category scoping has stopped working and the app is guessing.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.cine137'],
    expect: {0: 'approval-required'},
  },
  {
    id: 'three-large-spares-exceed-the-count',
    why: 'Two spares above 100 Wh is the limit, from both the FAA and Delta.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.cine137x3'],
    expect: {0: 'prohibited'},
  },
  {
    id: 'four-small-spares-are-fine',
    why: 'The two-spare limit is scoped above 100 Wh. Four 16 Wh cells must not trip it — the control case for the watt-hour band.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.cam16x4'],
    expect: {0: 'allowed'},
  },
  {
    id: 'spare-in-checked-baggage-refused',
    why: 'A 16 Wh cell is trivially legal in the cabin and prohibited in the hold. Placement, not capacity.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.cam16checked'],
    expect: {0: 'prohibited'},
  },
  {
    id: 'power-station-refused-by-the-ceiling-where-the-carrier-is-silent',
    why: 'American publishes no watt-hour figure this engine can compute with. The regulatory ceiling still answers, and the carrier prose belongs in the Knowledge Base.',
    itineraryId: 'itn.aa.generator',
    itemIds: ['itm.station'],
    expect: {0: 'prohibited'},
  },
  {
    id: 'vape-has-no-sourced-rule-and-says-so',
    why: 'Nothing in the corpus covers vapes. The engine must report unknown rather than reason from what it happens to know about aviation.',
    itineraryId: 'itn.dl.regional',
    itemIds: ['itm.vape'],
    expect: {0: 'unknown', 1: 'unknown'},
  },
  {
    id: 'crj-bin-reports-cannot-be-ordered',
    why: 'Two traveller reports of CRJ-200 bin size, one longer and one deeper. The engine must refuse to pick and flag it for a ruling.',
    itineraryId: 'itn.dl.regional',
    itemIds: ['itm.smallcase'],
    expect: {0: 'allowed', 1: 'prohibited'},
    expectUnresolvedOn: [1],
  },
  {
    id: 'laptop-installed-battery-does-not-trip-the-spare-rules',
    why: 'Neither FAA page sets a watt-hour ceiling for a battery installed in a device \u2014 both defer to the spare-battery entries. So the corpus is genuinely silent and "unknown" is the correct answer, not "allowed". This case exists to keep it that way: the moment it reports allowed, the engine has started asserting things no source says.',
    itineraryId: 'itn.dl.drone',
    itemIds: ['itm.laptop'],
    expect: {0: 'unknown'},
  },
  {
    id: 'gate-checked-bag-forces-the-batteries-out',
    why: 'Three facts from three documents have to line up: the CRJ-200 will not take the bag, the traveller has spare cells in it, and the FAA requires spares to stay in the cabin when a bag is checked at the door. No single page says this.',
    itineraryId: 'itn.dl.regional',
    itemIds: ['itm.rollaboard', 'itm.cam16x4'],
    expect: {0: 'allowed', 1: 'prohibited'},
    expectConditionOn: [1],
  },
]
