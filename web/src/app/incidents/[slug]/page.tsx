'use client'

import Link from 'next/link'
import {useParams} from 'next/navigation'

import {Clip} from '@/components/Clip'
import {OutcomeBadge} from '@/components/OutcomeBadge'
import {Scorebug} from '@/components/Scorebug'
import {SiteHeader} from '@/components/SiteHeader'
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

  if (incident === undefined) return <Frame><p className="p-5 text-muted">Loading the verdict…</p></Frame>
  if (incident === null) return <Frame><p className="p-5">No incident called “{slug}”.</p></Frame>

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
    <Frame>
      {/* The same shape as /live's MatchScene: the incident on a rail, the footage beside it. */}
      <section className="flex flex-col overflow-hidden rounded-xl bg-pitch lg:flex-row">
        <div className="flex shrink-0 flex-col gap-5 p-5 lg:w-[30rem] lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/incidents" className="text-sm text-muted hover:text-chalk">
              ← All results
            </Link>
            <OutcomeBadge outcome={outcome} />
          </div>
          <div className="flex flex-col gap-3">
            <Scorebug home={home} away={away} minute={incident.minute} />
            <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.95] text-balance xl:text-5xl">{incident.title}</h1>
            {incident.situation && <p className="text-lg leading-snug text-muted">{incident.situation}</p>}
            <p className="text-sm text-muted">
              {incident.match.competition} · final score {incident.match.score.home}–{incident.match.score.away}
            </p>
            {controlVerdict && <p className="text-var">Control case. {controlVerdict}</p>}
          </div>
          {/* Who won the argument is marked: the VAR's call if the fans kept it, the referee's if they overturned it. */}
          <div className="grid grid-cols-3 gap-2">
            <Call label="Referee" value={incident.originalCall} state={outcome === 'overturned' ? 'won' : isDecided(outcome) ? 'lost' : undefined} />
            <Call label="VAR" value={incident.varRecommendation} accent state={outcome === 'upheld' ? 'won' : isDecided(outcome) ? 'lost' : undefined} />
            <People outcome={outcome} />
          </div>
          <div className="flex items-stretch gap-3">
            <span className="w-1.5 shrink-0 bg-var" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">Time added by democracy</p>
              <p className="font-display text-4xl font-extrabold leading-none text-var tabular">
                {formatClock(incident.realDelaySeconds + votedSeconds)}
              </p>
              <p className="text-sm text-muted tabular">
                {formatClock(incident.realDelaySeconds)} real VAR review + {formatClock(votedSeconds)} of voting over{' '}
                {incident.rounds.length} {incident.rounds.length === 1 ? 'round' : 'rounds'}
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 p-2 lg:py-6 lg:pl-0 lg:pr-6">
          {/* Never taller than the screen leaves room for: capped at 16:9 of the viewport height minus the chrome. */}
          <div className="ml-auto w-full lg:max-w-[calc((100dvh-9rem)*16/9)]">
            <Clip clip={incident.clip} fallbackText={incident.fallbackText} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-xl bg-pitch p-5 lg:p-6">
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
                        <span className="text-sm">{roundLabel(round.round)}</span>
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

        <section className="flex flex-col gap-3 rounded-xl bg-pitch p-5 lg:p-6">
          <h2 className="font-display text-2xl font-bold uppercase">The outcry · {incident.outcry.level}/5</h2>
          <p className="max-w-prose leading-relaxed">{incident.outcry.summary}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {incident.outcry.sources.map((url) => (
              <li key={url}>
                <a className="text-muted underline hover:text-chalk" href={url} target="_blank" rel="noreferrer">
                  {new URL(url).hostname.replace('www.', '')}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <nav aria-label="Other incidents" className="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-1 pb-6 text-sm">
        <span className="text-muted">More incidents</span>
        {incident.others.map((other) => (
          <Link key={other.slug} href={`/incidents/${other.slug}`} className="underline hover:text-var">
            {other.title}
          </Link>
        ))}
      </nav>
    </Frame>
  )
}

// One side of the argument. Once decided, the call that stands is marked and the other one fades.
function Call({label, value, accent = false, state}: {label: string; value: string; accent?: boolean; state?: 'won' | 'lost'}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-lg p-3 ${state === 'won' ? 'bg-raised ring-2 ring-chalk' : 'bg-ink/40'} ${state === 'lost' ? 'opacity-50' : ''}`}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className={`font-display text-xl font-extrabold uppercase leading-none ${accent ? 'text-var' : ''}`}>
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
    <div className={`flex min-w-0 flex-col gap-1 rounded-lg p-3 ${waiting ? 'border border-dashed border-line' : 'bg-ink/40'}`}>
      <p className="text-sm text-muted">The people</p>
      <p className={`font-display text-xl font-extrabold uppercase leading-none ${tone}`}>
        {outcome === 'upheld' ? 'Kept it' : outcome === 'overturned' ? 'Overturned it' : waiting ? 'Not yet' : label}
      </p>
    </div>
  )
}

// The same frame as /live and /incidents: floodlit backdrop, the shared header, full width.
function Frame({children}: {children: React.ReactNode}) {
  return (
    <div className="stadium flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-4 px-4 py-3 sm:px-6">
        <SiteHeader current="results" />
        {children}
      </main>
    </div>
  )
}
