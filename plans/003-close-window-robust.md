# Plan 003: A vote window always closes, exactly once, and the referendum's result always matches the workflow

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected
> result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/runtime.ts workflows/runtime.test.ts`
> Plan 002 is expected to have changed both (it adds a `client`/`now` seam and tests). Anything beyond that: compare
> the excerpts below with the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-runtime-test-seam.md
- **Category**: bug
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

On the live site a run sometimes hangs: the start button says "A vote is already live" forever and screens show
"Counting…" or a stale verdict. The close path writes the referendum's `result` **before** the workflow action, so if
that action fails (network error, or several screens calling `/api/tick` at the same moment), the referendum looks
closed, the screens stop retrying, and the workflow instance never advances. A stage whose ballot effect failed is
never retried either. Fixing the order, adding a retry path and deriving `result` from the engine's own record makes
closing idempotent and self-healing.

## Current state

- Background: VARdict runs a Sanity Workflows (early access, `@sanity/workflow-engine@0.35.0`, a library — nothing
  runs unless code calls it) workflow `peoples-var`. Vote stages: `referendum`, `extraTime`, `shootout`. Entering a
  vote stage queues an `open-*` effect; `engine.drainEffects({instanceId})` runs its handler, which creates a
  `referendum` document in the `production` dataset and writes `referendumId` + `closesAt` back as **stage fields**.
  `/api/tick` (web) and the bot crowd call `closeWindow` when time is up; every open `/live` screen calls `/api/tick`
  every 5 s while a finished window has no result.
- `workflows/runtime.ts:146-184` (`closeWindow`), today:
  ```ts
  const instance = await engine.getInstance({instanceId})
  const stage = instance.currentStage
  if (!['referendum', 'extraTime', 'shootout'].includes(stage)) return {status: 'notVoting', stage}
  const fields = currentStageFields(instance)
  if (fields.upholdPct != null) return {status: 'alreadyClosed', stage}
  if (!fields.referendumId || !fields.closesAt) return {status: 'stillOpen', stage} // ballot not open yet
  if (now < Date.parse(String(fields.closesAt))) return {status: 'stillOpen', stage}
  const referendumId = String(fields.referendumId)
  const tally = await countVotes(content, referendumId)
  const upholdPct = tally.weightedTotal ? Math.round((tally.uphold / tally.weightedTotal) * 1000) / 10 : 50
  if (tally.bots + tally.humans < RULES.quorum && !fields.extended) {
    await engine.fireAction({instanceId, activity: 'count', action: 'extend'})
    await engine.drainEffects({instanceId})
    return {status: 'extended', stage, upholdPct, votes: tally.bots + tally.humans}
  }
  const action = stage === 'shootout' ? (upholdPct > 50 ? 'roundWon' : 'roundLost') : 'closeVote'
  const result = stage === 'shootout' ? (upholdPct > 50 ? 'upheld' : 'overturned')
    : upholdPct > RULES.upheldAbove ? 'upheld' : upholdPct < RULES.overturnedBelow ? 'overturned' : 'tooClose'
  await content.patch(referendumId).set({result}).commit()          // ← written first
  await engine.fireAction({instanceId, activity: 'count', action, params: {upholdPct, votes: ...},
    idempotencyKey: `close-${referendumId}`})
  await engine.drainEffects({instanceId})
  ```
- `workflows/runtime.ts:66-72` (`extend` effect handler): reads `closesAt`, adds `params.seconds`, writes it. A
  redelivered effect (at-least-once) extends again.
- `countVotes` (`runtime.ts:207-221`) counts **all** human `vote` docs for the referendum, including ones written
  after `closesAt` by a request that passed `/api/vote`'s open-check just before the deadline.
- `currentStageFields(instance)` (`runtime.ts:136-139`) reads `instance.stages.at(-1).fields`. Earlier visits are in
  `instance.stages[]` with the same shape; a closed visit has a `upholdPct` field.
- Thresholds: `RULES.upheldAbove` = 55, `RULES.overturnedBelow` = 45, shootout round win: > 50.
- Tests live in `workflows/runtime.test.ts` (created by plan 002, with a `setup()` helper on the in-memory bench).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter workflows test` | all pass |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `workflows/runtime.ts` (`closeWindow`, the `extend` handler, `countVotes`, a new `syncResults`
helper), `workflows/runtime.test.ts`.

**Out of scope**: the workflow definition (`workflows/definitions/peoplesVar.ts` — changing it means a redeploy and
new instances pinned to a new version), `runCrowd` (plan 004), `startNext`/`sendToThePeople` (plan 005), anything
in `web/` (plan 006 changes when screens tick).

## Git workflow

Branch `advisor/003-close-window-robust`. Imperative commit subjects. Don't push (a push to `main` deploys production).

## Steps

### Step 1: Drain first

At the top of `closeWindow`, before `getInstance`, add
`await engine.drainEffects({instanceId}).catch((error) => console.warn('drain before close failed', instanceId, error))`.
This retries a stuck `open-*` effect so a stage that never got its ballot recovers.

**Verify**: new test "a stage whose open effect never ran gets its ballot on the next closeWindow": start a run, and
before draining (use the bench engine's `fireAction` for `recommend` without `drainEffects`), call `closeWindow` →
returns `stillOpen` **and** a referendum doc now exists. `pnpm --filter workflows test` → passes.

### Step 2: Derive `result` from the engine, write it after the action

- Add `resultFor(stageName: string, upholdPct: number)` returning `'upheld' | 'overturned' | 'tooClose'` with the
  thresholds above (shootout: `> 50` upheld else overturned).
- Add `async function syncResults(content, instance)`: for every entry in `instance.stages` whose fields contain both
  `referendumId` and `upholdPct`, set `result: resultFor(entry.name, upholdPct)` on that referendum **only if it has
  no `result` yet** (use `content.patch(id).setIfMissing({result})`). Check the stage entry shape against a real
  instance in the tests (`instance.stages[i].name` and `.fields`); adapt the property names if they differ.
- In `closeWindow`: remove the `content.patch(referendumId).set({result})` before `fireAction`. After `fireAction`,
  call `syncResults(content, await engine.getInstance({instanceId}))`, then `drainEffects`.
- In the `alreadyClosed` and `notVoting` branches, also call `syncResults` before returning (heals referendums left
  without a result by an earlier crash).
- Wrap the `fireAction` in try/catch. On error: re-read the instance; if the stage visit now has `upholdPct` (another
  caller closed it) or `currentStage` changed, run `syncResults` and return `{status: 'alreadyClosed', stage}`;
  otherwise rethrow.

**Verify**: tests
1. "closing writes the result after the workflow records it" — after close, the referendum's `result` equals
   `resultFor(stage, upholdPct)` of the closed visit.
2. "a referendum left without result is healed": close a round, then `unset(['result'])` on the referendum, call
   `closeWindow` again → `result` is back.
3. "two concurrent closes": `Promise.all([closeWindow(...), closeWindow(...)])` → neither rejects; the instance
   advanced exactly one stage; one referendum `result`.

### Step 3: Make the quorum extension idempotent and race-safe

- `closeWindow`: pass `idempotencyKey: \`extend-${referendumId}\`` to the `extend` `fireAction`.
- Read `closesAt` from the **referendum document** as well as the stage field and use the later of the two for the
  "still open" check (`fields.closesAt` lags until the extend effect completes).
- `extend` handler: fetch `{_rev, closesAt, extended}`; if `extended == true` return the existing `closesAt` as the
  stage op (no second extension). Otherwise `patch(id).set({closesAt: next, extended: true}).ifRevisionId(_rev)`.
  Add `extended` to nothing else (it's a new field on `referendum`; the Studio schema doesn't need it — out of scope).

**Verify**: test "a redelivered extend doesn't extend twice": under-quorum close → `extended`; call the extend handler
path again (or `closeWindow` again before the new `closesAt`) → `closesAt` moved by 15 s exactly once.

### Step 4: Count only votes cast before the window closed

In `countVotes`, take `closesAt` as a parameter and filter human votes with `dateTime(castAt) <= dateTime($closesAt)`.
Pass the referendum's `closesAt` from `closeWindow`.

**Verify**: test "a human vote written after closesAt isn't counted": 30/30 bots + one human uphold with `castAt`
after `closesAt` → `tooClose` (not `upheld`).

## Test plan

All tests above go in `workflows/runtime.test.ts`, using plan 002's `setup()` helper. Update any plan-002
characterization test that pinned the old write order, with a comment "changed by plan 003".

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] New tests: drain-first, result-after-action, heal, concurrent close, idempotent extend, late vote — all pass
- [ ] `grep -n "set({result})" workflows/runtime.ts` returns nothing
- [ ] Only `workflows/runtime.ts` and `workflows/runtime.test.ts` modified
- [ ] `plans/README.md` row updated

## STOP conditions

- `instance.stages[]` entries don't carry `fields` per visit (so `syncResults` can't read closed visits). Report the
  actual shape.
- The engine throws a specific error type on concurrent `fireAction` that isn't caught by the re-read logic and the
  concurrent-close test keeps failing after one fix attempt.
- Making step 3 work seems to need a change to `workflows/definitions/peoplesVar.ts`.

## Maintenance notes

- `result` on a referendum is now a projection of the engine's record. Anything that writes `result` directly
  (scripts included) should stop doing so.
- `/live` currently ticks only while `!result`. That's still correct after this plan (result is written last), but
  plan 006 revisits when screens tick.
- Deferred: electing a single ticker to reduce `/api/tick` fan-out (plan 007 reduces read volume; tick volume is small).
