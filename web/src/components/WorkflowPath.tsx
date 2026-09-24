import {WINDOW_SECONDS} from 'workflows/shared'

import type {Phase} from '@/lib/run-status'
import type {RunRound} from '@/lib/queries'

// The payoff: the path this decision actually took through the Sanity Workflow (`peoples-var`), stage by stage,
// with the real stage names. Derived from the run's referendums, which are public; the engine's own state lives in
// the private workflows dataset.

type Stage = 'varRoom' | 'referendum' | 'extraTime' | 'shootout' | 'upheld' | 'abandoned'

const EXPLAIN: Record<Stage, string> = {
  varRoom: 'The VAR room reviews the footage and recommends a call.',
  referendum: `The fans vote for ${WINDOW_SECONDS.referendum} s. Over 55% keeps the call, under 45% overturns it.`,
  extraTime: `Too close to call: ${WINDOW_SECONDS.extraTime} more seconds, same thresholds.`,
  shootout: `Still too close: sudden death. One ${WINDOW_SECONDS.shootout}-second vote decides it.`,
  upheld: 'The people confirmed the call. It stands.',
  abandoned: 'Three trips back to the VAR room. Match to be replayed.',
}

const RESULT_TONE = {upheld: 'text-uphold', overturned: 'text-overturn', tooClose: 'text-var'} as const

type Step = {stage: Stage; label: string; result?: RunRound['result']; current?: boolean}

function stageOf(round: string): Stage {
  if (round === 'regular') return 'referendum'
  if (round === 'extraTime') return 'extraTime'
  return 'shootout'
}

function stepsFor(run: RunRound[], phase: Phase): Step[] {
  const steps: Step[] = []
  let loop = 0
  for (const round of run) {
    if (round.loop !== loop) {
      steps.push({stage: 'varRoom', label: loop ? `VAR room · loop ${round.loop}` : 'VAR room'})
      loop = round.loop
    }
    const stage = stageOf(round.round)
    const label = stage === 'shootout' ? 'Penalty' : stage === 'extraTime' ? 'Extra time' : 'Referendum'
    steps.push({stage, label, result: round.result, current: !round.result})
  }
  const last = run.at(-1)
  if (!last?.result) return steps
  // Where the run is now, after its latest result.
  if (phase === 'parked') steps.push({stage: 'varRoom', label: `VAR room · loop ${last.loop + 1}`, current: true})
  else if (phase === 'decided') {
    steps.push(last.result === 'upheld' ? {stage: 'upheld', label: 'Upheld'} : {stage: 'abandoned', label: 'Abandoned'})
  } else if (phase === 'between') {
    const next = last.round === 'regular' ? 'extraTime' : 'shootout'
    steps.push({stage: next, label: next === 'extraTime' ? 'Extra time' : 'Next penalty', current: true})
  }
  return steps
}

export function WorkflowPath({run, phase}: {run: RunRound[]; phase: Phase}) {
  const steps = stepsFor(run, phase)
  if (steps.length === 0) return null
  const explained = [...new Set(steps.map((s) => s.stage))]
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-pitch/60 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">
        The path through the workflow · <span className="font-mono normal-case tracking-normal">peoples-var</span>
      </p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted" aria-hidden>→</span>}
            <span
              className={`flex flex-col rounded-md border px-2.5 py-1 ${step.current ? 'border-var' : 'border-line'}`}
            >
              <span className="font-display text-sm font-bold uppercase">
                {step.label}
                {step.result && (
                  <span className={`ml-1.5 ${RESULT_TONE[step.result]}`}>
                    · {step.stage === 'shootout' ? PENALTY_WORD[step.result] : RESULT_WORD[step.result]}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] text-muted">{step.stage}</span>
            </span>
          </li>
        ))}
      </ol>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {explained.map((stage) => (
          <div key={stage} className="flex gap-2">
            <dt className="font-mono text-muted">{stage}</dt>
            <dd>{EXPLAIN[stage]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const RESULT_WORD = {upheld: 'upheld', overturned: 'overturned', tooClose: 'too close'} as const
// A shootout round is a penalty: uphold means the VAR scores.
const PENALTY_WORD = {upheld: 'scored', overturned: 'saved', tooClose: 'retaken'} as const
