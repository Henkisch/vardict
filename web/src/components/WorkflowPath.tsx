import {WINDOW_SECONDS} from 'workflows/shared'

import {Chevron} from '@/components/PathChips'

import type {Phase} from '@/lib/run-status'
import type {RunRound} from '@/lib/queries'

// The payoff: the path this decision actually took through the Sanity Workflow (`peoples-var`), stage by stage,
// in plain words (VAR room, Fans vote, ...). Derived from the run's referendums, which are public; the engine's own state lives in
// the private workflows dataset.

type Stage = 'varRoom' | 'referendum' | 'extraTime' | 'shootout' | 'upheld' | 'overturned'

const EXPLAIN: Record<Stage, string> = {
  varRoom: 'The VAR room reviews the footage and recommends a call.',
  referendum: `The fans vote for ${WINDOW_SECONDS.referendum} s, or until a human votes. Over 55% keeps the call, under 45% overturns it.`,
  extraTime: `Too close to call: ${WINDOW_SECONDS.extraTime} more seconds, same thresholds.`,
  shootout: `Still too close: sudden death. One ${WINDOW_SECONDS.shootout}-second vote decides it.`,
  upheld: 'The fans confirmed the call. It stands.',
  overturned: 'The fans overruled the VAR, and their call is final.',
}

// Plain words only (Henrik, as in the VAR Room booth): the stage names stay in code.
const PLAIN: Record<Stage, string> = {
  varRoom: 'VAR room',
  referendum: 'Fans vote',
  extraTime: 'Extra time',
  shootout: 'Penalty',
  upheld: 'Upheld',
  overturned: 'Overturned',
}

const RESULT_TONE = {upheld: 'text-uphold', overturned: 'text-overturn', tooClose: 'text-var', noVotes: 'text-muted', aborted: 'text-muted'} as const

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
      steps.push({stage: 'varRoom', label: loop ? 'VAR room · again' : 'VAR room'})
      loop = round.loop
    }
    const stage = stageOf(round.round)
    const label = PLAIN[stage]
    steps.push({stage, label, result: round.result, current: !round.result})
  }
  const last = run.at(-1)
  if (!last?.result) return steps
  // Where the run is now, after its latest result.
  if (phase === 'parked') steps.push({stage: 'varRoom', label: 'VAR room · again', current: true})
  else if (phase === 'decided') {
    steps.push(last.result === 'upheld' ? {stage: 'upheld', label: 'Upheld'} : {stage: 'overturned', label: 'Overturned'})
  } else if (phase === 'between') {
    const next = last.round === 'regular' ? 'extraTime' : 'shootout'
    steps.push({stage: next, label: next === 'extraTime' ? 'Extra time' : 'Penalty', current: true})
  }
  return steps
}

export function WorkflowPath({run, phase}: {run: RunRound[]; phase: Phase}) {
  const steps = stepsFor(run, phase)
  if (steps.length === 0) return null
  const explained = [...new Set(steps.map((s) => s.stage))]
  return (
    <section className="flex flex-col gap-3 px-1">
      <p className="text-sm text-muted">
        The path through the Sanity workflow
      </p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <Chevron className="h-4 w-4" />}
            <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${step.current ? 'border-var text-var' : 'border-line'}`}>
              {step.label}
              {step.result && (
                <span className={`ml-1.5 font-normal ${RESULT_TONE[step.result]}`}>
                  {step.stage === 'shootout' ? PENALTY_WORD[step.result] : RESULT_WORD[step.result]}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <ul className="flex flex-col gap-1 text-sm text-muted">
        {explained.map((stage) => (
          <li key={stage}>
            <span className="font-semibold text-chalk">{PLAIN[stage]}:</span> {EXPLAIN[stage]}
          </li>
        ))}
      </ul>
    </section>
  )
}

const RESULT_WORD = {upheld: 'upheld', overturned: 'overturned', tooClose: 'too close', noVotes: 'no humans voted', aborted: 'stopped'} as const
// A shootout round is a penalty: uphold means the VAR scores.
const PENALTY_WORD = {upheld: 'upheld', overturned: 'overturned', tooClose: 'too close', noVotes: 'no humans voted', aborted: 'stopped'} as const
