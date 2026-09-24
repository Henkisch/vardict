# Plan 011: The brief matches the code, and shared rules live in one place

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- CLAUDE.md web/src/lib/queries.ts var-room/src workflows/scripts/smoke.ts functions studio/schemaTypes/documents/vote.ts web/.gitignore .env.example`
> Earlier plans change several of these. This plan is **last** on purpose: describe the code as it is when you run it,
> not as this plan describes it.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: run after plans 001–010 (so the docs describe the final state)
- **Category**: docs + tech-debt
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

`CLAUDE.md` is the project brief that every agent session reads first, and `SUBMISSION.md` (the contest post) is
written from it. It has drifted: it still describes a Sanity Function running the bot crowd, CDN-based polling, a
`smoke.ts` "working pattern", and a TODO that's done. Agents in the last days before the Oct 4 deadline would follow
those. Separately, the human vote weight (×20), the call labels and the weighted-tally GROQ are copied between
packages. The weight has already changed once (×10 → ×20); a missed copy makes the VAR Room show a split that
disagrees with the verdict.

## Current state

Verified at the planned commit:
- Duplicates:
  - `web/src/lib/queries.ts:5` `export const HUMAN_VOTE_WEIGHT = 20` and `var-room/src/api.ts:30` (same); the
    source of truth is `workflows/definitions/peoplesVar.ts` `RULES.humanVoteWeight`.
  - `CALL_LABELS` in `web/src/lib/queries.ts:73` and `var-room/src/api.ts:20`.
  - Persona list in `workflows/runtime.ts` (`PERSONAS`), `workflows/crowd.ts`, `var-room/src/components/LiveRound.tsx`,
    `studio/schemaTypes/constants.ts`.
- Importing `workflows/definitions/peoplesVar.ts` into browser code pulls in `@sanity/workflow-engine/define`; a
  dependency-free module is needed for shared constants. `var-room` has no dependency on the `workflows` package yet
  (`web` has `"workflows": "workspace:*"`).
- `workflows/scripts/smoke.ts` starts a `smoke` workflow that no longer exists (`workflows/sanity.workflow.ts` deploys
  only `peoplesVar`). `CLAUDE.md` points to it as "the working pattern".
- `functions/` has only `package.json` + `README.md` (nothing uses it; the crowd runs in the web app's `/api/crowd`).
- `studio/schemaTypes/documents/vote.ts` still models bot votes (`simulated` required, `persona` with custom
  validation, preview "Bot · persona"); bots are counters on the referendum now (`referendum.botVotes`), so votes are
  humans only.
- `web/.gitignore:34` has `.env*`, which ignores `web/.env.example` (so it's not in git). Root `.env.example` lists
  `SANITY_READ_TOKEN` (check `grep -rn SANITY_READ_TOKEN --include=*.ts --include=*.py .` — if unused, drop it).
  Undocumented env vars in code: `VARDICT_PAUSED` (web), `SANITY_APP_WEB_URL` (var-room), and any added by plan 005
  (`VARDICT_OPERATOR_KEY`, `SANITY_APP_OPERATOR_KEY`).
- Stale comments: `workflows/crowd.ts` line 2 ("flagged simulated by the runner"), `web/src/app/api/crowd/route.ts`
  (fixed by plan 004 if run).
- Package READMEs `web/README.md` and `studio/README.md` are stock templates; there is no root `README.md`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| All | `pnpm verify` | exit 0 |
| Schema deploy (operator) | `cd studio && npx sanity schema deploy` | "Deployed 1/1 schemas" — **ask the operator first** |

## Scope

**In scope**: `CLAUDE.md`, `README.md` (create, root), `web/README.md`, `studio/README.md`, `functions/README.md`,
`workflows/shared.ts` (create), `workflows/package.json` (export `./shared`), `web/src/lib/queries.ts`,
`var-room/src/api.ts`, `var-room/package.json` (add `"workflows": "workspace:*"`),
`var-room/src/components/LiveRound.tsx`, `workflows/crowd.ts` (comment only), `workflows/scripts/smoke.ts` (delete),
`studio/schemaTypes/documents/vote.ts`, `web/.gitignore`, `web/.env.example`, `.env.example`, `var-room/.env.example`.

**Out of scope**: `BUILD_LOG.md` (a historical log: never rewrite past entries; you may append one short entry),
`SUBMISSION.md` (the operator owns the post's voice), `pnpm-workspace.yaml` (leave `functions` listed unless removing
it is trivially safe — `pnpm install` must stay clean), any behaviour change.

## Git workflow

Branch `advisor/011-docs-and-constants`. Imperative subjects. No push.

## Steps

### Step 1: Shared constants

Create `workflows/shared.ts` with **no imports**: `HUMAN_VOTE_WEIGHT` (= 20), `CALL_LABELS`, `PERSONAS`, and
`weightedCount(choice: 'uphold' | 'overturn')` returning the GROQ string
`coalesce(botVotes.${choice}, 0) + ${HUMAN_VOTE_WEIGHT} * count(*[_type == "vote" && references(^._id) && choice == "${choice}"])`
(copy it from `web/src/lib/queries.ts`). In `workflows/definitions/peoplesVar.ts`, set
`humanVoteWeight: HUMAN_VOTE_WEIGHT` by importing from `../shared`; run `pnpm --filter workflows check` and confirm the
definition is unchanged ("passed validation"). Export `./shared` in `workflows/package.json`. Replace the copies in
web and var-room with imports; add the workspace dependency to var-room and run `pnpm install`.

**Verify**: `pnpm verify` → exit 0; `grep -rn "HUMAN_VOTE_WEIGHT = " web var-room workflows --include=*.ts --include=*.tsx`
→ only `workflows/shared.ts`.

### Step 2: Remove dead parts

Delete `workflows/scripts/smoke.ts`. Reduce `functions/README.md` to two lines: "Not used. The bot crowd runs in the web
app (`/api/crowd`, Next.js `after()`), because Scheduled Functions can't close 10–30 s windows on the Free plan."

**Verify**: `pnpm verify` → exit 0.

### Step 3: Votes are humans only

In `studio/schemaTypes/documents/vote.ts`: make `simulated` optional and hidden (old documents may still have it),
remove `persona` and its validation, update the file comment and preview. Tell the operator the schema must be
redeployed (`npx sanity schema deploy` and `npx sanity deploy` in `studio/`); do not deploy yourself unless told to.

**Verify**: `pnpm --filter studio typecheck` → exit 0.

### Step 4: Env templates

Add `!.env.example` after `.env*` in `web/.gitignore`. Create `web/.env.example` with the variable **names** used by
`web/src` (`grep -rhn "process.env\.\w*" web/src | sort -u`) and empty values plus one comment each. Same for
`var-room/.env.example` (`SANITY_APP_*`). Drop `SANITY_READ_TOKEN` from the root file if unused.

**Verify**: `git status --short web/.env.example` shows it as new (tracked); `grep -c "=" web/.env.example` ≥ 5; no
value after any `=` (`grep -E "=.+" web/.env.example var-room/.env.example` → nothing except comments).

### Step 5: Bring CLAUDE.md up to date

Edit only statements that are false now. At minimum check and fix:
- **Repo structure**: web routes (include `/api/live`, `/api/crowd` if present), `/functions` line, remove `smoke.ts`
  references.
- **Architecture table**: `/vote` redirects to `/live`; no Functions row for the crowd; sessionId lives in
  `localStorage`, not a cookie; bot votes are counters, not documents.
- **"Still to verify"**: mark answered items (real-time on /live → polling via the shared route).
- **Workflows facts / Workflow section**: runtime exports (`createRuntime`, `startNext`, `closeWindow`, `runCrowd`,
  `liveInstances`), `/api/start`/`/api/tick` exist, the crowd hook is done, test counts.
- **Content model**: `vote` fields; `closesAt` rule enforced in `/api/vote` and the close path (no Function).
- **Simulated crowd**: started by the open effect → `/api/crowd`.
- **Milestones / Risks / Cost guards**: tick what's done; polling numbers match `web/src/lib/live.ts`.
- **Investigate next**: remove items fixed by plans 003–007, keep anything still open.
Keep the file's style: short sentences, tables, bold for decisions.

**Verify**: `grep -n -E "smoke\.ts|Document Function fires|bot Function|API CDN and the Live Content API|TODO in the open handler" CLAUDE.md`
→ nothing.

### Step 6: A root README

Create `README.md` (≤ 60 lines): what VARdict is (one paragraph, reuse the CLAUDE.md pitch), the live URL
`https://live-vardict.vercel.app/live`, packages, how to run each (`pnpm dev:web`, `pnpm dev:studio`,
`pnpm dev:var-room`), `pnpm verify`, the scripts in `workflows/scripts/` (with the warning that they touch the real
project and that `reset.ts` is destructive), the env files, and links to `CLAUDE.md`, `BUILD_LOG.md`. Replace
`web/README.md` and `studio/README.md` with 3–5 line pointers to the root README.

**Verify**: `pnpm verify` → exit 0.

## Test plan

No new tests; `pnpm verify` covers compilation of the constant moves. The workflow check proves the deployed
definition didn't change.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `pnpm --filter workflows check` passes and reports no new definition version would be created (if the CLI prints
  a diff/version, it should be unchanged)
- [ ] Step 1, 4 and 5 greps as stated
- [ ] `plans/README.md` updated; report lists "operator: redeploy Studio schema"

## STOP conditions

- Importing `HUMAN_VOTE_WEIGHT` from `shared.ts` into `peoplesVar.ts` changes the workflow definition's fingerprint
  (the check reports a new version). Then revert that import, keep the literal `20` in `RULES.humanVoteWeight`, and
  add a comment in both files that they must match. Report it.
- `pnpm install` after adding the var-room dependency changes other packages' versions in the lockfile.

## Maintenance notes

- New shared rules go in `workflows/shared.ts` (no imports, safe for browsers).
- CLAUDE.md drift is a recurring risk; the build log is the place for history, CLAUDE.md for the current truth.
