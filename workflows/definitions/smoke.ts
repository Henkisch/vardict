import {
  defineAction,
  defineActivity,
  defineField,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

// Session 1 smoke test: proves deploy + start + fire-action work on this project.
// Deleted (nuked) after the check; peoplesVar replaces it.
export const smoke = defineWorkflow({
  name: 'smoke',
  title: 'Smoke test',
  description: 'Two-stage check that Workflows early access runs on the VARdict project.',
  initialStage: 'varRoom',
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Document',
      required: true,
      initialValue: {type: 'input'},
    }),
  ],
  stages: [
    defineStage({
      name: 'varRoom',
      title: 'VAR room',
      activities: [
        defineActivity({
          name: 'review',
          title: 'Review the footage',
          actions: [defineAction({name: 'recommend', title: 'Recommend', status: 'done'})],
        }),
      ],
      transitions: [defineTransition({name: 'to-upheld', title: 'Uphold', to: 'upheld'})],
    }),
    defineStage({name: 'upheld', title: 'Upheld'}),
  ],
})
