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
            {i > 0 && <Chevron />}
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

// Drawn, not a glyph: a small "›" in the rule colour all but disappears on the pitch surface (Henrik).
export function Chevron({className = ''}: {className?: string}) {
  return (
    <svg className={`shrink-0 text-muted ${className}`} width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
