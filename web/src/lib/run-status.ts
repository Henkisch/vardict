// Which part of a peoplesVar run is happening right now, derived from the current referendum. This is the one
// place that decides the phase — /live and useLiveState both read it instead of re-deriving their own rules.
//
// voting:   the window is open, no result yet.
// counting: the window closed, no result yet (waiting on /api/tick).
// between:  a round has a result but the run continues — tooClose, or a shootout round that isn't decided yet.
// parked:   overturned and back in the VAR room for another loop.
// decided:  upheld, overturned at the loop cap (abandoned), a shootout that's been won or lost outright, or no
//           referendum at all.
export type Phase = 'voting' | 'counting' | 'between' | 'parked' | 'decided'

// Keep in sync with workflows/definitions/peoplesVar.ts RULES.
const SHOOTOUT_ROUNDS_TO_WIN = 3
const LOOP_CAP = 3

export type RunRef = {
  result?: string
  round: string
  loop: number
  closesAt: string
  // Results of this loop's finished shootout rounds, in this run, including the current round once it has a
  // result (LIVE_QUERY and INCIDENT_QUERY both filter defined(result), so a round in this list is done).
  shootout: string[]
  incident: {finalCall?: string}
}

// No automated test: `web` has no test runner (see plans/006), and adding vitest as a devDependency pulled in
// a peer-resolution graph (via jsdom/vite) that rewrote unrelated lockfile entries for next/styled-jsx/
// eslint-config-next beyond the vitest addition itself, so it was reverted. Reasoned through by hand instead —
// each case below is a `runPhase(ref, now)` call worth re-checking after any change to this function:
//   - no ref (null/undefined)                                            -> decided
//   - no result, now < closesAt                                          -> voting
//   - no result, now >= closesAt                                         -> counting
//   - result: tooClose                                                   -> between
//   - shootout round, 2 wins/1 loss so far (nobody at 3 yet)              -> between
//   - shootout round, 3rd win                                            -> decided
//   - shootout round, 3rd loss, loop 1                                   -> parked
//   - result: overturned, loop 3 (loop cap, abandoned)                   -> decided
//   - result: upheld                                                     -> decided
export function runPhase(ref: RunRef | null | undefined, now: number): Phase {
  if (!ref) return 'decided'
  if (!ref.result) return now < Date.parse(ref.closesAt) ? 'voting' : 'counting'
  if (ref.result === 'tooClose') return 'between'

  let overturned = ref.result === 'overturned'
  if (ref.round.startsWith('shootout')) {
    const wins = ref.shootout.filter((r) => r === 'upheld').length
    const losses = ref.shootout.filter((r) => r === 'overturned').length
    if (wins < SHOOTOUT_ROUNDS_TO_WIN && losses < SHOOTOUT_ROUNDS_TO_WIN) return 'between'
    overturned = losses >= SHOOTOUT_ROUNDS_TO_WIN
  }

  return overturned && ref.loop < LOOP_CAP ? 'parked' : 'decided'
}
