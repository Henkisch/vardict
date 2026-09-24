# Plan 006: `/live` always shows the round that's actually happening

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/lib/live.ts web/src/app/live/page.tsx web/src/lib/queries.ts`
> On a mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of 002–005; plan 007 later changes the data source under this hook)
- **Category**: bug
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The owner reported the big screen "showing an older last verdict" and missing new rounds. Three client-side causes:
(1) `/live` treats **any** round result except "too close" as the end of the run, including each **shootout round**,
so between shootout rounds it flashes "Back in the VAR room" or even a different incident; (2) fast polling stops the
moment a result lands, which is before the next round's referendum exists, so screens drop to 8 s polling and miss
most of a 10 s shootout window; (3) overlapping requests can resolve out of order and overwrite newer data with older.

## Current state

- `web/src/lib/live.ts` — `useLiveQuery(query, params, {fast})` polls Sanity directly (uncached) every 3 s when `fast`,
  8 s otherwise, only while the tab is visible, plus reloads on Live Content API events (which arrive 5–20 s late).
  `load()` has no request ordering:
  ```ts
  const load = async (lastLiveEventId?: string) => {
    const response = await client
      .fetch<T>(query, JSON.parse(key), {filterResponse: false, lastLiveEventId})
      .catch(() => undefined)
    if (cancelled || !response) return
    tags = response.syncTags ?? []
    setData(response.result)
  }
  ```
  `useLiveState(query)` (bottom of the file):
  ```ts
  const [fast, setFast] = useState(false)
  const [boosted, setBoosted] = useState(false)
  const state = useLiveQuery<T>(query, {}, {fast})
  const live = Boolean(state?.referendum && !state.referendum.result)
  if ((live || boosted) !== fast) setFast(live || boosted)
  ```
- `web/src/app/live/page.tsx:48-52`:
  ```ts
  const finished = Boolean(ref?.result && ref.result !== 'tooClose')
  const parked = finished && ref?.result === 'overturned' && ref.loop < 3 && !ref.incident.finalCall
  const waitingOn = !ref ? state?.next : finished ? (parked ? ref.incident : state?.next) : undefined
  ```
  `ref.shootout` is an array of results of the current run's finished shootout rounds in this loop
  (`'upheld' | 'overturned'`), from `LIVE_QUERY` in `web/src/lib/queries.ts`.
- Rules: a shootout is best of five; the first side to **3** round wins decides it. Loop cap: the third trip back to
  the VAR room abandons the match, so a run at `loop == 3` that's overturned is over.
- Referendum `round` values: `regular`, `extraTime`, `shootout1`…`shootout5`.
- Style: Tailwind classes, `'use client'` pages, hooks in `web/src/lib/live.ts`. Next.js 16 — per `web/AGENTS.md`,
  read `web/node_modules/next/dist/docs/` before using any Next API you're unsure of (this plan needs none).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm --filter web typecheck` | exit 0 |
| Lint | `pnpm --filter web lint` | exit 0 |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `web/src/lib/live.ts`, `web/src/app/live/page.tsx`, `web/src/lib/run-status.ts` (create),
`web/src/lib/run-status.test.ts` (create, only if you add vitest to web — see Test plan).

**Out of scope**: the GROQ in `web/src/lib/queries.ts` (plan 007 moves reads server-side), the VAR Room scene
component's look, `/api/*` routes.

## Git workflow

Branch `advisor/006-live-state-logic`. Imperative subjects. No push.

## Steps

### Step 1: One pure function decides the run phase

Create `web/src/lib/run-status.ts`:
```ts
export type Phase = 'voting' | 'counting' | 'between' | 'parked' | 'decided'
// between: a round has a result but the run continues (tooClose, or a shootout that isn't decided yet)
// parked: overturned and back in the VAR room for another loop
// decided: upheld, or overturned at the loop cap (abandoned), or no referendum at all
export function runPhase(ref: {result?: string; round: string; loop: number; closesAt: string; shootout: string[];
  incident: {finalCall?: string}} | null | undefined, now: number): Phase
```
Rules: no ref → `decided`. No result and `now < closesAt` → `voting`; no result otherwise → `counting`.
`tooClose` → `between`. Shootout round (`round.startsWith('shootout')`): count `shootout` wins/losses **including
this round** (the query may or may not include it — check `LIVE_QUERY`: it filters `defined(result)`, so it
includes the current round once it has a result); if neither side has 3 → `between`; wins ≥ 3 → `decided`;
losses ≥ 3 → treat as an overturn below. Overturned (or a lost shootout) with `loop < 3` → `parked`; at
`loop >= 3` → `decided`. Upheld → `decided`.

**Verify**: `pnpm --filter web typecheck` → exit 0.

### Step 2: Use it on `/live`

In `page.tsx` replace `finished`/`parked`/`waitingOn` with `runPhase(ref, now)`:
- `voting` / `counting` / `between` → the match view (existing branch), with "The next round opens in a moment." for
  `between`.
- `parked` → `VarRoomScene` with `ref.incident` and `loop={ref.loop + 1}`.
- `decided` → `VarRoomScene` with `state.next` (when present) and `last={ref}`.
Keep `useCloseWhenCounting(phase === 'counting')`.

**Verify**: typecheck + lint exit 0.

### Step 3: Poll fast across the gap

In `useLiveState`, poll fast when the phase is `voting`, `counting` or `between`, and for 20 s after the phase last
changed (use a `useEffect` on the phase that sets `boosted` true and clears it after 20 s — no `Date.now()` in
render; the repo's lint rule `react-hooks/purity` forbids it). Keep the existing 30 s boost after pressing the button.
`useLiveState` needs `now` or the phase: simplest is to accept a `phaseOf(state) => Phase` callback argument from the
page.

**Verify**: typecheck + lint exit 0.

### Step 4: Ignore out-of-order responses

In `useLiveQuery`, add two counters inside the effect: `let seq = 0` and `let applied = 0`. Each `load()` starts with
`const mine = ++seq`; after the await: `if (cancelled || !response || mine < applied) return; applied = mine;` then
`setData(...)`. A response to an older request that resolves after a newer one is thereby ignored.

**Verify**: typecheck + lint exit 0.

### Step 5: Manual check on a local dev server (if a local `.env.local` exists)

`pnpm --filter web dev`, open `/live`, press "Send to the people", and watch one run to its end. Expected: during a
shootout the screen stays on the match view between rounds; after an overturn it shows "Back in the VAR room · loop 2
of 3". **This spends real Sanity quota and writes to the public dataset** — ask the operator before doing it, and
afterwards run `pnpm --filter workflows exec tsx --env-file=../.env.local scripts/reset.ts` only if the operator says so.

## Test plan

`web` has no test runner. If adding vitest to `web` is acceptable (devDependency only), add
`web/src/lib/run-status.test.ts` covering: no ref, voting, counting, tooClose, shootout 2–1 (between), shootout 3–1
(decided), shootout 1–3 at loop 1 (parked), overturned at loop 3 (decided), upheld (decided). If adding a dependency
is not acceptable, put the same table as a `// Examples:` comment and verify by typecheck only — say which in your
report.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `grep -n "result !== 'tooClose'" web/src/app/live/page.tsx` returns nothing
- [ ] `runPhase` exists and is the only place the phase is decided
- [ ] Only in-scope files modified; `plans/README.md` updated

## STOP conditions

- `LIVE_QUERY`'s `shootout` field turns out not to include the current round's result (breaks the counting rule) and
  fixing it requires editing `queries.ts`. Report; don't edit the query.
- The page needs data the query doesn't provide (e.g. whether a run was aborted). Report instead of adding fields.

## Maintenance notes

- Plan 007 replaces the browser's direct Sanity reads with a cached `/api/live` route; `runPhase` and the polling
  cadence stay.
- If the workflow's rules change (shootout length, loop cap), update `runPhase` together with
  `workflows/definitions/peoplesVar.ts` `RULES`.
