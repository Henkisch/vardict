# Plan 012 (design spike): "Watch a shootout" — replay a recorded run so every judge sees the whole flow

> **Executor instructions**: This is a **design/spike** plan: investigate, prototype on a branch, and write a short
> proposal. Don't ship to `main`. Update this plan's row in `plans/README.md` with the outcome.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/app web/src/components web/src/lib`

## Status

- **Priority**: P3
- **Effort**: M (coarse)
- **Risk**: LOW (read-only feature)
- **Depends on**: plans/006-live-state-logic.md, plans/010-results-index.md
- **Category**: direction
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The shootout is the joke's peak (five 10-second votes, best of five) and the demo checklist wants "one incident
reaching the shootout". But one human vote counts ×20 against ~60 bots, so a judge testing alone usually decides a round
outright and rarely sees extra time, a shootout, a loop back to the VAR room or an abandoned match. Every round's split
is already stored (referendum documents with `round`, `loop`, `result`, `botVotes`, human `vote` documents), so a
recorded run can be replayed without spending the vote budget.

## Current state

- `web/src/app/incidents/[slug]/page.tsx` groups an incident's rounds by run (`workflowInstanceId`) and loop.
- `web/src/components/Bars.tsx` (split bar), `web/src/components/VarRoomScene.tsx` (VAR room between votes),
  `web/src/app/live/page.tsx` (match view: clip, recommendation, countdown, bars, shootout score).
- Referendum rounds: `regular`, `extraTime`, `shootout1`…`shootout5`; windows 30 / 15 / 10 s.

## Questions to answer

1. What should a replay show per round: the final split only, or an animated fill that mimics the waves
   (`botVotes.waves` is stored, per-wave timing isn't)?
2. Which run is featured? Proposal: the most recent run that reached a shootout, or a run the operator pins (a
   `featured` boolean on the incident — schema change, needs the operator).
3. Where does it live: `/incidents/[slug]?replay=<instanceId>`, or a "Watch a shootout" button on `/live` when idle?
4. How is it labelled so nobody mistakes it for a live vote ("Replay of a real run from <date>")?
5. Speed: real time (≈2 min) or compressed (each round ~5 s)?

## Spike steps

1. Query one real run's rounds (`INCIDENT_QUERY` in `web/src/lib/queries.ts`) and list what's available per round.
2. Prototype `web/src/components/Replay.tsx` on branch `advisor/012-spike-shootout-replay` that steps through a run's
   rounds with the existing `Bars` and a round label, compressed to ~5 s per round.
3. Mount it behind `?replay=` on the incident page only.
4. Write `plans/012-spike-shootout-replay-FINDINGS.md`: screenshots or a description, answers to the questions, an
   effort estimate for shipping, and a recommendation (ship / don't).

**Verify**: `pnpm verify` → exit 0 on the spike branch.

## Out of scope

Changing the workflow, the crowd, or the live screen's behaviour; schema changes (propose them in the findings).

## STOP conditions

- No stored run has reached a shootout (nothing to replay). Report; the operator can create one during the dress rehearsal.
