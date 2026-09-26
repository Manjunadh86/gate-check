import {defineField, defineType} from 'sanity'
import {
  AIRCRAFT_FAMILIES,
  BATTERY_STATES,
  CABIN_CLASSES,
  ITEM_CATEGORIES,
} from '../vocabulary.ts'

/**
 * `dimensionsMm` — millimetres, always. Sources quote centimetres, inches and
 * "linear inches" interchangeably; normalising at the point of entry is the
 * only way two claims from two continents can be compared at all.
 */
export const dimensionsMm = defineType({
  name: 'dimensionsMm',
  title: 'Dimensions (mm)',
  type: 'object',
  fields: [
    defineField({name: 'lengthMm', title: 'Length', type: 'number', validation: (r) => r.required().positive()}),
    defineField({name: 'widthMm', title: 'Width', type: 'number', validation: (r) => r.required().positive()}),
    defineField({name: 'heightMm', title: 'Height', type: 'number', validation: (r) => r.required().positive()}),
    defineField({
      name: 'wheelsAndHandlesIncluded',
      title: 'Includes wheels and handles',
      type: 'boolean',
      description:
        'Carriers differ on this and it is worth 20–40 mm. If the source does not say, leave it unset rather than guessing.',
    }),
  ],
  preview: {
    select: {l: 'lengthMm', w: 'widthMm', h: 'heightMm'},
    prepare: ({l, w, h}) => ({title: `${l ?? '?'} × ${w ?? '?'} × ${h ?? '?'} mm`}),
  },
})

/**
 * `scope` — the situation in which a claim or a ruling applies.
 *
 * This is the load-bearing object of the whole model. An empty array means
 * "any", so a regulator claim with an empty scope applies everywhere, and a
 * carrier claim naming one aircraft type applies to exactly that metal. The
 * resolver counts how many of these facets are populated to decide which of two
 * competing claims is the more specific, so adding a facet here changes how
 * conflicts resolve everywhere.
 */
export const scope = defineType({
  name: 'scope',
  title: 'Applies when',
  type: 'object',
  description: 'Leave a facet empty to mean "any". Every populated facet narrows the claim and raises its specificity.',
  options: {collapsible: true, collapsed: false},
  fields: [
    defineField({
      name: 'carriers',
      title: 'Operating carriers',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'carrier'}]}],
      description:
        'The carrier that operates the flight, not the one that sold the ticket. This distinction is the entire point of the app.',
    }),
    defineField({
      name: 'aircraftFamilies',
      title: 'Aircraft families',
      type: 'array',
      of: [{type: 'string'}],
      options: {list: AIRCRAFT_FAMILIES.map((v) => ({title: v, value: v})), layout: 'grid'},
    }),
    defineField({
      name: 'aircraftTypes',
      title: 'Specific aircraft types',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'aircraftType'}]}],
    }),
    defineField({
      name: 'cabinClasses',
      title: 'Cabin classes',
      type: 'array',
      of: [{type: 'string'}],
      options: {list: CABIN_CLASSES.map((v) => ({title: v, value: v})), layout: 'grid'},
    }),
    defineField({
      name: 'fareBrands',
      title: 'Fare brands',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Free text because carriers rename these constantly. e.g. "Basic Economy", "Light".',
    }),
    defineField({
      name: 'minimumTier',
      title: 'Minimum loyalty tier',
      type: 'tierRequirement',
    }),
    defineField({
      name: 'jurisdictions',
      title: 'Jurisdictions touched by the route',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'jurisdiction'}]}],
      description:
        'A claim scoped to a jurisdiction applies if the segment departs from, arrives in, or overflies it.',
    }),
    defineField({
      name: 'itemCategories',
      title: 'Item categories',
      type: 'array',
      of: [{type: 'string'}],
      options: {list: ITEM_CATEGORIES.map((v) => ({title: v, value: v})), layout: 'grid'},
    }),
    defineField({
      name: 'appliesAtOrBelowSeats',
      title: 'Applies only on aircraft with at most (seats)',
      type: 'number',
      description:
        'Delta writes its regional-jet restriction as "flights with 50 seats or less". Scoping by seat count rather than by listing aircraft types means a newly added 50-seat type inherits the rule instead of quietly escaping it.',
    }),
    defineField({
      name: 'appliesAboveWh',
      title: 'Applies only above (Wh)',
      type: 'number',
      description:
        'Exclusive lower bound on the item’s watt-hour rating. The FAA limits spares to two per person only above 100 Wh — without this facet the same rule would cap a passenger at two phone batteries.',
    }),
    defineField({
      name: 'appliesAtOrBelowWh',
      title: 'Applies only at or below (Wh)',
      type: 'number',
      description: 'Inclusive upper bound on the item’s watt-hour rating.',
    }),
    defineField({
      name: 'batteryStates',
      title: 'Battery states',
      type: 'array',
      of: [{type: 'string'}],
      options: {list: BATTERY_STATES.map((v) => ({title: v, value: v})), layout: 'grid'},
      description: 'A cell installed in a device is regulated differently from the identical cell carried loose.',
    }),
  ],
})

export const tierRequirement = defineType({
  name: 'tierRequirement',
  title: 'Tier requirement',
  type: 'object',
  fields: [
    defineField({name: 'carrier', type: 'reference', to: [{type: 'carrier'}]}),
    defineField({
      name: 'tierName',
      type: 'string',
      description: 'Must match a tier name on the referenced carrier.',
    }),
  ],
})

/** A bin opening. Policy says a bag is legal; geometry says whether it goes up there. */
export const binOpening = defineType({
  name: 'binOpening',
  title: 'Overhead bin opening',
  type: 'object',
  fields: [
    defineField({name: 'lengthMm', type: 'number'}),
    defineField({name: 'widthMm', type: 'number'}),
    defineField({name: 'heightMm', type: 'number'}),
    defineField({
      name: 'note',
      type: 'text',
      rows: 2,
      description: 'Where the figure came from, and which bins on the aircraft it describes.',
    }),
  ],
})
