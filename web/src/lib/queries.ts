// GROQ for the public screens. The vote split and the democracy clock are always derived, never stored.

// Weighted split: a human vote counts this many times. Keep in sync with RULES.humanVoteWeight (workflows).
export const HUMAN_VOTE_WEIGHT = 20

const team = '{name, shortName, primaryColor}'

export const LIVE_QUERY = `{
  "referendum": *[_type == "referendum"] | order(windowOpensAt desc)[0]{
    _id, round, loop, windowOpensAt, closesAt, result, workflowInstanceId,
    "uphold": count(*[_type == "vote" && references(^._id) && choice == "uphold" && simulated == true])
      + ${HUMAN_VOTE_WEIGHT} * count(*[_type == "vote" && references(^._id) && choice == "uphold" && simulated != true]),
    "overturn": count(*[_type == "vote" && references(^._id) && choice == "overturn" && simulated == true])
      + ${HUMAN_VOTE_WEIGHT} * count(*[_type == "vote" && references(^._id) && choice == "overturn" && simulated != true]),
    "bots": count(*[_type == "vote" && references(^._id) && simulated == true]),
    "humans": count(*[_type == "vote" && references(^._id) && simulated != true]),
    "shootout": *[_type == "referendum" && workflowInstanceId == ^.workflowInstanceId && loop == ^.loop
      && round match "shootout*" && defined(result)] | order(windowOpensAt asc).result,
    incident->{
      title, "slug": slug.current, situation, minute, varRecommendation, originalCall, controlCase, fallbackText,
      clip{youtubeId, startSeconds, endSeconds, channel, embedAllowed},
      match->{competition, homeTeam->${team}, awayTeam->${team}}
    }
  },
  "democracySeconds": math::sum(*[_type == "incident"].realDelaySeconds)
    + coalesce(math::sum(*[_type == "referendum" && defined(result)]{
        "s": dateTime(closesAt) - dateTime(windowOpensAt)
      }.s), 0)
}`

export type Team = {name: string; shortName: string; primaryColor?: string}

export type LiveReferendum = {
  _id: string
  round: string
  loop: number
  windowOpensAt: string
  closesAt: string
  result?: 'upheld' | 'overturned' | 'tooClose'
  workflowInstanceId: string
  uphold: number
  overturn: number
  bots: number
  humans: number
  shootout: ('upheld' | 'overturned')[]
  incident: {
    title: string
    slug: string
    situation?: string
    minute: number
    varRecommendation: string
    originalCall: string
    controlCase?: boolean
    fallbackText: string
    clip?: {youtubeId: string; startSeconds: number; endSeconds: number; channel: string; embedAllowed: boolean}
    match: {competition: string; homeTeam: Team; awayTeam: Team}
  }
}

export type LiveState = {referendum: LiveReferendum | null; democracySeconds: number}

export const CALL_LABELS: Record<string, string> = {
  goal: 'Goal',
  noGoal: 'No goal',
  penalty: 'Penalty',
  noPenalty: 'No penalty',
  redCard: 'Red card',
  yellowCard: 'Yellow card',
  noFoul: 'No foul',
}

export function roundLabel(round: string) {
  if (round === 'regular') return 'Regular time'
  if (round === 'extraTime') return 'Extra time'
  return `Shootout · round ${round.replace('shootout', '')}`
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
