import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, test} from 'vitest'

import {peoplesVar} from './peoplesVar'

const incident = {_id: 'incident-diaz', _type: 'incident', title: 'Luis Díaz goal', varRecommendation: 'noGoal'}

async function start() {
  const bench = createBench({now: '2026-10-01T19:00:00.000Z', documents: [incident]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [peoplesVar]})
  const {instance} = await bench.startInstance({
    definition: 'peoples-var',
    initialFields: [subjectField(incident._id, {type: 'incident'})],
  })
  const id = instance._id
  const stage = () => bench.currentStage(id)
  const recommend = () => bench.fireAction({instanceId: id, activity: 'review', action: 'recommend'})
  const close = (upholdPct: number, votes = 60) =>
    bench.fireAction({instanceId: id, activity: 'count', action: 'closeVote', params: {upholdPct, votes}})
  const round = (won: boolean) =>
    bench.fireAction({
      instanceId: id,
      activity: 'count',
      action: won ? 'roundWon' : 'roundLost',
      params: {upholdPct: won ? 70 : 30, votes: 60},
    })
  const pendingEffects = async () => (await bench.listPendingEffects({instanceId: id})).map((e) => e.name)
  return {bench, id, stage, recommend, close, round, pendingEffects}
}

describe('peoplesVar', () => {
  test('starts in the VAR room', async () => {
    const {stage} = await start()
    expect(await stage()).toBe('varRoom')
  })

  test('recommend opens the referendum and queues the ballot', async () => {
    const {stage, recommend, pendingEffects, bench, id} = await start()
    await recommend()
    expect(await stage()).toBe('referendum')
    expect(await pendingEffects()).toEqual(['open-referendum'])
    const [effect] = await bench.listPendingEffects({instanceId: id})
    expect(effect.params).toMatchObject({incidentId: expect.stringMatching(/:incident-diaz$/), round: 'regular', windowSeconds: 30})
  })

  test('over 55% upholds in regular time and finalizes the call', async () => {
    const {stage, recommend, close, pendingEffects} = await start()
    await recommend()
    await close(56)
    expect(await stage()).toBe('upheld')
    expect(await pendingEffects()).toContain('finalize-referendum')
  })

  test('under 45% sends it back to the VAR room', async () => {
    const {stage, recommend, close} = await start()
    await recommend()
    await close(44)
    expect(await stage()).toBe('varRoom')
  })

  test('only an upheld result writes the final call, from whichever stage decided it', async () => {
    const finals = async (run: Awaited<ReturnType<typeof start>>) =>
      (await run.pendingEffects()).filter((name) => name.startsWith('finalize-'))

    const overturned = await start()
    await overturned.recommend()
    await overturned.close(10)
    expect(await finals(overturned)).toEqual([])

    const extra = await start()
    await extra.recommend()
    await extra.close(50)
    await extra.close(80)
    expect(await finals(extra)).toEqual(['finalize-extra-time'])

    const shootout = await start()
    await shootout.recommend()
    await shootout.close(50)
    await shootout.close(50)
    for (const won of [true, true, false, true]) await shootout.round(won)
    expect(await finals(shootout)).toEqual(['finalize-shootout'])
  })

  test('exactly 55% and 45% are too close to call', async () => {
    const a = await start()
    await a.recommend()
    await a.close(55)
    expect(await a.stage()).toBe('extraTime')

    const b = await start()
    await b.recommend()
    await b.close(45)
    expect(await b.stage()).toBe('extraTime')
  })

  test('extra time: upheld, overturned, or on to a shootout', async () => {
    for (const [pct, expected] of [
      [60, 'upheld'],
      [40, 'varRoom'],
      [50, 'shootout'],
    ] as const) {
      const run = await start()
      await run.recommend()
      await run.close(50)
      expect(await run.stage()).toBe('extraTime')
      await run.close(pct)
      expect(await run.stage()).toBe(expected)
    }
  })

  test('extra time opens a 15 s window', async () => {
    const {recommend, close, bench, id} = await start()
    await recommend()
    await close(50)
    const pending = await bench.listPendingEffects({instanceId: id})
    expect(pending.at(-1)?.params).toMatchObject({round: 'extraTime', windowSeconds: 15})
  })

  test('shootout: 3 rounds won upholds, with one ballot per round', async () => {
    const {bench, id, stage, recommend, close, round} = await start()
    await recommend()
    await close(50)
    await close(50)
    expect(await stage()).toBe('shootout')
    await round(true)
    await round(false)
    await round(true)
    expect(await stage()).toBe('shootout')
    await round(true)
    expect(await stage()).toBe('upheld')

    const rounds = (await bench.listPendingEffects({instanceId: id}))
      .filter((e) => e.name.startsWith('open-'))
      .map((e) => e.params.round)
    expect(rounds).toEqual(['regular', 'extraTime', 'shootout1', 'shootout2', 'shootout3', 'shootout4'])
  })

  test('shootout: 3 rounds lost goes back to the VAR room', async () => {
    const {stage, recommend, close, round} = await start()
    await recommend()
    await close(50)
    await close(50)
    await round(false)
    await round(true)
    await round(false)
    await round(true)
    await round(false)
    expect(await stage()).toBe('varRoom')
  })

  test('a second shootout starts from 0–0', async () => {
    const {stage, recommend, close, round} = await start()
    await recommend()
    await close(50)
    await close(50)
    for (const won of [false, false, false]) await round(won)
    expect(await stage()).toBe('varRoom')
    await recommend()
    await close(50)
    await close(50)
    expect(await stage()).toBe('shootout')
    await round(true)
    await round(true)
    expect(await stage()).toBe('shootout')
    await round(true)
    expect(await stage()).toBe('upheld')
  })

  test('the third trip back to the VAR room abandons the match', async () => {
    const {stage, recommend, close} = await start()
    for (let trip = 1; trip <= 2; trip++) {
      await recommend()
      await close(10)
      expect(await stage()).toBe('varRoom')
    }
    await recommend()
    await close(10)
    expect(await stage()).toBe('abandoned')
  })

  test('no quorum: one extension, then the window must close', async () => {
    const {bench, id, stage, recommend, pendingEffects} = await start()
    await recommend()
    await bench.fireAction({instanceId: id, activity: 'count', action: 'extend'})
    expect(await stage()).toBe('referendum')
    expect(await pendingEffects()).toContain('extend-referendum')
    await expect(bench.fireAction({instanceId: id, activity: 'count', action: 'extend'})).rejects.toThrow()
  })

  test('a second run on the same incident is refused while one is live', async () => {
    const {bench} = await start()
    await expect(
      bench.startInstance({definition: 'peoples-var', initialFields: [subjectField(incident._id, {type: 'incident'})]}),
    ).rejects.toThrow()
  })
})
