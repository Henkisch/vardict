import {defineField, defineType} from 'sanity'
import {CalendarIcon} from '@sanity/icons/Calendar'

export const match = defineType({
  name: 'match',
  title: 'Match',
  type: 'document',
  icon: CalendarIcon,
  fields: [
    defineField({
      name: 'homeTeam',
      title: 'Home team',
      type: 'reference',
      to: [{type: 'team'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'awayTeam',
      title: 'Away team',
      type: 'reference',
      to: [{type: 'team'}],
      validation: (rule) =>
        rule.required().custom((away, context) => {
          const home = (context.document?.homeTeam as {_ref?: string} | undefined)?._ref
          return !away?._ref || away._ref !== home || 'A team cannot play itself (VAR would still check)'
        }),
    }),
    defineField({
      name: 'competition',
      title: 'Competition',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'date', title: 'Date', type: 'date', validation: (rule) => rule.required()}),
    defineField({name: 'venue', title: 'Venue', type: 'string'}),
    defineField({
      name: 'score',
      title: 'Final score',
      type: 'object',
      options: {columns: 2},
      fields: [
        defineField({name: 'home', title: 'Home', type: 'number', validation: (rule) => rule.min(0).integer()}),
        defineField({name: 'away', title: 'Away', type: 'number', validation: (rule) => rule.min(0).integer()}),
      ],
    }),
  ],
  preview: {
    select: {
      home: 'homeTeam.shortName',
      away: 'awayTeam.shortName',
      homeScore: 'score.home',
      awayScore: 'score.away',
      competition: 'competition',
      date: 'date',
    },
    prepare({home, away, homeScore, awayScore, competition, date}) {
      const score = homeScore !== undefined && awayScore !== undefined ? ` ${homeScore}–${awayScore} ` : ' v '
      return {
        title: `${home ?? '?'}${score}${away ?? '?'}`,
        subtitle: [competition, date].filter(Boolean).join(' · '),
      }
    },
  },
})
