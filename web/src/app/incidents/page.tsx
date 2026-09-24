'use client'

import Link from 'next/link'

import {incidentOutcome, OUTCOME_LABEL} from '@/lib/outcome'
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
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Time added by democracy</p>
        <p className="font-display text-5xl font-extrabold text-var tabular">
          {overview ? formatClock(overview.democracySeconds) : '--:--'}
        </p>
      </header>

      <section className="flex flex-col gap-4">
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
  const {label, tone} = OUTCOME_LABEL[outcome]
  const {homeTeam: home, awayTeam: away} = incident.match
  // The control case: VAR was simply wrong, so overturning (or abandoning, its extreme form) is "right".
  const controlVerdict =
    incident.controlCase && (outcome === 'upheld' || outcome === 'abandoned')
      ? outcome === 'upheld'
        ? {text: 'The people got it wrong.', tone: 'text-overturn'}
        : {text: 'The people got it right.', tone: 'text-uphold'}
      : undefined

  return (
    <Link
      href={`/incidents/${incident.slug}`}
      className="flex flex-col gap-2 rounded-lg border border-line bg-pitch p-5 hover:border-chalk"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold uppercase tracking-wide">
          <span style={{color: home.primaryColor}}>■</span> {home.shortName} v {away.shortName}{' '}
          <span style={{color: away.primaryColor}}>■</span>
        </p>
        <p className="text-sm text-muted">{new Date(incident.match.date).toLocaleDateString()}</p>
      </div>
      <h2 className="font-display text-2xl font-extrabold uppercase">{incident.title}</h2>
      {incident.controlCase && (
        <p className="text-sm text-var">Control case: the VAR was wrong. Did the people notice?</p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <p>
          <span className="text-muted">VAR recommended </span>
          {CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation}
        </p>
        <p className={`font-display text-lg font-bold uppercase ${tone}`}>{label}</p>
        {controlVerdict && <p className={`font-bold ${controlVerdict.tone}`}>{controlVerdict.text}</p>}
        <p className="text-muted">
          {incident.rounds.length} {incident.rounds.length === 1 ? 'round' : 'rounds'}
        </p>
      </div>
    </Link>
  )
}
