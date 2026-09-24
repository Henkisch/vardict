'use client'

import {useState} from 'react'

import {Bars} from '@/components/Bars'
import {useLiveQuery, useNow} from '@/lib/live'
import {CALL_LABELS, HUMAN_VOTE_WEIGHT, LIVE_QUERY, roundLabel, type LiveState} from '@/lib/queries'

type Choice = 'uphold' | 'overturn'

function sessionId() {
  try {
    const existing = localStorage.getItem('vardict-session')
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem('vardict-session', fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

export default function VotePage() {
  const state = useLiveQuery<LiveState>(LIVE_QUERY)
  const now = useNow()
  const ref = state?.referendum
  const secondsLeft = ref && !ref.result ? Math.max(0, (Date.parse(ref.closesAt) - now) / 1000) : 0
  const open = Boolean(ref && secondsLeft > 0)

  // Votes by referendum id, so a new round shows fresh buttons.
  const [votes, setVotes] = useState<Record<string, Choice>>({})
  const [error, setError] = useState<string>()
  const mine = ref ? votes[ref._id] : undefined

  async function vote(choice: Choice) {
    if (!ref) return
    const session = sessionId()
    setError(undefined)
    setVotes((v) => ({...v, [ref._id]: choice}))
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({referendumId: ref._id, choice, sessionId: session}),
    })
    const body = await response.json().catch(() => ({}))
    if (body.status === 'alreadyVoted') setVotes((v) => ({...v, [ref._id]: body.choice}))
    else if (!response.ok) {
      setVotes((v) => {
        const next = {...v}
        delete next[ref._id]
        return next
      })
      setError(body.status === 'closed' ? 'Too late: that window has closed.' : 'Your vote didn’t count. Try again.')
    }
  }

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

          <div className="grid flex-1 grid-rows-2 gap-4">
            {(['uphold', 'overturn'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={Boolean(mine)}
                onClick={() => void vote(choice)}
                className={`rounded-2xl font-display text-6xl font-extrabold uppercase text-ink transition-opacity focus-visible:outline-4 focus-visible:outline-chalk ${
                  choice === 'uphold' ? 'bg-uphold' : 'bg-overturn'
                } ${mine && mine !== choice ? 'opacity-25' : ''}`}
              >
                {choice === 'uphold' ? 'Uphold' : 'Overturn'}
                {mine === choice && <span className="block text-xl font-bold">Your vote</span>}
              </button>
            ))}
          </div>
          {error && <p className="text-center text-overturn">{error}</p>}
          {mine && <Bars uphold={ref.uphold} overturn={ref.overturn} size="small" />}
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
