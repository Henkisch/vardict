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
    <div className="flex shrink-0 items-baseline gap-3 overflow-hidden px-1 text-base" aria-live="polite">
      <span className="shrink-0 text-sm text-muted">In the studio</span>
      <p key={line._id} className="ticker-in min-w-0 truncate">
        <span className="font-semibold">{PUNDIT_NAME[line.pundit] ?? line.pundit}:</span>{' '}
        <span className="text-muted">{line.text}</span>
      </p>
    </div>
  )
}
