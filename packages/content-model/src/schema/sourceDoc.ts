import {defineField, defineType} from 'sanity'
import {DOC_TYPES, DOC_TYPE_AUTHORITY} from '../vocabulary.ts'

/**
 * A document we read a rule out of.
 *
 * Nothing in this system asserts anything without pointing at one of these. The
 * `docType` is not decoration: it produces the authority score the resolver uses
 * to break ties, so classifying a page as `marketing-page` rather than
 * `conditions-of-carriage` changes which number a traveller is shown.
 */
export const sourceDoc = defineType({
  name: 'sourceDoc',
  title: 'Source document',
  type: 'document',
  groups: [
    {name: 'identity', title: 'Identity', default: true},
    {name: 'authority', title: 'Authority'},
    {name: 'lifecycle', title: 'Lifecycle'},
  ],
  fields: [
    defineField({name: 'title', type: 'string', group: 'identity', validation: (r) => r.required()}),
    defineField({
      name: 'url',
      type: 'url',
      group: 'identity',
      validation: (r) => r.required(),
      description: 'Where a judge, or a gate agent, can go and check the wording themselves.',
    }),
    defineField({
      name: 'publisherName',
      type: 'string',
      group: 'identity',
      validation: (r) => r.required(),
      description: 'Free text so regulators and standards bodies do not need carrier documents.',
    }),
    defineField({
      name: 'publisherCarrier',
      title: 'Publisher (if a carrier)',
      type: 'reference',
      to: [{type: 'carrier'}],
      group: 'identity',
    }),
    defineField({
      name: 'docType',
      title: 'Document class',
      type: 'string',
      group: 'authority',
      options: {
        list: DOC_TYPES.map((v) => ({title: `${v} (authority ${DOC_TYPE_AUTHORITY[v]})`, value: v})),
        layout: 'radio',
      },
      validation: (r) => r.required(),
      description:
        'Descending authority. Used to break ties between contradicting claims, so classify honestly: a help-centre article that paraphrases the tariff is a help-page, not the contract.',
    }),
    defineField({
      name: 'excerpt',
      type: 'text',
      rows: 3,
      group: 'identity',
      description:
        'A short quotation, long enough to show the rule and no longer. Keep it under a sentence or two — this is someone else’s copyright.',
      validation: (r) => r.max(400),
    }),
    defineField({
      name: 'retrievedAt',
      type: 'datetime',
      group: 'lifecycle',
      validation: (r) => r.required(),
      description: 'When we last actually looked at the page. Stale provenance is its own kind of wrong answer.',
    }),
    defineField({
      name: 'effectiveFrom',
      type: 'date',
      group: 'lifecycle',
      description: 'Date the rule in this document took effect, if the document says.',
    }),
    defineField({
      name: 'effectiveTo',
      type: 'date',
      group: 'lifecycle',
      description: 'Leave empty for "still current".',
    }),
    defineField({
      name: 'supersededBy',
      type: 'reference',
      to: [{type: 'sourceDoc'}],
      group: 'lifecycle',
      description:
        'Points forward to the document that replaced this one. Lets the resolver drop a claim without deleting the history of why it was ever believed.',
    }),
  ],
  preview: {
    select: {title: 'title', publisher: 'publisherName', docType: 'docType', to: 'effectiveTo'},
    prepare: ({title, publisher, docType, to}) => ({
      title,
      subtitle: [publisher, docType, to ? `expired ${to}` : null].filter(Boolean).join(' · '),
    }),
  },
})
