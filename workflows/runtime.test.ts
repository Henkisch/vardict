import type {SanityClient} from '@sanity/client'
import {createBench} from '@sanity/workflow-engine-test'
import {describe, expect, test, vi} from 'vitest'

import {planCrowd, waves} from './crowd'
import {peoplesVar, RULES} from './definitions/peoplesVar'
import {
  closeUntilDone,
  closeWindow,
  createRuntime,
  finishEarly,
  DEFINITION,
  openReferendum,
  runCrowd,
  START_COOLDOWN_SECONDS,
  startNext,
  type Runtime,
  wipeRunData,
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
    originalCall: 'goal',
    recommendationFavours: 'home',
    crowdSeed: 1,
    outcry: {level: 3},
    ...overrides,
  }
}

type SetupOptions = {
  // runCrowd/closeUntilDone wait via `runtime.sleep`, whose default is a real timer - but T0 sits days in
  // the future relative to the real wall clock, so a test that needs those waits to actually finish (not
  // hang on a real multi-day setTimeout) opts into this: `sleep` resolves at once and instead advances the
  // bench's own clock by the requested amount, so `runtime.now()` (what closeWindow checks closesAt against)
  // moves exactly as far as production's real timer would have made it wait.
  instantSleep?: boolean
  requireHumanVote?: boolean
}

async function setup(documents: Doc[] = [incidentDoc()], options: SetupOptions = {}) {
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
    // Most tests drive rounds with bot counters only; the no-human-vote rule has its own tests below.
    requireHumanVote: options.requireHumanVote ?? false,
    ...(options.instantSleep
      ? {
          sleep: (ms: number) => {
            bench.advance(ms)
            return Promise.resolve()
          },
        }
      : {}),
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
// castAt defaults to "now" on the bench's clock, which in every existing test is still well before the
// referendum's closesAt (the bench clock only moves when a test calls bench.advance()). Step 4's own test
// passes an explicit castAt after closesAt to exercise the late-vote filter.
async function castHumanVote(runtime: Runtime, referendumId: string, choice: 'uphold' | 'overturn', castAt?: string) {
  voteCounter += 1
  await runtime.content.create({
    _id: `vote-${voteCounter}`,
    _type: 'vote',
    referendum: {_type: 'reference', _ref: referendumId},
    choice,
    sessionId: `human-${voteCounter}`,
    simulated: false,
    castAt: castAt ?? new Date(runtime.now()).toISOString(),
  })
}

// Wraps the content client so the NEXT `.commit()` on a patch of `documentId` rejects once, as if it lost an
// `ifRevisionId` race (e.g. to the bot crowd incrementing botVotes on the same document) - then behaves
// normally again. Returns the spy so a test can restore it.
function makeNextPatchCommitFailOnce(client: SanityClient, documentId: string) {
  const originalPatch = client.patch.bind(client)
  let armed = true
  return vi.spyOn(client, 'patch').mockImplementation((selector: unknown, ...rest: unknown[]) => {
    const builder = (originalPatch as (...args: unknown[]) => any)(selector, ...rest)
    if (armed && selector === documentId) {
      armed = false
      // The fake client's chain methods (set/ifRevisionId/...) return the same closed-over builder object,
      // not `this` - so wrapping only has any effect if every chain call keeps returning the proxy too,
      // otherwise the chain escapes the wrapper after the first `.set()`/`.ifRevisionId()` call.
      const wrapped: any = new Proxy(builder, {
        get(target, prop, receiver) {
          if (prop === 'commit') return () => Promise.reject(new Error('simulated ifRevisionId conflict'))
          const value = Reflect.get(target, prop, receiver)
          if (typeof value !== 'function') return value
          return (...args: unknown[]) => {
            const result = value.apply(target, args)
            return result === target ? receiver : result
          }
        },
      })
      return wrapped
    }
    return builder
  })
}

// Starts the (single, by default) seeded incident's run and hands back the instance id plus helpers scoped to it.
async function start(documents?: Doc[], options?: SetupOptions) {
  const {bench, runtime, tasks} = await setup(documents, options)
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

  test('under 45% overturns: the fans\' call is final, the on-field call stands (v4)', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 26, 34) // 26/60 = 43.3%
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result.status).toBe('closed')
    expect((await referendum()).result).toBe('overturned')
    expect(await stage()).toBe('overturned')
    const incident = await runtime.content.fetch<{finalCall?: string}>('*[_id == "incident-1"][0]{finalCall}')
    expect(incident.finalCall).toBe('goal')
  })

  test('overturning writes overturnedCall when the VAR backed the referee (Pickford: red card)', async () => {
    const {runtime, instanceId, referendum} = await start([
      incidentDoc({originalCall: 'noPenalty', varRecommendation: 'noFoul', overturnedCall: 'redCard'}),
    ])
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 20, 40)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    const incident = await runtime.content.fetch<{finalCall?: string}>('*[_id == "incident-1"][0]{finalCall}')
    expect(incident.finalCall).toBe('redCard')
  })

  test('no human vote: no decision, back to the VAR room', async () => {
    const {runtime, instanceId, referendum, stage} = await start(undefined, {requireHumanVote: true})
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 50, 10) // the bots would uphold, but they can't decide alone
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result).toMatchObject({status: 'noVotes', votes: 60})
    expect((await referendum()).result).toBe('noVotes')
    expect(await stage()).toBe('varRoom')
  })

  test('one human vote is enough for the crowd to decide', async () => {
    const {runtime, instanceId, referendum, stage} = await start(undefined, {requireHumanVote: true})
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 50, 10)
    await castHumanVote(runtime, ref._id, 'uphold')
    expect(await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))).toMatchObject({status: 'closed'})
    expect(await stage()).toBe('upheld')
  })

  test('exactly 50% is too close: extra time waits for its press, then opens a second referendum', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const first = await referendum()
    await setBotVotes(runtime, first._id, 30, 30)
    const result = await closeWindow(runtime, instanceId, Date.parse(first.closesAt))
    expect(result.status).toBe('closed')
    expect(await stage()).toBe('extraTime')
    // Experience v3: nothing opens by itself. The run waits on the verdict screen until someone presses.
    expect((await referendum())._id).toBe(first._id)
    expect(await closeWindow(runtime, instanceId, Date.parse(first.closesAt) + 60_000)).toEqual({status: 'waiting', stage: 'extraTime'})
    expect(await startNext(runtime)).toEqual({status: 'kickedOff', instanceId, incidentId: 'incident-1', stage: 'extraTime'})
    const second = await referendum()
    expect(second._id).not.toBe(first._id)
    expect(second.round).toBe('extraTime')
  })

  test('a double press on Go to extra time opens one ballot, not two', async () => {
    const {runtime, instanceId, referendum} = await start()
    const first = await referendum()
    await setBotVotes(runtime, first._id, 30, 30)
    await closeWindow(runtime, instanceId, Date.parse(first.closesAt))
    expect(await startNext(runtime)).toMatchObject({status: 'kickedOff'})
    expect(await startNext(runtime)).toEqual({status: 'busy', instanceId, stage: 'extraTime'})
    expect(await runtime.content.fetch<number>('count(*[_type == "referendum"])')).toBe(2)
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
    await castHumanVote(runtime, ref._id, 'uphold') // one human = RULES.humanVoteWeight weighted uphold votes
    const w = RULES.humanVoteWeight
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result).toMatchObject({status: 'closed', votes: 61})
    if (result.status !== 'closed') throw new Error('unreachable')
    expect(result.upholdPct).toBeCloseTo((100 * (30 + w)) / (60 + w), 1)
    // At 30/30 bots, one uphold vote tips it over 55% as long as it counts at least 7 bots.
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
    // changed by plan 003: result is written from the engine's own record after the action, not before, but
    // a second call still finds it there (either healed by syncResults or simply already correct).
    expect((await referendum()).result).toBe('upheld')
  })

  test('shootout: sudden death, one scored penalty upholds', async () => {
    const {runtime, instanceId, referendum, stage} = await start()

    let ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30) // regular: too close
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('extraTime')
    await startNext(runtime) // Go to extra time

    ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30) // extra time: too close
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('shootout')

    expect(await startNext(runtime)).toMatchObject({status: 'kickedOff', stage: 'shootout'}) // Penalties!
    ref = await referendum()
    await setBotVotes(runtime, ref._id, 31, 30) // just over 50%: scored
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('upheld')
  })

  test('a human vote finishes the round early: the rest of the crowd votes at once, then it closes', async () => {
    const {runtime, referendum, stage} = await start()
    const ref = await referendum()
    await castHumanVote(runtime, ref._id, 'overturn')
    // Well before closesAt: the bench clock hasn't moved.
    const result = await finishEarly(runtime, ref._id)
    expect(result).toMatchObject({status: 'closed'})

    const after = await runtime.content.fetch<{result?: string; bots: number; waves: number}>(
      '*[_id == $id][0]{result, "bots": botVotes.uphold + botVotes.overturn, "waves": botVotes.waves}',
      {id: ref._id},
    )
    const planned = waves(planCrowd({round: 'regular', loop: 1, windowSeconds: 20, recommendationFavours: 'home', outcryLevel: 3, seed: 1}))
    expect(after.waves).toBe(planned.length)
    expect(after.bots).toBe(planned.reduce((n, w) => n + w.votes.length, 0))
    expect(after.result).toBeDefined()
    expect(await stage()).not.toBe('referendum')
  })

  test('finishEarly on a round that already has a result does nothing', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await finishEarly(runtime, ref._id)).toBeUndefined()
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

  test('startNext after a round nobody voted in recommends the same parked instance', async () => {
    const {runtime, instanceId, referendum, stage} = await start(undefined, {requireHumanVote: true})
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 10, 50) // no human vote -> parked in the VAR room
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('varRoom')

    const result = await startNext(runtime)
    expect(result).toEqual({status: 'recommended', instanceId, incidentId: 'incident-1'})
  })

  test('an unknown pick changes nothing (plan 005)', async () => {
    const {runtime, instanceId, referendum, stage} = await start(undefined, {requireHumanVote: true})
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 10, 50) // no human vote -> parked in the VAR room
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('varRoom')

    const result = await startNext(runtime, 'nope')
    expect(result).toEqual({status: 'unknownIncident'})
    // Nothing was aborted: the parked instance is exactly where it was.
    expect(await stage()).toBe('varRoom')
  })

  test('a pick at the daily cap does not abort the parked run (plan 005)', async () => {
    const {runtime, instanceId, referendum, stage} = await start(
      [incidentDoc(), incidentDoc({_id: 'incident-2', title: 'Test 2'})],
      {requireHumanVote: true},
    )
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 10, 50) // no human vote -> parked in the VAR room
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(await stage()).toBe('varRoom')

    // Seed enough instance documents to hit the daily cap. The daily-cap query only reads
    // (_type, tag, startedAt), so a direct write to the workflows dataset is enough - no need for the
    // real engine to have started these runs. completedAt is set well outside the cooldown window, both so
    // these seeds don't show up as `live` (liveInstances filters on !defined(completedAt), which would let
    // one of them outrank the real parked instance) and so they don't trip the cooldown check themselves.
    const wellPastCooldown = new Date(runtime.now() - (START_COOLDOWN_SECONDS + 3600) * 1000).toISOString()
    for (let i = 0; i < RULES.maxRunsPerDay; i++) {
      await runtime.workflows.create({
        _id: `seed-cap-${i}`,
        _type: 'sanity.workflow.instance',
        tag: runtime.tag,
        startedAt: new Date(runtime.now()).toISOString(),
        completedAt: wellPastCooldown,
        currentStage: 'upheld',
      })
    }

    // A different, real incident: this would otherwise abort the parked run and replace it.
    const result = await startNext(runtime, 'incident-2')
    expect(result).toEqual({status: 'dailyLimit', limit: RULES.maxRunsPerDay})
    // The parked run was never touched - the cap was checked before any abort.
    expect(await stage()).toBe('varRoom')
  })

  test('two simultaneous starts create one run (plan 005)', async () => {
    const {runtime} = await setup()
    const [a, b] = await Promise.all([startNext(runtime), startNext(runtime)])
    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual(['busy', 'started'])
    const liveCount = await runtime.workflows.fetch<number>(
      'count(*[_type == "sanity.workflow.instance" && tag == $wfTag && !defined(completedAt)])',
      {wfTag: runtime.tag},
    )
    expect(liveCount).toBe(1)
  })

  test('a failed recommend is recovered by the next press (plan 005)', async () => {
    const {runtime} = await setup()
    const originalFireAction = runtime.engine.fireAction.bind(runtime.engine)
    let calls = 0
    const fireActionSpy = vi.spyOn(runtime.engine, 'fireAction').mockImplementation(async (args: Parameters<typeof originalFireAction>[0]) => {
      calls += 1
      if (calls === 1) throw new Error('simulated recommend failure')
      return originalFireAction(args)
    })

    const first = await startNext(runtime)
    expect(first).toEqual({status: 'busy', stage: 'starting'})

    const second = await startNext(runtime)
    expect(second).toMatchObject({status: 'recommended', incidentId: 'incident-1'})

    fireActionSpy.mockRestore()
  })

  test('starting when every incident has a final call starts a new season instead of throwing', async () => {
    const {bench, runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt)) // upheld -> writes finalCall
    // Clear the start cooldown first, so it's the incident-exhausted check under test, not the cooldown.
    bench.advance((START_COOLDOWN_SECONDS + 1) * 1000)

    const referendumsBefore = await runtime.content.fetch<string[]>('*[_type == "referendum"]._id')

    const result = await startNext(runtime)
    expect(result).toMatchObject({status: 'started', newSeason: true, incidentId: 'incident-1'})
    expect(result.status).toBe('started')
    if (result.status !== 'started') throw new Error('unreachable')
    expect(result.instanceId).not.toBe(instanceId) // a fresh run, not the finished one

    // The new run isn't decided yet, so no incident has a finalCall - including the one that was just reset.
    const undecided = await runtime.content.fetch<number>('count(*[_type == "incident" && defined(finalCall)])')
    expect(undecided).toBe(0)

    // Round history survives: the upheld run's own referendum is still there, plus the new run's opening one.
    const referendumsAfter = await runtime.content.fetch<string[]>('*[_type == "referendum"]._id')
    expect(referendumsAfter).toEqual(expect.arrayContaining(referendumsBefore))
    expect(referendumsAfter.length).toBe(referendumsBefore.length + 1)
  })

  test('one incident still open: a final call elsewhere does not trigger a season reset', async () => {
    const {bench, runtime, instanceId, referendum} = await start([
      incidentDoc(),
      incidentDoc({_id: 'incident-2', title: 'Test 2'}),
    ])
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt)) // upholds incident-1 only
    bench.advance((START_COOLDOWN_SECONDS + 1) * 1000)

    const result = await startNext(runtime)
    expect(result).toMatchObject({status: 'started', incidentId: 'incident-2'})
    expect(result).not.toHaveProperty('newSeason')

    // incident-1's finalCall is untouched - no season reset happened.
    const incident1 = await runtime.content.fetch<{finalCall?: string}>('*[_id == "incident-1"][0]{finalCall}')
    expect(incident1.finalCall).toBe('noGoal')
  })

  test('runCrowd releases every planned vote across the window', async () => {
    // instantSleep: runCrowd's own waits advance the bench's clock instead of blocking on a real timer -
    // T0 is days in the future on the real wall clock, so a real-timer wait would just hang the test.
    const {runtime, referendum} = await start(undefined, {instantSleep: true})
    const ref = await referendum()

    // What crowd.ts itself would plan for this referendum, independent of runCrowd — used below to check
    // runCrowd released everything it planned, without hardcoding a wave count.
    const plan = waves(
      planCrowd({round: ref.round, loop: 1, windowSeconds: 30, recommendationFavours: 'home', outcryLevel: 3, seed: 1}),
    )

    await runCrowd(runtime, ref._id)

    const after = await runtime.content.fetch<{botVotes: {uphold: number; overturn: number; waves: number}}>(
      '*[_id == $id][0]{botVotes}',
      {id: ref._id},
    )
    expect(after.botVotes.uphold + after.botVotes.overturn).toBe(60)
    expect(after.botVotes.waves).toBe(plan.length)
  })

  test('a conflicting wave is retried, not skipped', async () => {
    const {runtime, referendum} = await start(undefined, {instantSleep: true})
    const ref = await referendum()

    const plan = waves(
      planCrowd({round: ref.round, loop: 1, windowSeconds: 30, recommendationFavours: 'home', outcryLevel: 3, seed: 1}),
    )
    // The first commit against this referendum (some wave's very first attempt) loses its `ifRevisionId`
    // race once, as if it collided with another write - then behaves normally again.
    const patchSpy = makeNextPatchCommitFailOnce(runtime.content, ref._id)

    await runCrowd(runtime, ref._id)

    const after = await runtime.content.fetch<{botVotes: {uphold: number; overturn: number; waves: number}}>(
      '*[_id == $id][0]{botVotes}',
      {id: ref._id},
    )
    // Nothing lost: every planned vote still landed, and every wave is accounted for in `waves` - the old
    // code would have skipped the conflicting wave's votes for good instead of retrying it.
    expect(after.botVotes.uphold + after.botVotes.overturn).toBe(60)
    expect(after.botVotes.waves).toBe(plan.length)
    patchSpy.mockRestore()
  })

  test('an under-quorum round still gets closed by its crowd', async () => {
    // Exercises the same closing loop runCrowd calls at its tail, directly - forcing an under-quorum first
    // close (as if the crowd's writes were lost) the way the plan describes, rather than waiting on the real
    // ~60-vote crowd (which is always well over quorum on its own).
    const {runtime, instanceId, referendum} = await start(undefined, {instantSleep: true})
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 6, 4) // 10 heads, under RULES.quorum (20)

    const result = await closeUntilDone(runtime, ref._id, instanceId)

    // The old code called closeWindow exactly once at the crowd's tail: an under-quorum round would extend
    // and then just hang, never actually closing.
    expect(result?.status).toBe('closed')
    expect((await referendum()).result).toBeDefined()
  })

  test('a redelivered open effect does not start a second crowd', async () => {
    const {runtime} = await setup()
    let opened = 0
    const onOpened = () => {
      opened += 1
    }
    const params = {incidentId: `dataset:${PROJECT}:production:incident-1`, round: 'regular', loop: 1, windowSeconds: 30}

    const first = await openReferendum(runtime.content, runtime.now, 'redelivered-key', 'instance-x', params, onOpened)
    const second = await openReferendum(runtime.content, runtime.now, 'redelivered-key', 'instance-x', params, onOpened)

    expect(opened).toBe(1)
    expect(second).toEqual(first)
    const referendumCount = await runtime.content.fetch<number>('count(*[_type == "referendum"])')
    expect(referendumCount).toBe(1)
  })

  test('a kicked-off stage whose open effect never ran gets its ballot on the next closeWindow', async () => {
    const {runtime} = await setup()
    const {instance} = await runtime.engine.startInstance({
      definition: DEFINITION,
      initialFields: [
        {type: 'subject', name: 'subject', value: {id: `dataset:${PROJECT}:production:incident-1`, type: 'incident'}},
      ],
    })
    // Fires `recommend` and the kick-off but never drains effects, leaving the open-referendum effect queued
    // and unrun - the crash closeWindow's drain-first step is meant to recover from.
    await runtime.engine.fireAction({instanceId: instance._id, activity: 'review', action: 'recommend'})
    await runtime.engine.fireAction({instanceId: instance._id, activity: 'ballot', action: 'open'})
    const referendumCountBefore = await runtime.content.fetch<number>('count(*[_type == "referendum"])')
    expect(referendumCountBefore).toBe(0)

    const result = await closeWindow(runtime, instance._id, Date.parse(T0))
    expect(result.status).toBe('stillOpen')
    const ref = await latestReferendum(runtime, instance._id)
    expect(ref).toBeTruthy()
  })

  test('closing writes the result after the workflow records it', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 34, 26) // 34/60 = 56.7%
    const fireSpy = vi.spyOn(runtime.engine, 'fireAction')
    const patchSpy = vi.spyOn(runtime.content, 'patch')

    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))

    // The close action fired before the referendum's own `result` field was patched.
    const closeCallOrder = fireSpy.mock.invocationCallOrder[0]
    const resultPatchIndex = patchSpy.mock.calls.findIndex((call) => (call[0] as unknown) === ref._id)
    expect(resultPatchIndex).toBeGreaterThanOrEqual(0)
    expect(patchSpy.mock.invocationCallOrder[resultPatchIndex]).toBeGreaterThan(closeCallOrder)

    expect((await referendum()).result).toBe('upheld')
    expect(await stage()).toBe('upheld')
  })

  test('a referendum left without result is healed', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 34, 26)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect((await referendum()).result).toBe('upheld')

    await runtime.content.patch(ref._id).unset(['result']).commit()
    // GROQ projects a missing field as null, not undefined.
    expect((await referendum()).result ?? null).toBeNull()

    // The stage is now terminal ('upheld'), so this hits the notVoting branch, which heals every past visit.
    const healed = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt) + 5_000)
    expect(healed.status).toBe('notVoting')
    expect((await referendum()).result).toBe('upheld')
  })

  test('closing a window whose result is already synced writes nothing (Free-plan request budget)', async () => {
    // /api/tick is polled every few seconds by every open screen while a round is live, and the Sanity
    // project has a hard Free-plan request quota, so a closeWindow call that finds nothing to heal must not
    // spend a write - not even a no-op patch - re-confirming a result that's already there.
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 34, 26)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect((await referendum()).result).toBe('upheld')

    const patchSpy = vi.spyOn(runtime.content, 'patch')
    const transactionSpy = vi.spyOn(runtime.content, 'transaction')
    const second = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt) + 5_000)
    expect(['alreadyClosed', 'notVoting']).toContain(second.status)
    expect(patchSpy).not.toHaveBeenCalled()
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  test('two concurrent closes: neither rejects, the instance advances once, one referendum result', async () => {
    const {runtime, instanceId, referendum, stage} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 34, 26)

    const results = await Promise.all([
      closeWindow(runtime, instanceId, Date.parse(ref.closesAt)),
      closeWindow(runtime, instanceId, Date.parse(ref.closesAt)),
    ])
    for (const result of results) expect(['closed', 'alreadyClosed']).toContain(result.status)

    expect(await stage()).toBe('upheld')
    const referendumCount = await runtime.content.fetch<number>('count(*[_type == "referendum"])')
    expect(referendumCount).toBe(1)
    expect((await referendum()).result).toBe('upheld')
  })

  test('a redelivered extend does not extend the window twice', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 6, 4) // 10 heads, under RULES.quorum (20)

    const results = await Promise.all([
      closeWindow(runtime, instanceId, Date.parse(ref.closesAt)),
      closeWindow(runtime, instanceId, Date.parse(ref.closesAt)),
    ])
    for (const result of results) expect(result.status).toBe('extended')

    const after = await referendum()
    expect(Date.parse(after.closesAt)).toBe(Date.parse(ref.closesAt) + RULES.quorumExtensionSeconds * 1000)
  })

  test('extend retries once after losing a revision race (e.g. to the bot crowd) and still moves closesAt by exactly 15s', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 6, 4) // under RULES.quorum (20)

    const patchSpy = makeNextPatchCommitFailOnce(runtime.content, ref._id)
    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result.status).toBe('extended')
    expect(patchSpy).toHaveBeenCalledTimes(2) // the failed attempt, then the retry

    const after = await referendum()
    expect(Date.parse(after.closesAt)).toBe(Date.parse(ref.closesAt) + RULES.quorumExtensionSeconds * 1000)
    patchSpy.mockRestore()
  })

  test('a human vote written after closesAt is not counted', async () => {
    const {runtime, instanceId, referendum} = await start()
    const ref = await referendum()
    await setBotVotes(runtime, ref._id, 30, 30) // 50/50 on its own
    // Cast after the window's closesAt - /api/vote's own open-check should have refused this, but a request
    // that slipped in right at the deadline must not be allowed to swing the result after the fact.
    await castHumanVote(runtime, ref._id, 'uphold', new Date(Date.parse(ref.closesAt) + 5_000).toISOString())

    const result = await closeWindow(runtime, instanceId, Date.parse(ref.closesAt))
    expect(result).toMatchObject({status: 'closed', upholdPct: 50, votes: 60})
    // Not `referendum()`: a tooClose result opens extra time's own referendum, which is now the latest one.
    const closed = await runtime.content.fetch<{result?: string}>('*[_id == $id][0]{result}', {id: ref._id})
    expect(closed.result).toBe('tooClose')
  })

  test('full wipe deletes only run data: content survives, finalCalls clear, the next press starts fresh', async () => {
    const content: Doc[] = [
      incidentDoc(),
      {_id: 'match-1', _type: 'match', competition: 'Premier League'},
      {_id: 'team-1', _type: 'team', name: 'Everton'},
      {_id: 'law-12', _type: 'law', number: 12},
      {_id: 'pundit-1', _type: 'punditLine', text: 'Clear and obvious.'},
    ]
    const {bench, runtime, instanceId, referendum} = await start(content)
    const ref = await referendum()
    await castHumanVote(runtime, ref._id, 'uphold')
    await setBotVotes(runtime, ref._id, 40, 5)
    await closeWindow(runtime, instanceId, Date.parse(ref.closesAt)) // upheld -> writes finalCall

    const result = await wipeRunData(runtime)
    expect(result).toMatchObject({status: 'wiped', deleted: 2, cleared: 1})

    expect(await runtime.content.fetch<number>('count(*[_type in ["vote", "referendum"]])')).toBe(0)
    expect(await runtime.content.fetch<number>('count(*[defined(finalCall)])')).toBe(0)
    const kept = await runtime.content.fetch<string[]>('*[_id in $ids]._id', {ids: content.map((d) => d._id)})
    expect(kept.sort()).toEqual(content.map((d) => d._id).sort())

    bench.advance((START_COOLDOWN_SECONDS + 1) * 1000)
    expect((await startNext(runtime)).status).toBe('started')
  })

  test('full wipe aborts a live run', async () => {
    const {runtime, instanceId} = await start()
    const result = await wipeRunData(runtime)
    expect(result).toMatchObject({status: 'wiped', aborted: 1, deleted: 1})
    const instance = await runtime.engine.getInstance({instanceId})
    expect(instance.completedAt).toBeDefined()
  })

  test('checkOnly starts the VAR check without a vote; the next press sends it to the people', async () => {
    const {runtime} = await setup()
    const check = await startNext(runtime, undefined, {checkOnly: true})
    expect(check.status).toBe('checking')
    if (check.status !== 'checking') throw new Error('unreachable')
    expect(await stageOf(runtime, check.instanceId)).toBe('varRoom')
    expect(await runtime.content.fetch<number>('count(*[_type == "referendum"])')).toBe(0)

    // A second "Start the VAR check" (someone else pressing too) changes nothing.
    const again = await startNext(runtime, undefined, {checkOnly: true})
    expect(again).toMatchObject({status: 'checking', instanceId: check.instanceId})

    const sent = await startNext(runtime)
    expect(sent).toMatchObject({status: 'recommended', instanceId: check.instanceId})
    expect(await runtime.content.fetch<number>('count(*[_type == "referendum"])')).toBe(1)
  })

  test('sendOnly with nothing live starts nothing (a stale screen cannot skip the VAR check)', async () => {
    const {runtime} = await setup()
    expect(await startNext(runtime, undefined, {sendOnly: true})).toEqual({status: 'nothingToSend'})
    expect(await runtime.content.fetch<number>('count(*[_type == "referendum"])')).toBe(0)
    const check = await startNext(runtime, undefined, {checkOnly: true})
    expect(check.status).toBe('checking')
    expect((await startNext(runtime, undefined, {sendOnly: true})).status).toBe('recommended')
  })

  test('the start lock is only released by its own holder (plan 016 #15)', async () => {
    const {runtime, bench} = await setup()
    // Two presses in a row both get through: the first releases its own lease.
    expect((await startNext(runtime, undefined, {checkOnly: true})).status).toBe('checking')
    bench.advance(1000)
    expect((await startNext(runtime, undefined, {checkOnly: true})).status).toBe('checking')
  })
})
