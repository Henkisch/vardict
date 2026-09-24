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
}

export type Runtime = {
  engine: Engine
  content: SanityClient
  workflows: SanityClient
  projectId: string
  contentDataset: string
  tag: string
  background: (task: () => Promise<void>) => void
}

// Effect params carry documents as global references: dataset:<project>:<dataset>:<id>.
const docId = (gdr: unknown) => String(gdr).split(':').at(-1)!

const stageField = (field: string, value: unknown) => ({
  type: 'field.set' as const,
  target: {scope: 'stage' as const, field},
  value: {type: 'literal' as const, value},
})

function handlers(content: SanityClient, onOpened: (referendumId: string) => void) {
  // Creates the referendum document the phones vote on. Idempotent on the effect key (at-least-once delivery).
  const open: EffectHandler = async (params, ctx) => {
    const now = Date.now()
    const referendumId = `referendum-${ctx.effectKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const closesAt = new Date(now + Number(params.windowSeconds) * 1000).toISOString()
    const doc = await content.createIfNotExists({
      _id: referendumId,
      _type: 'referendum',
      // Lets /live and /api/tick find the run from the referendum alone.
      workflowInstanceId: ctx.instanceId,
      incident: {_type: 'reference', _ref: docId(params.incidentId)},
      round: params.round,
      loop: Number(params.loop),
      threshold: RULES.upheldAbove / 100,
      windowOpensAt: new Date(now).toISOString(),
      closesAt,
    })
    onOpened(doc._id)
    return {ops: [stageField('referendumId', doc._id), stageField('closesAt', doc.closesAt)]}
  }

  const extend: EffectHandler = async (params) => {
    const id = String(params.referendumId)
    const {closesAt} = await content.fetch<{closesAt: string}>('*[_id == $id][0]{closesAt}', {id})
    const next = new Date(Date.parse(closesAt) + Number(params.seconds) * 1000).toISOString()
    await content.patch(id).set({closesAt: next}).commit()
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
}: RuntimeConfig): Runtime {
  const base = createClient({projectId, token, apiVersion: '2025-02-19', useCdn: false})
  const content = base.withConfig({dataset: contentDataset})
  const workflows = base.withConfig({dataset: workflowsDataset})
  const engine = createEngine({
    client: workflows,
    tag,
    workflowResource: {type: 'dataset', id: `${projectId}.${workflowsDataset}`},
    // The subject (incident) lives in the content dataset; the engine only accepts refs it can resolve.
    resourceClients: (gdr) =>
      gdr.scheme === 'dataset' && gdr.projectId === projectId && gdr.dataset === contentDataset ? content : undefined,
    // The crowd needs the finished runtime, which doesn't exist yet while the engine is being built.
    effects: {handlers: handlers(content, (referendumId) => background(() => runCrowd(runtime, referendumId)))},
  })
  const runtime: Runtime = {engine, content, workflows, projectId, contentDataset, tag, background}
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

// Called by /api/tick when a countdown hits zero. Safe to call twice or too early.
export async function closeWindow({engine, content}: Runtime, instanceId: string, now = Date.now()): Promise<CloseResult> {
  const instance = await engine.getInstance({instanceId})
  const stage = instance.currentStage
  if (!['referendum', 'extraTime', 'shootout'].includes(stage)) return {status: 'notVoting', stage}

  const fields = currentStageFields(instance)
  if (fields.upholdPct != null) return {status: 'alreadyClosed', stage}
  if (!fields.referendumId || !fields.closesAt) return {status: 'stillOpen', stage} // ballot not open yet
  if (now < Date.parse(String(fields.closesAt))) return {status: 'stillOpen', stage}

  const referendumId = String(fields.referendumId)
  const tally = await content.fetch<{uphold: number; total: number}>(
    `{"uphold": count(*[_type == "vote" && referendum._ref == $id && choice == "uphold"]),
      "total": count(*[_type == "vote" && referendum._ref == $id])}`,
    {id: referendumId},
  )
  const upholdPct = tally.total ? Math.round((tally.uphold / tally.total) * 1000) / 10 : 50

  if (tally.total < RULES.quorum && !fields.extended) {
    await engine.fireAction({instanceId, activity: 'count', action: 'extend'})
    await engine.drainEffects({instanceId})
    return {status: 'extended', stage, upholdPct, votes: tally.total}
  }

  const action = stage === 'shootout' ? (upholdPct > 50 ? 'roundWon' : 'roundLost') : 'closeVote'
  const result =
    stage === 'shootout'
      ? upholdPct > 50 ? 'upheld' : 'overturned'
      : upholdPct > RULES.upheldAbove ? 'upheld' : upholdPct < RULES.overturnedBelow ? 'overturned' : 'tooClose'
  await content.patch(referendumId).set({result}).commit()
  await engine.fireAction({
    instanceId,
    activity: 'count',
    action,
    params: {upholdPct, votes: tally.total},
    // Two callers can close the same window; the engine replays instead of double-counting.
    idempotencyKey: `close-${referendumId}`,
  })
  // Opens the next round's referendum, or writes the final call.
  await engine.drainEffects({instanceId})
  return {status: 'closed', stage, upholdPct, votes: tally.total}
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

// The "Send to the people" button: one live vote at a time. A run parked in the VAR room (after an overturn)
// is sent back to the people; otherwise the next incident in line starts a fresh run.
export async function startNext(runtime: Runtime, pick?: string): Promise<StartResult> {
  const {engine, content, workflows, tag} = runtime
  const [live] = await liveInstances(runtime)
  if (live && live.currentStage !== 'varRoom') return {status: 'busy', instanceId: live._id, stage: live.currentStage}
  if (live) {
    await engine.fireAction({instanceId: live._id, activity: 'review', action: 'recommend'})
    await engine.drainEffects({instanceId: live._id})
    return {status: 'recommended', instanceId: live._id, incidentId: docId(live.subjectId)}
  }

  const last = await workflows.fetch<{completedAt: string} | null>(
    `*[_type == "sanity.workflow.instance" && tag == $wfTag && defined(completedAt)] | order(completedAt desc)[0]{completedAt}`,
    {wfTag: tag},
  )
  const since = last ? (Date.now() - Date.parse(last.completedAt)) / 1000 : Infinity
  if (since < START_COOLDOWN_SECONDS) return {status: 'coolingDown', retryInSeconds: Math.ceil(START_COOLDOWN_SECONDS - since)}

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
  let index = 0
  for (const wave of waves(plan)) {
    await sleepUntil(opensAt + wave.atMs)
    const tally = wave.votes.some((v) => v.choice === null)
      ? await content.fetch<{uphold: number; overturn: number}>(
          `{"uphold": count(*[_type == "vote" && referendum._ref == $id && choice == "uphold"]),
            "overturn": count(*[_type == "vote" && referendum._ref == $id && choice == "overturn"])}`,
          {id: referendumId},
        )
      : undefined
    const tx = content.transaction()
    for (const vote of wave.votes) {
      tx.createIfNotExists({
        // Deterministic ids: a crowd that runs twice (at-least-once effects) can't double-vote.
        _id: `vote-bot-${referendumId}-${index++}`,
        _type: 'vote',
        referendum: {_type: 'reference', _ref: referendumId},
        choice: vote.choice ?? chaosChoice(tally!.uphold, tally!.overturn),
        sessionId: `bot-${vote.persona}`,
        simulated: true,
        persona: vote.persona,
        castAt: new Date().toISOString(),
      })
    }
    await tx.commit()
  }
  // The window may have been extended; wait for the real close, then close it.
  const {closesAt} = await content.fetch<{closesAt: string}>('*[_id == $id][0]{closesAt}', {id: referendumId})
  await sleepUntil(Date.parse(closesAt) + 500)
  await closeWindow(runtime, ref.workflowInstanceId)
}
