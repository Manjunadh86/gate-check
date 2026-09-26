import {defineField, defineType} from 'sanity'
import {
  BINDING_MODES,
  BINDING_MODE_LABELS,
  CLAIM_SUBJECTS,
  CONFIDENCE,
  SUBJECT_LABELS,
  SUBJECT_VALUE_TYPE,
  type ClaimSubject,
} from '../vocabulary.ts'

const subjectsOfType = (t: 'dimensions' | 'mass' | 'number' | 'boolean') =>
  CLAIM_SUBJECTS.filter((s) => SUBJECT_VALUE_TYPE[s] === t) as readonly ClaimSubject[]

/**
 * A single sourced assertion.
 *
 * The decision that shapes this whole model: we do not store "the cabin bag
 * limit is 7 kg". We store "this document, published by this carrier, on this
 * date, said 7 kg, and it said it about these situations". The limit a traveller
 * is finally shown is computed, never stored — because there is no such thing as
 * "the" limit until you know who is flying the aeroplane.
 */
export const claim = defineType({
  name: 'claim',
  title: 'Claim',
  type: 'document',
  groups: [
    {name: 'what', title: 'What it claims', default: true},
    {name: 'when', title: 'When it applies'},
    {name: 'provenance', title: 'Provenance'},
  ],
  fields: [
    defineField({
      name: 'subject',
      title: 'Subject',
      type: 'string',
      group: 'what',
      options: {list: CLAIM_SUBJECTS.map((v) => ({title: SUBJECT_LABELS[v], value: v}))},
      validation: (r) => r.required(),
      description: 'Two claims can only contradict each other if they share a subject. Closed set by design.',
    }),

    defineField({
      name: 'bindingMode',
      title: 'Binding mode',
      type: 'string',
      group: 'what',
      initialValue: 'override',
      options: {list: BINDING_MODES.map((v) => ({title: v, value: v})), layout: 'radio'},
      validation: (r) => r.required(),
      description:
        Object.values(BINDING_MODE_LABELS).join(' · ') +
        ' — Get this wrong and the resolver will hand a traveller the looser of two numbers.',
    }),

    // One typed value field per value class, revealed by the subject. Keeps the
    // document narrow in the Studio and keeps comparisons type-safe downstream.
    defineField({
      name: 'dimensionsValue',
      title: 'Value — dimensions',
      type: 'dimensionsMm',
      group: 'what',
      hidden: ({parent}) => !subjectsOfType('dimensions').includes(parent?.subject),
    }),
    defineField({
      name: 'massKgValue',
      title: 'Value — mass (kg)',
      type: 'number',
      group: 'what',
      hidden: ({parent}) => !subjectsOfType('mass').includes(parent?.subject),
      validation: (r) => r.positive(),
    }),
    defineField({
      name: 'numberValue',
      title: 'Value — number',
      type: 'number',
      group: 'what',
      hidden: ({parent}) => !subjectsOfType('number').includes(parent?.subject),
      description: 'Watt-hours for battery subjects, a count for piece subjects.',
    }),
    defineField({
      name: 'booleanValue',
      title: 'Value — yes/no',
      type: 'boolean',
      group: 'what',
      hidden: ({parent}) => !subjectsOfType('boolean').includes(parent?.subject),
    }),

    defineField({
      name: 'scope',
      type: 'scope',
      group: 'when',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'effectiveFrom',
      type: 'date',
      group: 'when',
      description: 'Overrides the source document’s date when the document states a different one for this rule.',
    }),
    defineField({name: 'effectiveTo', type: 'date', group: 'when'}),
    defineField({
      name: 'supersedes',
      type: 'reference',
      to: [{type: 'claim'}],
      group: 'when',
      description:
        'The earlier claim this one replaces. The old claim stays queryable so the app can explain why the number it used to give was different.',
    }),

    defineField({
      name: 'source',
      type: 'reference',
      to: [{type: 'sourceDoc'}],
      group: 'provenance',
      validation: (r) => r.required(),
      description: 'Required. A claim without a source is a rumour.',
    }),
    defineField({
      name: 'quote',
      type: 'string',
      group: 'provenance',
      validation: (r) => r.max(240),
      description: 'The clause this claim was read out of, trimmed to the part that carries the rule.',
    }),
    defineField({
      name: 'confidence',
      type: 'string',
      group: 'provenance',
      initialValue: 'stated',
      options: {list: CONFIDENCE.map((v) => ({title: v, value: v})), layout: 'radio'},
      description:
        '"stated" — the source says it outright. "inferred" — we derived it from wording that implies it. "uncertain" — the source is ambiguous and a human should look.',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'note',
      type: 'text',
      rows: 3,
      group: 'provenance',
      description: 'Anything a reader needs in order to trust or distrust this row.',
    }),
  ],
  preview: {
    select: {
      subject: 'subject',
      dims: 'dimensionsValue',
      mass: 'massKgValue',
      num: 'numberValue',
      bool: 'booleanValue',
      confidence: 'confidence',
      publisher: 'source.publisherName',
      docType: 'source.docType',
    },
    prepare: ({subject, dims, mass, num, bool, confidence, publisher, docType}) => {
      const value =
        dims && dims.lengthMm
          ? `${dims.lengthMm}×${dims.widthMm}×${dims.heightMm} mm`
          : typeof mass === 'number'
            ? `${mass} kg`
            : typeof num === 'number'
              ? String(num)
              : typeof bool === 'boolean'
                ? (bool ? 'yes' : 'no')
                : '—'
      return {
        title: `${SUBJECT_LABELS[subject as ClaimSubject] ?? subject} = ${value}`,
        subtitle: [publisher, docType, confidence !== 'stated' ? confidence : null].filter(Boolean).join(' · '),
      }
    },
  },
})
