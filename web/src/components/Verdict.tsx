import {Bars} from '@/components/Bars'
import {WorkflowPath} from '@/components/WorkflowPath'
import type {LiveReferendum} from '@/lib/queries'
import type {Phase} from '@/lib/run-status'
import {LOOP_CAP, SHOOTOUT_ROUNDS_TO_WIN} from 'workflows/shared'

type Copy = {headline: string; tone: string; next: string}

// What a result means, in words. The screen holds here until someone presses: nothing moves on by itself.
function copyFor(ref: LiveReferendum, phase: Phase): Copy {
  const shootout = ref.round.startsWith('shootout')
  const won = ref.shootout.filter((r) => r === 'upheld').length
  const lost = ref.shootout.filter((r) => r === 'overturned').length
  if (shootout && phase === 'between') {
    return ref.result === 'upheld'
      ? {headline: 'Scored', tone: 'text-uphold', next: `The VAR leads ${won}–${lost}. First to ${SHOOTOUT_ROUNDS_TO_WIN}.`}
      : {headline: 'Saved', tone: 'text-overturn', next: `The people lead ${lost}–${won}. First to ${SHOOTOUT_ROUNDS_TO_WIN}.`}
  }
  if (ref.result === 'tooClose') {
    return ref.round === 'regular'
      ? {headline: 'Too close to call', tone: 'text-var', next: 'Between 45% and 55%. 15 seconds of extra time.'}
      : {headline: 'Still too close', tone: 'text-var', next: 'Extra time settled nothing. Penalties: best of five.'}
  }
  const upheld = ref.result === 'upheld'
  const how = shootout ? ' on penalties' : ref.round === 'extraTime' ? ' in extra time' : ''
  if (upheld) return {headline: `Upheld${how}`, tone: 'text-uphold', next: 'The people confirmed it. The call stands.'}
  if (phase === 'decided' || ref.loop >= LOOP_CAP) {
    return {headline: 'Match abandoned', tone: 'text-overturn', next: `Overturned for the ${LOOP_CAP}rd time. To be replayed.`}
  }
  return {
    headline: `Overturned${how}`,
    tone: 'text-overturn',
    next: `Back to the VAR room for another look (loop ${ref.loop + 1} of ${LOOP_CAP}).`,
  }
}

export function Verdict({round: ref, phase, action}: {round: LiveReferendum; phase: Phase; action: React.ReactNode}) {
  const copy = copyFor(ref, phase)
  const shootout = ref.round.startsWith('shootout')
  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col justify-center gap-4 rounded-xl border border-line bg-pitch p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {ref.incident.title} · {shootout ? `Penalty ${ref.round.replace('shootout', '')}` : ref.round === 'extraTime' ? 'Extra time' : 'Regular time'}
          </p>
          <p className={`font-display text-7xl font-extrabold uppercase leading-none ${copy.tone}`}>{copy.headline}</p>
          <p className="text-xl">{copy.next}</p>
          {shootout && <Penalties results={ref.shootout} />}
          <Bars uphold={ref.uphold} overturn={ref.overturn} size="small" />
          <p className="text-sm text-muted">
            {ref.humans} human and {ref.bots} simulated votes. Each human vote counts ×20.
          </p>
        </div>
        <aside className="flex flex-col justify-center gap-4 rounded-xl border border-line bg-pitch p-6">{action}</aside>
      </div>
      <WorkflowPath run={ref.run} phase={phase} />
    </section>
  )
}

// Five dots per side, like a TV penalty graphic. Uphold = the VAR scores, overturn = the people save it.
function Penalties({results}: {results: ('upheld' | 'overturned')[]}) {
  const dots = Array.from({length: Math.max(5, results.length)}, (_, i) => results[i])
  return (
    <div className="flex items-center gap-2" aria-label="Penalty shootout">
      {dots.map((result, i) => (
        <span
          key={i}
          className={`h-5 w-5 rounded-full border ${
            result === 'upheld' ? 'border-uphold bg-uphold' : result === 'overturned' ? 'border-overturn bg-overturn' : 'border-line'
          }`}
        />
      ))}
      <span className="ml-2 text-sm text-muted">
        <span className="text-uphold">●</span> scored · <span className="text-overturn">●</span> saved
      </span>
    </div>
  )
}
