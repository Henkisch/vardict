// For each published incident and round: the simulated crowd's split, and where one human vote lands either way
// (upheld / overturned / EXTRA TIME). Run: pnpm tsx --env-file=../.env.local scripts/crowd-odds.ts
import {chaosChoice, planCrowd} from '../crowd'
import {createRuntime} from '../runtime'
import {HUMAN_VOTE_WEIGHT, WINDOW_SECONDS} from '../shared'
const {content} = createRuntime({projectId: process.env.SANITY_PROJECT_ID!, token: process.env.SANITY_WRITE_TOKEN!})
const incidents = await content.fetch<{title: string; crowdSeed: number; recommendationFavours: 'home' | 'away'; outcry: {level: number}}[]>(
  '*[_type == "incident" && !(_id in path("drafts.**"))] | order(match->date asc){title, crowdSeed, recommendationFavours, outcry}',
)
for (const inc of incidents) {
  for (const round of ['regular', 'extraTime'] as const) {
    const plan = planCrowd({seed: inc.crowdSeed, round, loop: 1, windowSeconds: WINDOW_SECONDS[round === 'regular' ? 'referendum' : 'extraTime'], recommendationFavours: inc.recommendationFavours, outcryLevel: inc.outcry?.level ?? 3} as never)
    let up = 0, down = 0
    for (const v of plan) { const c = v.choice ?? chaosChoice(up, down); if (c === 'uphold') up++; else down++ }
    const pct = (u: number, d: number) => Math.round((100 * u) / (u + d))
    const band = (p: number) => (p > 55 ? 'upheld' : p < 45 ? 'overturned' : 'EXTRA TIME')
    const pu = pct(up + HUMAN_VOTE_WEIGHT, down), po = pct(up, down + HUMAN_VOTE_WEIGHT)
    console.log(`${inc.title.slice(0, 32).padEnd(32)} ${round.padEnd(9)} bots ${pct(up, down)}% up | human uphold → ${pu}% ${band(pu)} | human overturn → ${po}% ${band(po)}`)
  }
}
