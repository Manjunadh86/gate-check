import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * The record of one answer the app gave.
 *
 * Context MCP is read-only by design, so the agent cannot create this. It is
 * written by a server route after the agent has finished, which is the pattern
 * the Sanity docs point at for writes. Verdicts are stored denormalised on
 * purpose: when a carrier edits a policy next week, this row must still show what
 * the traveller was told, and the claim references beside it show what has moved.
 */
export const checkRun = defineType({
  name: 'checkRun',
  title: 'Check run',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'askedAt', type: 'datetime', validation: (r) => r.required()}),
    defineField({name: 'itinerary', type: 'reference', to: [{type: 'itinerary'}]}),
    defineField({name: 'question', type: 'text', rows: 2}),
    defineField({
      name: 'verdicts',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'verdictSnapshot',
          fields: [
            defineField({name: 'segmentLabel', type: 'string'}),
            defineField({name: 'itemLabel', type: 'string'}),
            defineField({
              name: 'outcome',
              type: 'string',
              options: {
                list: ['allowed', 'allowed-with-conditions', 'approval-required', 'gate-check-likely', 'prohibited', 'unknown'].map(
                  (v) => ({title: v, value: v}),
                ),
              },
            }),
            defineField({name: 'reason', type: 'text', rows: 2}),
            defineField({name: 'governingClaim', type: 'reference', to: [{type: 'claim'}]}),
            defineField({name: 'appliedRuling', type: 'reference', to: [{type: 'ruling'}]}),
            defineField({name: 'unresolvedConflict', type: 'boolean'}),
          ],
          preview: {
            select: {title: 'itemLabel', seg: 'segmentLabel', outcome: 'outcome'},
            prepare: ({title, seg, outcome}) => ({title: `${title} — ${outcome}`, subtitle: seg}),
          },
        }),
      ],
    }),
    defineField({
      name: 'openConflicts',
      title: 'Conflicts left open',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'claim'}]}],
      description: 'Claims that disagreed and that no signed ruling covers. The backlog of decisions someone owes.',
    }),
    defineField({name: 'model', type: 'string'}),
    defineField({name: 'toolCalls', type: 'number', description: 'MCP tool calls made while answering.'}),
  ],
  preview: {
    select: {title: 'question', subtitle: 'askedAt'},
  },
})
