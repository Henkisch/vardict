import {PLAIN_STAGE, RESULT_WORD, type PathStep} from '@/lib/path'

const TONE: Record<string, string> = {upheld: 'text-uphold', overturned: 'text-overturn', tooClose: 'text-var', noVotes: 'text-muted'}

// A compact path through the workflow for a results card: the stages in plain words, each vote with its result.
export function PathChips({steps}: {steps: PathStep[]}) {
  if (steps.length === 0) return null
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="The path through the Sanity workflow">
      {steps.map((step, i) => {
        const end = step.stage === 'upheld' || step.stage === 'overturned'
        return (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-line" aria-hidden>
                ›
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                end ? (step.stage === 'upheld' ? 'border-uphold text-uphold' : 'border-overturn text-overturn') : 'border-line text-chalk'
              }`}
            >
              {PLAIN_STAGE[step.stage]}
              {step.result && <span className={`ml-1 font-normal ${TONE[step.result] ?? 'text-muted'}`}>{RESULT_WORD[step.result]}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
