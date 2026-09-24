'use client'

import {Bars} from '@/components/Bars'
import {VoteButtons} from '@/components/VoteButtons'
import {useCloseWhenCounting, useLiveQuery, useNow} from '@/lib/live'
import {CALL_LABELS, HUMAN_VOTE_WEIGHT, LIVE_QUERY, roundLabel, type LiveState} from '@/lib/queries'

export default function VotePage() {
  const state = useLiveQuery<LiveState>(LIVE_QUERY)
  const now = useNow()
  const ref = state?.referendum
  const secondsLeft = ref && !ref.result ? Math.max(0, (Date.parse(ref.closesAt) - now) / 1000) : 0
  const open = Boolean(ref && secondsLeft > 0)
  useCloseWhenCounting(Boolean(ref && !ref.result && secondsLeft === 0))

  const incident = ref?.incident
  return (
    <main className="flex min-h-dvh flex-col gap-5 px-4 py-5">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-extrabold uppercase">
          VAR<span className="text-var">dict</span>
        </h1>
        {open && (
          <p className="font-display text-4xl font-extrabold tabular">
            {Math.ceil(secondsLeft)}
            <span className="text-lg text-muted">s</span>
          </p>
        )}
      </header>

      {open && incident && ref ? (
        <>
          <section className="flex flex-col gap-1">
            <p className="font-display text-lg font-bold uppercase text-muted">
              {incident.match.homeTeam.shortName} v {incident.match.awayTeam.shortName} · {incident.minute}&apos; ·{' '}
              {roundLabel(ref.round)}
            </p>
            {incident.situation && <p className="text-lg leading-snug">{incident.situation}</p>}
            <p className="mt-2 text-sm uppercase tracking-[0.2em] text-muted">The VAR room recommends</p>
            <p className="font-display text-4xl font-extrabold uppercase text-var">
              {CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation}
            </p>
            <p className="text-sm text-muted">You’re up against a simulated crowd. Your vote counts ×{HUMAN_VOTE_WEIGHT}.</p>
          </section>

          <VoteButtons key={ref._id} referendumId={ref._id} size="huge" />
          <Bars uphold={ref.uphold} overturn={ref.overturn} size="small" />
        </>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="font-display text-3xl font-bold uppercase">
            {ref && !ref.result ? 'Counting…' : 'No vote is live'}
          </p>
          <p className="max-w-xs text-muted">
            Keep this page open. When the VAR room sends a decision to the people, the buttons appear here.
          </p>
        </section>
      )}
    </main>
  )
}
