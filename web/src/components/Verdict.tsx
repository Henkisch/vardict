import {Bars} from '@/components/Bars'
import {Scorebug} from '@/components/Scorebug'
import {WorkflowPath} from '@/components/WorkflowPath'
import {CALL_LABELS, formatClock, type LiveReferendum} from '@/lib/queries'
import type {Phase} from '@/lib/run-status'
import {SHOOTOUT_ROUNDS_TO_WIN, WINDOW_SECONDS} from 'workflows/shared'

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
      ? {headline: 'Too close to call', tone: 'text-var', next: `Between 45% and 55%. ${WINDOW_SECONDS.extraTime} seconds of extra time.`}
      : {headline: 'Still too close', tone: 'text-var', next: 'Extra time settled nothing. Sudden death: one penalty decides it.'}
  }
  if (ref.result === 'noVotes') {
    return {headline: 'No fans voted', tone: 'text-var', next: "The crowd can't decide alone. Back to the VAR room."}
  }
  const how = shootout ? ' on the penalty' : ref.round === 'extraTime' ? ' in extra time' : ''
  const overturnedTo = CALL_LABELS[ref.incident.overturnedCall] ?? ref.incident.overturnedCall
  if (ref.result === 'upheld' || (shootout && won > lost)) {
    return {headline: `Upheld${how}`, tone: 'text-uphold', next: 'The fans confirmed the VAR. The call stands.'}
  }
  // The fans' call is final (workflow v4): the overturned call stands (incident.overturnedCall).
  return {headline: `Overturned${how}`, tone: 'text-overturn', next:
      ref.incident.overturnedCall === ref.incident.originalCall
        ? `The fans overruled the VAR. The referee's call stands: ${overturnedTo}.`
        : `The fans overruled the VAR. New decision: ${overturnedTo}.`}
}

export function Verdict({round: ref, phase, action}: {round: LiveReferendum; phase: Phase; action: React.ReactNode}) {
  const copy = copyFor(ref, phase)
  const shootout = ref.round.startsWith('shootout')
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col justify-center gap-5 rounded-xl bg-pitch p-6 lg:p-8">
          <div className="flex flex-col gap-2">
            <Scorebug home={ref.incident.match.homeTeam} away={ref.incident.match.awayTeam} minute={ref.incident.minute} />
            <p className="font-display text-3xl font-extrabold uppercase leading-none text-balance">{ref.incident.title}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              {shootout ? 'Sudden-death penalty' : ref.round === 'extraTime' ? 'Extra time' : 'Regular time'}
            </p>
            <p className={`verdict-land origin-left font-display text-7xl font-extrabold uppercase leading-none xl:text-8xl ${copy.tone}`}>{copy.headline}</p>
            <p className="text-xl">{copy.next}</p>
          </div>
          <Bars uphold={ref.uphold} overturn={ref.overturn} size="small" />
          <p className="text-sm text-muted">
            {ref.humans} human and {ref.bots} simulated votes. Each human vote counts ×20.
          </p>
          <SlowerClock realSeconds={ref.incident.realDelaySeconds} votedSeconds={votedSeconds(ref)} />
        </div>
        <aside className="flex flex-col justify-center gap-4 rounded-xl bg-pitch p-6">{action}</aside>
      </div>
      <WorkflowPath run={ref.run} phase={phase} />
    </section>
  )
}

// The pitch in one line: the real VAR took this long; with the fans it takes longer. Only closed rounds count.
const votedSeconds = (ref: LiveReferendum) => ref.run.filter((r) => r.result).reduce((n, r) => n + r.seconds, 0)

function SlowerClock({realSeconds, votedSeconds}: {realSeconds: number; votedSeconds: number}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3 font-display text-2xl font-bold uppercase">
      <span>
        <span className="text-muted">The real VAR took </span>
        <span className="tabular">{formatClock(realSeconds)}</span>
      </span>
      <span>
        <span className="text-muted">With the fans </span>
        <span className="tabular text-var">{formatClock(realSeconds + votedSeconds)}</span>
      </span>
    </p>
  )
}
