'use client'

import Link from 'next/link'

import {ViewTransition} from 'react'

import {OutcomeBadge} from '@/components/OutcomeBadge'
import {PageTransition} from '@/components/PageTransition'
import {Scorebug} from '@/components/Scorebug'
import {SiteHeader} from '@/components/SiteHeader'
import {incidentOutcome, isDecided, OUTCOME_LABEL} from '@/lib/outcome'
import {useLiveQuery} from '@/lib/live'
import {CALL_LABELS, formatClock, type IncidentOverviewRow, type IncidentsOverview} from '@/lib/queries'

export default function IncidentsPage() {
  const {data: overview} = useLiveQuery<IncidentsOverview>('/api/live?q=incidents', {intervalMs: 30_000})

  const decided = overview?.incidents.filter((i) => isDecided(incidentOutcome(i.rounds))).length ?? 0
  return (
    <div className="stadium flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-4 px-4 py-3 sm:px-6">
        <SiteHeader current="results" />
        <PageTransition>
        <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-6 rounded-xl bg-pitch p-5 sm:flex-row sm:items-end sm:justify-between lg:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-5xl font-extrabold uppercase leading-none lg:text-6xl">Results</h1>
            <p className="text-lg text-muted">
              {overview ? `${decided} of ${overview.incidents.length} decided by the people` : 'Loading the verdicts…'}
            </p>
          </div>
          <div className="flex items-stretch gap-3 sm:text-right">
            <span className="w-1.5 shrink-0 bg-var sm:order-last" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">Time added by democracy</p>
              <p className="font-display text-6xl font-extrabold leading-none text-var tabular lg:text-7xl">
                {overview ? formatClock(overview.democracySeconds) : '--:--'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 pb-6 xl:grid-cols-2">
          {overview?.incidents.map((incident) => (
            <IncidentRow key={incident.slug} incident={incident} />
          ))}
        </section>
        </div>
        </PageTransition>
      </main>
    </div>
  )
}

function IncidentRow({incident}: {incident: IncidentOverviewRow}) {
  const outcome = incidentOutcome(incident.rounds)
  const {edge} = OUTCOME_LABEL[outcome]
  const decided = isDecided(outcome)
  const {homeTeam: home, awayTeam: away} = incident.match
  // The final call: the VAR's if the fans kept it, the overturned call if they didn't (workflow v4).
  const finalCall = outcome === 'upheld' ? incident.varRecommendation : outcome === 'overturned' ? incident.overturnedCall : undefined
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
      transitionTypes={['nav-forward']}
      className={`group relative flex overflow-hidden rounded-lg bg-pitch transition-colors hover:bg-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-chalk`}
    >
      <span className={`w-1.5 shrink-0 ${edge}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Scorebug home={home} away={away} minute={incident.minute} />
            <span className="text-sm text-muted">{new Date(incident.match.date).toLocaleDateString('en-GB')}</span>
          </div>
          <ViewTransition name={`title-${incident.slug}`} share="morph" default="none">
            <h2 className="w-fit font-display text-2xl font-extrabold uppercase leading-tight text-balance sm:text-3xl">{incident.title}</h2>
          </ViewTransition>
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
