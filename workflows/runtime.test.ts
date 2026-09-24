import type {SanityClient} from '@sanity/client'
import {createBench} from '@sanity/workflow-engine-test'
import {describe, expect, test, vi} from 'vitest'

import {planCrowd, waves} from './crowd'
import {peoplesVar, RULES} from './definitions/peoplesVar'
import {
  closeWindow,
  createRuntime,
  runCrowd,
  START_COOLDOWN_SECONDS,
  startNext,
  type Runtime,
} from './runtime'

// A bench's own client physically stores the "home" workflow resource (definitions, instances) wherever the
// client's own default (projectId, dataset) points — regardless of the `workflowResource` label passed to
// createBench. So definitions are deployed and instances are started through our OWN runtime's engine
// (built the same way production builds it), not through the bench's convenience wrappers. The bench itself
// supplies only the fake client and the controllable clock (`now`, `setNow`, `advance`).
const PROJECT = 't2sbu6uu'
const T0 = '2026-10-01T19:00:00.000Z'

type Doc = {_id: string; _type: string; [key: string]: unknown}

function incidentDoc(overrides: Record<string, unknown> = {}): Doc {
  return {
    _id: 'incident-1',
    _type: 'incident',
    title: 'Test incident',
    varRecommendation: 'noGoal',
    recommendationFavours: 'home',
    crowdSeed: 1,
    outcry: {level: 3},
    ...overrides,
  }
}

async function setup(documents: Doc[] = [incidentDoc()]) {
  const bench = createBench({
    now: T0,
    workflowResource: {type: 'dataset', id: `${PROJECT}.workflows`},
    serveResources: [{type: 'dataset', id: `${PROJECT}.production`}],
  })
  const tasks: Promise<void>[] = []
  const runtime = createRuntime({
    projectId: PROJECT,
    token: 'test',
    tag: bench.tag,
    // The base client must itself carry PROJECT, since content/workflows are built from it with `withConfig`
    // (dataset only) — matching the physical (projectId, dataset) pair our own resourceClients callback expects.
    client: (bench.client as unknown as SanityClient).withConfig({projectId: PROJECT}),
    now: () => Date.parse(bench.now()),
    background: (task) => void tasks.push(task()),
    // Tests drive votes directly; the one runCrowd test below builds its own runtime with the default background.
    startCrowd: () => {},
  })
  await runtime.engine.deployDefinitions({expectedMinReaderModel: 10, definitions: [peoplesVar]})
  for (const doc of documents) await runtime.content.createIfNotExists(doc)
  return {bench, runtime, tasks}
}

type ReferendumRow = {_id: string; closesAt: string; round: string; result?: string}

// Ordered by _createdAt (the fake store's own real-time doc metadata), not windowOpensAt: under a bench's
// frozen clock, two referendums opened moments apart in test time can share the exact same windowOpensAt.
async function latestReferendum(runtime: Runtime, instanceId: string): Promise<ReferendumRow> {
  return runtime.content.fetch(
    `*[_type == "referendum" && workflowInstanceId == $id] | order(_createdAt desc)[0]{_id, closesAt, round, result}`,
    {id: instanceId},
  )
}

async function stageOf(runtime: Runtime, instanceId: string) {
  return (await runtime.engine.getInstance({instanceId})).currentStage
}

async function setBotVotes(runtime: Runtime, referendumId: string, uphold: number, overturn: number) {
  await runtime.content.patch(referendumId).set({'botVotes.uphold': uphold, 'botVotes.overturn': overturn}).commit()
}

let voteCounter = 0
async function castHumanVote(runtime: Runtime, referendumId: string, choice: 'uphold' | 'overturn') {
  voteCounter += 1
  await runtime.content.create({
    _id: `vote-${voteCounter}`,
    _type: 'vote',
    referendum: {_type: 'reference', _ref: referendumId},
    choice,
    sessionId: `human-${voteCounter}`,
    simulated: false,
  })
}

// Starts the (single, by default) seeded incident's run and hands back the instance id plus helpers scoped to it.
async function start(documents?: Doc[]) {
  const {bench, runtime, tasks} = await setup(documents)
  const result = await startNext(runtime)
  if (result.status !== 'started') throw new Error(`setup: expected 'started', got '${result.status}'`)
  return {
    bench,
    runtime,
    tasks,
    instanceId: result.instanceId,
    incidentId: result.incidentId,
    referendum: () => latestReferendum(runtime, result.instanceId),
    stage: () => stageOf(runtime, result.instanceId),
  }
}

describe('runtime', () => {
  test('startNext on an empty board starts a run', async () => {
    const {runtime} = await setup()
    const result = await startNext(runtime)
    expect(result.status).toBe('started')
    const referendumCount = await runtime.content.fetch<number>('count(*[_type == "referendum"])')
    expect(referendumCount).toBe(1)
  })

  test('closeWindow before closesAt is stillOpen', async () => {
    const {runtime, instanceId} = await start()
    const result = await closeWindow(runtime, instanceId, Date.parse(T0))
    expect(result).toEqual({status: 'stillOpen', stage: 'referendum'})
  })

  test('over 55% upholds: closes, finalizes the incident', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 34, 26) // 34/60 = 56.7%
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result).toMatchObject({status: 'closed', upholdPct: 56.7, votes: 60})
    expect((await referendum()).result).toBe('upheld')
    expect(await stage()).toBe('upheld')
    const incident = await runtime.content.fetch<{finalCall?: string}>('*[_id == "incident-1"][0]{finalCall}')
    expect(incident.finalCall).toBe('noGoal')
  })

  test('under 45% overturns: back to the VAR room', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 26, 34) // 26/60 = 43.3%
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result.status).toBe('closed')
    expect((await referendum()).result).toBe('overturned')
    expect(await stage()).toBe('varRoom')
  })

  test('exactly 50% is too close: extra time opens a second referendum', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const first = await referendum()
    await setBotVotes(runtime, first._id, 30, 30)
    const result = await closeWindow(runtime, instanceId, Date.parse(first.closesAt))
    expect(result.status).toBe('closed')
    expect(await stage()).toBe('extraTime')
    const second = await referendum()
    expect(second._id).not.toBe(first._id)
    expect(second.round).toBe('extraTime')
  })

  test('under quorum extends the window once, then the window must close', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 6, 4) // 10 heads, under RULES.quorum (20)
    const extended = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(extended.status).toBe('extended')
    const afterExtension = await referendum()
    expect(Date.parse(afterExtension.closesAt)).toBe(Date.parse(ref.closesAt) + RULES.quorumExtensionSeconds * 1000)
    const closed = await closeWindow(runtime, instanceId, Date.parse(afterExtension.closesAt))
    expect(closed.status).toBe('closed')
  })

  test('a human vote counts as RULES.humanVoteWeight bot votes', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30)
    await castHumanVote(runtime, ref._id, 'uphold') // +20 weighted uphold: 50/80 = 62.5%
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result).toMatchObject({status: 'closed', upholdPct: 62.5, votes: 61})
    expect((await referendum()).result).toBe('upheld')
  })

  test('closing an already-closed window is a no-op', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    const second = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt) + 5_000)
    // The stage has already moved on to 'upheld' (terminal), so the second call sees a non-voting stage.
    expect(['alreadyClosed', 'notVoting']).toContain(second.status)
  })

  test('shootout: rounds accumulate a score, 3 wins upholds', async () => {
    const {runtime, instanceId, referendum, stage} = await start()

    let ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30) // regular: too close
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('extraTime')

    ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30) // extra time: too close
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('shootout')

    const roundOutcomes = [true, false, true, true] // win, lose, win, win: 3 wins reached on the 4th round
    for (const won of roundOutcomes) {
      ref = await referendum()
      const votes = won ? {uphold: 31, overturn: 30} : {uphold: 29, overturn: 31}
      await setBotVotes(runtime, ref._id, votes.uphold, votes.overturn)
      await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    }
    expect(await stage()).toBe('upheld')
  })

  test('startNext while a round is open is busy', async () => {
    const {runtime, instanceId} = await start()
    const result = await startNext(runtime)
    expect(result).toEqual({status: 'busy', instanceId, stage: 'referendum'})
  })

  test('startNext right after a run completes is cooling down, then starts once the cooldown passes', async () => {
    const {bench, runtime, instanceId, referendum} = await start([incidentDoc(), incidentDoc({_id: 'incident-2', title: 'Test 2'})])
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))

    const coolingDown = await startNext(runtime)
    expect(coolingDown).toEqual({status: 'coolingDown', retryInSeconds: expect.any(Number)})

    bench.advance((START_COOLDOWN_SECONDS + 1) * 1000)
    const after = await startNext(runtime)
    expect(after.status).toBe('started')
  })

  test('startNext after an overturn recommends the same parked instance', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 10, 50) // overturn
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('varRoom')

    const result = await startNext(runtime)
    expect(result).toEqual({status: 'recommended', instanceId, incidentId: 'incident-1'})
  })

  test('starting when every incident has a final call throws', async () => {
    const {bench, runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt)) // upheld -> writes finalCall
    // Clear the start cooldown first, so it's the incident-exhausted check under test, not the cooldown.
    bench.advance((START_COOLDOWN_SECONDS + 1) * 1000)
    await expect(startNext(runtime)).rejects.toThrow('Every incident has a final call')
  })

  test('runCrowd releases every planned vote across the window', async () => {
    const {runtime, referendum} = await start()
    const ref = await referendum()

    // What crowd.ts itself would plan for this referendum, independent of runCrowd — used below to check
    // runCrowd released everything it planned, without hardcoding a wave count.
    const plan = waves(
      planCrowd({round: ref.round, loop: 1, windowSeconds: 30, recommendationFavours: 'home', outcryLevel: 3, seed: 1}),
    )

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(ref.closesAt).getTime() - 30_000) // = windowOpensAt
      const promise = runCrowd(runtime, ref._id)
      await vi.advanceTimersByTimeAsync(35_000)
      await promise
    } finally {
      vi.useRealTimers()
    }

    const after = await runtime.content.fetch<{botVotes: {uphold: number; overturn: number; waves: number}}>(
      '*[_id == $id][0]{botVotes}',
      {id: ref._id},
    )
    expect(after.botVotes.uphold + after.botVotes.overturn).toBe(60)
    expect(after.botVotes.waves).toBe(plan.length)
  })
})
