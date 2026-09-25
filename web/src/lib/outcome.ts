// An incident's outcome, derived from its rounds rather than incident.finalCall - plan 009 clears finalCall on
// a new season, so deriving from rounds is what keeps a past verdict visible on the incident and overview
// pages. Reuses runPhase (run-status.ts) rather than re-encoding the shootout-to-3 and loop-cap rules here.

import {runPhase, type RunRef} from '@/lib/run-status'
import type {IncidentRound} from '@/lib/queries'
import {SHOOTOUT_ROUNDS_TO_WIN} from 'workflows/shared'

export type Outcome = 'upheld' | 'overturned' | 'parked' | 'live' | 'open' | 'notVoted'

// Group rounds into runs (one workflow instance each, spanning every loop within it). Runs never overlap in
// time (singleSubject: one live run per incident), so this also leaves them in chronological order.
export function groupRuns(rounds: IncidentRound[]) {
  const runs = new Map<string, IncidentRound[]>()
  for (const round of rounds) runs.set(round.workflowInstanceId, [...(runs.get(round.workflowInstanceId) ?? []), round])
  return [...runs.values()]
}

// No automated test: `web` has no test runner (see run-status.ts's comment and plans/006). Reasoned through by
// hand instead - each case below is a `runOutcome(run)` / `incidentOutcome(rounds)` call worth re-checking
// after any change:
//   - no rounds                                                              -> notVoted
//   - one run, regular time, upheld                                         -> upheld
//   - one run, reaches a shootout, wins it 3-1                              -> upheld
//   - one run, overturned in regular time (final, workflow v4)             -> overturned
//   - one run, latest round has no result yet (voting or counting)          -> live
//   - one run, latest round is tooClose (between)                           -> open
//   - one run, last round nobody voted in (back in the VAR room)            -> parked

// The outcome of a single run (one workflowInstanceId), given all of its rounds across every loop it visited.
export function runOutcome(run: IncidentRound[]): Outcome {
  if (run.length === 0) return 'notVoted'
  const last = run[run.length - 1]

  // Same-loop, defined-result shootout rounds of this run, in order - what runPhase expects as `shootout`.
  const shootout = run
    .filter((r) => r.loop === last.loop && r.round.startsWith('shootout') && r.result)
    .map((r) => r.result as string)

  // runPhase only reads closesAt to tell voting from counting when there's no result yet, and both cases map
  // to 'open' below, so the exact value never changes the outcome. It never reads ref.incident.
  const ref: RunRef = {
    result: last.result,
    round: last.round,
    loop: last.loop,
    closesAt: last.windowOpensAt,
    shootout,
    incident: {},
  }

  const phase = runPhase(ref, Date.now())
  if (phase === 'parked') return 'parked'
  if (phase === 'voting' || phase === 'counting') return 'live'
  if (phase !== 'decided') return 'open'

  // runPhase already used SHOOTOUT_ROUNDS_TO_WIN to decide 'decided' vs 'parked' here, so a shootout that
  // reaches this line has one side at SHOOTOUT_ROUNDS_TO_WIN wins/losses, never both - safe to re-check the same way.
  const overturned = last.round.startsWith('shootout')
    ? shootout.filter((r) => r === 'overturned').length >= SHOOTOUT_ROUNDS_TO_WIN
    : last.result === 'overturned'
  return overturned ? 'overturned' : 'upheld'
}

// The incident's current outcome: whatever its latest run says.
export function incidentOutcome(rounds: IncidentRound[]): Outcome {
  if (rounds.length === 0) return 'notVoted'
  const runs = groupRuns(rounds)
  return runOutcome(runs[runs.length - 1])
}

// Shared display for an Outcome (design.md): the incident page and the /incidents overview both use these, so a
// state looks the same everywhere. `edge` is the card's left status bar, `chip` the badge.
export const OUTCOME_LABEL: Record<Outcome, {label: string; tone: string; edge: string; chip: string}> = {
  upheld: {label: 'Upheld', tone: 'text-uphold', edge: 'bg-uphold', chip: 'bg-uphold text-ink'},
  overturned: {label: 'Overturned', tone: 'text-overturn', edge: 'bg-overturn', chip: 'bg-overturn text-chalk'},
  live: {label: 'Live · fans voting', tone: 'text-overturn', edge: 'bg-overturn', chip: 'border border-overturn text-overturn'},
  open: {label: 'Too close · waiting', tone: 'text-var', edge: 'bg-var', chip: 'border border-var text-var'},
  parked: {label: 'Back in the VAR room', tone: 'text-var', edge: 'bg-var', chip: 'border border-var text-var'},
  notVoted: {label: 'To play', tone: 'text-muted', edge: 'bg-line', chip: 'border border-dashed border-line text-muted'},
}

export const isDecided = (outcome: Outcome) => outcome === 'upheld' || outcome === 'overturned'
