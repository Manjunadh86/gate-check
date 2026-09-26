import {defineField, defineType} from 'sanity'
import {CLAIM_SUBJECTS, RULING_STATUS, SUBJECT_LABELS, type ClaimSubject} from '../vocabulary.ts'

/**
 * A human decision about a contradiction, recorded as content.
 *
 * The agent may draft one of these — it lands as `proposed`, and a proposed
 * ruling changes nothing. Only a `signed` ruling with a named person on it is
 * allowed to override the resolver's own tie-break, which is the whole reason
 * the status field exists. The decision then applies to every future question
 * that falls inside its scope, so the same conflict is never adjudicated twice.
 */
export const ruling = defineType({
  name: 'ruling',
  title: 'Ruling',
  type: 'document',
  fields: [
    defineField({
      name: 'subject',
      type: 'string',
      options: {list: CLAIM_SUBJECTS.map((v) => ({title: SUBJECT_LABELS[v], value: v}))},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'scope',
      type: 'scope',
      validation: (r) => r.required(),
      description: 'The situation this ruling settles. Narrower than the conflict it resolves is fine; broader is a bug.',
    }),
    defineField({
      name: 'conflicting',
      title: 'Claims that disagreed',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'claim'}]}],
      validation: (r) => r.required().min(2),
      description: 'Recorded so the reasoning survives even after one of the sources is taken down.',
    }),
    defineField({
      name: 'chosen',
      title: 'Claim that governs',
      type: 'reference',
      to: [{type: 'claim'}],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'rationale',
      type: 'text',
      rows: 4,
      validation: (r) => r.required().min(20),
      description: 'Why this one. Written for the next person, who will not remember the phone call.',
    }),
    defineField({
      name: 'status',
      type: 'string',
      initialValue: 'proposed',
      options: {list: RULING_STATUS.map((v) => ({title: v, value: v})), layout: 'radio'},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'decidedBy',
      title: 'Signed by',
      type: 'string',
      description: 'A person’s name. Required before the status may be set to signed.',
      validation: (r) =>
        r.custom((value, ctx) =>
          (ctx.document?.status === 'signed' && !value)
            ? 'A signed ruling needs a named person. An agent proposal stays "proposed" until someone signs it.'
            : true,
        ),
    }),
    defineField({name: 'decidedAt', type: 'datetime'}),
    defineField({
      name: 'proposedByAgent',
      title: 'Drafted by the agent',
      type: 'boolean',
      readOnly: true,
      description: 'Set by the write-back route so agent drafts are visibly distinguishable from human work.',
    }),
  ],
  preview: {
    select: {subject: 'subject', status: 'status', by: 'decidedBy'},
    prepare: ({subject, status, by}) => ({
      title: SUBJECT_LABELS[subject as ClaimSubject] ?? subject,
      subtitle: `${status}${by ? ` · ${by}` : ''}`,
    }),
  },
})
