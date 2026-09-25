// The path a run took through the peoples-var workflow, in plain words, derived from its public rounds. Shared by
// the results cards and the night's summary, so the two can't disagree. (The verdict screen's WorkflowPath draws
// the same stages live.)

export type PathStage = 'varRoom' | 'referendum' | 'extraTime' | 'shootout' | 'upheld' | 'overturned'
export type PathStep = {stage: PathStage; result?: string}

export const PLAIN_STAGE: Record<PathStage, string> = {
  varRoom: 'VAR room',
  referendum: 'Fans vote',
  extraTime: 'Extra time',
  shootout: 'Penalty',
  upheld: 'Upheld',
  overturned: 'Overturned',
}

const stageOf = (round: string): PathStage =>
  round === 'regular' ? 'referendum' : round === 'extraTime' ? 'extraTime' : 'shootout'

// One run's rounds, in order. A new loop means the run went back to the VAR room (a round nobody voted in).
export function runPath(run: {round: string; loop: number; result?: string}[]): PathStep[] {
  const steps: PathStep[] = []
  let loop = 0
  for (const round of run) {
    if (round.result === 'aborted') continue
    if (round.loop !== loop) {
      steps.push({stage: 'varRoom'})
      loop = round.loop
    }
    steps.push({stage: stageOf(round.round), result: round.result})
  }
  const last = run.filter((r) => r.result !== 'aborted').at(-1)
  if (last?.result === 'upheld' || last?.result === 'overturned') steps.push({stage: last.result})
  else if (last?.result === 'noVotes') steps.push({stage: 'varRoom'})
  return steps
}

export const RESULT_WORD: Record<string, string> = {
  upheld: 'upheld',
  overturned: 'overturned',
  tooClose: 'too close',
  noVotes: 'no humans voted',
}
