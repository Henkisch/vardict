'use client'

import {useMemo} from 'react'

import type {PunditLine} from '@/lib/queries'

const PUNDIT_NAME: Record<string, string> = {gaffer: 'The Gaffer', stats: 'The Stat Guy', oldPro: 'The Old Pro'}

// The commentary ticker: a full-width broadcast crawl along the bottom edge (Henrik, session 5). Lines come from
// Sanity (Studio: Pundit lines) for whatever just happened, preferring lines written for the incident on screen.
// Reduced motion: the first line, still.
export function PunditTicker({lines, trigger, incidentId}: {lines: PunditLine[]; trigger: string; incidentId?: string}) {
  const pool = useMemo(() => {
    const matching = lines.filter((l) => l.trigger === trigger && (!l.incident || l.incident === incidentId))
    const specific = matching.filter((l) => l.incident === incidentId)
    return specific.length ? specific : matching
  }, [lines, trigger, incidentId])
  if (!pool.length) return null

  // Speed follows length, so every crawl moves at the same pace (~70 px/s at 18 px type).
  const chars = pool.reduce((n, l) => n + l.text.length + 20, 0)
  const items = pool.map((line) => (
    <span key={line._id} className="flex shrink-0 items-baseline gap-2 pr-12">
      <span className="font-display text-lg font-bold uppercase text-chalk">{PUNDIT_NAME[line.pundit] ?? line.pundit}</span>
      <span className="text-muted">{line.text}</span>
    </span>
  ))

  return (
    <div className="flex h-11 shrink-0 items-stretch overflow-hidden border-t border-line bg-pitch" aria-live="polite">
      <span className="z-10 flex shrink-0 items-center bg-chalk px-4 font-display text-lg font-extrabold uppercase text-ink">
        Studio
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          key={`${trigger}:${incidentId}`}
          className="ticker-crawl absolute inset-y-0 left-0 flex w-max items-center text-lg"
          style={{animationDuration: `${Math.max(20, chars * 0.14)}s`}}
        >
          <div className="flex pl-6">{items}</div>
          <div className="ticker-copy flex pl-6" aria-hidden>
            {items}
          </div>
        </div>
      </div>
    </div>
  )
}
