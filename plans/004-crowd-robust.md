# Plan 004: The bot crowd never loses a wave, never runs twice, and always closes its window

> **Executor instructions**: Follow this plan step by step, verify each step, honour the STOP conditions, and update
> this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/runtime.ts workflows/runtime.test.ts web/src/app/api/crowd/route.ts`
> Plans 002/003 are expected to have changed `runtime.ts` and the test file. Compare `runCrowd` and the `open` handler
> with the excerpts below; if they differ, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-runtime-test-seam.md, plans/003-close-window-robust.md
- **Category**: bug
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

Every round has a seeded simulated crowd of 60 bots, written as counters on the referendum in about 11 waves. On
Vercel a round once stopped at 55 of 60 votes with every late "pundit" vote missing, and the run hung. Three causes
are in the code: a wave whose conditional write conflicts is **dropped permanently** (the wave counter skips it), a
single failed read kills the whole crowd, and the effect that starts the crowd can fire twice so two crowds race and
conflict. After a quorum extension the crowd also exits without closing the window.

## Current state

- `workflows/runtime.ts` — `runCrowd` (around lines 300-346 at the planned commit):
  ```ts
  for (const [index, wave] of planned.entries()) {
    await sleepUntil(opensAt + wave.atMs)
    const now = await content.fetch<{_rev: string; result?: string; botVotes?: BotVotes; humansUp: number; humansDown: number}>(
      `*[_id == $id][0]{_rev, result, botVotes, "humansUp": ..., "humansDown": ...}`, {id: referendumId})
    if (now.result) return // closed already
    // Waves are numbered, so a restarted crowd (at-least-once effects) skips what's been counted.
    if ((now.botVotes?.waves ?? 0) > index) continue
    ... build `inc` for this wave ...
    await content.patch(referendumId).setIfMissing({botVotes: emptyBotVotes()}).inc(inc)
      .set({'botVotes.waves': index + 1})
      .ifRevisionId(now._rev)
      .commit()
      .catch((error: unknown) => console.warn('crowd wave skipped', referendumId, index, error))
  }
  // The window may have been extended; wait for the real close, then close it.
  const {closesAt} = await content.fetch<{closesAt: string}>('*[_id == $id][0]{closesAt}', {id: referendumId})
  await sleepUntil(Date.parse(closesAt) + 500)
  await closeWindow(runtime, ref.workflowInstanceId)
  ```
  The bug: if wave `i`'s commit fails, the next wave reads `waves == i`, which is not `> i+1`, so it applies wave `i+1`
  and sets `waves = i+2`. Wave `i` is never applied.
- `workflows/runtime.ts` `open` handler (~lines 45-64): `createIfNotExists(...)` then **always** `onOpened(doc._id)`,
  even when the document already existed (effect redelivery) → a second crowd starts.
- `web/src/app/api/crowd/route.ts` — runs `after(() => runCrowd(getRuntime(), referendumId))`; comment on line ~10
  says "bot votes have deterministic ids", which is stale (bots are counters now).
- Crowd plan: `workflows/crowd.ts` (`planCrowd`, `waves`, `chaosChoice`) — pure and tested; do not change it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter workflows test` | all pass |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `workflows/runtime.ts` (`runCrowd`, `open` handler), `workflows/runtime.test.ts`,
`web/src/app/api/crowd/route.ts` (comment only).

**Out of scope**: `workflows/crowd.ts` (the crowd's composition is a product decision), the workflow definition,
`closeWindow` beyond calling it.

## Git workflow

Branch `advisor/004-crowd-robust`. Imperative commit subjects. No push.

## Steps

### Step 1: Retry a wave instead of skipping it

Replace the per-wave body with a loop of up to 3 attempts: read `{_rev, result, botVotes, humans...}`; if `result`
→ return; if `(botVotes?.waves ?? 0) > index` → break (already applied); else commit with `ifRevisionId`; on
success break; on failure wait 200–400 ms and retry. Wrap the read in try/catch too (a failed read counts as an
attempt). After 3 failed attempts, `console.warn` and continue (the wave is lost, but log it with index).

Also change the skip condition so a wave is applied only when `waves == index` (exactly the next one). If
`waves < index` (an earlier wave was lost), apply the missing earlier waves first: iterate from `waves` up to `index`.

**Verify**: test "a conflicting wave is retried": use a content client wrapper whose first `commit()` for a given
wave throws; after the crowd finishes, `botVotes.uphold + botVotes.overturn == 60`. `pnpm --filter workflows test` → pass.

### Step 2: Start the crowd only when the referendum was created now

In the `open` handler: `const existing = await content.getDocument(referendumId)`; if it exists, skip `onOpened` and
return the ops from the existing doc. Otherwise create and call `onOpened`. (Or compare `doc._createdAt` to now; the
existence check is simpler.)

**Verify**: test "a redelivered open effect doesn't start a second crowd": call the open handler twice with the same
`effectKey` → `onOpened` called once.

### Step 3: Keep closing until the round is closed

Replace the final "wait + closeWindow once" with a loop (max ~6 iterations): read `closesAt`; `sleepUntil(closesAt +
500)`; `const r = await closeWindow(...)` inside try/catch; stop when `r.status` is `closed`, `alreadyClosed` or
`notVoting`; continue when `extended` or `stillOpen`.

**Verify**: test "an under-quorum round still gets closed by its crowd": plan a crowd, force the first close to return
`extended` (e.g. zero out the counters before the first close), advance fake timers past the extension → the
round ends `closed`.

### Step 4: Fix the stale comment

`web/src/app/api/crowd/route.ts`: replace "bot votes have deterministic ids" with "waves are numbered on the
referendum's counters, so a restarted crowd only adds missing waves".

**Verify**: `pnpm verify` → exit 0.

## Test plan

Tests in `workflows/runtime.test.ts` with plan 002's `setup()`. Use `vi.useFakeTimers()` for `sleepUntil`; if fake timers
don't work with the bench, inject a `sleep` function via `RuntimeConfig` (in scope) instead of waiting on real time.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] Tests for retry, single crowd, close-after-extension pass
- [ ] `grep -n "crowd wave skipped" workflows/runtime.ts` only appears after the retry loop gives up
- [ ] Only in-scope files modified; `plans/README.md` updated

## STOP conditions

- Applying lost earlier waves (step 1) would double-count because `waves` semantics differ from "number of waves
  applied". Report and apply only the retry part.
- The fake client doesn't support `ifRevisionId` conflicts (can't produce the failure in tests). Report; implement
  with an injected failure instead of relying on the fake.

## Maintenance notes

- `botVotes.waves` means "waves 0..waves-1 are applied". Keep that invariant if the crowd changes.
- The crowd runs inside one `/api/crowd` request (`maxDuration = 90`). A round is at most 30 s + one 15 s extension;
  the close loop must stay well inside 90 s.
