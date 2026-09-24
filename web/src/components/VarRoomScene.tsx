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

const LAST_COPY = {
  upheld: {label: 'Upheld', tone: 'text-uphold'},
  overturned: {label: 'Overturned', tone: 'text-overturn'},
  tooClose: {label: 'Too close', tone: 'text-var'},
} as const

// What the big screen shows between votes: the VAR room at work on the next decision.
export function VarRoomScene({incident, loop, last, start}: Props) {
  const {homeTeam: home, awayTeam: away} = incident.match
  const recommendation = CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* The wall gets all the room there is: this is the show. */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-black">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-pitch px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-overturn motion-safe:animate-pulse" aria-hidden />
            VAR · Review
          </span>
          <span className="hidden text-muted sm:inline">
            {home.shortName} v {away.shortName} · {incident.minute}&apos;
          </span>
          <span className="tabular text-muted">
            <span className="hidden sm:inline">Real VAR check took </span>
            {formatClock(incident.realDelaySeconds)}
          </span>
        </div>
        <FitBox ratio={WALL_RATIO} className="flex-1 p-2">
          <MonitorWall incident={incident} />
        </FitBox>
      </section>

      {/* One strip under the wall: what happened, the two calls, the button. */}
      <section className="grid shrink-0 items-center gap-4 rounded-xl border border-line bg-pitch p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {loop ? `Back in the VAR room · loop ${loop} of 3` : 'In the VAR room'} · {incident.match.competition}
          </p>
          <h2 className="font-display text-3xl font-extrabold uppercase leading-tight text-balance">{incident.title}</h2>
          {incident.situation && <p className="mt-1 text-lg leading-snug lg:line-clamp-2">{incident.situation}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-3">
            <dt className="text-xs uppercase tracking-[0.2em] text-muted">On the pitch</dt>
            <dd className="font-display text-3xl font-extrabold uppercase">
              {CALL_LABELS[incident.originalCall] ?? incident.originalCall}
            </dd>
          </div>
          <div className="rounded-lg border border-var/60 p-3">
            <dt className="text-xs uppercase tracking-[0.2em] text-var">VAR recommends</dt>
            <dd className="font-display text-3xl font-extrabold uppercase text-var">{recommendation}</dd>
          </div>
          <p className="col-span-2 text-sm text-muted">It only stands if the people confirm it: over 55% upholds, under 45% sends it back.</p>
        </dl>
        {start}
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
