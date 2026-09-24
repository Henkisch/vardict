import {defineField, defineType} from 'sanity'
import {MicrophoneIcon} from '@sanity/icons/Microphone'
import {PUNDITS, PUNDIT_TRIGGERS, titleFor} from '../constants'

// A line for the pundit ticker on /live. The screen picks lines by trigger (what just happened), preferring ones
// written for the incident on screen. Written by us, in our own words; the pundits are fictional.
export const punditLine = defineType({
  name: 'punditLine',
  title: 'Pundit line',
  type: 'document',
  icon: MicrophoneIcon,
  fields: [
    defineField({
      name: 'text',
      title: 'Line',
      type: 'string',
      description: 'One sentence, said with total confidence. Max 120 characters.',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'pundit',
      title: 'Pundit',
      type: 'string',
      options: {list: PUNDITS, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'trigger',
      title: 'When it plays',
      type: 'string',
      options: {list: PUNDIT_TRIGGERS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'incident',
      title: 'Only for this incident',
      type: 'reference',
      to: [{type: 'incident'}],
      description: 'Optional. Leave empty for a line that fits any incident.',
    }),
  ],
  preview: {
    select: {text: 'text', pundit: 'pundit', trigger: 'trigger', incident: 'incident.title'},
    prepare: ({text, pundit, trigger, incident}) => ({
      title: text,
      subtitle: [titleFor(PUNDITS, pundit), titleFor(PUNDIT_TRIGGERS, trigger), incident].filter(Boolean).join(' · '),
    }),
  },
})
