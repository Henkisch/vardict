'use client'

import Link from 'next/link'

import {OutcomeBadge} from '@/components/OutcomeBadge'
import {Scorebug} from '@/components/Scorebug'
import {incidentOutcome, isDecided, OUTCOME_LABEL} from '@/lib/outcome'
import {useLiveQuery} from '@/lib/live'
import {CALL_LABELS, formatClock, type IncidentOverviewRow, type IncidentsOverview} from '@/lib/queries'

export default function IncidentsPage() {
  const {data: overview} = useLiveQuery<IncidentsOverview>('/api/live?q=incidents', {intervalMs: 30_000})

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <Link href="/live" className="font-display text-xl font-extrabold uppercase">
          VAR<span className="text-var">dict</span>
        </Link>
        <h1 className="font-display text-5xl font-extrabold uppercase text-balance">Results</h1>
        <p className="text-sm text-muted">Time added by democracy</p>
        <p className="font-display text-5xl font-extrabold text-var tabular">
          {overview ? formatClock(overview.democracySeconds) : '--:--'}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {overview === undefined && <p className="text-muted">Loading the verdicts…</p>}
        {overview?.incidents.map((incident) => (
          <IncidentRow key={incident.slug} incident={incident} />
        ))}
      </section>
    </main>
  )
}

function IncidentRow({incident}: {incident: IncidentOverviewRow}) {
  const outcome = incidentOutcome(incident.rounds)
  const {edge} = OUTCOME_LABEL[outcome]
  const decided = isDecided(outcome)
  const {homeTeam: home, awayTeam: away} = incident.match
  // The final call: the VAR's if the fans kept it, the referee's if they overturned it (workflow v4).
  const finalCall = outcome === 'upheld' ? incident.varRecommendation : outcome === 'overturned' ? incident.originalCall : undefined
  // The control case: VAR was simply wrong, so overturning it is "right".
  const controlVerdict =
    incident.controlCase && decided
      ? outcome === 'upheld'
        ? {text: 'The people got it wrong.', tone: 'text-overturn'}
        : {text: 'The people got it right.', tone: 'text-uphold'}
      : undefined

  return (
    <Link
      href={`/incidents/${incident.slug}`}
      className={`group relative flex overflow-hidden rounded-lg bg-pitch transition-colors hover:bg-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
        outcome === 'notVoted' ? 'opacity-70 hover:opacity-100' : ''
      }`}
    >
      <span className={`w-1.5 shrink-0 ${edge}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Scorebug home={home} away={away} minute={incident.minute} />
            <span className="text-sm text-muted">{new Date(incident.match.date).toLocaleDateString('en-GB')}</span>
          </div>
          <h2 className="font-display text-2xl font-extrabold uppercase leading-tight text-balance sm:text-3xl">{incident.title}</h2>
          <p className="text-sm text-muted">
            VAR said {CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation}
            {incident.rounds.length > 0 && ` · ${incident.rounds.length} ${incident.rounds.length === 1 ? 'round' : 'rounds'}`}
            {incident.controlCase && ' · control case: the VAR was wrong'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <OutcomeBadge outcome={outcome} />
          {finalCall && (
            <p className="font-display text-3xl font-extrabold uppercase leading-none">
              {CALL_LABELS[finalCall] ?? finalCall}
            </p>
          )}
          {controlVerdict && <p className={`text-sm font-semibold ${controlVerdict.tone}`}>{controlVerdict.text}</p>}
        </div>
      </div>
    </Link>
  )
}
