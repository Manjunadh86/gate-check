/**
 * The seeded dataset.
 *
 * Every `sourceDoc` below is a page that was actually opened and read on
 * 2026-09-26, and every `claim` is a reading of a sentence on that page. Where a
 * page's wording is genuinely ambiguous the claim says so with
 * `confidence: 'uncertain'` and the note explains the ambiguity, rather than
 * quietly picking an interpretation. Where a figure comes from travellers rather
 * than from the carrier it is classified `third-party`, which costs it authority
 * in the resolver.
 *
 * Quotations are kept to the clause that carries the rule. The URL is there so
 * anyone can go and check that the reading is fair.
 *
 * NOTHING HERE IS TRAVEL ADVICE. Policies change; two of these pages changed in
 * 2026 alone. `retrievedAt` is the honest expiry date on every row.
 */

const RETRIEVED = '2026-09-26T00:00:00Z'

// Inches to millimetres, because every source quotes inches and the model stores mm.
const inches = (...v: number[]) => v.map((n) => Math.round(n * 25.4))
const dims = (l: number, w: number, h: number, wheels?: boolean) => {
  const [lengthMm, widthMm, heightMm] = inches(l, w, h) as [number, number, number]
  return {lengthMm, widthMm, heightMm, ...(wheels === undefined ? {} : {wheelsAndHandlesIncluded: wheels})}
}

const ref = (_ref: string) => ({_type: 'reference', _ref})
const refs = (...ids: string[]) => ids.map((id) => ({...ref(id), _key: id.replace(/\./g, '_')}))

// ---------------------------------------------------------------- jurisdictions

export const jurisdictions = [
  {
    _id: 'jur-us',
    _type: 'jurisdiction',
    name: 'United States',
    iso2: 'US',
    regulator: 'FAA / TSA',
    supranational: false,
  },
  {
    _id: 'jur-eu',
    _type: 'jurisdiction',
    name: 'European Union',
    iso2: 'EU',
    regulator: 'EASA',
    supranational: true,
  },
  {
    _id: 'jur-intl',
    _type: 'jurisdiction',
    name: 'International (ICAO/IATA)',
    iso2: 'XX',
    regulator: 'ICAO Technical Instructions, as published by IATA',
    supranational: true,
  },
]

// -------------------------------------------------------------------- carriers

export const carriers = [
  {
    _id: 'car-dl',
    _type: 'carrier',
    name: 'Delta Air Lines',
    iata: 'DL',
    icao: 'DAL',
    country: ref('jur-us'),
    tiers: [
      {_key: 'silver', name: 'Silver Medallion', rank: 1},
      {_key: 'gold', name: 'Gold Medallion', rank: 2},
      {_key: 'platinum', name: 'Platinum Medallion', rank: 3},
      {_key: 'diamond', name: 'Diamond Medallion', rank: 4},
    ],
    regionalPartners: refs('car-9e', 'car-oo'),
  },
  {
    _id: 'car-9e',
    _type: 'carrier',
    name: 'Endeavor Air',
    iata: '9E',
    icao: 'EDV',
    country: ref('jur-us'),
    tiers: [],
  },
  {
    _id: 'car-oo',
    _type: 'carrier',
    name: 'SkyWest Airlines',
    iata: 'OO',
    icao: 'SKW',
    country: ref('jur-us'),
    tiers: [],
  },
  {
    _id: 'car-aa',
    _type: 'carrier',
    name: 'American Airlines',
    iata: 'AA',
    icao: 'AAL',
    country: ref('jur-us'),
    tiers: [
      {_key: 'gold', name: 'Gold', rank: 1},
      {_key: 'platinum', name: 'Platinum', rank: 2},
      {_key: 'platpro', name: 'Platinum Pro', rank: 3},
      {_key: 'exp', name: 'Executive Platinum', rank: 4},
    ],
    regionalPartners: refs('car-oo'),
  },
]

// ------------------------------------------------------------------- aircraft

export const aircraftTypes = [
  {
    _id: 'ac-739',
    _type: 'aircraftType',
    name: 'Boeing 737-900',
    iataCode: '739',
    family: 'narrowbody',
    seats: 180,
    gateCheckLikely: false,
    // No binOpening: no manufacturer figure was found for mainline bins, and a
    // guessed number here would silently become a verdict. Absence is the honest
    // value, and the resolver treats it as "geometry unknown" rather than "fits".
  },
  {
    _id: 'ac-339',
    _type: 'aircraftType',
    name: 'Airbus A330-900neo',
    iataCode: '339',
    family: 'widebody',
    seats: 281,
    gateCheckLikely: false,
  },
  {
    _id: 'ac-321',
    _type: 'aircraftType',
    name: 'Airbus A321',
    iataCode: '321',
    family: 'narrowbody',
    seats: 190,
    gateCheckLikely: false,
  },
  {
    _id: 'ac-crj2',
    _type: 'aircraftType',
    name: 'Bombardier CRJ-200',
    iataCode: 'CR2',
    family: 'regional-jet',
    seats: 50,
    gateCheckLikely: true,
    binOpening: {
      ...dims(18, 14, 7),
      note:
        'Traveller-reported, not a manufacturer figure, and reports disagree — see the two competing claims scoped to this type. Recorded at the larger reported size so the geometry check is not falsely strict.',
    },
  },
  {
    _id: 'ac-crj9',
    _type: 'aircraftType',
    name: 'Bombardier CRJ-900',
    iataCode: 'CR9',
    family: 'regional-jet',
    seats: 76,
    gateCheckLikely: false,
  },
  {
    _id: 'ac-e75',
    _type: 'aircraftType',
    name: 'Embraer E175',
    iataCode: 'E75',
    family: 'regional-jet',
    seats: 76,
    gateCheckLikely: false,
    binOpening: {
      ...dims(18, 13.5, 8.5),
      note: 'Traveller-reported figure for mid-size regional jet bins. Treat as indicative.',
    },
  },
]

// ---------------------------------------------------------------- source docs

export const sourceDocs = [
  {
    _id: 'src-faa-lithium',
    _type: 'sourceDoc',
    title: 'PackSafe — Lithium Batteries',
    url: 'https://www.faa.gov/hazmat/packsafe/lithium-batteries',
    publisherName: 'Federal Aviation Administration',
    docType: 'regulation',
    excerpt:
      'Spare (uninstalled) lithium ion and lithium metal batteries, including power banks and cell phone battery charging cases, must be carried in carry-on baggage only. … The battery terminals must be protected from short circuit.',
    retrievedAt: RETRIEVED,
    effectiveFrom: '2026-08-11',
  },
  {
    _id: 'src-faa-ped',
    _type: 'sourceDoc',
    title: 'PackSafe — Portable Electronic Devices Containing Batteries',
    url: 'https://www.faa.gov/hazmat/packsafe/portable-electronic-devices-with-batteries',
    publisherName: 'Federal Aviation Administration',
    docType: 'regulation',
    excerpt:
      'Devices containing lithium metal or lithium ion batteries (laptops, smartphones, tablets, etc.) should be carried in carry-on baggage. … When portable electronic devices powered by lithium batteries are in checked baggage, they must be completely powered off and protected to prevent unintentional activation or damage.',
    retrievedAt: RETRIEVED,
    effectiveFrom: '2025-09-23',
  },
  {
    _id: 'src-iata-batteries',
    _type: 'sourceDoc',
    title: 'Safe Travel with Lithium Batteries',
    url: 'https://www.iata.org/en/youandiata/travelers/batteries/',
    publisherName: 'International Air Transport Association',
    docType: 'regulator-guidance',
    excerpt:
      'Up to 100 watt-hours (Wh): generally allowed in carry-on baggage. 100–160 Wh: may be allowed with airline approval. Over 160 Wh: usually not permitted on passenger aircraft. … Never place spare batteries or power banks in checked baggage.',
    retrievedAt: RETRIEVED,
  },
  {
    _id: 'src-dl-battery',
    _type: 'sourceDoc',
    title: 'Battery or Fuel-Powered Items',
    url: 'https://www.delta.com/us/en/baggage/prohibited-or-restricted-items/battery-or-fuel-powered',
    publisherName: 'Delta Air Lines',
    publisherCarrier: ref('car-dl'),
    docType: 'help-page',
    excerpt:
      'Spare lithium batteries are allowed in carry-on baggage only with batteries individually protected to prevent short circuit … no more than two (2) spares between 100 and 160-watt hours are allowed.',
    retrievedAt: RETRIEVED,
  },
  {
    _id: 'src-dl-carryon',
    _type: 'sourceDoc',
    title: 'Carry-On Baggage',
    url: 'https://www.delta.com/us/en/baggage/carry-on-baggage',
    publisherName: 'Delta Air Lines',
    publisherCarrier: ref('car-dl'),
    docType: 'help-page',
    excerpt:
      'Passengers traveling on Delta Connection flights, including flights with 50 seats or less, are only permitted to carry personal items on board the aircraft due to limited overhead space.',
    retrievedAt: RETRIEVED,
  },
  {
    _id: 'src-aa-restricted',
    _type: 'sourceDoc',
    title: 'Restricted items in bags — Special Notice: Generator and battery restrictions',
    url: 'https://www.aa.com/i18n/travel-info/baggage/restricted-items.jsp',
    publisherName: 'American Airlines',
    publisherCarrier: ref('car-aa'),
    docType: 'help-page',
    excerpt:
      'Large portable power banks and lithium-ion battery-powered generators are not allowed as carry-on or checked items.',
    retrievedAt: RETRIEVED,
    // Deliberately carries no structured claim. "Large" is not defined anywhere on
    // the page, so there is no number to compute with — this is the prose the
    // Knowledge Base endpoint exists to return.
  },
  {
    _id: 'src-iata-interline',
    _type: 'sourceDoc',
    title: 'Interline Considerations on Baggage Standards (Resolution 302 guidance)',
    url: 'https://www.iata.org/contentassets/e7a533819be440edbb1e49da96e0f2a8/guidance-document-on-baggage-standards-for-interline.pdf',
    publisherName: 'International Air Transport Association',
    docType: 'regulator-guidance',
    excerpt:
      'Where published baggage provisions differ between participating carriers, the provisions of the Most Significant Carrier apply to the whole checked portion of the journey.',
    retrievedAt: RETRIEVED,
  },
  {
    _id: 'src-crj-report-a',
    _type: 'sourceDoc',
    title: 'Traveller thread: 21 × 14 × 7 carry-on on the CRJ-200',
    url: 'https://www.flyertalk.com/forum/united-mileage-plus-pre-merger/949320-21-x-14-x-7-carry-crj-200-a.html',
    publisherName: 'FlyerTalk forum contributors',
    docType: 'third-party',
    excerpt: 'Reports of the largest bag that goes into a CRJ-200 bin, given as roughly 21 × 14 × 7 inches.',
    retrievedAt: RETRIEVED,
  },
  {
    _id: 'src-crj-report-b',
    _type: 'sourceDoc',
    title: 'Traveller thread: regional-jet bins and the bag that would not fit',
    url: 'https://community.ricksteves.com/travel-forum/packing/crj-700-overhead-bins-the-rs-carryon-doesn-t-fit',
    publisherName: 'Rick Steves travel forum contributors',
    docType: 'third-party',
    excerpt: 'Reports of smaller regional-jet bins, given as roughly 18 × 13 × 8 inches.',
    retrievedAt: RETRIEVED,
  },
]

// ------------------------------------------------------------------- claims

type ScopeInput = {
  carriers?: string[]
  aircraftTypes?: string[]
  aircraftFamilies?: string[]
  cabinClasses?: string[]
  fareBrands?: string[]
  jurisdictions?: string[]
  itemCategories?: string[]
  batteryStates?: string[]
  appliesAboveWh?: number
  appliesAtOrBelowWh?: number
  appliesAtOrBelowSeats?: number
  minimumTier?: {carrier: string; tierName: string}
}

const scope = (s: ScopeInput) => ({
  _type: 'scope',
  ...(s.carriers ? {carriers: refs(...s.carriers)} : {}),
  ...(s.aircraftTypes ? {aircraftTypes: refs(...s.aircraftTypes)} : {}),
  ...(s.jurisdictions ? {jurisdictions: refs(...s.jurisdictions)} : {}),
  ...(s.aircraftFamilies ? {aircraftFamilies: s.aircraftFamilies} : {}),
  ...(s.cabinClasses ? {cabinClasses: s.cabinClasses} : {}),
  ...(s.fareBrands ? {fareBrands: s.fareBrands} : {}),
  ...(s.itemCategories ? {itemCategories: s.itemCategories} : {}),
  ...(s.batteryStates ? {batteryStates: s.batteryStates} : {}),
  ...(s.appliesAboveWh !== undefined ? {appliesAboveWh: s.appliesAboveWh} : {}),
  ...(s.appliesAtOrBelowWh !== undefined ? {appliesAtOrBelowWh: s.appliesAtOrBelowWh} : {}),
  ...(s.appliesAtOrBelowSeats !== undefined ? {appliesAtOrBelowSeats: s.appliesAtOrBelowSeats} : {}),
  ...(s.minimumTier
    ? {minimumTier: {_type: 'tierRequirement', carrier: ref(s.minimumTier.carrier), tierName: s.minimumTier.tierName}}
    : {}),
})

const SPARE = ['spare', 'in-power-bank']

export const claims = [
  // ---- FAA, United States. A floor: the page itself invites carriers to be stricter.
  {
    _id: 'clm-faa-cabinonly',
    _type: 'claim',
    subject: 'spareBatteryCabinOnly',
    bindingMode: 'floor',
    booleanValue: true,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE}),
    source: ref('src-faa-lithium'),
    quote: 'Spare (uninstalled) lithium ion and lithium metal batteries … must be carried in carry-on baggage only.',
    confidence: 'stated',
    note: 'Also requires that spares be removed and kept with the passenger if the carry-on is gate-checked — which is exactly what happens on a 50-seat regional jet.',
  },
  {
    _id: 'clm-faa-approval',
    _type: 'claim',
    subject: 'spareBatteryApprovalAboveWh',
    bindingMode: 'floor',
    numberValue: 100,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE}),
    source: ref('src-faa-lithium'),
    quote: 'Lithium ion (rechargeable) batteries are limited to a rating of 100 watt hours (Wh) per battery.',
    confidence: 'stated',
  },
  {
    _id: 'clm-faa-ceiling',
    _type: 'claim',
    subject: 'spareBatteryMaxWh',
    bindingMode: 'ceiling',
    numberValue: 160,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE}),
    source: ref('src-faa-lithium'),
    quote: 'With airline approval, passengers may also carry up to two spare larger lithium ion batteries (exceeding 101–160 Wh).',
    confidence: 'stated',
    note: 'Marked as a ceiling: no operator may permit more, so it caps whatever the carrier overlays resolve to.',
  },
  {
    _id: 'clm-faa-count',
    _type: 'claim',
    subject: 'spareBatteryMaxCount',
    bindingMode: 'floor',
    numberValue: 2,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE, appliesAboveWh: 100}),
    source: ref('src-faa-lithium'),
    quote: 'There is a limit of two spare batteries per person for the larger lithium ion batteries … (exceeding 101–160 Wh per battery).',
    confidence: 'stated',
    note: 'Scoped above 100 Wh deliberately. The same page says there is no quantity limit for ordinary cells, so an unscoped version of this claim would wrongly cap a passenger at two phone batteries.',
  },
  {
    _id: 'clm-faa-terminals',
    _type: 'claim',
    subject: 'powerBankTerminalProtectionRequired',
    bindingMode: 'floor',
    booleanValue: true,
    scope: scope({jurisdictions: ['jur-us'], itemCategories: ['power-bank']}),
    source: ref('src-faa-lithium'),
    quote: 'The battery terminals must be protected from short circuit.',
    confidence: 'stated',
  },

  {
    // The rule that joins the two halves of this app together: it only fires when
    // you know the bag is going to be gate-checked, which you only know from the
    // aircraft and the carrier's own regional policy.
    _id: 'clm-faa-gatecheck-spares',
    _type: 'claim',
    subject: 'spareMustLeaveGateCheckedBag',
    bindingMode: 'floor',
    booleanValue: true,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE}),
    source: ref('src-faa-lithium'),
    quote: 'When a carry-on bag is checked at the gate or at planeside, all spare lithium batteries and power banks must be removed from the bag and kept with the passenger in the aircraft cabin.',
    confidence: 'stated',
  },
  {
    _id: 'clm-faa-ped-gatecheck',
    _type: 'claim',
    subject: 'spareMustLeaveGateCheckedBag',
    bindingMode: 'floor',
    booleanValue: true,
    scope: scope({jurisdictions: ['jur-us'], batteryStates: SPARE}),
    source: ref('src-faa-ped'),
    quote: 'When a carry-on bag is checked at the gate or at planeside, any spare lithium batteries must be removed from the bag and kept with the passenger in the aircraft cabin.',
    confidence: 'stated',
    note: 'Two FAA pages state the same rule in almost the same words. Kept as two claims rather than one so the resolver reports "unanimous" rather than "sole-source" \u2014 a rule stated twice by the regulator is worth knowing about.',
  },

  // ---- IATA, worldwide. Same floor, no jurisdiction scope, so it covers routes the FAA does not.
  {
    _id: 'clm-iata-approval',
    _type: 'claim',
    subject: 'spareBatteryApprovalAboveWh',
    bindingMode: 'floor',
    numberValue: 100,
    scope: scope({batteryStates: SPARE}),
    source: ref('src-iata-batteries'),
    quote: '100–160 Wh: may be allowed with airline approval.',
    confidence: 'stated',
  },
  {
    _id: 'clm-iata-ceiling',
    _type: 'claim',
    subject: 'spareBatteryMaxWh',
    bindingMode: 'ceiling',
    numberValue: 160,
    scope: scope({batteryStates: SPARE}),
    source: ref('src-iata-batteries'),
    quote: 'Over 160 Wh: usually not permitted on passenger aircraft.',
    confidence: 'stated',
  },
  {
    _id: 'clm-iata-cabinonly',
    _type: 'claim',
    subject: 'spareBatteryCabinOnly',
    bindingMode: 'floor',
    booleanValue: true,
    scope: scope({batteryStates: SPARE}),
    source: ref('src-iata-batteries'),
    quote: 'Never place spare batteries or power banks in checked baggage.',
    confidence: 'stated',
  },

  // ---- Delta, battery page. Overrides: the carrier's own figures for its own operation.
  {
    _id: 'clm-dl-maxwh',
    _type: 'claim',
    subject: 'spareBatteryMaxWh',
    bindingMode: 'override',
    numberValue: 160,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], batteryStates: SPARE}),
    source: ref('src-dl-battery'),
    quote: 'lithium ion batteries that contain a maximum of 160-watt hours per battery',
    confidence: 'stated',
  },
  {
    _id: 'clm-dl-count',
    _type: 'claim',
    subject: 'spareBatteryMaxCount',
    bindingMode: 'override',
    numberValue: 2,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], batteryStates: SPARE, appliesAboveWh: 100}),
    source: ref('src-dl-battery'),
    quote: 'no more than two (2) spares between 100 and 160-watt hours are allowed',
    confidence: 'stated',
  },
  {
    // The claim the whole demo turns on. Delta's page caps power banks lower than
    // it caps the identical cell sold as a camera battery.
    _id: 'clm-dl-pb-wh',
    _type: 'claim',
    subject: 'spareBatteryMaxWh',
    bindingMode: 'override',
    numberValue: 100,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], itemCategories: ['power-bank']}),
    source: ref('src-dl-battery'),
    quote: 'No more than two power banks may be carried per person, and they may not exceed an aggregate total of 100 Wh each',
    confidence: 'uncertain',
    note:
      '"an aggregate total of 100 Wh each" is ambiguous: it can be read as 100 Wh per unit, or as 100 Wh across both. Recorded as the per-unit reading because that is the stricter of the two and the one a gate agent is likeliest to apply — but recorded as uncertain, and there is an open proposed ruling asking a human to settle it rather than pretending the sentence is clear.',
  },
  {
    _id: 'clm-dl-pb-count',
    _type: 'claim',
    subject: 'spareBatteryMaxCount',
    bindingMode: 'override',
    numberValue: 2,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], itemCategories: ['power-bank']}),
    source: ref('src-dl-battery'),
    quote: 'No more than two power banks may be carried per person',
    confidence: 'stated',
    note: 'Applies at any watt-hour rating, unlike the regulator’s two-spare limit which only bites above 100 Wh. This is the carrier being stricter in a way the FAA page explicitly anticipates.',
  },
  {
    _id: 'clm-dl-cabinonly',
    _type: 'claim',
    subject: 'spareBatteryCabinOnly',
    bindingMode: 'override',
    booleanValue: true,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], batteryStates: SPARE}),
    source: ref('src-dl-battery'),
    quote: 'Spare lithium batteries are allowed in carry-on baggage only',
    confidence: 'stated',
  },

  // ---- Delta, carry-on page.
  {
    _id: 'clm-dl-dims',
    _type: 'claim',
    subject: 'carryOnMaxDimensionsMm',
    bindingMode: 'override',
    dimensionsValue: {_type: 'dimensionsMm', ...dims(22, 14, 9, true)},
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo']}),
    source: ref('src-dl-carryon'),
    quote: 'Individual length, width and height measurements may not exceed 22" x 14" x 9" … include any handles or wheels',
    confidence: 'stated',
  },
  {
    _id: 'clm-dl-pieces',
    _type: 'claim',
    subject: 'carryOnPieceCount',
    bindingMode: 'override',
    numberValue: 1,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo']}),
    source: ref('src-dl-carryon'),
    quote: '1 carry-on bag and 1 personal item free of charge',
    confidence: 'stated',
  },
  {
    _id: 'clm-dl-personal',
    _type: 'claim',
    subject: 'personalItemAllowed',
    bindingMode: 'override',
    booleanValue: true,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo']}),
    source: ref('src-dl-carryon'),
    quote: '1 carry-on bag and 1 personal item free of charge',
    confidence: 'stated',
  },
  {
    // The second claim the demo turns on. Same airline, same ticket, zero cabin bags.
    _id: 'clm-dl-conn-pieces',
    _type: 'claim',
    subject: 'carryOnPieceCount',
    bindingMode: 'override',
    numberValue: 0,
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], appliesAtOrBelowSeats: 50}),
    source: ref('src-dl-carryon'),
    quote: 'Passengers traveling on Delta Connection flights, including flights with 50 seats or less, are only permitted to carry personal items on board',
    confidence: 'stated',
    note: 'Scoped by seat count because that is how the source writes it. Any 50-seat type added to the dataset inherits this automatically.',
  },

  // ---- Traveller reports about what physically fits. Low authority, and they disagree
  //      in a way that cannot be ordered: one is longer, the other is deeper.
  {
    _id: 'clm-crj-a-dims',
    _type: 'claim',
    subject: 'carryOnMaxDimensionsMm',
    bindingMode: 'override',
    dimensionsValue: {_type: 'dimensionsMm', ...dims(21, 14, 7)},
    scope: scope({aircraftTypes: ['ac-crj2']}),
    source: ref('src-crj-report-a'),
    quote: 'Reported largest bag to go into a CRJ-200 bin: about 21 × 14 × 7 inches.',
    confidence: 'uncertain',
  },
  {
    _id: 'clm-crj-b-dims',
    _type: 'claim',
    subject: 'carryOnMaxDimensionsMm',
    bindingMode: 'override',
    dimensionsValue: {_type: 'dimensionsMm', ...dims(18, 13, 8)},
    scope: scope({aircraftTypes: ['ac-crj2']}),
    source: ref('src-crj-report-b'),
    quote: 'Reported regional-jet bin capacity: about 18 × 13 × 8 inches.',
    confidence: 'uncertain',
    note: 'Deeper but shorter than the other report. Neither fits inside the other, so the resolver refuses to order them and asks for a ruling instead of splitting the difference.',
  },
]

// ------------------------------------------------------------------ rulings

export const rulings = [
  {
    _id: 'rul-pb-wh',
    _type: 'ruling',
    subject: 'spareBatteryMaxWh',
    scope: scope({carriers: ['car-dl', 'car-9e', 'car-oo'], itemCategories: ['power-bank']}),
    conflicting: refs('clm-dl-maxwh', 'clm-dl-pb-wh'),
    chosen: ref('clm-dl-pb-wh'),
    rationale:
      'Delta caps batteries at 160 Wh generally but writes "they may not exceed an aggregate total of 100 Wh each" about power banks specifically. The sentence can be read two ways. Proposing the per-unit reading at 100 Wh: it is the stricter one, and a traveller turned away at the gate is worse off than one who left a power bank at home. Needs a named person to sign before it binds.',
    status: 'proposed',
    proposedByAgent: true,
  },
  {
    _id: 'rul-crj-dims',
    _type: 'ruling',
    subject: 'carryOnMaxDimensionsMm',
    scope: scope({aircraftTypes: ['ac-crj2']}),
    conflicting: refs('clm-crj-a-dims', 'clm-crj-b-dims'),
    chosen: ref('clm-crj-b-dims'),
    rationale:
      'Two traveller reports of CRJ-200 bin capacity, one longer and one deeper, so neither contains the other and the resolver correctly refuses to pick. Proposing the 18 × 13 × 8 reading: depth is the axis that actually stops a bag entering these bins. Both figures are traveller-reported and neither should be treated as authoritative — the better fix is a manufacturer or carrier source.',
    status: 'proposed',
    proposedByAgent: true,
  },
]

// -------------------------------------------------------------- itineraries

const seg = (o: {
  key: string
  marketing: string
  operating: string
  flightNumber: string
  aircraft: string
  from: string
  to: string
  jurisdictions: string[]
  cabinClass?: string
  fareBrand?: string
}) => ({
  _key: o.key,
  _type: 'segment',
  marketingCarrier: ref(o.marketing),
  operatingCarrier: ref(o.operating),
  flightNumber: o.flightNumber,
  aircraftType: ref(o.aircraft),
  originIata: o.from,
  destinationIata: o.to,
  jurisdictions: refs(...o.jurisdictions),
  cabinClass: o.cabinClass ?? 'economy',
  fareBrand: o.fareBrand ?? 'Main Cabin',
})

export const itineraries = [
  {
    _id: 'itn-dl-regional',
    _type: 'itinerary',
    label: 'JFK → ATL → TYS — one ticket, two different sets of rules',
    travelDate: '2026-10-20',
    segments: [
      seg({key: 's1', marketing: 'car-dl', operating: 'car-dl', flightNumber: '1421', aircraft: 'ac-739', from: 'JFK', to: 'ATL', jurisdictions: ['jur-us']}),
      seg({key: 's2', marketing: 'car-dl', operating: 'car-9e', flightNumber: '4921', aircraft: 'ac-crj2', from: 'ATL', to: 'TYS', jurisdictions: ['jur-us']}),
    ],
    teachingPoint:
      'Both segments say Delta on the boarding pass. The second is flown by Endeavor Air on a 50-seat CRJ-200, where Delta’s own carry-on page permits personal items only. A bag that is perfectly legal on the way out cannot come into the cabin on the way home — and once it is gate-checked, the FAA requires every spare battery to come out of it first.',
  },
  {
    _id: 'itn-dl-drone',
    _type: 'itinerary',
    label: 'SEA → AMS — widebody, camera and drone kit',
    travelDate: '2026-11-02',
    segments: [
      seg({key: 's1', marketing: 'car-dl', operating: 'car-dl', flightNumber: '132', aircraft: 'ac-339', from: 'SEA', to: 'AMS', jurisdictions: ['jur-us', 'jur-eu', 'jur-intl']}),
    ],
    teachingPoint:
      'A single long-haul segment, but the kit is the interesting part. A 137 Wh cell needs the operating carrier’s approval; three of them break the two-spare limit; and the identical 137 Wh sold as a power bank is refused outright because Delta caps power banks lower than it caps camera batteries.',
  },
  {
    _id: 'itn-aa-generator',
    _type: 'itinerary',
    label: 'DFW → ORD — American, with a portable power station',
    travelDate: '2026-10-10',
    segments: [
      seg({key: 's1', marketing: 'car-aa', operating: 'car-aa', flightNumber: '2411', aircraft: 'ac-321', from: 'DFW', to: 'ORD', jurisdictions: ['jur-us']}),
    ],
    teachingPoint:
      'The case where structured claims run out. American’s notice bans "large portable power banks" without defining large, so there is no number to compute with. The regulatory ceiling still answers the question, and the Knowledge Base supplies the carrier prose that no GROQ query could have returned.',
  },
]

// ---------------------------------------------------------------- bag items

const item = (o: {
  id: string
  label: string
  category: string
  dims?: [number, number, number]
  massKg?: number
  wattHours?: number
  batteryState?: string
  quantity?: number
  carriedIn?: string
}) => ({
  _id: o.id,
  _type: 'bagItem',
  label: o.label,
  category: o.category,
  ...(o.dims ? {dimensionsMm: {_type: 'dimensionsMm', ...dims(...(o.dims as [number, number, number]))}} : {}),
  ...(o.massKg !== undefined ? {massKg: o.massKg} : {}),
  ...(o.wattHours !== undefined ? {wattHours: o.wattHours} : {}),
  batteryState: o.batteryState ?? 'none',
  quantity: o.quantity ?? 1,
  carriedIn: o.carriedIn ?? 'cabin',
})

export const bagItems = [
  item({id: 'itm-rollaboard', label: 'Roll-aboard, exactly 22 × 14 × 9 in', category: 'cabin-bag', dims: [22, 14, 9], massKg: 8.5}),
  item({id: 'itm-smallcase', label: 'Small case, 18 × 13 × 7 in', category: 'cabin-bag', dims: [18, 13, 7], massKg: 6}),
  item({id: 'itm-backpack', label: 'Backpack (personal item)', category: 'personal-item', dims: [16, 12, 8], massKg: 4}),
  item({id: 'itm-laptop', label: 'Laptop, 99 Wh battery installed', category: 'laptop', wattHours: 99, batteryState: 'installed'}),
  item({id: 'itm-pb99', label: 'Power bank, 99 Wh', category: 'power-bank', wattHours: 99, batteryState: 'in-power-bank'}),
  item({id: 'itm-pb99x3', label: 'Power banks, 99 Wh × 3', category: 'power-bank', wattHours: 99, batteryState: 'in-power-bank', quantity: 3}),
  item({id: 'itm-pb137', label: 'Power bank, 137 Wh', category: 'power-bank', wattHours: 137, batteryState: 'in-power-bank'}),
  item({id: 'itm-cine137', label: 'Cine camera battery, 137 Wh spare', category: 'camera-battery', wattHours: 137, batteryState: 'spare'}),
  item({id: 'itm-cine137x3', label: 'Cine camera batteries, 137 Wh × 3 spare', category: 'camera-battery', wattHours: 137, batteryState: 'spare', quantity: 3}),
  item({id: 'itm-cam16x4', label: 'Mirrorless camera batteries, 16 Wh × 4 spare', category: 'camera-battery', wattHours: 16, batteryState: 'spare', quantity: 4}),
  item({id: 'itm-drone', label: 'Drone flight pack, 137 Wh spare', category: 'drone-battery', wattHours: 137, batteryState: 'spare', quantity: 2}),
  item({id: 'itm-cam16checked', label: 'Camera battery, 16 Wh spare, packed in the checked bag', category: 'camera-battery', wattHours: 16, batteryState: 'spare', carriedIn: 'checked'}),
  item({id: 'itm-vape', label: 'Vape, packed in the checked bag', category: 'ecig', wattHours: 10, batteryState: 'installed', carriedIn: 'checked'}),
  item({id: 'itm-station', label: 'Portable power station, 768 Wh', category: 'power-bank', wattHours: 768, batteryState: 'in-power-bank'}),
  item({id: 'itm-smartbag', label: 'Smart bag with integrated battery', category: 'smart-bag', dims: [21, 14, 9], massKg: 9, wattHours: 40, batteryState: 'installed'}),
]

// --------------------------------------------------------------------- all

/** Insertion order matters: referenced documents must exist before referrers. */
export const allDocuments = [
  ...jurisdictions,
  ...carriers,
  ...aircraftTypes,
  ...sourceDocs,
  ...claims,
  ...rulings,
  ...itineraries,
  ...bagItems,
]
