import {defineField, defineType} from 'sanity'
import {BookIcon} from '@sanity/icons/Book'

export const law = defineType({
  name: 'law',
  title: 'Law of the Game',
  type: 'document',
  icon: BookIcon,
  fields: [
    defineField({
      name: 'number',
      title: 'Law number',
      type: 'number',
      description: 'IFAB Laws of the Game, 1–17.',
      validation: (rule) => rule.required().min(1).max(17).integer(),
    }),
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'text',
      rows: 4,
      description: 'In our own words. Do not copy the IFAB text.',
      validation: (rule) => rule.required(),
    }),
  ],
  orderings: [{title: 'Law number', name: 'numberAsc', by: [{field: 'number', direction: 'asc'}]}],
  preview: {
    select: {number: 'number', title: 'title'},
    prepare: ({number, title}) => ({title: `Law ${number ?? '?'}: ${title ?? ''}`}),
  },
})
