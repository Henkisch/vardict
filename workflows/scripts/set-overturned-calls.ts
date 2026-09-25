// One-off (session 5): set each published incident's overturnedCall - the call that stands if the fans overrule
// the VAR - and correct Pickford's finalCall from the test round that wrote the referee's call instead.
// Run: pnpm tsx --env-file=../.env.local scripts/set-overturned-calls.ts
import {createRuntime} from '../runtime'

const {content} = createRuntime({projectId: process.env.SANITY_PROJECT_ID!, token: process.env.SANITY_WRITE_TOKEN!})

const CALLS: Record<string, string> = {
  'maupay-brighton-man-utd-2020': 'noPenalty', // VAR gave the penalty; overturned, the referee's no penalty stands
  'pickford-van-dijk-everton-liverpool-2020': 'redCard', // offside came first, the missed call was Pickford's red
  'luis-diaz-tottenham-liverpool-2023': 'goal', // the control case: the goal should have stood
  'gordon-newcastle-arsenal-2023': 'noGoal',
  'milenkovic-west-ham-forest-2025': 'noGoal',
}

for (const [slug, call] of Object.entries(CALLS)) {
  const doc = await content.fetch<{_id: string; finalCall?: string; originalCall: string} | null>(
    '*[_type == "incident" && slug.current == $slug && !(_id in path("drafts.**"))][0]{_id, finalCall, originalCall}',
    {slug},
  )
  if (!doc) throw new Error(`no published incident ${slug}`)
  const patch = content.patch(doc._id).set({overturnedCall: call})
  // A round overturned under the old rule wrote the referee's call; rewrite it to what overturning means now.
  if (doc.finalCall && doc.finalCall === doc.originalCall && call !== doc.originalCall) patch.set({finalCall: call})
  await patch.commit()
  console.log(slug, '->', call, doc.finalCall ? `(finalCall was ${doc.finalCall})` : '')
}
