// Constants shared across packages (web, var-room, workflows). No imports on purpose: importing
// definitions/peoplesVar.ts (which pulls in @sanity/workflow-engine/define) into browser code would ship the
// engine's define-time machinery to the client for no reason. This module is the one place these numbers and
// labels live; everything else imports from here instead of copying them.

// A human vote counts this many bot votes. Real people are rare at a demo (Henrik, session 3). 8 since session 5:
// at 20 a lone vote always landed outside 45-55%, so extra time never happened; at 8, voting against the crowd's
// lean forces extra time on every incident (scripts/crowd-odds.ts checks it). Quorum counts heads; the split counts weight. Shown on /live, /vote and the VAR Room.
export const HUMAN_VOTE_WEIGHT = 8

// Sudden death (Henrik, session 4: five penalties was too long): one penalty decides it. Scored = upheld,
// saved = back to the VAR room. The workflow still counts wins/losses, so this could go back up.
export const SHOOTOUT_ROUNDS_TO_WIN = 1

// How long each vote is open, in seconds. Short on purpose: a judge plays a whole run alone (session 4).
export const WINDOW_SECONDS = {referendum: 60, extraTime: 30, shootout: 15} as const

// A new round opens this many seconds after it's created: the countdown every screen shows, timed by the round
// itself. 5 s, so a screen that polls every 3 s sees the round before its vote opens (session 5).
export const KICKOFF_SECONDS = 5

export const CALL_LABELS: Record<string, string> = {
  goal: 'Goal',
  noGoal: 'No goal',
  penalty: 'Penalty',
  noPenalty: 'No penalty',
  redCard: 'Red card',
  yellowCard: 'Yellow card',
  noFoul: 'No foul',
}

// The simulated crowd's fixed personas (see CLAUDE.md "Simulated crowd").
export const PERSONAS = ['homeFan', 'awayFan', 'neutral', 'pundit', 'chaos'] as const

// GROQ for one referendum's weighted vote count, from inside a projection on the referendum itself (`^`
// refers to it): bots are counters (botVotes.<choice>), humans are vote documents referencing this
// referendum, each worth HUMAN_VOTE_WEIGHT.
export const weightedCount = (choice: 'uphold' | 'overturn') =>
  `coalesce(botVotes.${choice}, 0) + ${HUMAN_VOTE_WEIGHT} * count(*[_type == "vote" && references(^._id) && choice == "${choice}"])`
