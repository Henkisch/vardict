'use client'

import Link from 'next/link'
import {useParams} from 'next/navigation'

import {Clip} from '@/components/Clip'
import {OutcomeBadge} from '@/components/OutcomeBadge'
import {useLiveQuery} from '@/lib/live'
import {groupRuns, runOutcome, incidentOutcome, isDecided, OUTCOME_LABEL} from '@/lib/outcome'
import {CALL_LABELS, formatClock, roundLabel, type IncidentResult} from '@/lib/queries'

const RESULT = {
  upheld: {label: 'Upheld', tone: 'text-uphold'},
  overturned: {label: 'Overturned', tone: 'text-overturn'},
  tooClose: {label: 'Too close', tone: 'text-var'},
  noVotes: {label: 'No fans voted', tone: 'text-muted'},
} as const

export default function IncidentPage() {
  const {slug} = useParams<{slug: string}>()
  const {data: incident} = useLiveQuery<IncidentResult | null>(`/api/live?q=incident&slug=${encodeURIComponent(slug)}`, {
    intervalMs: 30_000,
  })

  if (incident === undefined) return <main className="p-8 text-muted">Loading the verdict…</main>
  if (incident === null) return <main className="p-8">No incident called “{slug}”.</main>

  const votedSeconds = incident.rounds.filter((r) => r.result).reduce((n, r) => n + r.seconds, 0)
  const runs = groupRuns(incident.rounds)
  const {homeTeam: home, awayTeam: away} = incident.match
  const outcome = incidentOutcome(incident.rounds)
  // The control case: VAR was simply wrong. Overturning it is the "right" call.
  const controlVerdict =
    incident.controlCase && isDecided(outcome)
      ? outcome === 'upheld'
        ? 'The people upheld a decision the referees themselves admit was wrong.'
        : 'The people refused to rubber-stamp a decision the referees admit was wrong.'
      : undefined
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <div className="flex items-baseline gap-4">
          <Link href="/live" className="font-display text-xl font-extrabold uppercase">
            VAR<span className="text-var">dict</span>
          </Link>
          <Link href="/incidents" className="text-sm text-muted underline">
            ← Back to results
          </Link>
        </div>
        <OutcomeBadge outcome={outcome} className="mt-2 self-start" />
        <p className="text-sm text-muted">
          {incident.match.competition} · {home.name} {incident.match.score.home}–{incident.match.score.away} {away.name}
        </p>
        <h1 className="font-display text-5xl font-extrabold uppercase text-balance">{incident.title}</h1>
        {incident.situation && <p className="text-xl">{incident.situation}</p>}
        {controlVerdict && <p className="text-lg text-var">Control case. {controlVerdict}</p>}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {/* Who won the argument is marked: the VAR's call if the fans kept it, the referee's if they overturned it. */}
        <Call label="The referee said" value={incident.originalCall} state={outcome === 'overturned' ? 'won' : isDecided(outcome) ? 'lost' : undefined} />
        <Call label="The VAR said" value={incident.varRecommendation} accent state={outcome === 'upheld' ? 'won' : isDecided(outcome) ? 'lost' : undefined} />
        <People outcome={outcome} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Clip clip={incident.clip} fallbackText={incident.fallbackText} />
        <div className="flex flex-col gap-2 rounded-lg bg-pitch p-5">
          <p className="text-sm text-muted">Time added by democracy</p>
          <p className="font-display text-5xl font-extrabold text-var tabular">
            {formatClock(incident.realDelaySeconds + votedSeconds)}
          </p>
          <p className="text-sm text-muted tabular">
            {formatClock(incident.realDelaySeconds)} real VAR review + {formatClock(votedSeconds)} of voting over{' '}
            {incident.rounds.length} {incident.rounds.length === 1 ? 'round' : 'rounds'}.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold uppercase">Every round</h2>
        {runs.length === 0 && <p className="text-muted">Nobody has sent this one to the people yet.</p>}
        {runs.map((run, i) => {
          const runResult = OUTCOME_LABEL[runOutcome(run)]
          return (
          <div key={run[0].workflowInstanceId} className="flex flex-col gap-2">
            <p className="flex items-center gap-3 text-sm text-muted">
              Run {i + 1} <span className={`font-semibold ${runResult.tone}`}>{runResult.label}</span>
            </p>
            <ol className="flex flex-col gap-2">
              {run.map((round) => {
                const total = round.uphold + round.overturn
                const pct = total ? Math.round((100 * round.uphold) / total) : 50
                return (
                  <li key={round._id} className="grid grid-cols-[9rem_minmax(0,1fr)_10rem] items-center gap-3">
                    <span className="text-sm">
                      {roundLabel(round.round)}
                      {round.loop > 1 && <span className="text-muted"> · loop {round.loop}</span>}
                    </span>
                    <div className="flex h-4 overflow-hidden rounded bg-overturn" title={`${pct}% uphold`}>
                      <div className="bar h-full bg-uphold" style={{width: `${pct}%`}} />
                    </div>
                    <span className={`text-right font-display text-lg font-bold uppercase ${round.result ? RESULT[round.result].tone : 'text-muted'}`}>
                      {pct}% {round.result ? RESULT[round.result].label : 'open'}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
          )
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">The outcry · {incident.outcry.level}/5</h2>
        <p className="max-w-prose leading-relaxed">{incident.outcry.summary}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {incident.outcry.sources.map((url) => (
            <li key={url}>
              <a className="text-muted underline" href={url} target="_blank" rel="noreferrer">
                {new URL(url).hostname.replace('www.', '')}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-6 text-sm">
        {incident.others.map((other) => (
          <Link key={other.slug} href={`/incidents/${other.slug}`} className="text-muted underline">
            {other.title}
          </Link>
        ))}
      </nav>
    </main>
  )
}

// One side of the argument. Once decided, the call that stands is marked and the other one fades.
function Call({label, value, accent = false, state}: {label: string; value: string; accent?: boolean; state?: 'won' | 'lost'}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg p-4 ${state === 'won' ? 'bg-raised ring-2 ring-chalk' : 'bg-pitch'} ${state === 'lost' ? 'opacity-50' : ''}`}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className={`font-display text-3xl font-extrabold uppercase leading-none ${accent ? 'text-var' : ''}`}>
        {CALL_LABELS[value] ?? value}
      </p>
      {state === 'won' && <p className="text-sm font-semibold">Stands</p>}
    </div>
  )
}

// The people's part, coloured by where the vote is.
function People({outcome}: {outcome: ReturnType<typeof incidentOutcome>}) {
  const {label, tone} = OUTCOME_LABEL[outcome]
  const waiting = outcome === 'notVoted'
  return (
    <div className={`flex flex-col gap-1 rounded-lg p-4 ${waiting ? 'border border-dashed border-line' : 'bg-pitch'}`}>
      <p className="text-sm text-muted">The people</p>
      <p className={`font-display text-3xl font-extrabold uppercase leading-none ${tone}`}>
        {outcome === 'upheld' ? 'Kept it' : outcome === 'overturned' ? 'Overturned it' : waiting ? 'Not voted yet' : label}
      </p>
    </div>
  )
}
