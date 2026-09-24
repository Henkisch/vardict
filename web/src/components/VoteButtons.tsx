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
export function VoteButtons({referendumId, size}: {referendumId: string; size: 'huge' | 'panel'}) {
  // Votes by referendum id, so a new round shows fresh buttons.
  const [votes, setVotes] = useState<Record<string, Choice>>({})
  const [error, setError] = useState<string>()
  const mine = votes[referendumId]

  async function vote(choice: Choice) {
    setError(undefined)
    setVotes((v) => ({...v, [referendumId]: choice}))
    const response = await fetch('/api/vote', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({referendumId, choice, sessionId: sessionId()}),
    })
    const body = await response.json().catch(() => ({}))
    if (body.status === 'alreadyVoted') setVotes((v) => ({...v, [referendumId]: body.choice}))
    else if (!response.ok) {
      setVotes((v) => {
        const next = {...v}
        delete next[referendumId]
        return next
      })
      setError(body.status === 'closed' ? 'Too late: that window has closed.' : 'Your vote didn’t count. Try again.')
    }
  }

  const huge = size === 'huge'
  return (
    <div className={`flex flex-col gap-3 ${huge ? 'flex-1' : ''}`}>
      <div className={huge ? 'grid flex-1 grid-rows-2 gap-4' : 'grid grid-cols-2 gap-3'}>
        {(['uphold', 'overturn'] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={Boolean(mine)}
            onClick={() => void vote(choice)}
            className={`font-display font-extrabold uppercase text-ink transition-opacity hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
              huge ? 'rounded-2xl text-6xl' : 'rounded-lg py-4 text-2xl'
            } ${choice === 'uphold' ? 'bg-uphold' : 'bg-overturn'} ${mine && mine !== choice ? 'opacity-25' : ''}`}
          >
            {choice === 'uphold' ? 'Uphold' : 'Overturn'}
            {mine === choice && <span className={`block font-bold ${huge ? 'text-xl' : 'text-sm'}`}>Your vote</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-center text-sm text-overturn">{error}</p>}
    </div>
  )
}
