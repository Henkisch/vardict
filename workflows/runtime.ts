// The People's VAR runtime: engine setup, effect handlers, and closing a vote window.
// Server-only (uses the write token). Used by scripts/ and by /web's /api/start and /api/tick.
import {createClient, type SanityClient} from '@sanity/client'
import {createEngine, type EffectHandler, type Engine} from '@sanity/workflow-engine'

import {chaosChoice, planCrowd, type PlannedVote, waves} from './crowd'
import {EFFECTS, RULES} from './definitions/peoplesVar'
import {KICKOFF_SECONDS, PERSONAS} from './shared'

export const DEFINITION = 'peoples-var'

export type RuntimeConfig = {
  projectId: string
  token: string
  contentDataset?: string
  workflowsDataset?: string
  tag?: string
  // Runs background work (the bot crowd) past the current request. Next.js passes `after`; scripts await it.
  background?: (task: () => Promise<void>) => void
  // How a newly opened referendum gets its crowd. Default: run it in the background here. The web app instead
  // starts each round's crowd in its own request, so one dying function can't take the rest of the run with it.
  startCrowd?: (referendumId: string) => void
  // A base client to build content/workflows clients from. Tests pass a test bench's fake client.
  client?: SanityClient
  // Clock. Tests pass a bench's controllable clock so time-based behaviour is deterministic.
  now?: () => number
  // How runCrowd waits between waves and while closing its window. Default: a real timer, so `ms` is real
  // wall-clock milliseconds - matching `now`'s own default of `Date.now`. Tests inject a fast/no-op sleep
  // (e.g. one that instead advances a bench's own clock) so waits aren't pinned to real time, which has
  // nothing to do with a bench's separately-tracked clock.
  sleep?: (ms: number) => Promise<void>
  // The simulated crowd can't decide alone: a round with no human vote goes back to the VAR room. Default on;
  // most runtime tests turn it off to drive rounds with bot counters only.
  requireHumanVote?: boolean
}

export type Runtime = {
  engine: Engine
  content: SanityClient
  workflows: SanityClient
  projectId: string
  contentDataset: string
  tag: string
  background: (task: () => Promise<void>) => void
  now: () => number
  sleep: (ms: number) => Promise<void>
  requireHumanVote: boolean
}

// Effect params carry documents as global references: dataset:<project>:<dataset>:<id>.
const docId = (gdr: unknown) => String(gdr).split(':').at(-1)!

const stageField = (field: string, value: unknown) => ({
  type: 'field.set' as const,
  target: {scope: 'stage' as const, field},
  value: {type: 'literal' as const, value},
})

// Creates the referendum document for a stage visit, keyed by the effect's own key so at-least-once
// redelivery is idempotent: a repeat finds the document already there and returns it unchanged, without
// calling `onOpened` again - which is what starts the bot crowd, so two crowds racing on the same document
// is exactly the bug this guards against. Exported so a test can call it directly with the same effectKey
// twice (see runtime.test.ts).
export async function openReferendum(
  content: SanityClient,
  now: () => number,
  effectKey: string,
  instanceId: string,
  params: Record<string, unknown>,
  onOpened: (referendumId: string) => void,
): Promise<{referendumId: string; closesAt: string}> {
  const referendumId = `referendum-${effectKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const existing = await content.getDocument<{closesAt: string}>(referendumId)
  if (existing) return {referendumId, closesAt: existing.closesAt}
  // The window opens after the kick-off countdown, so every screen can count down to the same moment.
  const opensAt = now() + KICKOFF_SECONDS * 1000
  const closesAt = new Date(opensAt + Number(params.windowSeconds) * 1000).toISOString()
  const doc = await content.createIfNotExists({
    _id: referendumId,
    _type: 'referendum',
    // Lets /live and /api/tick find the run from the referendum alone.
    workflowInstanceId: instanceId,
    incident: {_type: 'reference', _ref: docId(params.incidentId)},
    round: params.round,
    loop: Number(params.loop),
    threshold: RULES.upheldAbove / 100,
    windowOpensAt: new Date(opensAt).toISOString(),
    closesAt,
    botVotes: emptyBotVotes(),
  })
  onOpened(doc._id)
  return {referendumId: doc._id, closesAt: doc.closesAt}
}

function handlers(content: SanityClient, now: () => number, onOpened: (referendumId: string) => void) {
  // Creates the referendum document the phones vote on. Idempotent on the effect key (at-least-once delivery).
  const open: EffectHandler = async (params, ctx) => {
    const {referendumId, closesAt} = await openReferendum(content, now, ctx.effectKey, ctx.instanceId, params, onOpened)
    return {ops: [stageField('referendumId', referendumId), stageField('closesAt', closesAt)]}
  }

  // At-least-once delivery can call this twice for the same window; `extended` makes the second call a no-op
  // instead of pushing closesAt out again.
  const extend: EffectHandler = async (params) => {
    const id = String(params.referendumId)
    const seconds = Number(params.seconds)
    // One retry: the bot crowd patches this same document's botVotes counters throughout the window, so our
    // ifRevisionId commit can lose a race to a wave landing at the same moment. Re-reading and retrying once
    // beats leaving the stage marked `extended` with a closesAt that never actually moved.
    for (let attempt = 0; ; attempt++) {
      const {_rev, closesAt, extended} = await content.fetch<{_rev: string; closesAt: string; extended?: boolean}>(
        '*[_id == $id][0]{_rev, closesAt, extended}',
        {id},
      )
      if (extended === true) return {ops: [stageField('closesAt', closesAt)]}
      const next = new Date(Date.parse(closesAt) + seconds * 1000).toISOString()
      try {
        await content.patch(id).set({closesAt: next, extended: true}).ifRevisionId(_rev).commit()
        return {ops: [stageField('closesAt', next)]}
      } catch (error) {
        if (attempt >= 1) throw error
      }
    }
  }

  // The people upheld the VAR's recommendation, so it becomes the final call.
  const finalize: EffectHandler = async (params) => {
    const id = docId(params.incidentId)
    const {varRecommendation} = await content.fetch<{varRecommendation: string}>(
      '*[_id == $id][0]{varRecommendation}',
      {id},
    )
    await content.patch(id).set({finalCall: varRecommendation}).commit()
  }

  // The fans overturned the VAR's recommendation: the on-field call stands, and becomes the final call.
  const overrule: EffectHandler = async (params) => {
    const id = docId(params.incidentId)
    // The call the fans overturn to: the incident's overturnedCall, else the referee's call. Not always the referee's:
    // when the VAR backed the referee (Pickford, Díaz, Gordon, Milenkovic), overturning means the other call.
    const {call} = await content.fetch<{call: string}>('*[_id == $id][0]{"call": coalesce(overturnedCall, originalCall)}', {id})
    await content.patch(id).set({finalCall: call}).commit()
  }

  const byKind = {open, extend, finalize, overrule}
  return Object.fromEntries(
    Object.entries(EFFECTS).flatMap(([kind, names]) =>
      Object.values(names as Record<string, string>).map((name) => [name, byKind[kind as keyof typeof byKind]]),
    ),
  )
}

export function createRuntime({
  projectId,
  token,
  contentDataset = 'production',
  workflowsDataset = 'workflows',
  tag = 'dev',
  background = (task) => void task().catch((error) => console.error('background task failed', error)),
  startCrowd,
  client,
  now = Date.now,
  sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  requireHumanVote = true,
}: RuntimeConfig): Runtime {
  const base = client ?? createClient({projectId, token, apiVersion: '2025-02-19', useCdn: false})
  const content = base.withConfig({dataset: contentDataset})
  const workflows = base.withConfig({dataset: workflowsDataset})
  const engine = createEngine({
    client: workflows,
    tag,
    // Same seam as `now`: omitted `now` defaults to Date.now, so this is real wall-clock time in production,
    // same as never passing `clock`. Tests inject `now` from a bench's frozen/controllable clock, so the
    // engine's own timestamps (startedAt, completedAt, $now) line up with the times our own handlers stamp.
    clock: () => new Date(now()).toISOString(),
    workflowResource: {type: 'dataset', id: `${projectId}.${workflowsDataset}`},
    // The subject (incident) lives in the content dataset; the engine only accepts refs it can resolve.
    resourceClients: (gdr) =>
      gdr.scheme === 'dataset' && gdr.projectId === projectId && gdr.dataset === contentDataset ? content : undefined,
    // The crowd needs the finished runtime, which doesn't exist yet while the engine is being built.
    effects: {
      handlers: handlers(content, now, (referendumId) =>
        startCrowd ? startCrowd(referendumId) : background(() => runCrowd(runtime, referendumId)),
      ),
    },
  })
  const runtime: Runtime = {engine, content, workflows, projectId, contentDataset, tag, background, now, sleep, requireHumanVote}
  return runtime
}

// Start a run for an incident, record the VAR's call and open the first vote: one press of Send to the people.
// The VAR check starts: a run for the incident, waiting in the VAR room for its recommend (the next press).
export async function startVarCheck(runtime: Runtime, incidentId: string) {
  const {engine, projectId, contentDataset} = runtime
  const {instance} = await engine.startInstance({
    definition: DEFINITION,
    initialFields: [
      {type: 'subject', name: 'subject', value: {id: `dataset:${projectId}:${contentDataset}:${incidentId}`, type: 'incident'}},
    ],
  })
  return instance
}

export async function sendToThePeople(runtime: Runtime, incidentId: string) {
  const {engine} = runtime
  const instance = await startVarCheck(runtime, incidentId)
  // Keyed by this visit to the VAR room, so a retry after a dropped response (or the recovery path in
  // startNext) replays instead of double-firing the human action.
  const visits = instance.stages.filter((s) => s.name === 'varRoom').length
  await engine.fireAction({
    instanceId: instance._id,
    activity: 'review',
    action: 'recommend',
    idempotencyKey: `recommend-${instance._id}-${visits}`,
  })
  await engine.drainEffects({instanceId: instance._id})
  await kickOff(runtime, instance._id)
  return instance._id
}

const VOTE_STAGES = ['referendum', 'extraTime', 'shootout']

// Opens the current voting stage's ballot: the referendum document, its window and its bot crowd. Every voting
// stage waits for this (Experience v3): the cascade never opens a round, a person does. Keyed by the stage visit
// (its position in the instance's stage list), so a double press or a retry replays instead of opening twice.
// Returns false when there's nothing to kick off (not a voting stage, or its ballot is already open).
export async function kickOff({engine}: Runtime, instanceId: string): Promise<boolean> {
  const instance = await engine.getInstance({instanceId})
  if (!VOTE_STAGES.includes(instance.currentStage)) return false
  if (currentStageFields(instance).referendumId != null) return false
  await engine.fireAction({
    instanceId,
    activity: 'ballot',
    action: 'open',
    idempotencyKey: `open-${instanceId}-${instance.stages.length}`,
  })
  await engine.drainEffects({instanceId})
  return true
}

// The current stage visit's fields, as the engine stores them.
function currentStageFields(instance: Awaited<ReturnType<Engine['getInstance']>>) {
  const visit = instance.stages.at(-1) as {fields?: {name: string; value?: unknown}[]} | undefined
  return Object.fromEntries((visit?.fields ?? []).map((f) => [f.name, f.value]))
}

export type CloseResult =
  // waiting: a voting stage whose ballot hasn't been kicked off yet (the run is on the verdict screen).
  | {status: 'notVoting' | 'stillOpen' | 'alreadyClosed' | 'waiting'; stage: string}
  // noVotes: the window closed without a human vote, so the run went back to the VAR room with no decision.
  | {status: 'noVotes'; stage: string; votes: number}
  | {status: 'extended' | 'closed'; stage: string; upholdPct: number; votes: number}

// The same thresholds closeActions() in the definition routes on, mirrored here so we can label a referendum
// with the outcome the engine itself will record for that stage visit.
function resultFor(stageName: string, upholdPct: number): 'upheld' | 'overturned' | 'tooClose' {
  if (stageName === 'shootout') return upholdPct > 50 ? 'upheld' : 'overturned'
  return upholdPct > RULES.upheldAbove ? 'upheld' : upholdPct < RULES.overturnedBelow ? 'overturned' : 'tooClose'
}

// `result` on a referendum is a projection of the engine's own record, never written independently of it.
// Walks every stage visit the instance has ever had (not just the current one) and, for any visit whose fields
// carry both a referendumId and a decided upholdPct, makes sure that referendum's `result` matches — filling
// in only what's missing. This runs on every closeWindow call (including the "nothing to do" branches), and
// closeWindow itself is polled every few seconds by every open screen on a Free-plan request quota, so it must
// cost zero writes once a run's referendums already have their results. One fetch finds which of this
// instance's decided referendums are actually still missing a result, and (only when that set is non-empty)
// one transaction patches exactly those.
async function syncResults(content: SanityClient, instance: Awaited<ReturnType<Engine['getInstance']>>) {
  const decided = new Map<string, 'upheld' | 'overturned' | 'tooClose'>()
  for (const visit of instance.stages as unknown as {name: string; fields?: {name: string; value?: unknown}[]}[]) {
    const fields = Object.fromEntries((visit.fields ?? []).map((f) => [f.name, f.value]))
    if (fields.referendumId == null || fields.upholdPct == null) continue
    decided.set(String(fields.referendumId), resultFor(visit.name, Number(fields.upholdPct)))
  }
  if (decided.size === 0) return

  const missing = await content.fetch<string[]>(
    '*[_id in $ids && !defined(result)]._id',
    {ids: [...decided.keys()]},
  )
  if (missing.length === 0) return

  const tx = content.transaction()
  for (const id of missing) tx.patch(content.patch(id).setIfMissing({result: decided.get(id)!}))
  await tx.commit()
}

// Called by /api/tick when a countdown hits zero. Safe to call twice or too early.
export async function closeWindow(
  {engine, content, now: runtimeNow, requireHumanVote}: Runtime,
  instanceId: string,
  now = runtimeNow(),
): Promise<CloseResult> {
  // Retries a stuck open-* effect (e.g. a caller fired `recommend` but crashed before draining), so a stage
  // that never got its ballot recovers here instead of hanging forever.
  await engine.drainEffects({instanceId}).catch((error) => console.warn('drain before close failed', instanceId, error))

  const instance = await engine.getInstance({instanceId})
  const stage = instance.currentStage
  if (!['referendum', 'extraTime', 'shootout'].includes(stage)) {
    await syncResults(content, instance) // heals any earlier visit left without a result by a crash
    return {status: 'notVoting', stage}
  }

  const fields = currentStageFields(instance)
  if (fields.upholdPct != null) {
    await syncResults(content, instance)
    return {status: 'alreadyClosed', stage}
  }
  if (!fields.referendumId) return {status: 'waiting', stage} // ballot not kicked off yet
  const referendumId = String(fields.referendumId)

  // The stage field's closesAt lags until the extend effect completes; the referendum document is patched
  // immediately, so use whichever is later to decide whether the window has actually closed.
  const refDoc = await content.fetch<{closesAt?: string}>('*[_id == $id][0]{closesAt}', {id: referendumId})
  const stageClosesAt = fields.closesAt ? Date.parse(String(fields.closesAt)) : undefined
  const docClosesAt = refDoc?.closesAt ? Date.parse(refDoc.closesAt) : undefined
  const known = [stageClosesAt, docClosesAt].filter((v): v is number => v != null)
  if (known.length === 0) return {status: 'stillOpen', stage} // ballot not open yet
  const closesAtMs = Math.max(...known)
  if (now < closesAtMs) return {status: 'stillOpen', stage}
  const closesAtIso = new Date(closesAtMs).toISOString()

  const tally = await countVotes(content, referendumId, closesAtIso)
  // Quorum counts heads; the split counts humans at their weight.
  const upholdPct = tally.weightedTotal ? Math.round((tally.uphold / tally.weightedTotal) * 1000) / 10 : 50

  // The simulated crowd can't decide alone: no human vote, no decision. Back to the VAR room.
  if (requireHumanVote && tally.humans === 0) {
    await engine.fireAction({instanceId, activity: 'count', action: 'noVotes', idempotencyKey: `novotes-${referendumId}`})
    await content.patch(referendumId).setIfMissing({result: 'noVotes'}).commit()
    await engine.drainEffects({instanceId})
    return {status: 'noVotes', stage, votes: tally.bots}
  }

  if (tally.bots + tally.humans < RULES.quorum && !fields.extended) {
    await engine.fireAction({
      instanceId,
      activity: 'count',
      action: 'extend',
      // Two callers can race to extend the same window; the engine replays instead of extending twice.
      idempotencyKey: `extend-${referendumId}`,
    })
    await engine.drainEffects({instanceId})
    return {status: 'extended', stage, upholdPct, votes: tally.bots + tally.humans}
  }

  const action = stage === 'shootout' ? (upholdPct > 50 ? 'roundWon' : 'roundLost') : 'closeVote'
  try {
    await engine.fireAction({
      instanceId,
      activity: 'count',
      action,
      params: {upholdPct, votes: tally.bots + tally.humans},
      // Two callers can close the same window; the engine replays instead of double-counting.
      idempotencyKey: `close-${referendumId}`,
    })
  } catch (error) {
    // Another caller may have closed this same window between our read and our write. Re-check before
    // deciding this call genuinely failed.
    const reread = await engine.getInstance({instanceId})
    const reFields = currentStageFields(reread)
    if (reFields.upholdPct != null || reread.currentStage !== stage) {
      await syncResults(content, reread)
      return {status: 'alreadyClosed', stage}
    }
    throw error
  }
  // The referendum's `result` is written from the engine's own record, after the action that decided it -
  // never before, so a failed action never leaves a referendum that looks closed while the workflow hasn't moved.
  const after = await engine.getInstance({instanceId})
  await syncResults(content, after)
  // Writes the final call if this round decided it. The next round's ballot waits for a press (kickOff).
  await engine.drainEffects({instanceId})
  return {status: 'closed', stage, upholdPct, votes: tally.bots + tally.humans}
}

// Bots aren't documents: each wave is one atomic `inc` on the referendum's counters (1 document per round instead
// of ~60, and screens read the counters instead of counting documents). Humans stay documents: the document id is
// what enforces one vote per phone per round.
export type BotVotes = {
  uphold: number
  overturn: number
  waves: number
  byPersona: Record<(typeof PERSONAS)[number], {uphold: number; overturn: number}>
}

export const emptyBotVotes = (): BotVotes & {_type: string} => ({
  _type: 'botVotes',
  uphold: 0,
  overturn: 0,
  waves: 0,
  byPersona: Object.fromEntries(PERSONAS.map((p) => [p, {uphold: 0, overturn: 0}])) as BotVotes['byPersona'],
})

// Weighted uphold/overturn (a human counts RULES.humanVoteWeight) and heads. Only counts human votes cast at
// or before `closesAt` - a request that slipped past /api/vote's open-check right at the deadline still
// shouldn't move the result after the fact.
async function countVotes(content: SanityClient, referendumId: string, closesAt: string) {
  const t = await content.fetch<{botsUp: number; botsDown: number; humansUp: number; humansDown: number}>(
    `*[_id == $id][0]{
      "botsUp": coalesce(botVotes.uphold, 0),
      "botsDown": coalesce(botVotes.overturn, 0),
      "humansUp": count(*[_type == "vote" && referendum._ref == $id && choice == "uphold" && dateTime(castAt) <= dateTime($closesAt)]),
      "humansDown": count(*[_type == "vote" && referendum._ref == $id && choice == "overturn" && dateTime(castAt) <= dateTime($closesAt)])
    }`,
    {id: referendumId, closesAt},
  )
  const w = RULES.humanVoteWeight
  const uphold = t.botsUp + w * t.humansUp
  const overturn = t.botsDown + w * t.humansDown
  return {uphold, overturn, weightedTotal: uphold + overturn, bots: t.botsUp + t.botsDown, humans: t.humansUp + t.humansDown}
}

type InstanceRow = {_id: string; currentStage: string; subjectId: string; completedAt?: string; startedAt: string}

// Unfinished runs under our tag, newest first. Instances are engine-owned documents; reading them is fine.
export async function liveInstances({workflows, tag}: Runtime) {
  return workflows.fetch<InstanceRow[]>(
    `*[_type == "sanity.workflow.instance" && tag == $wfTag && !defined(completedAt)] | order(startedAt desc){
      _id, currentStage, startedAt, "subjectId": fields[name == "subject"][0].value.id}`,
    {wfTag: tag},
  )
}

export const START_COOLDOWN_SECONDS = 10

export type StartResult =
  // newSeason: true only when every incident had a final call and this press reset them all to start again.
  | {status: 'started'; instanceId: string; incidentId: string; newSeason?: true}
  // checkOnly: the VAR check started (a run waiting in the VAR room); the next press sends it to the people.
  | {status: 'checking'; instanceId: string; incidentId: string; newSeason?: true}
  // sendOnly with nothing live: the VAR check this press was meant for has ended (or was never started).
  | {status: 'nothingToSend'}
  | {status: 'recommended'; instanceId: string; incidentId: string}
  // A voting stage was waiting for its press (Go to extra time, Take the next penalty): its ballot is now open.
  | {status: 'kickedOff'; instanceId: string; incidentId: string; stage: string}
  // instanceId is present for a genuinely busy live instance, absent for the lock-not-acquired /
  // recommend-failed variants (stage: 'starting') - both just mean "press again shortly".
  | {status: 'busy'; instanceId?: string; stage: string}
  | {status: 'coolingDown'; retryInSeconds: number}
  | {status: 'dailyLimit'; limit: number}
  | {status: 'unknownIncident'}

const START_LOCK_ID = 'vardict-start-lock'
// Longer than the slowest measured first press (~13 s: start + recommend + open, plan 016 #15).
const START_LOCK_TTL_MS = 30_000

// Serializes "Send to the people" presses. Without this, two presses landing at once (or a slow request
// overlapping a retry) could both read the same parked/empty state and both act on it - aborting the same
// run twice, or starting two runs. `lockedUntil` is a plain lease on a single tiny document; a caller that
// can't acquire it gets 'busy' back and should just try again, the same as any other busy state.
async function acquireStartLock(runtime: Runtime): Promise<string | undefined> {
  const {content} = runtime
  await content.createIfNotExists({_id: START_LOCK_ID, _type: 'startLock', lockedUntil: new Date(0).toISOString()})
  const {_rev, lockedUntil} = await content.fetch<{_rev: string; lockedUntil: string}>(
    '*[_id == $id][0]{_rev, lockedUntil}',
    {id: START_LOCK_ID},
  )
  if (Date.parse(lockedUntil) > runtime.now()) return undefined
  // Our lease, so release can tell it from someone else's (after ours expired and they took it).
  const lease = new Date(runtime.now() + START_LOCK_TTL_MS).toISOString()
  try {
    await content.patch(START_LOCK_ID).set({lockedUntil: lease}).ifRevisionId(_rev).commit()
    return lease
  } catch {
    // Lost the race to acquire: someone else's commit landed between our read and our write.
    return undefined
  }
}

// Frees only our own lease: a slow holder whose lease expired must not free the lock someone else now holds.
async function releaseStartLock(runtime: Runtime, lease: string): Promise<void> {
  const {content} = runtime
  try {
    const {_rev, lockedUntil} = await content.fetch<{_rev: string; lockedUntil: string}>('*[_id == $id][0]{_rev, lockedUntil}', {
      id: START_LOCK_ID,
    })
    if (lockedUntil !== lease) return
    await content.patch(START_LOCK_ID).set({lockedUntil: new Date(runtime.now()).toISOString()}).ifRevisionId(_rev).commit()
  } catch (error) {
    console.warn('start lock release failed', error)
  }
}

// The "Send to the people" button: one live vote at a time. A run parked in the VAR room (after an overturn)
// is sent back to the people; otherwise the next incident in line starts a fresh run. Only an operator-picked
// `pick` (validated by the caller/route) reaches here as anything other than undefined.
// `checkOnly` (the /live waiting screen's "Start the VAR check"): with nothing running, start the run but leave
// it in the VAR room instead of opening the vote. With a run already live it changes nothing, so two people
// pressing at once can't skip the VAR room.
// `sendOnly` ("Send to the people", "Go to extra time", "Penalty"): only move a live run on. With nothing live it
// answers nothingToSend, so a stale screen can't start the next incident straight into a vote.
export async function startNext(
  runtime: Runtime,
  pick?: string,
  {checkOnly = false, sendOnly = false}: {checkOnly?: boolean; sendOnly?: boolean} = {},
): Promise<StartResult> {
  const lease = await acquireStartLock(runtime)
  if (!lease) return {status: 'busy', stage: 'starting'}
  try {
    return await startNextLocked(runtime, pick, checkOnly, sendOnly)
  } finally {
    await releaseStartLock(runtime, lease)
  }
}

async function startNextLocked(runtime: Runtime, pick: string | undefined, checkOnly: boolean, sendOnly: boolean): Promise<StartResult> {
  const {engine, content, workflows, tag} = runtime

  // Validate the pick before anything else can act on it - in particular, before any abort below.
  if (pick !== undefined) {
    const found = await content.fetch<string | null>(
      `*[_type == "incident" && _id == $id && !(_id in path("drafts.**"))][0]._id`,
      {id: pick},
    )
    if (!found) return {status: 'unknownIncident'}
  }

  const [live] = await liveInstances(runtime)
  if (sendOnly && !live) return {status: 'nothingToSend'}
  // Counted from stored rounds, so it holds across serverless instances.
  const roundsToday = await content.fetch<number>(
    'count(*[_type == "referendum" && dateTime(windowOpensAt) > dateTime(now()) - 60*60*24])',
  )
  if (roundsToday >= RULES.maxRoundsPerDay) return {status: 'dailyLimit', limit: RULES.maxRoundsPerDay}
  if (checkOnly && live) {
    return live.currentStage === 'varRoom'
      ? {status: 'checking', instanceId: live._id, incidentId: docId(live.subjectId)}
      : {status: 'busy', instanceId: live._id, stage: live.currentStage}
  }
  // A voting stage whose ballot isn't open yet is waiting for a press, not busy: the run sits on the verdict
  // screen until someone presses Go to extra time / Take the next penalty.
  let waiting = false
  if (live && live.currentStage !== 'varRoom') {
    const instance = await engine.getInstance({instanceId: live._id})
    waiting = VOTE_STAGES.includes(live.currentStage) && currentStageFields(instance).referendumId == null
    if (!waiting) return {status: 'busy', instanceId: live._id, stage: live.currentStage}
  }
  // The operator picked a different incident: the parked or waiting run gives way (aborted runs keep their rounds).
  const replacing = Boolean(live && pick && docId(live.subjectId) !== pick)

  if (live && !replacing && waiting) {
    try {
      await kickOff(runtime, live._id)
    } catch (error) {
      console.warn('kick-off failed, left for the next press', live._id, error)
      return {status: 'busy', stage: 'starting'}
    }
    return {status: 'kickedOff', instanceId: live._id, incidentId: docId(live.subjectId), stage: live.currentStage}
  }

  if (live && !replacing) {
    const instance = await engine.getInstance({instanceId: live._id})
    const visits = instance.stages.filter((s) => s.name === 'varRoom').length
    try {
      await engine.fireAction({
        instanceId: live._id,
        activity: 'review',
        action: 'recommend',
        idempotencyKey: `recommend-${live._id}-${visits}`,
      })
      await engine.drainEffects({instanceId: live._id})
      // One press: the VAR's call is recorded and the vote opens. If this part fails, the run waits in the
      // referendum stage and the next press takes the kick-off branch above.
      await kickOff(runtime, live._id)
    } catch (error) {
      // Leave the instance parked; the next press retries the same idempotency key and recovers it.
      console.warn('recommend failed, left for the next press', live._id, error)
      return {status: 'busy', stage: 'starting'}
    }
    return {status: 'recommended', instanceId: live._id, incidentId: docId(live.subjectId)}
  }

  // Checks before any side effect - including the abort below - so a rejected pick or a blocked start
  // never costs the parked run its place.
  const last = await workflows.fetch<{completedAt: string} | null>(
    // Aborted runs (a wipe, an operator pick) don't need a breather: only finished matches cool down.
    `*[_type == "sanity.workflow.instance" && tag == $wfTag && defined(completedAt) && !defined(abortedAt)] | order(completedAt desc)[0]{completedAt}`,
    {wfTag: tag},
  )
  const since = last ? (runtime.now() - Date.parse(last.completedAt)) / 1000 : Infinity
  if (since < START_COOLDOWN_SECONDS) return {status: 'coolingDown', retryInSeconds: Math.ceil(START_COOLDOWN_SECONDS - since)}

  // Counted from stored runs, so it holds across serverless instances (an in-memory limiter wouldn't).
  const startedToday = await workflows.fetch<number>(
    `count(*[_type == "sanity.workflow.instance" && tag == $wfTag && dateTime(startedAt) > dateTime(now()) - 60*60*24])`,
    {wfTag: tag},
  )
  if (startedToday >= RULES.maxRunsPerDay) return {status: 'dailyLimit', limit: RULES.maxRunsPerDay}

  if (replacing) {
    await engine.abortInstance({instanceId: live!._id})
    // An aborted run can leave a round without a result, which screens would show as "counting" forever.
    const open = await content.fetch<string[]>(
      '*[_type == "referendum" && workflowInstanceId == $id && !defined(result)]._id',
      {id: live!._id},
    )
    // 'aborted', not 'noVotes': the run is gone, so screens mustn't show it as back in the VAR room (plan 016 #12).
    for (const id of open) await content.patch(id).set({result: 'aborted'}).commit()
  }

  // Next in line: the incident whose last referendum is oldest (never-voted first). Upheld incidents are done.
  const nextInLine = () =>
    content.fetch<string | null>(
      `*[_type == "incident" && !defined(finalCall) && !(_id in path("drafts.**"))]{
        _id, "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt,
        "date": match->date
      } | order(coalesce(last, "0") asc, date asc)[0]._id`,
    )

  let incidentId = pick ?? (await nextInLine())
  let newSeason: true | undefined

  if (!incidentId) {
    // Every incident has a final call - one human vote counts several bots, so a handful of judges can uphold all
    // five in an afternoon. Rather than fail forever, the next press starts a new season: round history
    // stays, only finalCall resets so the next-in-line query has somewhere to go again.
    const publishedIds = await content.fetch<string[]>(`*[_type == "incident" && !(_id in path("drafts.**"))]._id`)
    if (publishedIds.length > 0) {
      const tx = content.transaction()
      for (const id of publishedIds) tx.patch(content.patch(id).unset(['finalCall']))
      await tx.commit()
      incidentId = await nextInLine()
      newSeason = true
    }
    // No published incidents at all: nothing to start.
    if (!incidentId) return {status: 'unknownIncident'}
  }

  try {
    if (checkOnly) {
      const {_id: instanceId} = await startVarCheck(runtime, incidentId)
      return newSeason ? {status: 'checking', instanceId, incidentId, newSeason: true} : {status: 'checking', instanceId, incidentId}
    }
    const instanceId = await sendToThePeople(runtime, incidentId)
    return newSeason
      ? {status: 'started', instanceId, incidentId, newSeason: true}
      : {status: 'started', instanceId, incidentId}
  } catch (error) {
    // The run may already exist, parked in the VAR room without its recommend - the next press's
    // parked-run branch above recovers it.
    console.warn('start failed, left for the next press', incidentId, error)
    return {status: 'busy', stage: 'starting'}
  }
}

// Only run data - what rounds create on the fly - is ever deleted. Content (incidents, matches, teams, laws,
// pundit lines) is never deleted; incidents only lose their finalCall.
export const RUN_DATA_TYPES = ['vote', 'referendum'] as const

export type WipeResult = {status: 'wiped'; aborted: number; deleted: number; cleared: number} | {status: 'busy'; stage: string}

// The booth's "Full wipe": a clean slate before recording or judging. Aborts live runs, deletes every vote and
// referendum, and clears every finalCall, so the democracy clock falls back to the real VAR delays. Finished
// workflow instances stay in the private dataset (engine-owned). Takes the start lock so no press can start a
// run halfway through.
export async function wipeRunData(runtime: Runtime): Promise<WipeResult> {
  const lease = await acquireStartLock(runtime)
  if (!lease) return {status: 'busy', stage: 'starting'}
  try {
    const {engine, content} = runtime
    const live = await liveInstances(runtime)
    for (const instance of live) await engine.abortInstance({instanceId: instance._id})
    // Votes before rounds: a vote holds a strong reference to its referendum, so deleting a round first would fail
    // (plan 016 #13). Chunks keep each transaction small.
    const ids = await content.fetch<string[]>(
      '[...*[_type == "vote"]._id, ...*[_type == "referendum"]._id]',
    )
    const incidents = await content.fetch<string[]>('*[_type == "incident" && defined(finalCall)]._id')
    // Chunked: one transaction per 200 mutations keeps each request small.
    for (let i = 0; i < ids.length; i += 200) {
      const tx = content.transaction()
      ids.slice(i, i + 200).forEach((id) => tx.delete(id))
      await tx.commit()
    }
    if (incidents.length) {
      const tx = content.transaction()
      incidents.forEach((id) => tx.patch(content.patch(id).unset(['finalCall'])))
      await tx.commit()
    }
    return {status: 'wiped', aborted: live.length, deleted: ids.length, cleared: incidents.length}
  } finally {
    await releaseStartLock(runtime, lease)
  }
}

// `at` is in the runtime's own clock domain (production: real wall-clock ms, same as `now`'s default of
// `Date.now`; tests: a bench's controllable clock). Delegates the actual wait to `runtime.sleep` so tests can
// swap in a fast/no-op wait instead of pinning this to real time.
const sleepUntil = (runtime: Runtime, at: number) => runtime.sleep(Math.max(0, at - runtime.now()))

const backoff = () => new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.round(Math.random() * 200)))

type CrowdReferendum = {
  round: string
  loop: number
  windowOpensAt: string
  closesAt: string
  workflowInstanceId: string
  seed: number
  recommendationFavours: 'home' | 'away'
  outcryLevel: number
}

type WaveApplyResult = 'closed' | 'applied' | 'gaveUp'

// Applies one wave's votes as a single atomic `inc`, guarded by `ifRevisionId` and the wave's own index in
// `botVotes.waves` (so two runners racing on the same wave can't double count). Retries up to 3 times - on a
// failed read or a lost revision race - with a short backoff between attempts, so one conflicting write
// doesn't permanently drop the wave. (The bug this fixes: the old code skipped straight to the NEXT wave on
// any commit failure, silently losing that wave's votes for good.)
async function applyWave(runtime: Runtime, referendumId: string, index: number, votes: PlannedVote[]): Promise<WaveApplyResult> {
  const {content} = runtime
  for (let attempt = 1; attempt <= 3; attempt++) {
    let now: {_rev: string; result?: string; botVotes?: BotVotes; humansUp: number; humansDown: number} | null
    try {
      now = await content.fetch(
        `*[_id == $id][0]{_rev, result, botVotes,
          "humansUp": count(*[_type == "vote" && referendum._ref == $id && choice == "uphold"]),
          "humansDown": count(*[_type == "vote" && referendum._ref == $id && choice == "overturn"])}`,
        {id: referendumId},
      )
    } catch (error) {
      if (attempt === 3) {
        console.warn('crowd wave skipped', referendumId, index, error)
        return 'gaveUp'
      }
      await backoff()
      continue
    }
    if (!now || now.result) return 'closed' // the round closed while we were retrying (or was wiped)
    if ((now.botVotes?.waves ?? 0) > index) return 'applied' // someone else already applied this exact wave
    const upSoFar = (now.botVotes?.uphold ?? 0) + RULES.humanVoteWeight * now.humansUp
    const downSoFar = (now.botVotes?.overturn ?? 0) + RULES.humanVoteWeight * now.humansDown
    const inc: Record<string, number> = {}
    const add = (path: string) => (inc[path] = (inc[path] ?? 0) + 1)
    for (const vote of votes) {
      const choice = vote.choice ?? chaosChoice(upSoFar, downSoFar)
      add(`botVotes.${choice}`)
      add(`botVotes.byPersona.${vote.persona}.${choice}`)
    }
    try {
      await content
        .patch(referendumId)
        .setIfMissing({botVotes: emptyBotVotes()})
        .inc(inc)
        .set({'botVotes.waves': index + 1})
        // Fails if anything else changed the counters since the read; retried above instead of skipped.
        .ifRevisionId(now._rev)
        .commit()
      return 'applied'
    } catch (error) {
      if (attempt === 3) {
        console.warn('crowd wave skipped', referendumId, index, error)
        return 'gaveUp'
      }
      await backoff()
    }
  }
  return 'gaveUp'
}

// Keeps calling closeWindow until the round is actually done - closed, already closed, or no longer a voting
// stage - instead of giving up after one call. (The bug this fixes: the old code called closeWindow exactly
// once at the crowd's tail, so a round that needed a quorum extension never got closed once the crowd had
// finished its waves and exited - the run just hung.) Bounded so a stuck instance can't loop forever inside
// one request. Exported so a test can drive it directly (see runtime.test.ts).
export async function closeUntilDone(
  runtime: Runtime,
  referendumId: string,
  workflowInstanceId: string,
  maxAttempts = 6,
): Promise<CloseResult | undefined> {
  const {content} = runtime
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const round = await content.fetch<{closesAt: string} | null>('*[_id == $id][0]{closesAt}', {id: referendumId})
    if (!round) return undefined // wiped while the crowd was waiting
    const {closesAt} = round
    await sleepUntil(runtime, Date.parse(closesAt) + 500)
    let result: CloseResult
    try {
      result = await closeWindow(runtime, workflowInstanceId)
    } catch (error) {
      console.warn('crowd close failed', referendumId, attempt, error)
      continue
    }
    if (['closed', 'alreadyClosed', 'notVoting', 'waiting', 'noVotes'].includes(result.status)) {
      return result
    }
    // 'extended' or 'stillOpen': the window moved (or hadn't opened yet when we checked); loop and re-read closesAt.
  }
  return undefined
}

// A human voted, so there's nothing left to wait for (Experience v3: one judge alone at a desk). The rest of the
// seeded crowd votes at once, in the same waves it would have cast over the window, then the round closes.
// The crowd still running in the background finds the round closed and stops.
export async function finishEarly(runtime: Runtime, referendumId: string) {
  const {content} = runtime
  const ref = await content.fetch<CrowdReferendum & {result?: string; waves?: number}>(
    `*[_id == $id][0]{round, loop, windowOpensAt, closesAt, workflowInstanceId, result, "waves": coalesce(botVotes.waves, 0),
      "seed": incident->crowdSeed, "recommendationFavours": incident->recommendationFavours,
      "outcryLevel": incident->outcry.level}`,
    {id: referendumId},
  )
  if (!ref || ref.result) return
  const windowSeconds = (Date.parse(ref.closesAt) - Date.parse(ref.windowOpensAt)) / 1000
  const planned = waves(planCrowd({...ref, windowSeconds}))
  for (let index = ref.waves ?? 0; index < planned.length; index++) {
    if ((await applyWave(runtime, referendumId, index, planned[index].votes)) === 'closed') return
  }
  // Closing "after" the window: the tally still only counts votes cast before closesAt, which this one was.
  return closeWindow(runtime, ref.workflowInstanceId, Number.POSITIVE_INFINITY)
}

// Releases about 60 seeded bot votes in waves across the window, then closes the window. The next round doesn't
// open by itself: it waits for a press, and its own crowd starts from its open effect.
export async function runCrowd(runtime: Runtime, referendumId: string) {
  const {content} = runtime
  const ref = await content.fetch<CrowdReferendum | null>(
    `*[_id == $id][0]{round, loop, windowOpensAt, closesAt, workflowInstanceId,
      "seed": incident->crowdSeed, "recommendationFavours": incident->recommendationFavours,
      "outcryLevel": incident->outcry.level}`,
    {id: referendumId},
  )
  if (!ref) return // wiped before the crowd started
  const opensAt = Date.parse(ref.windowOpensAt)
  const windowSeconds = (Date.parse(ref.closesAt) - opensAt) / 1000
  const plan = planCrowd({...ref, windowSeconds})
  const planned = waves(plan)

  for (const [index, wave] of planned.entries()) {
    await sleepUntil(runtime, opensAt + wave.atMs)

    const state = await content
      .fetch<{result?: string; waves: number}>('*[_id == $id][0]{result, "waves": coalesce(botVotes.waves, 0)}', {id: referendumId})
      .catch(() => undefined)
    if (state?.result) return // closed already
    const alreadyApplied = state?.waves ?? 0
    if (alreadyApplied > index) continue // this wave was already applied - a restarted crowd catching up

    // A conflicting commit can leave an earlier wave still missing; recover it before applying this one, so
    // `botVotes.waves` never jumps ahead of what's actually been counted.
    for (let missing = alreadyApplied; missing < index; missing++) {
      const status = await applyWave(runtime, referendumId, missing, planned[missing].votes)
      if (status === 'closed') return
    }

    const status = await applyWave(runtime, referendumId, index, wave.votes)
    if (status === 'closed') return
  }

  await closeUntilDone(runtime, referendumId, ref.workflowInstanceId)
}
