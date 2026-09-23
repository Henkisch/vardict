// Session 1 smoke test: start the `smoke` workflow against a document in the
// production dataset, fire `recommend`, and confirm the instance reaches `upheld`.
// Run: pnpm tsx --env-file=../.env.local scripts/smoke.ts
import {createClient} from '@sanity/client'
import {createEngine} from '@sanity/workflow-engine'

const projectId = process.env.SANITY_PROJECT_ID!
const token = process.env.SANITY_WRITE_TOKEN!
const contentDataset = process.env.SANITY_DATASET ?? 'production'
const workflowsDataset = process.env.SANITY_WORKFLOWS_DATASET ?? 'workflows'

const base = createClient({projectId, token, apiVersion: '2025-02-19', useCdn: false})
const workflowClient = base.withConfig({dataset: workflowsDataset})
const contentClient = base.withConfig({dataset: contentDataset})

const engine = createEngine({
  client: workflowClient,
  tag: 'dev',
  workflowResource: {type: 'dataset', id: `${projectId}.${workflowsDataset}`},
  // Declare the content dataset so the engine accepts refs into it.
  resourceClients: (gdr) =>
    gdr.scheme === 'dataset' && gdr.projectId === projectId && gdr.dataset === contentDataset
      ? contentClient
      : undefined,
})

const started = await engine.startInstance({
  definition: 'smoke',
  initialFields: [
    {
      type: 'subject',
      name: 'subject',
      value: {id: `dataset:${projectId}:${contentDataset}:smoke-1`, type: 'smokeTest'},
    },
  ],
})
const instanceId = started.instance._id
console.log('started', instanceId, 'stage:', started.instance.currentStage)

const fired = await engine.fireAction({instanceId, activity: 'review', action: 'recommend'})
console.log('after recommend, stage:', fired.instance.currentStage, 'cascaded:', fired.cascaded)

const final = await engine.getInstance({instanceId})
console.log(final.currentStage === 'upheld' ? 'PASS' : 'FAIL', 'final stage:', final.currentStage)
