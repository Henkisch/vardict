export const INCIDENT_TYPES = [
  {title: 'Offside', value: 'offside'},
  {title: 'Handball', value: 'handball'},
  {title: 'Penalty', value: 'penalty'},
  {title: 'Red card', value: 'redCard'},
  {title: 'Mistaken identity', value: 'mistakenIdentity'},
  {title: 'Goal line', value: 'goalLine'},
]

export const CALLS = [
  {title: 'Goal', value: 'goal'},
  {title: 'No goal', value: 'noGoal'},
  {title: 'Penalty', value: 'penalty'},
  {title: 'No penalty', value: 'noPenalty'},
  {title: 'Red card', value: 'redCard'},
  {title: 'Yellow card', value: 'yellowCard'},
  {title: 'No foul', value: 'noFoul'},
]

export const ROUNDS = [
  {title: 'Regular time', value: 'regular'},
  {title: 'Extra time', value: 'extraTime'},
  // One sudden-death penalty since workflow v4 (the value keeps its old name).
  {title: 'Sudden-death penalty', value: 'shootout1'},
]

export const REFERENDUM_RESULTS = [
  {title: 'Upheld', value: 'upheld'},
  {title: 'Overturned', value: 'overturned'},
  {title: 'Too close to call', value: 'tooClose'},
  {title: 'No humans voted (back to the VAR room)', value: 'noVotes'},
  {title: 'Stopped (the run was aborted)', value: 'aborted'},
]

export const CHOICES = [
  {title: 'Uphold', value: 'uphold'},
  {title: 'Overturn', value: 'overturn'},
]

// Values must match workflows/shared.ts PERSONAS (studio has no dependency on workflows, so this stays a
// copy; titles are Studio-only display strings, not shared with the other packages).
export const PERSONAS = [
  {title: 'Home fan', value: 'homeFan'},
  {title: 'Away fan', value: 'awayFan'},
  {title: 'Neutral', value: 'neutral'},
  {title: 'Pundit', value: 'pundit'},
  {title: 'Chaos voter', value: 'chaos'},
]

export const titleFor = (list: {title: string; value: string}[], value?: string) =>
  list.find((item) => item.value === value)?.title ?? value

// Clips longer than this don't fit the big screen's attention span, or ours.
export const MAX_CLIP_SECONDS = 30

// Fictional pundits for the ticker on /live.
export const PUNDITS = [
  {title: 'The Gaffer (ex-manager, blames the system)', value: 'gaffer'},
  {title: 'The Stat Guy (xG for everything)', value: 'stats'},
  {title: 'The Old Pro (it was better before VAR)', value: 'oldPro'},
]

// When a pundit line plays, keyed to what just happened on /live.
export const PUNDIT_TRIGGERS = [
  {title: 'VAR room: reviewing', value: 'review'},
  {title: 'Kick-off: the vote opens', value: 'kickoff'},
  {title: 'During the vote', value: 'voting'},
  {title: 'Too close to call', value: 'tooClose'},
  {title: 'Penalty scored (uphold)', value: 'penaltyScored'},
  {title: 'Penalty saved (overturn)', value: 'penaltySaved'},
  {title: 'Upheld', value: 'upheld'},
  {title: 'Overturned', value: 'overturned'},
  {title: 'Nobody voted (back to the VAR room)', value: 'noVotes'},
]
