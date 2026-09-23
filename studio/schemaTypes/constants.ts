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
  {title: 'Shootout 1', value: 'shootout1'},
  {title: 'Shootout 2', value: 'shootout2'},
  {title: 'Shootout 3', value: 'shootout3'},
  {title: 'Shootout 4', value: 'shootout4'},
  {title: 'Shootout 5', value: 'shootout5'},
]

export const REFERENDUM_RESULTS = [
  {title: 'Upheld', value: 'upheld'},
  {title: 'Overturned', value: 'overturned'},
  {title: 'Too close to call', value: 'tooClose'},
]

export const CHOICES = [
  {title: 'Uphold', value: 'uphold'},
  {title: 'Overturn', value: 'overturn'},
]

export const PERSONAS = [
  {title: 'Home fan', value: 'homeFan'},
  {title: 'Away fan', value: 'awayFan'},
  {title: 'Neutral', value: 'neutral'},
  {title: 'Pundit', value: 'pundit'},
  {title: 'Chaos voter', value: 'chaos'},
]

export const titleFor = (list: {title: string; value: string}[], value?: string) =>
  list.find((item) => item.value === value)?.title ?? value

// Clips longer than this don't fit the Control Room's attention span, or ours.
export const MAX_CLIP_SECONDS = 30
