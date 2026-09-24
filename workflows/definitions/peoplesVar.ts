import {
  defineAction,
  defineActivity,
  defineEffect,
  defineField,
  defineOp,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

import {HUMAN_VOTE_WEIGHT, SHOOTOUT_ROUNDS_TO_WIN, WINDOW_SECONDS} from '../shared'

// The rules of the People's VAR. Percentages are the share of votes to UPHOLD the VAR recommendation.
export const RULES = {
  upheldAbove: 55,
  overturnedBelow: 45,
  shootoutRoundsToWin: SHOOTOUT_ROUNDS_TO_WIN,
  quorum: 20,
  // Real people are rare at a demo, so each human vote counts as this many bot votes. Shown on screen.
  humanVoteWeight: HUMAN_VOTE_WEIGHT,
  // Cost guards (Free plan quotas): runs started per rolling 24 h, human votes per referendum.
  maxRunsPerDay: 40,
  maxHumanVotesPerRound: 300,
  // Free plan's 10k document cap, kept far away: a ceiling on human vote documents per rolling 24 h.
  maxHumanVotesPerDay: 3000,
  quorumExtensionSeconds: 15,
} as const

type VoteStage = 'referendum' | 'extraTime' | 'shootout'

export {WINDOW_SECONDS}

// Effect names must be unique per definition, so each vote stage gets its own. The runtime registers
// one handler per kind for all three (see EFFECTS).
export const EFFECTS = {
  open: {referendum: 'open-referendum', extraTime: 'open-extra-time', shootout: 'open-shootout-round'},
  extend: {referendum: 'extend-referendum', extraTime: 'extend-extra-time', shootout: 'extend-shootout-round'},
  finalize: {referendum: 'finalize-referendum', extraTime: 'finalize-extra-time', shootout: 'finalize-shootout'},
  // The fans overturned it: the on-field call becomes the final call.
  overrule: {referendum: 'overrule-referendum', extraTime: 'overrule-extra-time', shootout: 'overrule-shootout'},
} as const satisfies Record<string, Record<VoteStage, string>>

// GROQ for the referendum round name stored on the referendum document.
const ROUND: Record<VoteStage, string> = {
  referendum: "'regular'",
  extraTime: "'extraTime'",
  shootout: "'shootout' + string($fields.shootoutWon + $fields.shootoutLost + 1)",
}

// The engine can't read vote documents (conditions only see the instance snapshot), so the tick route
// counts the votes when a window closes and passes the result in as action params.
const voteParams = [
  {name: 'upholdPct', type: 'number' as const, required: true},
  {name: 'votes', type: 'number' as const, required: true},
]

const recordResult = [
  defineOp({type: 'field.set', target: {field: 'upholdPct'}, value: {type: 'param', param: 'upholdPct'}}),
  defineOp({type: 'field.set', target: {field: 'votes'}, value: {type: 'param', param: 'votes'}}),
]

const setLiteral = (field: string, value: number) =>
  defineOp({type: 'field.set', target: {field}, value: {type: 'literal', value}})

// Routing reads fields, not activity status: a stage is decided once the tick route has recorded a result.
const decided = 'defined($fields.upholdPct)'
const WIN: Record<VoteStage, string> = {
  referendum: `${decided} && $fields.upholdPct > ${RULES.upheldAbove}`,
  extraTime: `${decided} && $fields.upholdPct > ${RULES.upheldAbove}`,
  shootout: `${decided} && $fields.shootoutWon >= ${RULES.shootoutRoundsToWin}`,
}
const LOSS: Record<VoteStage, string> = {
  referendum: `${decided} && $fields.upholdPct < ${RULES.overturnedBelow}`,
  extraTime: `${decided} && $fields.upholdPct < ${RULES.overturnedBelow}`,
  shootout: `${decided} && $fields.shootoutLost >= ${RULES.shootoutRoundsToWin}`,
}

function closeActions(stage: VoteStage) {
  if (stage === 'shootout') {
    // Ops can't branch, so the tick route picks the action: over 50% uphold wins the round.
    return [
      defineAction({
        name: 'roundWon',
        title: 'Round won (upheld)',
        params: voteParams,
        ops: [...recordResult, defineOp({type: 'field.inc', target: {field: 'shootoutWon'}})],
        status: 'done',
      }),
      defineAction({
        name: 'roundLost',
        title: 'Round lost (overturned)',
        params: voteParams,
        ops: [...recordResult, defineOp({type: 'field.inc', target: {field: 'shootoutLost'}})],
        status: 'done',
      }),
    ]
  }
  return [
    defineAction({
      name: 'closeVote',
      title: 'Close the vote',
      params: voteParams,
      // Leaving extra time for a shootout starts it at 0–0.
      ops: stage === 'extraTime' ? [...recordResult, setLiteral('shootoutWon', 0), setLiteral('shootoutLost', 0)] : recordResult,
      status: 'done',
    }),
  ]
}

function voteStage(stage: VoteStage, title: string, tooClose: string) {
  return defineStage({
    name: stage,
    title,
    // Stage-scoped: every visit (every loop back, every shootout round) starts clean.
    fields: [
      defineField({type: 'number', name: 'upholdPct'}),
      defineField({type: 'number', name: 'votes'}),
      defineField({type: 'boolean', name: 'extended', initialValue: {type: 'literal', value: false}}),
      // Set when the window closed without a single human vote: the simulated crowd can't decide alone.
      defineField({type: 'boolean', name: 'noVotes', initialValue: {type: 'literal', value: false}}),
      // Written by the open-* effect handler.
      defineField({type: 'string', name: 'referendumId'}),
      defineField({type: 'datetime', name: 'closesAt'}),
    ],
    activities: [
      defineActivity({
        name: 'ballot',
        title: 'Open the vote',
        actions: [
          // Fired by a person (Send to the people, Go to extra time, Take the next penalty), never by the
          // cascade: every round waits for a press (Experience v3, session 4).
          defineAction({
            name: 'open',
            title: 'Kick off',
            status: 'done',
            effects: [
              defineEffect({
                name: EFFECTS.open[stage],
                // Bindings are GROQ, resolved when the effect is queued.
                bindings: {
                  incidentId: '$fields.subject._id',
                  round: ROUND[stage],
                  windowSeconds: String(WINDOW_SECONDS[stage]),
                  loop: VAR_ROOM_VISITS,
                },
              }),
            ],
          }),
        ],
      }),
      defineActivity({
        name: 'count',
        title: 'Count the votes',
        actions: [
          ...closeActions(stage),
          // No human voted: no decision. The tick route fires this instead of a close action.
          defineAction({
            name: 'noVotes',
            title: 'No fans voted',
            ops: [defineOp({type: 'field.set', target: {field: 'noVotes'}, value: {type: 'literal', value: true}})],
            status: 'done',
          }),
          // A window that closes under quorum gets one extension; the tick route fires this instead.
          defineAction({
            name: 'extend',
            title: 'Extend the window (no quorum)',
            filter: '$fields.extended != true',
            ops: [defineOp({type: 'field.set', target: {field: 'extended'}, value: {type: 'literal', value: true}})],
            effects: [
              defineEffect({
                name: EFFECTS.extend[stage],
                bindings: {referendumId: '$fields.referendumId', seconds: String(RULES.quorumExtensionSeconds)},
              }),
            ],
          }),
        ],
      }),
      // Upheld and overturned are terminal and can't run work, so the final call is written here, in the hop
      // that moves there: the VAR's call if upheld, the on-field call if the fans overturned it.
      defineActivity({
        name: 'finalize',
        title: 'Write the final call',
        actions: [
          defineAction({
            name: 'writeFinalCall',
            when: WIN[stage],
            status: 'done',
            effects: [defineEffect({name: EFFECTS.finalize[stage], bindings: {incidentId: '$fields.subject._id'}})],
          }),
          defineAction({
            name: 'writeOverruledCall',
            when: LOSS[stage],
            status: 'done',
            effects: [defineEffect({name: EFFECTS.overrule[stage], bindings: {incidentId: '$fields.subject._id'}})],
          }),
        ],
      }),
    ],
    // Declaration order is routing priority.
    transitions: [
      defineTransition({name: 'upheld', to: 'upheld', when: WIN[stage]}),
      defineTransition({name: 'overturned', to: 'overturned', when: LOSS[stage]}),
      defineTransition({name: 'noDecision', to: 'varRoom', when: '$fields.noVotes == true'}),
      defineTransition({name: stage === 'shootout' ? 'nextRound' : 'tooClose', to: tooClose, when: decided}),
    ],
  })
}

// Stage visits live in the raw instance snapshot. 1 on the first run through, 2 after a round nobody voted in, ...
const VAR_ROOM_VISITS = 'count(*[_id == $self][0].stages[name == "varRoom"])'

export const peoplesVar = defineWorkflow({
  name: 'peoples-var',
  title: "People's VAR",
  description:
    'The VAR room recommends, the fans decide. Too close to call goes to extra time, then a sudden-death penalty. Overturned means the on-field call stands. A round nobody votes in goes back to the VAR room.',
  initialStage: 'varRoom',
  start: {
    kind: 'interactive',
    requirements: [{type: 'singleSubject', name: 'one-run-per-incident', title: 'This incident is already live'}],
  },
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Incident',
      types: ['incident'],
      required: true,
      initialValue: {type: 'input'},
    }),
    // Workflow scope so the score survives the shootout's stage-per-round loop.
    defineField({type: 'number', name: 'shootoutWon', initialValue: {type: 'literal', value: 0}}),
    defineField({type: 'number', name: 'shootoutLost', initialValue: {type: 'literal', value: 0}}),
  ],
  stages: [
    defineStage({
      name: 'varRoom',
      title: 'VAR room',
      activities: [
        defineActivity({
          name: 'review',
          title: 'Review the footage',
          actions: [defineAction({name: 'recommend', title: 'Send to the people', status: 'done'})],
        }),
      ],
      transitions: [
        defineTransition({name: 'recommend', to: 'referendum', when: '$allActivitiesDone'}),
      ],
    }),
    voteStage('referendum', 'Referendum', 'extraTime'),
    voteStage('extraTime', 'Extra time', 'shootout'),
    voteStage('shootout', 'Shootout', 'shootout'),
    defineStage({name: 'upheld', title: 'Upheld', description: 'The people have spoken. The call stands.'}),
    defineStage({name: 'overturned', title: 'Overturned', description: 'The fans overruled the VAR. The on-field call stands.'}),
  ],
})
