import {OUTCOME_LABEL, type Outcome} from '@/lib/outcome'

// The status chip for an incident or a run (design.md): one look per state, the same on every results page.
export function OutcomeBadge({outcome, className = ''}: {outcome: Outcome; className?: string}) {
  const {label, chip} = OUTCOME_LABEL[outcome]
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded px-2.5 py-1 font-display text-base font-bold uppercase leading-none ${chip} ${className}`}
    >
      {outcome === 'live' && <span className="h-2 w-2 rounded-full bg-overturn motion-safe:animate-pulse" aria-hidden />}
      {label}
    </span>
  )
}
