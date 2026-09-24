// End-to-end check against the real project: start a run on an incident, cast test votes, close the windows
// (pretending the clock has run out), and follow the instance to the end. Cleans up its votes, referendums
// and instance afterwards. Test votes are flagged simulated with persona 'neutral'.
// Run: pnpm tsx --env-file=../.env.local scripts/live-run.ts <incidentId> <upholdPct per window, comma-separated>
//   e.g. 60445da6-cee5-4596-b90f-aaff728d1a4b 50,50,70,70,30,70
import {closeWindow, createRuntime, sendToThePeople} from '../runtime'

const [incidentId, plan = '50,50,70,70,70'] = process.argv.slice(2)
if (!incidentId) throw new Error('usage: live-run.ts <incidentId> [pcts]')

// No bot crowd here: this script casts its own votes.
const runtime = createRuntime({
  projectId: process.env.SANITY_PROJECT_ID!,
  token: process.env.SANITY_WRITE_TOKEN!,
  background: () => {},
})
const {engine, content} = runtime
const VOTES = 25
const FUTURE = Date.now() + 60 * 60 * 1000

const instanceId = await sendToThePeople(runtime, incidentId)
console.log('started', instanceId)
const referendums: string[] = []

try {
  for (const pct of plan.split(',').map(Number)) {
    const instance = await engine.getInstance({instanceId})
    const visit = instance.stages.at(-1) as {fields?: {name: string; value?: unknown}[]}
    const referendumId = visit.fields?.find((f) => f.name === 'referendumId')?.value as string | undefined
    if (!referendumId) {
      console.log('no open referendum; stage', instance.currentStage)
      break
    }
    referendums.push(referendumId)
    const ref = await content.getDocument(referendumId)
    const uphold = Math.round((pct / 100) * VOTES)
    const tx = content.transaction()
    for (let i = 0; i < VOTES; i++) {
      tx.create({
        _type: 'vote',
        referendum: {_type: 'reference', _ref: referendumId},
        choice: i < uphold ? 'uphold' : 'overturn',
        sessionId: `live-run-${i}`,
        simulated: true,
        persona: 'neutral',
        castAt: new Date().toISOString(),
      })
    }
    await tx.commit()
    const result = await closeWindow(runtime, instanceId, FUTURE)
    const after = await engine.getInstance({instanceId})
    console.log(`${ref?.round} (loop ${ref?.loop}) ${pct}% ->`, result.status, '->', after.currentStage)
    if (after.completedAt) break
  }
  const final = await engine.getInstance({instanceId})
  const incident = await content.getDocument(incidentId)
  console.log('final stage:', final.currentStage, '| finalCall:', incident?.finalCall ?? '(unset)')
} finally {
  const cleanup = content.transaction()
  const votes = await content.fetch<string[]>('*[_type == "vote" && referendum._ref in $ids]._id', {ids: referendums})
  votes.forEach((id) => cleanup.delete(id))
  referendums.forEach((id) => cleanup.delete(id))
  await cleanup.commit()
  await content.patch(incidentId).unset(['finalCall']).commit()
  const live = await engine.getInstance({instanceId})
  if (!live.completedAt) await engine.abortInstance({instanceId})
  console.log(`cleaned up ${votes.length} votes, ${referendums.length} referendums; finalCall unset`)
}
