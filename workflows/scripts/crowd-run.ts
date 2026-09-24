// Full autopilot run against the real project: press "Send to the people" and let the bot crowd play the whole
// thing out in real time (~1–2 min). Use it to choose seeds. Leaves the results in place; reset with reset.ts.
// Run: pnpm tsx --env-file=../.env.local scripts/crowd-run.ts [incidentId]
import {createRuntime, startNext} from '../runtime'

const tasks: Promise<void>[] = []
const runtime = createRuntime({
  projectId: process.env.SANITY_PROJECT_ID!,
  token: process.env.SANITY_WRITE_TOKEN!,
  background: (task) => void tasks.push(task()),
})
const started = await startNext(runtime, process.argv[2])
console.log(started)
if (started.status !== 'started' && started.status !== 'recommended') process.exit(1)
// Each crowd may open the next round, which queues the next crowd.
while (tasks.length) await tasks.shift()

const rounds = await runtime.content.fetch<{round: string; loop: number; result: string; uphold: number; total: number}[]>(
  `*[_type == "referendum" && workflowInstanceId == $id] | order(windowOpensAt asc){round, loop, result,
    "uphold": coalesce(botVotes.uphold, 0) + count(*[_type == "vote" && references(^._id) && choice == "uphold"]),
    "total": coalesce(botVotes.uphold, 0) + coalesce(botVotes.overturn, 0) + count(*[_type == "vote" && references(^._id)])}`,
  {id: started.instanceId},
)
for (const r of rounds) console.log(`loop ${r.loop} ${r.round}: ${Math.round((100 * r.uphold) / r.total)}% uphold (unweighted) of ${r.total} -> ${r.result}`)
const instance = await runtime.engine.getInstance({instanceId: started.instanceId})
console.log('stage:', instance.currentStage)
