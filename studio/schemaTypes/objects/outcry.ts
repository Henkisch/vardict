import {defineArrayMember, defineField, defineType} from 'sanity'

export const outcry = defineType({
  name: 'outcry',
  title: 'Outcry',
  type: 'object',
  fields: [
    defineField({
      name: 'level',
      title: 'Level',
      type: 'number',
      description: '1 = mild grumbling, 5 = questions asked in parliament.',
      options: {list: [1, 2, 3, 4, 5], layout: 'radio', direction: 'horizontal'},
      validation: (rule) => rule.required().min(1).max(5).integer(),
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'text',
      rows: 3,
      description: 'In our own words. No copied quotes.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'sources',
      title: 'Sources',
      type: 'array',
      of: [defineArrayMember({type: 'url', validation: (rule) => rule.uri({scheme: ['http', 'https']})})],
      validation: (rule) => rule.required().min(1).error('Add at least one source URL'),
    }),
  ],
})
