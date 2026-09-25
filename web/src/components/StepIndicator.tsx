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
export function StepIndicator({step, detail}: {step: Step; detail?: string}) {
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

  // L5 chrome (design.md): quiet text, the current step in chalk with a small amber mark.
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Where the match is">
      <ol className="flex items-center gap-3 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            {i > 0 && <span className="h-px w-5 bg-line" aria-hidden />}
            <span
              aria-current={i === current ? 'step' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap ${i === current ? 'font-semibold text-chalk' : 'text-muted'}`}
            >
              {i === current && <span className="h-2 w-2 rounded-full bg-var" aria-hidden />}
              {s.label}
              {i === current && detail && <span className="font-normal text-muted">· {detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
