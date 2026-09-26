import {defineArrayMember, defineField, defineType} from 'sanity'
import {BATTERY_STATES, CABIN_CLASSES, ITEM_CATEGORIES} from '../vocabulary.ts'

/**
 * `segment` — where the marketing/operating split lives.
 *
 * A ticket sold by one carrier and flown by another is the ordinary case, not an
 * edge case, and the allowance follows the metal. Keeping both carriers on the
 * segment is what lets the app tell you that the answer you found on the website
 * you booked from was the wrong website.
 */
const segment = defineArrayMember({
  type: 'object',
  name: 'segment',
  fields: [
    defineField({
      name: 'marketingCarrier',
      title: 'Ticketed by',
      type: 'reference',
      to: [{type: 'carrier'}],
      validation: (r) => r.required(),
      description: 'Whose flight number is on your booking.',
    }),
    defineField({
      name: 'operatingCarrier',
      title: 'Operated by',
      type: 'reference',
      to: [{type: 'carrier'}],
      validation: (r) => r.required(),
      description: 'Whose aeroplane and whose baggage rules. This is the one that counts.',
    }),
    defineField({name: 'flightNumber', type: 'string'}),
    defineField({name: 'aircraftType', type: 'reference', to: [{type: 'aircraftType'}], validation: (r) => r.required()}),
    defineField({name: 'originIata', title: 'From (IATA)', type: 'string', validation: (r) => r.required().uppercase().length(3)}),
    defineField({name: 'destinationIata', title: 'To (IATA)', type: 'string', validation: (r) => r.required().uppercase().length(3)}),
    defineField({
      name: 'jurisdictions',
      title: 'Jurisdictions touched',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'jurisdiction'}]}],
      validation: (r) => r.required().min(1),
    }),
    defineField({
      name: 'cabinClass',
      type: 'string',
      options: {list: CABIN_CLASSES.map((v) => ({title: v, value: v}))},
      validation: (r) => r.required(),
    }),
    defineField({name: 'fareBrand', type: 'string'}),
  ],
  preview: {
    select: {
      mk: 'marketingCarrier.iata',
      op: 'operatingCarrier.iata',
      fn: 'flightNumber',
      from: 'originIata',
      to: 'destinationIata',
      ac: 'aircraftType.name',
    },
    prepare: ({mk, op, fn, from, to, ac}) => ({
      title: `${mk ?? '??'}${fn ?? ''} ${from ?? '???'} → ${to ?? '???'}`,
      subtitle: [op && mk && op !== mk ? `operated by ${op}` : null, ac].filter(Boolean).join(' · '),
    }),
  },
})

export const itinerary = defineType({
  name: 'itinerary',
  title: 'Itinerary',
  type: 'document',
  fields: [
    defineField({name: 'label', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'travelDate',
      type: 'date',
      validation: (r) => r.required(),
      description: 'Which rules were in force. A claim that expired last month must not answer a question about next week.',
    }),
    defineField({name: 'segments', type: 'array', of: [segment], validation: (r) => r.required().min(1)}),
    defineField({
      name: 'tierHeld',
      title: 'Traveller’s tier',
      type: 'tierRequirement',
      description: 'Loyalty status can unlock a larger allowance — on the carrier that granted it, not on its partners.',
    }),
    defineField({
      name: 'teachingPoint',
      type: 'text',
      rows: 3,
      description: 'For the seeded examples: what this itinerary is meant to demonstrate. Not used at runtime.',
    }),
  ],
  preview: {select: {title: 'label', subtitle: 'travelDate'}},
})

export const bagItem = defineType({
  name: 'bagItem',
  title: 'Item',
  type: 'document',
  fields: [
    defineField({name: 'label', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: ITEM_CATEGORIES.map((v) => ({title: v, value: v}))},
      validation: (r) => r.required(),
    }),
    defineField({name: 'dimensionsMm', type: 'dimensionsMm'}),
    defineField({name: 'massKg', type: 'number'}),
    defineField({
      name: 'wattHours',
      title: 'Watt-hours',
      type: 'number',
      description: 'Wh, not mAh. If the cell is labelled in mAh, Wh = mAh ÷ 1000 × nominal volts.',
    }),
    defineField({
      name: 'batteryState',
      type: 'string',
      initialValue: 'none',
      options: {list: BATTERY_STATES.map((v) => ({title: v, value: v})), layout: 'radio'},
      validation: (r) => r.required(),
    }),
    defineField({name: 'quantity', type: 'number', initialValue: 1, validation: (r) => r.required().integer().min(1)}),
    defineField({
      name: 'carriedIn',
      type: 'string',
      initialValue: 'cabin',
      options: {list: [{title: 'cabin', value: 'cabin'}, {title: 'checked', value: 'checked'}], layout: 'radio'},
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: {title: 'label', category: 'category', wh: 'wattHours'},
    prepare: ({title, category, wh}) => ({
      title,
      subtitle: [category, typeof wh === 'number' ? `${wh} Wh` : null].filter(Boolean).join(' · '),
    }),
  },
})
