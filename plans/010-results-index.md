# Plan 010: A results overview at `/incidents`, and "Abandoned" shown where it happened

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/app/incidents web/src/lib/queries.ts web/src/app/live/page.tsx`
> Plan 007 changes how the incident page loads data (`/api/live?q=incident`). Re-read the page first; follow whatever
> data-loading pattern it uses now.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/007-shared-live-read.md (data-loading pattern)
- **Category**: direction (brief gap)
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The brief promises results pages: "Final call, every round's split, total delay added". Each incident has one, at
`/incidents/[slug]`, but there's no overview: a judge can't see all five verdicts, the control case and the total
"time added by democracy" on one screen, and that screen is the punchline. The workflow's funniest outcome, a match
**abandoned** after the third trip back to the VAR room ("match to be replayed"), shows as "Not upheld (yet)" on the
incident page.

## Current state

- `web/src/app/incidents/[slug]/page.tsx` — client component; shows three "calls" (On the pitch / The VAR room / The
  people), the clip, the incident's democracy clock (JS sum of `realDelaySeconds` + closed rounds' seconds), every
  round grouped by run and loop, the outcry, and links to the other incidents. "The people" box:
  ```tsx
  <Call label="The people" value={final} fallback={incident.rounds.length ? 'Not upheld (yet)' : 'Not voted yet'} />
  ```
- `web/src/lib/queries.ts` — `INCIDENT_QUERY` returns `rounds[]` with `round`, `loop`, `result`,
  `workflowInstanceId`, `seconds`, `uphold`, `overturn`, `humans`. `LIVE_QUERY` computes the global clock:
  `"democracySeconds": math::sum(*[_type == "incident"].realDelaySeconds) + coalesce(math::sum(*[_type == "referendum" && defined(result)]{"s": dateTime(closesAt) - dateTime(windowOpensAt)}.s), 0)`.
- Outcome rules for one run (one `workflowInstanceId`): its last round `upheld` and not a mid-shootout round → upheld;
  last round `overturned` at `loop == 3` (and, for a shootout, the losing side reached 3) → **abandoned**; otherwise
  in progress / back in the VAR room. The incident's `finalCall` is set when a run is upheld (cleared by a new season,
  plan 009).
- Visual language: see the incident page — `font-display` uppercase headings, `rounded-lg border border-line bg-pitch`
  panels, colour tokens `text-uphold`, `text-overturn`, `text-var`, `text-muted` (defined in `web/src/app/globals.css`).
  `/live`'s header links: the logo `Link href="/live"`.
- Control case: the incident with `controlCase: true` (Luis Díaz, Tottenham v Liverpool 2023). The VAR was admittedly
  wrong, so the "right" answer is to overturn.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck/lint | `pnpm --filter web typecheck && pnpm --filter web lint` | exit 0 |
| Build | `pnpm --filter web build` | exit 0; `/incidents` in the route table |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `web/src/app/incidents/page.tsx` (create), `web/src/app/incidents/[slug]/page.tsx`,
`web/src/lib/queries.ts` (add `INCIDENTS_QUERY`), `web/src/lib/outcome.ts` (create), `/api/live` route if plan 007
made data flow through it (add `q=incidents`), `web/src/app/live/page.tsx` (one header link).

**Out of scope**: the workflow, the VAR Room app, OG images (plan 014).

## Git workflow

Branch `advisor/010-results-index`. Imperative subjects. No push.

## Steps

### Step 1: One outcome function

Create `web/src/lib/outcome.ts` exporting `runOutcome(rounds)` → `'upheld' | 'abandoned' | 'open'` for the rounds of one
run (ordered by `windowOpensAt`), using the rules above, and `incidentOutcome(rounds)` → the outcome of the **latest**
run, or `'notVoted'` when there are no rounds.

**Verify**: typecheck exits 0.

### Step 2: Show "Abandoned" on the incident page

In `/incidents/[slug]`, "The people" box: when `incidentOutcome` is `abandoned`, show "Abandoned · match to be
replayed" in `text-overturn`. Also label each run in "Every round" with its outcome.

**Verify**: typecheck/lint exit 0.

### Step 3: The overview page

Add `INCIDENTS_QUERY` (all published incidents ordered by `match->date`, each with `title`, `slug`, `controlCase`,
`varRecommendation`, `finalCall`, `realDelaySeconds`, the same `rounds[]` projection as `INCIDENT_QUERY`, and the global
`democracySeconds`). Create `/incidents/page.tsx`: the democracy clock big at the top, then one row per incident with
fixture, title, the VAR call, the outcome (Upheld / Abandoned / Back in the VAR room / Not voted yet), the number of
rounds, and a link to its page. Mark the control case ("Control case: the VAR was wrong. Did the people notice?") with
the outcome read as right (overturned/abandoned) or wrong (upheld).

**Verify**: `pnpm --filter web build` → exit 0 with `/incidents` listed.

### Step 4: Link it

Add a "Results" link in `/live`'s header next to the democracy clock, and on each incident page's back link.

**Verify**: `pnpm verify` → exit 0.

## Test plan

If plan 006 added vitest to `web`: `web/src/lib/outcome.test.ts` with cases upheld in regular time, upheld in a
shootout 3–1, abandoned at loop 3, open (tooClose last), not voted. Otherwise document the cases in a comment and rely
on typecheck plus a manual look.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `/incidents` builds and lists five incidents on a local dev server (manual, if env exists)
- [ ] `grep -n "Not upheld (yet)" web/src/app/incidents` → nothing
- [ ] Only in-scope files modified; `plans/README.md` updated

## STOP conditions

- The rounds data can't tell a mid-shootout round from a deciding one (needs shootout scores the query lacks). Report
  and propose the minimal query addition instead of guessing.

## Maintenance notes

- Outcome logic now lives in `web/src/lib/outcome.ts` and phase logic in `web/src/lib/run-status.ts` (plan 006); keep
  them consistent with `workflows/definitions/peoplesVar.ts` `RULES`.
