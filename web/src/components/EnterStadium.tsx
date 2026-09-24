'use client'

import type {Fixture} from '@/lib/queries'

// Match-day intro: what this is, tonight's fixtures, and the button that lets the crowd in (and starts the sound,
// since browsers only play audio after a click).
export function EnterStadium({fixtures, onEnter}: {fixtures: Fixture[]; onEnter: () => void}) {
  return (
    <div className="stadium fixed inset-0 z-40 flex items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted">Tonight, under the floodlights</p>
          <h1 className="font-display text-7xl font-extrabold uppercase tracking-wide sm:text-8xl">
            VAR<span className="text-var">dict</span>
          </h1>
          <p className="mt-2 text-2xl">VAR, finally in the fans&apos; hands.</p>
        </div>
        <p className="max-w-xl text-lg text-muted">
          Five real Premier League VAR decisions. The VAR room makes its call, then you and the crowd keep it or
          overturn it. Too close? Extra time. Still too close? Penalties.
        </p>
        <ol className="w-full divide-y divide-line rounded-xl border border-line bg-pitch/80 text-left">
          {fixtures.map((f, i) => (
            <li key={f._id} className="flex items-baseline justify-between gap-4 px-5 py-3">
              <span className="font-display text-xl font-bold uppercase">
                <span className="mr-3 text-muted tabular">{i + 1}</span>
                {f.home} v {f.away}
              </span>
              <span className="truncate text-sm text-muted">{f.title}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onEnter}
          className="rounded-lg bg-var px-10 py-5 font-display text-4xl font-extrabold uppercase text-ink hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk"
        >
          Enter the stadium
        </button>
        <p className="text-sm text-muted">Sound on: the crowd reacts to the vote.</p>
      </div>
    </div>
  )
}
