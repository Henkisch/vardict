'use client'

import {useEffect} from 'react'

export type Step = 'var-room' | 'vote' | 'verdict'

const STEPS: {id: Step; label: string}[] = [
  {id: 'var-room', label: 'VAR room'},
  {id: 'vote', label: 'Fans vote'},
  {id: 'verdict', label: 'Verdict'},
]

// Where the run is, as three steps, with the workflow stage it maps to. Also mirrored into the address bar
// (/live?step=...) without navigating: /live stays one route that follows the run.
export function StepIndicator({step, detail, stage}: {step: Step; detail?: string; stage?: string}) {
  // Next's router integrates native replaceState when the state argument is null (see the Next docs on
  // "Using the native History API"). Re-checked on every render, since a router update can reset the URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('step') === step) return
      params.set('step', step)
      window.history.replaceState(null, '', `?${params}`)
    } catch {
      // Some embedded browsers refuse replaceState; the on-screen indicator still works.
    }
  })

  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Where the match is" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className={`h-px w-6 ${i <= current ? 'bg-var' : 'bg-line'}`} aria-hidden />}
            <span
              aria-current={i === current ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1 font-display text-sm font-bold uppercase tracking-[0.15em] ${
                i === current ? 'bg-var text-ink' : i < current ? 'text-chalk' : 'text-muted'
              }`}
            >
              <span className="tabular">{i + 1}</span>
              {s.label}
              {i === current && detail && <span className="font-medium normal-case tracking-normal">· {detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {stage && (
        <span className="text-xs text-muted">
          workflow stage <span className="font-mono text-chalk">{stage}</span>
        </span>
      )}
    </nav>
  )
}
