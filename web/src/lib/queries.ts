// GROQ for the public screens. The vote split and the democracy clock are always derived, never stored.

// Shared with the workflow definition and the VAR Room - see workflows/shared.ts. Dependency-free on purpose:
// importing workflows/rules (definitions/peoplesVar.ts) here would pull @sanity/workflow-engine/define into
// this client-imported module's bundle.
import {CALL_LABELS, HUMAN_VOTE_WEIGHT, weightedCount} from 'workflows/shared'

export {CALL_LABELS, HUMAN_VOTE_WEIGHT}

const team = '{name, shortName, primaryColor}'

const INCIDENT_CARD = `{
  _id, title, "slug": slug.current, situation, minute, varRecommendation, originalCall, controlCase, fallbackText,
  realDelaySeconds, finalCall, incidentType,
  clip{youtubeId, startSeconds, endSeconds, keySeconds, channel, embedAllowed},
  match->{competition, homeTeam->${team}, awayTeam->${team}}
}`

export const LIVE_QUERY = `{
  "referendum": *[_type == "referendum"] | order(windowOpensAt desc)[0]{
    _id, round, loop, windowOpensAt, closesAt, result, workflowInstanceId,
    "uphold": ${weightedCount('uphold')},
    "overturn": ${weightedCount('overturn')},
    "bots": coalesce(botVotes.uphold, 0) + coalesce(botVotes.overturn, 0),
    "humans": count(*[_type == "vote" && references(^._id)]),
    "shootout": *[_type == "referendum" && workflowInstanceId == ^.workflowInstanceId && loop == ^.loop
      && round match "shootout*" && defined(result)] | order(windowOpensAt asc).result,
    // Every round of this run, for the workflow path on the verdict screen.
    "run": *[_type == "referendum" && workflowInstanceId == ^.workflowInstanceId] | order(windowOpensAt asc){
      round, loop, result, "seconds": dateTime(closesAt) - dateTime(windowOpensAt)
    },
    incident->${INCIDENT_CARD}
  },
  // Who the VAR room is looking at while nothing is live: next in line, same order as /api/start picks.
  "next": *[_type == "incident" && !defined(finalCall)]{
    ..., "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt
  } | order(coalesce(last, "0") asc)[0]${INCIDENT_CARD},
  "democracySeconds": math::sum(*[_type == "incident"].realDelaySeconds)
    + coalesce(math::sum(*[_type == "referendum" && defined(result)]{
        "s": dateTime(closesAt) - dateTime(windowOpensAt)
      }.s), 0),
  // The pundit ticker's lines (Studio: Pundit lines), and the fixture list for the Enter the stadium intro.
  "pundits": *[_type == "punditLine"]{_id, text, pundit, trigger, "incident": incident._ref},
  "fixtures": *[_type == "incident"] | order(match->date asc){
    _id, title, "home": match->homeTeam->name, "away": match->awayTeam->name, "competition": match->competition
  }
}`

export type PunditLine = {_id: string; text: string; pundit: string; trigger: string; incident?: string}
export type Fixture = {_id: string; title: string; home: string; away: string; competition: string}

export type Team = {name: string; shortName: string; primaryColor?: string}

export type LiveReferendum = {
  _id: string
  round: string
  loop: number
  windowOpensAt: string
  closesAt: string
  result?: 'upheld' | 'overturned' | 'tooClose' | 'noVotes'
  workflowInstanceId: string
  uphold: number
  overturn: number
  bots: number
  humans: number
  shootout: ('upheld' | 'overturned')[]
  run: RunRound[]
  incident: IncidentCard
}

export type RunRound = {round: string; loop: number; result?: 'upheld' | 'overturned' | 'tooClose' | 'noVotes'; seconds: number}

export type IncidentCard = {
    _id: string
    title: string
    slug: string
    situation?: string
    minute: number
    varRecommendation: string
    originalCall: string
    controlCase?: boolean
    fallbackText: string
    realDelaySeconds: number
    finalCall?: string
    incidentType?: string
    clip?: {
      youtubeId: string
      startSeconds: number
      endSeconds: number
      // The key moment (the contact, the offside line) for the replay monitor. Optional: defaults to mid-clip.
      keySeconds?: number
      channel: string
      embedAllowed: boolean
    }
    match: {competition: string; homeTeam: Team; awayTeam: Team}
}

export type LiveState = {
  referendum: LiveReferendum | null
  next: IncidentCard | null
  democracySeconds: number
  pundits: PunditLine[]
  fixtures: Fixture[]
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

// Shared by INCIDENT_QUERY and INCIDENTS_QUERY: every round with its weighted split, used to derive an
// incident's outcome (see lib/outcome.ts) and to render each round's bar.
const ROUNDS = `*[_type == "referendum" && references(^._id)] | order(windowOpensAt asc){
    _id, round, loop, result, windowOpensAt, workflowInstanceId,
    "seconds": dateTime(closesAt) - dateTime(windowOpensAt),
    "uphold": ${weightedCount('uphold')},
    "overturn": ${weightedCount('overturn')},
    "humans": count(*[_type == "vote" && references(^._id)])
  }`

export const INCIDENT_QUERY = `*[_type == "incident" && slug.current == $slug][0]{
  title, situation, minute, originalCall, varRecommendation, finalCall, controlCase, realDelaySeconds, fallbackText,
  clip{youtubeId, startSeconds, endSeconds, channel, embedAllowed},
  outcry{level, summary, sources},
  match->{competition, date, venue, score, homeTeam->${team}, awayTeam->${team}},
  "rounds": ${ROUNDS},
  "others": *[_type == "incident" && slug.current != $slug] | order(title asc){title, "slug": slug.current}
}`

export type IncidentRound = {
  _id: string
  round: string
  loop: number
  result?: 'upheld' | 'overturned' | 'tooClose' | 'noVotes'
  windowOpensAt: string
  workflowInstanceId: string
  seconds: number
  uphold: number
  overturn: number
  humans: number
}

export type IncidentResult = {
  title: string
  situation?: string
  minute: number
  originalCall: string
  varRecommendation: string
  finalCall?: string
  controlCase?: boolean
  realDelaySeconds: number
  fallbackText: string
  clip?: IncidentCard['clip']
  outcry: {level: number; summary: string; sources: string[]}
  match: {competition: string; date: string; venue: string; score: {home: number; away: number}; homeTeam: Team; awayTeam: Team}
  rounds: IncidentRound[]
  others: {title: string; slug: string}[]
}

// The overview page: every incident's fixture, VAR call and rounds, plus the same global democracy clock
// LIVE_QUERY computes, so the page can show one incident-independent total at the top.
export const INCIDENTS_QUERY = `{
  "incidents": *[_type == "incident"] | order(match->date asc){
    title, "slug": slug.current, controlCase, varRecommendation, finalCall, realDelaySeconds,
    match->{date, homeTeam->${team}, awayTeam->${team}},
    "rounds": ${ROUNDS}
  },
  "democracySeconds": math::sum(*[_type == "incident"].realDelaySeconds)
    + coalesce(math::sum(*[_type == "referendum" && defined(result)]{
        "s": dateTime(closesAt) - dateTime(windowOpensAt)
      }.s), 0)
}`

export type IncidentOverviewRow = {
  title: string
  slug: string
  controlCase?: boolean
  varRecommendation: string
  finalCall?: string
  realDelaySeconds: number
  match: {date: string; homeTeam: Team; awayTeam: Team}
  rounds: IncidentRound[]
}

export type IncidentsOverview = {incidents: IncidentOverviewRow[]; democracySeconds: number}
