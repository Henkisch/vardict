import {defineField, defineType} from 'sanity'
import {UsersIcon} from '@sanity/icons/Users'

export const team = defineType({
  name: 'team',
  title: 'Team',
  type: 'document',
  icon: UsersIcon,
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'shortName',
      title: 'Short name',
      type: 'string',
      description: 'Three letters, as on a scoreboard (e.g. ARS).',
      validation: (rule) => rule.required().max(4),
    }),
    defineField({
      name: 'primaryColor',
      title: 'Primary colour',
      type: 'string',
      description: 'Club colour as a hex value, for the team chip in the scorebug. Keep it readable on a dark background.',
      validation: (rule) =>
        rule.required().regex(/^#[0-9a-fA-F]{6}$/, {name: 'hex colour'}).error('Use a hex colour like #EF0107'),
    }),
  ],
  preview: {select: {title: 'name', subtitle: 'shortName'}},
})
