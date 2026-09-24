import {defineField, defineType} from 'sanity'
import {ClockIcon} from '@sanity/icons/Clock'
import {REFERENDUM_RESULTS, ROUNDS, titleFor} from '../constants'

// Written by the peoplesVar workflow, not by hand. Read-only in the Studio.
export const referendum = defineType({
  name: 'referendum',
  title: 'Referendum',
  type: 'document',
  icon: ClockIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'incident',
      title: 'Incident',
      type: 'reference',
      to: [{type: 'incident'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'round',
      title: 'Round',
      type: 'string',
      options: {list: ROUNDS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'loop',
      title: 'VAR room trip',
      type: 'number',
      description: 'Which trip back to the VAR room this referendum belongs to (1–3).',
      validation: (rule) => rule.required().min(1).max(3).integer(),
    }),
    defineField({
      name: 'threshold',
      title: 'Threshold',
      type: 'number',
      description: 'Share of uphold votes needed to uphold the call, e.g. 0.55.',
      validation: (rule) => rule.required().min(0).max(1),
    }),
    defineField({
      name: 'windowOpensAt',
      title: 'Window opens at',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'closesAt',
      title: 'Closes at',
      type: 'datetime',
      validation: (rule) =>
        rule.required().custom((closesAt, context) => {
          const opens = context.document?.windowOpensAt as string | undefined
          if (!closesAt || !opens) return true
          return new Date(closesAt) > new Date(opens) || 'Must close after it opens'
        }),
    }),
    defineField({
      name: 'workflowInstanceId',
      title: 'Workflow instance',
      type: 'string',
      description: 'The peoples-var run that opened this referendum. Written by the workflow.',
      readOnly: true,
    }),
    defineField({
      name: 'result',
      title: 'Result',
      type: 'string',
      description: 'Empty while voting is open.',
      options: {list: REFERENDUM_RESULTS},
    }),
  ],
  orderings: [{title: 'Newest first', name: 'opensDesc', by: [{field: 'windowOpensAt', direction: 'desc'}]}],
  preview: {
    select: {incident: 'incident.title', round: 'round', loop: 'loop', result: 'result'},
    prepare: ({incident, round, loop, result}) => ({
      title: `${titleFor(ROUNDS, round) ?? 'Round'} (trip ${loop ?? '?'})`,
      subtitle: [incident, result ? titleFor(REFERENDUM_RESULTS, result) : 'Voting open'].join(' · '),
    }),
  },
})
