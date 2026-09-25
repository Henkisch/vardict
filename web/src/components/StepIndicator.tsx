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

  // L5 chrome (design.md). From md up: quiet inline text in the header, the current step in chalk with an amber dot.
  // Below md it has its own row, so it becomes a full-width three-part progress bar (Henrik: the left-floating
  // row looked unfinished): an amber line up to the current step, grey after, labels centred.
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <nav aria-label="Where the match is" className="w-full md:w-auto">
      <ol className="grid w-full grid-cols-3 gap-1 text-sm md:flex md:items-center md:gap-3">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-col items-center gap-1.5 md:flex-row md:gap-3">
            {i > 0 && <span className="hidden h-px w-5 bg-line md:block" aria-hidden />}
            <span className={`h-0.5 w-full rounded-full md:hidden ${i <= current ? 'bg-var' : 'bg-line'}`} aria-hidden />
            <span
              aria-current={i === current ? 'step' : undefined}
              className={`flex items-center gap-2 whitespace-nowrap ${i === current ? 'font-semibold text-chalk' : 'text-muted'}`}
            >
              {i === current && <span className="hidden h-2 w-2 rounded-full bg-var md:block" aria-hidden />}
              {s.label}
              {i === current && detail && <span className="hidden font-normal text-muted md:inline">· {detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
