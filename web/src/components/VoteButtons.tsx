'use client'

import {useState} from 'react'

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

// Uphold / Overturn for one referendum. One vote per browser per round (the server enforces it too).
// `size="huge"` fills a phone screen; `size="panel"` sits in the big screen's side panel.
export function VoteButtons({
  referendumId,
  size,
  onVoted,
  outcomes,
  closed = false,
  weight,
}: {
  referendumId: string
  size: 'huge' | 'panel'
  // Called once the vote is stored: the round closes early (see /api/vote), so the screen should refetch.
  onVoted?: () => void
  // What each choice means for this incident, shown under the button (Uphold → the VAR's call, Overturn → the
  // overturned call), so nobody has to guess what overturning a "no foul" gives.
  outcomes?: {uphold: string; overturn: string}
  // The window has closed (counting): no more buttons; a voter keeps their receipt.
  closed?: boolean
  // How much one human vote counts, for the receipt.
  weight?: number
}) {
  // Votes by referendum id, so a new round shows fresh buttons.
  const [votes, setVotes] = useState<Record<string, Choice>>({})
  const [error, setError] = useState<string>()
  const mine = votes[referendumId]

  async function vote(choice: Choice) {
    setError(undefined)
    setVotes((v) => ({...v, [referendumId]: choice}))
    // A short buzz on phones: the vote is in your hand, like holding up a card.
    try {
      navigator.vibrate?.(30)
    } catch {
      // Not supported: the receipt on screen is the feedback.
    }
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({referendumId, choice, sessionId: sessionId()}),
    })
    const body = await response.json().catch(() => ({}))
    if (body.status === 'voted') onVoted?.()
    if (body.status === 'alreadyVoted') setVotes((v) => ({...v, [referendumId]: body.choice}))
    else if (!response.ok) {
      setVotes((v) => {
        const next = {...v}
        delete next[referendumId]
        return next
      })
      setError(
        body.status === 'closed'
          ? 'Too late: that window has closed.'
          : body.status === 'full'
            ? 'This round is full. Catch the next one.'
            : body.status === 'paused'
              ? 'Voting is paused.'
              : 'Your vote didn’t count. Try again.',
      )
    }
  }

  const huge = size === 'huge'
  // After a vote: a receipt for what you chose, and what happens next, instead of two dead buttons.
  if (mine) return <Receipt choice={mine} outcome={outcomes?.[mine]} weight={weight} closed={closed} huge={huge} />
  if (closed) return <p className="font-display text-3xl font-bold uppercase text-var">Counting…</p>
  return (
    <div className={`flex flex-col gap-3 ${huge ? 'flex-1' : ''}`}>
      <div className={huge ? 'grid flex-1 grid-rows-2 gap-4' : 'grid grid-cols-2 gap-3'}>
        {(['uphold', 'overturn'] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => void vote(choice)}
            className={`font-display font-extrabold uppercase text-ink transition-transform duration-150 hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk active:scale-[0.97] ${
              huge ? 'rounded-2xl text-6xl' : 'rounded-lg py-4 text-2xl'
            } ${choice === 'uphold' ? 'bg-uphold' : 'bg-overturn'}`}
          >
            {choice === 'uphold' ? 'Uphold' : 'Overturn'}
            {outcomes && (
              <span className={`block font-sans font-semibold normal-case ${huge ? 'text-xl' : 'text-sm'}`}>→ {outcomes[choice]}</span>
            )}
          </button>
        ))}
      </div>
      {error && <p className="text-center text-sm text-overturn">{error}</p>}
    </div>
  )
}

// "We've got your vote": what you chose, what it counts for, and what the screen is doing now. The round closes
// early after a human vote (the rest of the crowd votes at once), then the count, then the VARdict screen.
function Receipt({
  choice,
  outcome,
  weight,
  closed,
  huge,
}: {
  choice: Choice
  outcome?: string
  weight?: number
  closed: boolean
  huge: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`receipt-in flex flex-col gap-3 rounded-lg border-2 p-4 ${choice === 'uphold' ? 'border-uphold' : 'border-overturn'} ${huge ? 'flex-1 justify-center' : ''}`}
    >
      <p className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink ${choice === 'uphold' ? 'bg-uphold' : 'bg-overturn'}`}
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M3.5 9.5 7.5 13 14.5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="font-display text-2xl font-extrabold uppercase leading-none">
          Vote counted: <span className={choice === 'uphold' ? 'text-uphold' : 'text-overturn'}>{choice === 'uphold' ? 'Uphold' : 'Overturn'}</span>
          {outcome && <span className="text-muted"> → {outcome}</span>}
        </span>
      </p>
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="btn-spinner h-4 w-4 shrink-0 rounded-full border-2 border-line border-t-chalk" aria-hidden />
        {closed ? 'Counting the votes. The VARdict is coming.' : 'The rest of the crowd is voting. The VARdict is coming.'}
        {weight ? ` Your vote counts ×${weight}.` : ''}
      </p>
    </div>
  )
}
