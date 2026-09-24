'use client'

import Link from 'next/link'
import {useParams} from 'next/navigation'

import {Clip} from '@/components/Clip'
import {useLiveQuery} from '@/lib/live'
import {CALL_LABELS, formatClock, INCIDENT_QUERY, roundLabel, type IncidentResult, type IncidentRound} from '@/lib/queries'

const RESULT = {
  upheld: {label: 'Upheld', tone: 'text-uphold'},
  overturned: {label: 'Overturned', tone: 'text-overturn'},
  tooClose: {label: 'Too close', tone: 'text-var'},
} as const

// Group rounds into runs (one workflow instance each), then trips to the VAR room (loops) within a run.
function groupRuns(rounds: IncidentRound[]) {
  const runs = new Map<string, IncidentRound[]>()
  for (const round of rounds) runs.set(round.workflowInstanceId, [...(runs.get(round.workflowInstanceId) ?? []), round])
  return [...runs.values()]
}

export default function IncidentPage() {
  const {slug} = useParams<{slug: string}>()
  const incident = useLiveQuery<IncidentResult | null>(INCIDENT_QUERY, {slug})

  if (incident === undefined) return <main className="p-8 text-muted">Loading the verdict…</main>
  if (incident === null) return <main className="p-8">No incident called “{slug}”.</main>

  const votedSeconds = incident.rounds.filter((r) => r.result).reduce((n, r) => n + r.seconds, 0)
  const runs = groupRuns(incident.rounds)
  const {homeTeam: home, awayTeam: away} = incident.match
  const final = incident.finalCall
  // The control case: VAR was simply wrong. Did the people get it right, i.e. overturn it?
  const controlVerdict =
    incident.controlCase && incident.rounds.length
      ? final
        ? 'The people upheld a decision the referees themselves admit was wrong.'
        : 'The people refused to rubber-stamp a decision the referees admit was wrong.'
      : undefined

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <Link href="/live" className="font-display text-xl font-extrabold uppercase">
          VAR<span className="text-var">dict</span>
        </Link>
        <p className="text-sm uppercase tracking-[0.2em] text-muted">
          {incident.match.competition} · {home.name} {incident.match.score.home}–{incident.match.score.away} {away.name}
        </p>
        <h1 className="font-display text-5xl font-extrabold uppercase text-balance">{incident.title}</h1>
        {incident.situation && <p className="text-xl">{incident.situation}</p>}
        {controlVerdict && <p className="text-lg text-var">Control case. {controlVerdict}</p>}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Call label="On the pitch" value={incident.originalCall} />
        <Call label="The VAR room" value={incident.varRecommendation} />
        <Call label="The people" value={final} fallback={incident.rounds.length ? 'Not upheld (yet)' : 'Not voted yet'} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Clip clip={incident.clip} fallbackText={incident.fallbackText} />
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-pitch p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Time added by democracy</p>
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
        {runs.map((run, i) => (
          <div key={run[0].workflowInstanceId} className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.2em] text-muted">Run {i + 1}</p>
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
        ))}
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

function Call({label, value, fallback}: {label: string; value?: string; fallback?: string}) {
  return (
    <div className="rounded-lg border border-line bg-pitch p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold uppercase">
        {value ? (CALL_LABELS[value] ?? value) : <span className="text-muted">{fallback}</span>}
      </p>
    </div>
  )
}
