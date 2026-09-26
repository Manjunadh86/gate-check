import {defineArrayMember, defineField, defineType} from 'sanity'

export const carrier = defineType({
  name: 'carrier',
  title: 'Carrier',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'iata',
      title: 'IATA code',
      type: 'string',
      validation: (r) => r.required().uppercase().length(2),
    }),
    defineField({name: 'icao', title: 'ICAO code', type: 'string', validation: (r) => r.uppercase().length(3)}),
    defineField({
      name: 'country',
      title: 'Country of registration',
      type: 'reference',
      to: [{type: 'jurisdiction'}],
      description: 'Sets the default regulator whose rules bind this carrier regardless of route.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'tiers',
      title: 'Loyalty tiers',
      type: 'array',
      description: 'Ordered lowest to highest. Rank is what the resolver compares, not the name.',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'tier',
          fields: [
            defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
            defineField({name: 'rank', type: 'number', validation: (r) => r.required().integer().min(1)}),
          ],
          preview: {
            select: {title: 'name', subtitle: 'rank'},
            prepare: ({title, subtitle}) => ({title, subtitle: `rank ${subtitle}`}),
          },
        }),
      ],
    }),
    defineField({
      name: 'regionalPartners',
      title: 'Regional operating partners',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'carrier'}]})],
      description:
        'Carriers that fly under this brand but publish their own baggage limits. The reason a ticket does not tell you your allowance.',
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'iata'},
  },
})

export const jurisdiction = defineType({
  name: 'jurisdiction',
  title: 'Jurisdiction',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'iso2', title: 'ISO 3166-1 alpha-2', type: 'string', validation: (r) => r.uppercase().length(2)}),
    defineField({
      name: 'regulator',
      type: 'string',
      description: 'The authority whose published rules are treated as binding here, e.g. "FAA / TSA", "EASA", "DGCA".',
    }),
    defineField({
      name: 'supranational',
      type: 'boolean',
      description: 'True for entries like "ICAO" or "European Union" that are not a single country.',
    }),
  ],
  preview: {select: {title: 'name', subtitle: 'regulator'}},
})

export const aircraftType = defineType({
  name: 'aircraftType',
  title: 'Aircraft type',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'iataCode', title: 'IATA equipment code', type: 'string'}),
    defineField({
      name: 'family',
      type: 'string',
      options: {list: ['turboprop', 'regional-jet', 'narrowbody', 'widebody'].map((v) => ({title: v, value: v}))},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'seats',
      title: 'Typical seat count',
      type: 'number',
      description: 'Several carrier rules are written in terms of seat count, so it has to be queryable.',
    }),
    defineField({
      name: 'binOpening',
      title: 'Overhead bin opening',
      type: 'binOpening',
      description:
        'The physical constraint. A bag inside the published allowance still gets taken off you at the door if it will not go in here.',
    }),
    defineField({
      name: 'gateCheckLikely',
      title: 'Gate-check is routine on this type',
      type: 'boolean',
      description: 'Set where the operator gate-checks most roll-aboards regardless of size, e.g. 50-seat regional jets.',
    }),
  ],
  preview: {select: {title: 'name', subtitle: 'family'}},
})
