# Plan 002: The workflow runtime can be tested in memory, with characterization tests for today's behaviour

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected
> result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/runtime.ts workflows/runtime.test.ts`
> If an in-scope file changed since this plan was written, compare the "Current state" excerpts against the live
> code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-verification-baseline.md (for `pnpm verify`)
- **Category**: tests
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

`workflows/runtime.ts` decides every verdict in VARdict (who wins a vote, when a window closes, which incident starts
next, the cost caps), and it has **no tests**. The only way to exercise it today is `workflows/scripts/live-run.ts`
against the real Sanity project, which spends the Free-plan quota and touches the public site's data. Plans 003–005
change this file's riskiest paths; they need a fast in-memory harness and tests that pin today's behaviour first.

## Current state

- `workflows/runtime.ts` — the runtime. Key exports: `createRuntime`, `sendToThePeople`, `closeWindow`,
  `liveInstances`, `startNext`, `runCrowd`, `emptyBotVotes`, `PERSONAS`.
- The seam problem, `workflows/runtime.ts:92-120`:
  ```ts
  export function createRuntime({
    projectId, token, contentDataset = 'production', workflowsDataset = 'workflows', tag = 'dev',
    background = (task) => void task().catch((error) => console.error('background task failed', error)),
    startCrowd,
  }: RuntimeConfig): Runtime {
    const base = createClient({projectId, token, apiVersion: '2025-02-19', useCdn: false})
    const content = base.withConfig({dataset: contentDataset})
    const workflows = base.withConfig({dataset: workflowsDataset})
    const engine = createEngine({
      client: workflows, tag,
      workflowResource: {type: 'dataset', id: `${projectId}.${workflowsDataset}`},
      resourceClients: (gdr) => gdr.scheme === 'dataset' && gdr.projectId === projectId && gdr.dataset === contentDataset ? content : undefined,
      effects: {handlers: handlers(content, (referendumId) => startCrowd ? startCrowd(referendumId) : background(() => runCrowd(runtime, referendumId)))},
    })
    ...
  ```
  It always builds a real `@sanity/client`, so nothing can be injected.
- `closeWindow(runtime, instanceId, now = Date.now())` already takes a clock. `startNext(runtime, pick?)` and
  `runCrowd(runtime, referendumId)` read `Date.now()` directly.
- Test bench: `@sanity/workflow-engine-test@0.35.0` (devDependency of `workflows`). Exported API (from
  `workflows/node_modules/@sanity/workflow-engine-test/dist/index.d.ts`):
  - `createBench({documents?, workflowResource?, serveResources?, now?})` → a bench with `bench.client` (a fake,
    `@sanity/client`-compatible `TestClient` backed by an in-memory store), `bench.setNow(iso)`, `bench.advance(ms)`,
    `bench.deployDefinitions({expectedMinReaderModel, definitions})`, `bench.listPendingEffects({instanceId})`.
  - `serveResources: [{type: 'dataset', id: 'proj.production'}]` makes the bench also serve a sibling dataset from
    the same store (our incidents live in `production`, workflow state in `workflows`).
  - `createBenchEngine(bench, overrides?)` builds an extra engine on the bench's client and clock.
- Existing test to copy the style of: `workflows/definitions/peoplesVar.test.ts`. Excerpt:
  ```ts
  import {createBench, subjectField} from '@sanity/workflow-engine-test'
  import {describe, expect, test} from 'vitest'
  import {peoplesVar} from './peoplesVar'

  const incident = {_id: 'incident-diaz', _type: 'incident', title: 'Luis Díaz goal', varRecommendation: 'noGoal'}

  async function start() {
    const bench = createBench({now: '2026-10-01T19:00:00.000Z', documents: [incident]})
    await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [peoplesVar]})
    ...
  ```
- Rules the tests pin (from `workflows/definitions/peoplesVar.ts` `RULES` and `runtime.ts`): uphold share **over 55%**
  → `upheld`; **under 45%** → `overturned`; otherwise `tooClose`; in a shootout **over 50%** wins the round. A human
  vote counts `RULES.humanVoteWeight` (20) times; bots are counters on the referendum (`botVotes.uphold`,
  `botVotes.overturn`). Quorum: fewer than `RULES.quorum` (20) heads → fire `extend` once instead of closing.
  `startNext` returns `busy` when a run is in a voting stage, `coolingDown` within 10 s of the last completed run,
  `dailyLimit` at `RULES.maxRunsPerDay` (40) runs in 24 h.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter workflows test` | all pass |
| Typecheck | `pnpm --filter workflows typecheck` | exit 0 (from plan 001) |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `workflows/runtime.ts` (seam only), `workflows/runtime.test.ts` (create).

**Out of scope**: any behaviour change in `runtime.ts` (that's plans 003–005 — this plan must keep behaviour
identical, including known bugs), `workflows/definitions/peoplesVar.ts`, `web/`, scripts. Do not run any script
against the real Sanity project.

## Git workflow

Branch `advisor/002-runtime-test-seam`. Commits in imperative style ("Make the runtime injectable for tests"). No push.

## Steps

### Step 1: Add an injectable client and clock to `RuntimeConfig`

In `workflows/runtime.ts`:
- Add to `RuntimeConfig`: `client?: SanityClient` ("a base client; tests pass the bench's fake client") and
  `now?: () => number` ("clock; defaults to Date.now").
- In `createRuntime`: `const base = client ?? createClient({projectId, token, apiVersion: '2025-02-19', useCdn: false})`.
- Add `now: () => number` to the `Runtime` type and return it (`now ?? Date.now`).
- Replace `Date.now()` in `startNext` (cooldown `since`) and in the `open` handler and `runCrowd` **only where they
  compute times**, with `runtime.now()` / a `now` passed into `handlers(...)`. Keep `closeWindow`'s existing `now`
  parameter, but default it to `runtime.now()`.
- `sleepUntil` in `runCrowd` uses real timers; leave it (tests will use vitest fake timers or skip `runCrowd` waits,
  see step 3).

**Verify**: `pnpm --filter workflows typecheck` → exit 0; `pnpm --filter workflows test` → 22 pass (nothing else changed).

### Step 2: Build a test helper in `workflows/runtime.test.ts`

```ts
const PROJECT = 't2sbu6uu'
const T0 = '2026-10-01T19:00:00.000Z'
async function setup(documents = [incident()]) {
  const bench = createBench({
    now: T0,
    workflowResource: {type: 'dataset', id: `${PROJECT}.workflows`},
    serveResources: [{type: 'dataset', id: `${PROJECT}.production`}],
    documents,
  })
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [peoplesVar]})
  const tasks: Promise<void>[] = []
  const runtime = createRuntime({
    projectId: PROJECT, token: 'test', tag: bench.tag ?? 'test',
    client: bench.client as unknown as SanityClient,
    now: () => Date.parse(bench.now()),
    background: (task) => void tasks.push(task()),
  })
  return {bench, runtime, tasks}
}
```
Incident fixture: `{_id: 'incident-1', _type: 'incident', title: 'Test', varRecommendation: 'noGoal',
recommendationFavours: 'home', crowdSeed: 1, outcry: {level: 3}}`.

Check how the bench names its tag (`bench.tag` or the default in the `.d.ts`); the runtime's `tag` must equal the
bench's so `liveInstances` finds instances.

**Verify**: a first test `startNext on an empty board starts a run` —
`const r = await startNext(runtime)` → `expect(r.status).toBe('started')` and a `referendum` doc exists in the
production store (`await bench.client.withConfig({dataset: 'production'}).fetch('count(*[_type=="referendum"])')` → 1).
`pnpm --filter workflows test` → passes.

### Step 3: Characterization tests (pin today's behaviour)

Write these in `workflows/runtime.test.ts`. Drive votes by writing directly to the store: bot counters via
`patch(referendumId).set({'botVotes.uphold': n, 'botVotes.overturn': m})`, humans via `create({_type: 'vote',
referendum: {_type: 'reference', _ref: referendumId}, choice, sessionId, simulated: false})`. Pass an explicit `now`
past `closesAt` to `closeWindow`.

1. `closeWindow` before `closesAt` → `stillOpen`.
2. 60 bots at 34 uphold / 26 overturn (56.7%) → `closed`, referendum `result` = `upheld`, instance stage `upheld`,
   incident `finalCall` = `noGoal` after drain.
3. 26/34 → `overturned`, stage `varRoom`.
4. 30/30 → `tooClose`, stage `extraTime`, a second referendum with `round == 'extraTime'` exists.
5. 10 bots only → `extended` (quorum 20), referendum `closesAt` moved +15 s; a second close past the new time → `closed`.
6. One human uphold + 30/30 bots → weighted 50/80 = 62.5% → `upheld` (pins the ×20 weight).
7. `closeWindow` called twice after a close → second returns `alreadyClosed` or `notVoting`.
8. Shootout: drive two `tooClose` rounds, then round results 51% / 49% → stage stays `shootout` with the score
   counted; three wins → `upheld`.
9. `startNext` while a round is open → `busy`. After the run completes, within 10 s → `coolingDown`
   (`bench.advance` to move the clock).
10. `startNext` after an overturn (run parked in `varRoom`) → `recommended` on the same instance.
11. `startNext` when every incident has `finalCall` → **throws** (pin today's behaviour; plan 009 changes it).

For `runCrowd`: one test with `vi.useFakeTimers()` that runs `runCrowd(runtime, referendumId)` and advances timers
by 35 s, then asserts `botVotes.uphold + botVotes.overturn === 60` and `botVotes.waves` equals the number of waves.
If fake timers fight the bench's clock, mark the test `test.skip` with a one-line reason and report it.

**Verify**: `pnpm --filter workflows test` → all pass (22 existing + the new ones).

## Test plan

As step 3. Model the structure on `workflows/definitions/peoplesVar.test.ts` (a `start()`-style helper, one behaviour
per test, `describe('runtime', ...)`).

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `workflows/runtime.test.ts` exists with ≥ 11 passing tests
- [ ] `git diff 9a0bb9b -- workflows/runtime.ts` only adds the `client`/`now` seam (no logic changes)
- [ ] `plans/README.md` row updated

## STOP conditions

- The bench's fake client can't run a GROQ feature the runtime uses (`count(*[...])`, `references()`,
  `dateTime(now()) - 60*60*24`, `coalesce`, `order(...)`, `path("drafts.**")`). Report which ones fail with the error;
  don't rewrite runtime queries to suit the fake.
- `engine.startInstance` rejects the `production` subject ref in the bench (the cross-dataset setup). Report the error.
- Any existing test starts failing.

## Maintenance notes

- Plans 003–005 add their regression tests to this file; each "pins today's behaviour" test that a later plan
  deliberately changes should be updated in that plan, with a comment saying why.
- Keep tests off the real project. `scripts/live-run.ts` and `scripts/crowd-run.ts` remain for manual end-to-end checks.
