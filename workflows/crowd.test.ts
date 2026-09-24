import {describe, expect, test} from 'vitest'

import {chaosChoice, CROWD_SIZE, planCrowd, type CrowdInput} from './crowd'

const base: CrowdInput = {seed: 303703, round: 'regular', loop: 1, windowSeconds: 30, recommendationFavours: 'home', outcryLevel: 5}
const share = (plan: ReturnType<typeof planCrowd>) =>
  (100 * plan.filter((v) => v.choice === 'uphold').length) / plan.filter((v) => v.choice).length

describe('planCrowd', () => {
  test('is repeatable for the same incident, round and loop', () => {
    expect(planCrowd(base)).toEqual(planCrowd(base))
  })

  test('changes between rounds and loops', () => {
    expect(planCrowd({...base, round: 'shootout1'})).not.toEqual(planCrowd(base))
    expect(planCrowd({...base, loop: 2})).not.toEqual(planCrowd(base))
  })

  test('has the fixed personas: 21 home, 21 away, 12 neutrals, 5 pundits, 1 chaos', () => {
    const plan = planCrowd(base)
    expect(plan).toHaveLength(CROWD_SIZE)
    const count = (p: string) => plan.filter((v) => v.persona === p).length
    expect([count('homeFan'), count('awayFan'), count('neutral'), count('pundit'), count('chaos')]).toEqual([21, 21, 12, 5, 1])
  })

  test('home fans back a call that favours the home team; away fans oppose it', () => {
    const plan = planCrowd(base)
    expect(new Set(plan.filter((v) => v.persona === 'homeFan').map((v) => v.choice))).toEqual(new Set(['uphold']))
    expect(new Set(plan.filter((v) => v.persona === 'awayFan').map((v) => v.choice))).toEqual(new Set(['overturn']))
  })

  test('pundits vote as one bloc in the last 5 seconds', () => {
    const pundits = planCrowd(base).filter((v) => v.persona === 'pundit')
    expect(new Set(pundits.map((v) => v.choice)).size).toBe(1)
    for (const v of pundits) expect(v.atMs).toBeGreaterThanOrEqual(25_000)
  })

  test('every vote lands inside the window', () => {
    for (const windowSeconds of [30, 15, 10]) {
      for (const v of planCrowd({...base, windowSeconds})) {
        expect(v.atMs).toBeGreaterThan(0)
        expect(v.atMs).toBeLessThan(windowSeconds * 1000)
      }
    }
  })

  test('the split lands near the knife-edge, so rounds can go either way', () => {
    const splits = Array.from({length: 40}, (_, i) => share(planCrowd({...base, seed: i})))
    expect(Math.min(...splits)).toBeGreaterThan(25)
    expect(Math.max(...splits)).toBeLessThan(75)
    // Some rounds are too close to call (45–55), which is how incidents reach extra time and shootouts.
    expect(splits.some((s) => s >= 45 && s <= 55)).toBe(true)
  })

  test('the chaos voter joins the minority', () => {
    expect(chaosChoice(10, 20)).toBe('uphold')
    expect(chaosChoice(20, 10)).toBe('overturn')
  })
})
