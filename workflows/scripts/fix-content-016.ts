// Plan 016 P1 #9-10 (session 5): content that stated a wrong fact or an old rule. Patches the published documents.
// Run: pnpm tsx --env-file=../.env.local scripts/fix-content-016.ts
import {createRuntime} from '../runtime'

const {content} = createRuntime({projectId: process.env.SANITY_PROJECT_ID!, token: process.env.SANITY_WRITE_TOKEN!})

// Mané scored in the 3rd minute: it was 0-1 when Pickford went through Van Dijk (Sky Sports, ESPN match reports).
const pickford = await content.fetch<string>('*[_type == "incident" && slug.current == "pickford-van-dijk-everton-liverpool-2020" && !(_id in path("drafts.**"))][0]._id')
await content.patch(pickford).set({situation: "Everton 0–1 Liverpool, 6'. Pickford wipes out Van Dijk. VAR: offside, no foul, no card."}).commit()
console.log('pickford situation fixed')

const lines: Record<string, string> = {
  'pundit-10': "One human vote is worth eight bots. I've been saying that for years.", // weight is ×8 now
  'pundit-19': 'Confirmed by the people. Adds about a minute per decision. Worth it.', // windows are 60/30/15 s
  'pundit-23': 'The crowd has overruled the officials. Nobody tell the referee.', // overturned isn't always the on-field call
}
for (const [id, text] of Object.entries(lines)) {
  await content.patch(id).set({text}).commit()
  console.log(id, 'updated')
}
