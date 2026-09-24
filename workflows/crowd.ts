// The simulated crowd. Pure and seeded: the same incident, round and loop always produce the same crowd,
// so demo runs are repeatable. Every vote it produces is flagged simulated by the runner.

export type Choice = 'uphold' | 'overturn'
export type Persona = 'homeFan' | 'awayFan' | 'neutral' | 'pundit' | 'chaos'

export type CrowdInput = {
  seed: number
  round: string
  loop: number
  windowSeconds: number
  // Which side the VAR recommendation helps.
  recommendationFavours: 'home' | 'away'
  // 1–5: how loud the real-world outcry was. Loud outcry = the public thought VAR got it wrong.
  outcryLevel: number
}

export type PlannedVote = {
  atMs: number
  persona: Persona
  // null for the chaos voter, who decides at cast time: always with the current minority.
  choice: Choice | null
}

export const CROWD_SIZE = 60
const SHARES: [Persona, number][] = [
  ['homeFan', 21], // 35%
  ['awayFan', 21], // 35%
  ['neutral', 12], // 20%
  ['pundit', 5], // ~9%, one bloc
  ['chaos', 1],
]
const WAVES = 5
const PUNDIT_LEAD_MS = 5_000

// mulberry32: tiny, fast, good enough for a crowd.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(...parts: (string | number)[]) {
  let h = 2166136261
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function planCrowd(input: CrowdInput): PlannedVote[] {
  const random = rng(hash(input.seed, input.round, input.loop))
  const windowMs = input.windowSeconds * 1000
  const favoursHome = input.recommendationFavours === 'home'
  // Neutrals lean against a call the world was loud about: outcry 1 → ~73% uphold, 5 → ~27%.
  const neutralUphold = 0.85 - input.outcryLevel * 0.115
  // The pundits pick one side together, leaning the same way as the neutrals.
  const punditChoice: Choice = random() < neutralUphold ? 'uphold' : 'overturn'
  // Wave times: fans and neutrals trickle in across the window, before the pundits' final bloc.
  const waveAt = (i: number) => Math.round(((i + 1) / (WAVES + 1)) * (windowMs - PUNDIT_LEAD_MS))

  const plan: PlannedVote[] = []
  for (const [persona, count] of SHARES) {
    for (let i = 0; i < count; i++) {
      let choice: Choice | null
      let atMs = waveAt(Math.floor(random() * WAVES))
      if (persona === 'homeFan') choice = favoursHome ? 'uphold' : 'overturn'
      else if (persona === 'awayFan') choice = favoursHome ? 'overturn' : 'uphold'
      else if (persona === 'neutral') choice = random() < neutralUphold + (random() - 0.5) * 0.3 ? 'uphold' : 'overturn'
      else if (persona === 'pundit') {
        choice = punditChoice
        atMs = windowMs - PUNDIT_LEAD_MS + Math.round(random() * 3_000)
      } else {
        choice = null
        atMs = Math.round(windowMs * (0.5 + random() * 0.3))
      }
      plan.push({atMs, persona, choice})
    }
  }
  return plan.sort((a, b) => a.atMs - b.atMs)
}

// The chaos voter's pick, given the tally so far. A tie counts uphold as the minority.
export const chaosChoice = (uphold: number, overturn: number): Choice => (uphold <= overturn ? 'uphold' : 'overturn')

// Group a plan into waves that land at the same moment, so the runner writes one transaction per wave.
export function waves(plan: PlannedVote[]) {
  const byTime = new Map<number, PlannedVote[]>()
  for (const vote of plan) byTime.set(vote.atMs, [...(byTime.get(vote.atMs) ?? []), vote])
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([atMs, votes]) => ({atMs, votes}))
}
