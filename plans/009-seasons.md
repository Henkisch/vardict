# Plan 009: When every call has been confirmed, the next press starts a new season instead of failing

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/runtime.ts workflows/runtime.test.ts web/src/app/api/start/route.ts web/src/app/live/page.tsx web/src/components/VarRoomScene.tsx`
> Plans 002–008 touch these. Re-read `startNext` and the `/live` page before editing; if `startNext` no longer ends
> with the "Every incident has a final call" throw, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-start-flow-safe.md, plans/006-live-state-logic.md
- **Category**: bug
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

VARdict has five incidents. A run ends "upheld" when the public confirms the VAR call, and the incident gets a
`finalCall`. `startNext` only picks incidents **without** a `finalCall`, and throws when none are left. One human vote
counts ×20 against about 60 bots, so a handful of judges can uphold all five in an afternoon. After that, every judge's
"Send to the people" press returns HTTP 500 ("Something went wrong") and the demo is dead until someone runs a reset
script by hand. The fix: when all five are confirmed, the next press starts a new "season".

## Current state

- `workflows/runtime.ts` end of `startNext` (at the planned commit):
  ```ts
  // Next in line: the incident whose last referendum is oldest (never-voted first). Upheld incidents are done.
  const incidentId =
    pick ??
    (await content.fetch<string | null>(
      `*[_type == "incident" && !defined(finalCall) && !(_id in path("drafts.**"))]{
        _id, "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt
      } | order(coalesce(last, "0") asc)[0]._id`,
    ))
  if (!incidentId) throw new Error('Every incident has a final call. Reset them to run again.')
  ```
- `workflows/scripts/reset.ts` — the manual reset: aborts live runs, deletes all votes and referendums, unsets every
  `finalCall`. Too destructive for this (it would also wipe the results pages and the democracy clock history).
- `web/src/lib/queries.ts` `LIVE_QUERY` has `"next"`: the next incident without `finalCall`, or `null`.
- `/live` (`web/src/app/live/page.tsx`) shows `VarRoomScene` for `state.next`; when `next` is null and a run finished,
  there's no incident to show (plan 006's `runPhase` returns `decided`). The page also has an unreachable "Every call
  has been confirmed" section that only shows when no referendum exists at all.
- Brief wording to reuse on screen (CLAUDE.md pitch): "Football fixed VAR. We fixed it with democracy. Now it's
  slower and less accurate."

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter workflows test` | all pass |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `workflows/runtime.ts` (`startNext`), `workflows/runtime.test.ts`, `web/src/app/api/start/route.ts`
(status mapping), `web/src/app/live/page.tsx`, `web/src/lib/queries.ts` (only adding a `"seasonDone"` boolean or
`"confirmed"` count to `LIVE_QUERY` if needed).

**Out of scope**: deleting referendums or votes (history must survive), `scripts/reset.ts`, the workflow definition,
the results pages (plan 010 shows seasons there if wanted).

## Git workflow

Branch `advisor/009-seasons`. Imperative subjects. No push.

## Steps

### Step 1: A new season instead of a throw

In `startNext`, when the next-in-line query returns nothing and there's no `pick`:
- Unset `finalCall` on every published incident in one transaction (`content.transaction()` with a patch per id;
  fetch ids with `*[_type == "incident" && !(_id in path("drafts.**"))]._id`).
- Re-run the next-in-line query (now all five are eligible; the oldest `last` wins) and continue as normal.
- Return `status: 'started'` as usual, plus `newSeason: true` in the result (extend the `StartResult` `started`
  variant with an optional `newSeason?: boolean`).
Remove the `throw`.

**Verify**: update plan 002's characterization test "startNext when every incident has finalCall throws" to expect
`started` with `newSeason: true`, and assert no incident has `finalCall` afterwards except none (the new run hasn't
been decided). Comment: "changed by plan 009". `pnpm --filter workflows test` → pass.

### Step 2: `/live` offers the new season

When `runPhase` is `decided` and `state.next` is null (all confirmed), render a section instead of the VAR room scene:
headline "Every call has been confirmed", a line "The people have upheld all five. Democracy is complete, and slower.",
the "Send to the people" button (label: "Start a new season"), and the democracy clock. Remove the unreachable old
branch if it duplicates this.

**Verify**: `pnpm --filter web typecheck && pnpm --filter web lint` → exit 0.

### Step 3: No more 500 from the start button

`/api/start`: `started` with `newSeason` → 200 as before. (Plan 008 wrapped the route in try/catch; confirm an
unexpected error returns `{status: 'error'}` and the page shows "Something went wrong. Try again.".)

**Verify**: `pnpm verify` → exit 0.

## Test plan

In `workflows/runtime.test.ts`: (1) all incidents have `finalCall` → `startNext` returns `started` + `newSeason`, one
new unfinished instance, and the old referendums still exist; (2) with one incident still open, no season reset happens.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `grep -n "Every incident has a final call" workflows/runtime.ts` → nothing
- [ ] Referendum count before == after a new-season start (history kept)
- [ ] Only in-scope files modified; `plans/README.md` updated

## STOP conditions

- The democracy clock or results pages turn out to depend on `finalCall` for past runs in a way that would lose history
  (check `web/src/lib/queries.ts` `INCIDENT_QUERY` and the incident page first). Report before changing anything.
- Unsetting `finalCall` collides with a live run (a run is in a voting stage). It shouldn't — `busy` returns earlier —
  but if the test shows otherwise, STOP.

## Maintenance notes

- "Season" is implicit (finalCall cleared). If per-season results are wanted later, store a `season` number on each
  referendum at open time and filter by it.
