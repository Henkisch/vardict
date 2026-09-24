// The People's VAR runtime: engine setup, effect handlers, and closing a vote window.
// Server-only (uses the write token). Used by scripts/ and by /web's /api/start and /api/tick.
import {createClient, type SanityClient} from '@sanity/client'
import {createEngine, type EffectHandler, type Engine} from '@sanity/workflow-engine'

import {chaosChoice, planCrowd, waves} from './crowd'
import {EFFECTS, RULES} from './definitions/peoplesVar'

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
}

// Effect params carry documents as global references: dataset:<project>:<dataset>:<id>.
const docId = (gdr: unknown) => String(gdr).split(':').at(-1)!

const stageField = (field: string, value: unknown) => ({
  type: 'field.set' as const,
  target: {scope: 'stage' as const, field},
  value: {type: 'literal' as const, value},
})

function handlers(content: SanityClient, now: () => number, onOpened: (referendumId: string) => void) {
  // Creates the referendum document the phones vote on. Idempotent on the effect key (at-least-once delivery).
  const open: EffectHandler = async (params, ctx) => {
    const opensAt = now()
    const referendumId = `referendum-${ctx.effectKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const closesAt = new Date(opensAt + Number(params.windowSeconds) * 1000).toISOString()
    const doc = await content.createIfNotExists({
      _id: referendumId,
      _type: 'referendum',
      // Lets /live and /api/tick find the run from the referendum alone.
      workflowInstanceId: ctx.instanceId,
      incident: {_type: 'reference', _ref: docId(params.incidentId)},
      round: params.round,
      loop: Number(params.loop),
      threshold: RULES.upheldAbove / 100,
      windowOpensAt: new Date(opensAt).toISOString(),
      closesAt,
      botVotes: emptyBotVotes(),
    })
    onOpened(doc._id)
    return {ops: [stageField('referendumId', doc._id), stageField('closesAt', doc.closesAt)]}
  }

  // At-least-once delivery can call this twice for the same window; `extended` makes the second call a no-op
  // instead of pushing closesAt out again.
  const extend: EffectHandler = async (params) => {
    const id = String(params.referendumId)
    const {_rev, closesAt, extended} = await content.fetch<{_rev: string; closesAt: string; extended?: boolean}>(
      '*[_id == $id][0]{_rev, closesAt, extended}',
      {id},
    )
    if (extended === true) return {ops: [stageField('closesAt', closesAt)]}
    const next = new Date(Date.parse(closesAt) + Number(params.seconds) * 1000).toISOString()
    await content.patch(id).set({closesAt: next, extended: true}).ifRevisionId(_rev).commit()
    return {ops: [stageField('closesAt', next)]}
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

  const byKind = {open, extend, finalize}
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
  const runtime: Runtime = {engine, content, workflows, projectId, contentDataset, tag, background, now}
  return runtime
}

// Start a run for an incident and send it straight to the people.
export async function sendToThePeople({engine, projectId, contentDataset}: Runtime, incidentId: string) {
  const {instance} = await engine.startInstance({
    definition: DEFINITION,
    initialFields: [
      {type: 'subject', name: 'subject', value: {id: `dataset:${projectId}:${contentDataset}:${incidentId}`, type: 'incident'}},
    ],
  })
  await engine.fireAction({instanceId: instance._id, activity: 'review', action: 'recommend'})
  await engine.drainEffects({instanceId: instance._id})
  return instance._id
}

// The current stage visit's fields, as the engine stores them.
function currentStageFields(instance: Awaited<ReturnType<Engine['getInstance']>>) {
  const visit = instance.stages.at(-1) as {fields?: {name: string; value?: unknown}[]} | undefined
  return Object.fromEntries((visit?.fields ?? []).map((f) => [f.name, f.value]))
}

export type CloseResult =
  | {status: 'notVoting' | 'stillOpen' | 'alreadyClosed'; stage: string}
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
// in only what's missing, so a healthy referendum that already has its result is never re-written.
async function syncResults(content: SanityClient, instance: Awaited<ReturnType<Engine['getInstance']>>) {
  for (const visit of instance.stages as unknown as {name: string; fields?: {name: string; value?: unknown}[]}[]) {
    const fields = Object.fromEntries((visit.fields ?? []).map((f) => [f.name, f.value]))
    if (fields.referendumId == null || fields.upholdPct == null) continue
    const result = resultFor(visit.name, Number(fields.upholdPct))
    await content.patch(String(fields.referendumId)).setIfMissing({result}).commit()
  }
}

// Called by /api/tick when a countdown hits zero. Safe to call twice or too early.
export async function closeWindow(
  {engine, content, now: runtimeNow}: Runtime,
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
  if (!fields.referendumId) return {status: 'stillOpen', stage} // ballot not open yet
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
  // Opens the next round's referendum, or writes the final call.
  await engine.drainEffects({instanceId})
  return {status: 'closed', stage, upholdPct, votes: tally.bots + tally.humans}
}

export const PERSONAS = ['homeFan', 'awayFan', 'neutral', 'pundit', 'chaos'] as const

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
  | {status: 'started' | 'recommended'; instanceId: string; incidentId: string}
  | {status: 'busy'; instanceId: string; stage: string}
  | {status: 'coolingDown'; retryInSeconds: number}
  | {status: 'dailyLimit'; limit: number}

// The "Send to the people" button: one live vote at a time. A run parked in the VAR room (after an overturn)
// is sent back to the people; otherwise the next incident in line starts a fresh run.
export async function startNext(runtime: Runtime, pick?: string): Promise<StartResult> {
  const {engine, content, workflows, tag} = runtime
  const [live] = await liveInstances(runtime)
  if (live && live.currentStage !== 'varRoom') return {status: 'busy', instanceId: live._id, stage: live.currentStage}
  // The operator picked a different incident: the parked run gives way (aborted runs keep their rounds).
  const replacing = Boolean(live && pick && docId(live.subjectId) !== pick)
  if (replacing) {
    await engine.abortInstance({instanceId: live._id})
  } else if (live) {
    await engine.fireAction({instanceId: live._id, activity: 'review', action: 'recommend'})
    await engine.drainEffects({instanceId: live._id})
    return {status: 'recommended', instanceId: live._id, incidentId: docId(live.subjectId)}
  }

  const last = await workflows.fetch<{completedAt: string} | null>(
    `*[_type == "sanity.workflow.instance" && tag == $wfTag && defined(completedAt)] | order(completedAt desc)[0]{completedAt}`,
    {wfTag: tag},
  )
  const since = last ? (runtime.now() - Date.parse(last.completedAt)) / 1000 : Infinity
  if (!replacing && since < START_COOLDOWN_SECONDS) return {status: 'coolingDown', retryInSeconds: Math.ceil(START_COOLDOWN_SECONDS - since)}

  // Counted from stored runs, so it holds across serverless instances (an in-memory limiter wouldn't).
  const startedToday = await workflows.fetch<number>(
    `count(*[_type == "sanity.workflow.instance" && tag == $wfTag && dateTime(startedAt) > dateTime(now()) - 60*60*24])`,
    {wfTag: tag},
  )
  if (startedToday >= RULES.maxRunsPerDay) return {status: 'dailyLimit', limit: RULES.maxRunsPerDay}

  // Next in line: the incident whose last referendum is oldest (never-voted first). Upheld incidents are done.
  const incidentId =
    pick ??
    (await content.fetch<string | null>(
      `*[_type == "incident" && !defined(finalCall) && !(_id in path("drafts.**"))]{
        _id, "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt
      } | order(coalesce(last, "0") asc)[0]._id`,
    ))
  if (!incidentId) throw new Error('Every incident has a final call. Reset them to run again.')
  const instanceId = await sendToThePeople(runtime, incidentId)
  return {status: 'started', instanceId, incidentId}
}

const sleepUntil = (at: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, at - Date.now())))

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

// Releases about 60 seeded bot votes in waves across the window, then closes the window. Closing it can open the
// next round, whose own crowd starts from the open effect, so a whole run plays out without a browser.
export async function runCrowd(runtime: Runtime, referendumId: string) {
  const {content} = runtime
  const ref = await content.fetch<CrowdReferendum>(
    `*[_id == $id][0]{round, loop, windowOpensAt, closesAt, workflowInstanceId,
      "seed": incident->crowdSeed, "recommendationFavours": incident->recommendationFavours,
      "outcryLevel": incident->outcry.level}`,
    {id: referendumId},
  )
  const opensAt = Date.parse(ref.windowOpensAt)
  const windowSeconds = (Date.parse(ref.closesAt) - opensAt) / 1000
  const plan = planCrowd({...ref, windowSeconds})
  const planned = waves(plan)
  for (const [index, wave] of planned.entries()) {
    await sleepUntil(opensAt + wave.atMs)
    const now = await content.fetch<{_rev: string; result?: string; botVotes?: BotVotes; humansUp: number; humansDown: number}>(
      `*[_id == $id][0]{_rev, result, botVotes,
        "humansUp": count(*[_type == "vote" && referendum._ref == $id && choice == "uphold"]),
        "humansDown": count(*[_type == "vote" && referendum._ref == $id && choice == "overturn"])}`,
      {id: referendumId},
    )
    if (now.result) return // closed already
    // Waves are numbered, so a restarted crowd (at-least-once effects) skips what's been counted.
    if ((now.botVotes?.waves ?? 0) > index) continue
    const upSoFar = (now.botVotes?.uphold ?? 0) + RULES.humanVoteWeight * now.humansUp
    const downSoFar = (now.botVotes?.overturn ?? 0) + RULES.humanVoteWeight * now.humansDown
    const inc: Record<string, number> = {}
    const add = (path: string) => (inc[path] = (inc[path] ?? 0) + 1)
    for (const vote of wave.votes) {
      const choice = vote.choice ?? chaosChoice(upSoFar, downSoFar)
      add(`botVotes.${choice}`)
      add(`botVotes.byPersona.${vote.persona}.${choice}`)
    }
    await content
      .patch(referendumId)
      .setIfMissing({botVotes: emptyBotVotes()})
      .inc(inc)
      .set({'botVotes.waves': index + 1})
      // Fails if anything else changed the counters since the read; the next wave re-reads.
      .ifRevisionId(now._rev)
      .commit()
      .catch((error: unknown) => console.warn('crowd wave skipped', referendumId, index, error))
  }
  // The window may have been extended; wait for the real close, then close it.
  const {closesAt} = await content.fetch<{closesAt: string}>('*[_id == $id][0]{closesAt}', {id: referendumId})
  await sleepUntil(Date.parse(closesAt) + 500)
  await closeWindow(runtime, ref.workflowInstanceId)
}
