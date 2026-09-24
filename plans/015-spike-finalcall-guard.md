# Plan 015 (design spike): Declare the `finalCall` guard in the workflow

> **Executor instructions**: A spike. Read the current Workflows docs, prototype on a branch with bench tests, and
> report whether to ship. **Deploying a new definition version is the operator's call.** Update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/definitions/peoplesVar.ts workflows/definitions/peoplesVar.test.ts`

## Status

- **Priority**: P3
- **Effort**: S (coarse)
- **Risk**: LOW (guards are advisory in early access)
- **Depends on**: plans/002-runtime-test-seam.md
- **Category**: direction
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The brief says "Guard: incident.finalCall cannot be set until the workflow reaches Upheld", but no guard is declared;
only the Studio field is read-only. Sanity Workflows guards are **advisory in early access** (the Content Lake doesn't
enforce them yet), but declaring one uses another Workflows feature the contest judges care about, and the post can
say honestly "declared, simulated in tests, enforced once the Lake supports it".

## Current state

- `workflows/definitions/peoplesVar.ts` — no `guards` on any stage. The final call is written by the `finalize-*`
  effect handlers (`workflows/runtime.ts`), fired from the stage that decides the vote (a terminal stage can't run
  actions). The subject is the incident (`subject` field, type `incident`).
- Workflows packages pinned **exactly** at 0.35.0 (`@sanity/workflow-engine`, `@sanity/workflow-cli`,
  `@sanity/workflow-engine-test`). Don't upgrade.
- Test bench supports guard simulation: `bench.activeGuardsForDocument(id)` and `bench.editDocument({documentId,
  patch})` throws `GuardDeniedError` (docs: https://www.sanity.io/docs/workflows/testing.md, section "Test guard
  enforcement"; guards: https://www.sanity.io/docs/workflows/guards.md).
- Deploying a changed definition creates version 3 (`pnpm --filter workflows deploy`); running instances stay pinned to
  their version.

## Questions to answer

1. Where should the guard live? A guard is active while an instance occupies a stage. "Deny `finalCall` changes while
   in `varRoom`, `referendum`, `extraTime`, `shootout`" matches the brief, but the `finalize-*` effect writes
   `finalCall` from a vote stage. Does a guard block the workflow's own effect? (Read the guards doc on who is exempt.)
2. Does `delta::changedAny(finalCall)` (or the 0.35 equivalent) express "finalCall didn't change"?
3. Does adding guards change `expectedMinReaderModel` (currently 10 in `workflows/sanity.workflow.ts`)?

## Spike steps

1. Read the two docs above (append `.md` to any Sanity docs URL for markdown).
2. On branch `advisor/015-spike-finalcall-guard`, add a guard to the vote stages; add bench tests in
   `workflows/definitions/peoplesVar.test.ts`: editing `finalCall` on the subject during `referendum` throws
   `GuardDeniedError`; after `upheld` it's allowed; the finalize effect still completes.
3. `pnpm --filter workflows test` and `pnpm --filter workflows check` → pass.
4. Write `plans/015-spike-finalcall-guard-FINDINGS.md`: answers, test results, and a one-paragraph recommendation.
   Don't deploy.

## STOP conditions

- The guard blocks the workflow's own `finalize` effect with no documented exemption — report; don't work around it.
- `pnpm --filter workflows check` fails after adding the guard.
