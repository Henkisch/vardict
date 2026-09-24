// Reset the demo: abort every live run, delete all referendums and votes, and unset every incident's finalCall.
// Destructive by design (dress rehearsals, test runs). Run: pnpm tsx --env-file=../.env.local scripts/reset.ts
import {createRuntime, liveInstances} from '../runtime'

const runtime = createRuntime({projectId: process.env.SANITY_PROJECT_ID!, token: process.env.SANITY_WRITE_TOKEN!})
const {engine, content} = runtime

for (const instance of await liveInstances(runtime)) {
  await engine.abortInstance({instanceId: instance._id})
  console.log('aborted', instance._id, `(${instance.currentStage})`)
}
const ids = await content.fetch<string[]>('*[_type in ["vote", "referendum"]]._id')
const incidents = await content.fetch<string[]>('*[_type == "incident" && defined(finalCall)]._id')
const tx = content.transaction()
ids.forEach((id) => tx.delete(id))
incidents.forEach((id) => tx.patch(id, (p) => p.unset(['finalCall'])))
if (ids.length || incidents.length) await tx.commit()
console.log(`deleted ${ids.length} votes/referendums, cleared ${incidents.length} final calls`)
