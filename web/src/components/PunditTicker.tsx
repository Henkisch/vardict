'use client'

import {useEffect, useMemo, useState} from 'react'

import type {PunditLine} from '@/lib/queries'

const PUNDIT_NAME: Record<string, string> = {gaffer: 'The Gaffer', stats: 'The Stat Guy', oldPro: 'The Old Pro'}
const ROTATE_MS = 9_000

// The commentary ticker: lines from Sanity (Studio: Pundit lines) for whatever just happened, preferring lines
// written for the incident on screen. Rotates while nothing changes.
export function PunditTicker({lines, trigger, incidentId}: {lines: PunditLine[]; trigger: string; incidentId?: string}) {
  const pool = useMemo(() => {
    const matching = lines.filter((l) => l.trigger === trigger && (!l.incident || l.incident === incidentId))
    const specific = matching.filter((l) => l.incident === incidentId)
    return specific.length ? specific : matching
  }, [lines, trigger, incidentId])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  // A fresh trigger starts somewhere random, so the same line doesn't open every time.
  const [offset] = useState(() => Math.floor(Math.random() * 100))
  const line = pool.length ? pool[(tick + offset) % pool.length] : undefined
  if (!line) return null

  return (
    <div className="flex shrink-0 items-center gap-3 overflow-hidden rounded-lg border border-line bg-pitch px-4 py-2" aria-live="polite">
      <span className="shrink-0 rounded bg-overturn px-2 py-0.5 font-display text-sm font-extrabold uppercase tracking-[0.15em]">
        Studio
      </span>
      <p key={line._id} className="ticker-in min-w-0 truncate text-lg">
        <span className="font-display font-bold uppercase tracking-wide text-var">{PUNDIT_NAME[line.pundit] ?? line.pundit}:</span>{' '}
        {line.text}
      </p>
    </div>
  )
}
