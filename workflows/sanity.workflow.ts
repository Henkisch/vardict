import {defineWorkflowConfig} from '@sanity/workflow-engine/define'

import {smoke} from './definitions/smoke'

export default defineWorkflowConfig({
  deployments: [
    {
      name: 'dev',
      tag: 'dev',
      expectedMinReaderModel: 10,
      workflowResource: {type: 'dataset', id: 't2sbu6uu.workflows'},
      resourceAliases: [{name: 'content', resource: {type: 'dataset', id: 't2sbu6uu.production'}}],
      definitions: [smoke],
    },
  ],
})
