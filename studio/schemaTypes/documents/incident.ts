import {defineArrayMember, defineField, defineType} from 'sanity'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import {CALLS, INCIDENT_TYPES, titleFor} from '../constants'

export const incident = defineType({
  name: 'incident',
  title: 'Incident',
  type: 'document',
  icon: WarningOutlineIcon,
  groups: [
    {name: 'story', title: 'Story', default: true},
    {name: 'calls', title: 'Calls'},
    {name: 'media', title: 'Clip'},
    {name: 'crowd', title: 'Crowd'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'story',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'story',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'match',
      title: 'Match',
      type: 'reference',
      to: [{type: 'match'}],
      group: 'story',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'minute',
      title: 'Minute',
      type: 'number',
      group: 'story',
      validation: (rule) => rule.required().min(0).max(130).integer(),
    }),
    defineField({
      name: 'incidentType',
      title: 'Incident type',
      type: 'string',
      group: 'story',
      options: {list: INCIDENT_TYPES, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'lawsInvolved',
      title: 'Laws involved',
      type: 'array',
      group: 'story',
      of: [defineArrayMember({type: 'reference', to: [{type: 'law'}]})],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: 'realDelaySeconds',
      title: 'Real delay (seconds)',
      type: 'number',
      group: 'story',
      description: 'How long the real VAR review took. Feeds the "time added by democracy" clock.',
      validation: (rule) => rule.required().min(0).integer(),
    }),
    defineField({
      name: 'situation',
      title: 'Situation',
      type: 'string',
      group: 'story',
      description:
        'One or two short lines shown under the clip during the live vote: score, minute, what happened, what VAR decided.',
      validation: (rule) => rule.required().max(140),
    }),
    defineField({
      name: 'controlCase',
      title: 'Control case',
      type: 'boolean',
      group: 'story',
      description: 'The one clear-cut incident where VAR was simply wrong. Does the crowd still get it wrong?',
      initialValue: false,
    }),
    defineField({
      name: 'outcry',
      title: 'Outcry',
      type: 'outcry',
      group: 'story',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'originalCall',
      title: 'Original call',
      type: 'string',
      group: 'calls',
      description: 'What the referee gave on the pitch.',
      options: {list: CALLS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'varRecommendation',
      title: 'VAR recommendation',
      type: 'string',
      group: 'calls',
      description: 'What the VAR room recommended. This is what the public votes to uphold or overturn.',
      options: {list: CALLS},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'recommendationFavours',
      title: 'VAR recommendation favours',
      type: 'string',
      group: 'calls',
      description: 'Which side the recommendation helps. Home and away fan bots vote on this.',
      options: {
        list: [
          {title: 'Home team', value: 'home'},
          {title: 'Away team', value: 'away'},
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'finalCall',
      title: 'Final call',
      type: 'string',
      group: 'calls',
      description: 'Set by the peoplesVar workflow when the public upholds the call. Not editable by hand.',
      options: {list: CALLS},
      readOnly: true,
    }),
    defineField({
      name: 'clip',
      title: 'Clip',
      type: 'clip',
      group: 'media',
    }),
    defineField({
      name: 'fallbackText',
      title: 'Fallback text',
      type: 'text',
      rows: 4,
      group: 'media',
      description: 'Shown when the clip is missing or cannot be embedded. Describe what happened.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'crowdSeed',
      title: 'Crowd seed',
      type: 'number',
      group: 'crowd',
      description: 'Fixed random seed for the simulated crowd, so demo runs are repeatable.',
      initialValue: () => Math.floor(Math.random() * 1_000_000),
      validation: (rule) => rule.required().integer().min(0),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      minute: 'minute',
      type: 'incidentType',
      home: 'match.homeTeam.shortName',
      away: 'match.awayTeam.shortName',
    },
    prepare({title, minute, type, home, away}) {
      const fixture = home && away ? `${home} v ${away}` : undefined
      return {
        title,
        subtitle: [fixture, minute !== undefined ? `${minute}'` : undefined, titleFor(INCIDENT_TYPES, type)]
          .filter(Boolean)
          .join(' · '),
      }
    },
  },
})
