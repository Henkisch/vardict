import {defineField, defineType} from 'sanity'
import {ThumbsUpIcon} from '@sanity/icons/ThumbsUp'
import {CHOICES, PERSONAS, titleFor} from '../constants'

// Written by /api/vote (humans) and the bot crowd (simulated), never by hand.
// The production dataset is public: never store anything identifying here.
export const vote = defineType({
  name: 'vote',
  title: 'Vote',
  type: 'document',
  icon: ThumbsUpIcon,
  readOnly: true,
  fields: [
    defineField({
      name: 'referendum',
      title: 'Referendum',
      type: 'reference',
      to: [{type: 'referendum'}],
      validation: (rule) =>
        rule.required().custom(async (ref, context) => {
          if (!ref?._ref) return true
          const castAt = (context.document?.castAt as string | undefined) ?? new Date().toISOString()
          const closesAt = await context
            .getClient({apiVersion: '2025-02-19'})
            .fetch<string | null>(`*[_id == $id][0].closesAt`, {id: ref._ref})
          return !closesAt || new Date(castAt) <= new Date(closesAt) || 'Voting had already closed'
        }),
    }),
    defineField({
      name: 'choice',
      title: 'Choice',
      type: 'string',
      options: {list: CHOICES, layout: 'radio', direction: 'horizontal'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sessionId',
      title: 'Session ID',
      type: 'string',
      description: 'Random per-browser ID. One vote per round per session.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'simulated',
      title: 'Simulated',
      type: 'boolean',
      description: 'True for bot crowd votes. Always shown openly.',
      initialValue: false,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'persona',
      title: 'Persona',
      type: 'string',
      options: {list: PERSONAS},
      hidden: ({document}) => !document?.simulated,
      validation: (rule) =>
        rule.custom((persona, context) => {
          const simulated = context.document?.simulated
          if (simulated && !persona) return 'Simulated votes need a persona'
          if (!simulated && persona) return 'Only simulated votes have a persona'
          return true
        }),
    }),
    defineField({
      name: 'castAt',
      title: 'Cast at',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
  ],
  orderings: [{title: 'Newest first', name: 'castDesc', by: [{field: 'castAt', direction: 'desc'}]}],
  preview: {
    select: {choice: 'choice', simulated: 'simulated', persona: 'persona', castAt: 'castAt'},
    prepare: ({choice, simulated, persona, castAt}) => ({
      title: titleFor(CHOICES, choice) ?? 'Vote',
      subtitle: [simulated ? `Bot · ${titleFor(PERSONAS, persona)}` : 'Human', castAt].filter(Boolean).join(' · '),
    }),
  },
})
