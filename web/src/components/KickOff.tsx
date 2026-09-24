'use client'

import {useEffect, useState} from 'react'

const BEAT_MS = 800

// The breath before every vote: 3, 2, 1, whistle. Calls `onWhistle` once at the end, then stays up (showing
// "Kick-off") until the parent unmounts it, which covers the second or two before the new round shows up.
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
      <p className="text-sm uppercase tracking-[0.3em] text-muted">The referee checks the watch</p>
      <p key={count} className="kickoff-beat font-display text-[12rem] font-extrabold leading-none text-var tabular">
        {count > 0 ? count : 'Peep!'}
      </p>
      {count === 0 && <p className="font-display text-2xl font-bold uppercase">Kick-off</p>}
    </div>
  )
}
