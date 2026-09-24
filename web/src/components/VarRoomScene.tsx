import Link from 'next/link'

import {FitBox} from '@/components/FitBox'
import {MonitorWall, WALL_RATIO} from '@/components/MonitorWall'
import {CALL_LABELS, formatClock, type IncidentCard, type LiveReferendum} from '@/lib/queries'

type Props = {
  incident: IncidentCard
  // Set when the run was overturned and is back here for another look.
  loop?: number
  last?: LiveReferendum
  start: React.ReactNode
}

// What the VAR is checking, shown small in the monitor bar. Keyed by incident.incidentType.
const CHECK: Record<string, string> = {
  offside: 'Checking goal · possible offside',
  handball: 'Checking penalty · possible handball',
  penalty: 'Checking penalty',
  redCard: 'Checking possible red card',
  mistakenIdentity: 'Checking player identity',
  goalLine: 'Checking goal-line',
}

const LAST_COPY = {
  upheld: {label: 'Upheld', tone: 'text-uphold'},
  overturned: {label: 'Overturned', tone: 'text-overturn'},
  tooClose: {label: 'Too close', tone: 'text-var'},
} as const

// What the big screen shows between votes: the VAR room at work on the next decision.
export function VarRoomScene({incident, last, start}: Props) {
  const {homeTeam: home, awayTeam: away} = incident.match
  const recommendation = CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      {/* The wall gets all the room there is: this is the show. */}
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-pitch lg:min-h-0 lg:flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-pitch px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-overturn motion-safe:animate-pulse" aria-hidden />
            VAR · {CHECK[incident.incidentType ?? ''] ?? 'Review'}
          </span>
          <span className="tabular text-muted">
            <span className="hidden sm:inline">Real VAR check took </span>
            {formatClock(incident.realDelaySeconds)}
          </span>
        </div>
        {/* Context beside the footage on desktop (the wall is height-limited, so the side has room); above it on phones. */}
        <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
          <div className="flex shrink-0 flex-col justify-between gap-4 p-4 lg:w-80 xl:w-96">
            <div>
              <p className="font-display text-lg font-bold uppercase tracking-wide">
                {home.name} v {away.name} <span className="text-muted">{incident.minute}&apos;</span>
              </p>
              <p className="text-sm text-muted">{incident.match.competition}</p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-3xl font-extrabold uppercase leading-tight text-balance xl:text-4xl">
                {incident.title}
              </h2>
              {incident.situation && <p className="text-lg leading-snug">{incident.situation}</p>}
            </div>
          </div>
          <FitBox ratio={WALL_RATIO} className="p-2 lg:flex-1">
            <MonitorWall incident={incident} />
          </FitBox>
        </div>
      </section>

      {/* The decision as a story, left to right: what the referee said, what the VAR says, and your call. */}
      <section className="grid shrink-0 items-stretch gap-3 rounded-xl border border-line bg-pitch p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)] sm:items-center">
        <Step label="The referee said" value={CALL_LABELS[incident.originalCall] ?? incident.originalCall} />
        <span className="hidden font-display text-3xl text-muted sm:block" aria-hidden>→</span>
        <Step label="The VAR says" value={recommendation} highlight />
        <span className="hidden font-display text-3xl text-muted sm:block" aria-hidden>→</span>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Your call · keep it or overturn it?</p>
          {start}
          <p className="text-xs text-muted">Over 55% keeps it · under 45% overturns · in between: extra time</p>
        </div>
      </section>

      {last && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-4 text-sm">
          <span className="uppercase tracking-[0.2em] text-muted">Last verdict</span>
          <span>{last.incident.title}</span>
          {last.result && (
            <span className={`font-display text-lg font-extrabold uppercase ${LAST_COPY[last.result].tone}`}>
              {last.result === 'overturned' && last.loop >= 3 ? 'Abandoned, match to be replayed' : LAST_COPY[last.result].label}
            </span>
          )}
          <Link href={`/incidents/${last.incident.slug}`} className="text-var underline">
            Every round
          </Link>
        </p>
      )}
    </div>
  )
}

function Step({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-var/60' : 'border-line'}`}>
      <p className={`text-xs uppercase tracking-[0.2em] ${highlight ? 'text-var' : 'text-muted'}`}>{label}</p>
      <p className={`font-display text-3xl font-extrabold uppercase leading-none ${highlight ? 'text-var' : ''}`}>{value}</p>
    </div>
  )
}

