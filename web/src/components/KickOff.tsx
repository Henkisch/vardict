'use client'

import {useEffect, useState} from 'react'

const BEAT_MS = 600

// The breath before every vote: 3, 2, 1. Calls `onWhistle` once at the end, then stays up until the parent
// unmounts it, which covers the moment before the new round shows up.
export function KickOff({onWhistle}: {onWhistle: () => void}) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count === 0) {
      onWhistle()
      return
    }
    const id = setTimeout(() => setCount((c) => c - 1), BEAT_MS)
    return () => clearTimeout(id)
    // onWhistle is called exactly once, when the count reaches 0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/90 backdrop-blur-sm"
    >
      <p className="font-display text-3xl font-bold uppercase tracking-[0.2em] text-muted">Get ready to vote</p>
      {count > 0 && (
        <p key={count} className="kickoff-beat font-display text-[12rem] font-extrabold leading-none text-var tabular">
          {count}
        </p>
      )}
    </div>
  )
}
