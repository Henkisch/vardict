# Plan 001: One command verifies every package (typecheck, lint, tests, workflow check)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected
> result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- package.json workflows/package.json workflows/tsconfig.json web/package.json var-room/package.json studio/package.json`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

VARdict is a pnpm monorepo, and **a `git push` to `main` is a production deploy** (Vercel is connected to the GitHub
repo). There is no single command that proves everything still compiles and passes before a push. `workflows/` has
no `tsconfig.json`, so `workflows/runtime.ts`, `workflows/crowd.ts` and `workflows/scripts/*.ts` are only
type-checked indirectly when the web app's `next build` pulls them in, and vitest does not type-check. Every later
plan uses the command this plan creates as its verification gate.

## Current state

- `package.json` (repo root) — scripts today:
  ```json
  "scripts": {
    "dev:studio": "pnpm --filter studio dev",
    "dev:web": "pnpm --filter web dev",
    "dev:var-room": "pnpm --filter var-room dev",
    "build": "pnpm -r build"
  }
  ```
  (Confirm with `cat package.json`; exact names may differ slightly. If `build` or the `dev:*` scripts look
  different, keep what's there and only add.)
- `workflows/package.json` — scripts: `check` (`sanity-workflows deploy --check`), `deploy`, `test` (`vitest run`).
  No `typecheck`. `"type": "module"`. `exports` maps `./runtime` → `./runtime.ts` and `./rules` →
  `./definitions/peoplesVar.ts`. devDependencies include `@types/node`, `tsx`, `vitest`,
  `@sanity/workflow-engine-test`.
- `workflows/` has **no `tsconfig.json`**. The files that must type-check: `runtime.ts`, `crowd.ts`, `crowd.test.ts`,
  `definitions/peoplesVar.ts`, `definitions/peoplesVar.test.ts`, `sanity.workflow.ts`, `scripts/*.ts`.
  These compile today with:
  `npx tsc --noEmit --module preserve --moduleResolution bundler --target es2023 --strict --skipLibCheck --types node runtime.ts`
  (run from `workflows/`). `scripts/*.ts` use top-level `await` and `process.env`.
- `web/package.json` — scripts `dev`, `build`, `start`, `lint` (`eslint`). No `typecheck`. `web/tsconfig.json` exists.
- `var-room/package.json` — scripts `build`, `deploy`, `dev`, `start`. Has `eslint.config.mjs` and `tsconfig.json`
  but no `lint`/`typecheck` scripts.
- `studio/package.json` — scripts `build`, `deploy`, `deploy-graphql`, `dev`, `start`. Has `eslint.config.mjs` and
  `tsconfig.json`, no `lint`/`typecheck`.
- `functions/package.json` — an unused stub (no code). Leave it alone in this plan.
- `tsc --noEmit` writes `tsconfig.tsbuildinfo` where `incremental` is on; `studio/tsconfig.tsbuildinfo` already exists
  untracked. Check `.gitignore` covers `*.tsbuildinfo`; if it doesn't, add it (that is in scope).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` (repo root) | exit 0 |
| Workflow tests | `pnpm --filter workflows test` | 22 tests pass (2 files) |
| Workflow definition check | `pnpm --filter workflows check` | "1 definition(s) passed validation" |
| Web lint | `pnpm --filter web lint` | exit 0 |

## Scope

**In scope**:
- `package.json` (root) — add scripts
- `workflows/package.json`, `web/package.json`, `var-room/package.json`, `studio/package.json` — add `typecheck` (and
  `lint` where an eslint config exists)
- `workflows/tsconfig.json` (create)
- `.gitignore` (only to add `*.tsbuildinfo` if missing)

**Out of scope**:
- Any source file (`*.ts`, `*.tsx`). If a typecheck fails on real code, STOP (see below) — fixing code is other plans' job.
- Dependency upgrades of any kind. Versions are pinned on purpose; Sanity Workflows 0.x must not be upgraded before Oct 4, 2026.
- CI configuration (`.github/`). Not wanted before the deadline.
- `functions/`.

## Git workflow

- Branch: `advisor/001-verification-baseline` from `main`.
- One commit. Message style from `git log`: plain imperative subject, e.g. `Add a root verify command`, then a blank line
  and a short body.
- Do NOT push. A push to `main` deploys production.

## Steps

### Step 1: Add `workflows/tsconfig.json`

Create:
```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "isolatedModules": true
  },
  "include": ["*.ts", "definitions/**/*.ts", "scripts/**/*.ts"]
}
```

**Verify**: `cd workflows && npx tsc -p tsconfig.json` → exit 0, no output.

### Step 2: Add `typecheck` / `lint` scripts to each package

- `workflows/package.json`: `"typecheck": "tsc -p tsconfig.json"`
- `web/package.json`: `"typecheck": "tsc --noEmit"`
- `var-room/package.json`: `"typecheck": "tsc --noEmit"`, `"lint": "eslint src"`
- `studio/package.json`: `"typecheck": "tsc --noEmit"`, `"lint": "eslint ."` (check `studio/eslint.config.mjs` ignores
  `dist`; if linting `.` reports errors only inside `dist/` or `node_modules/`, use `eslint schemaTypes components structure sanity.config.ts`).

**Verify**: each of these exits 0:
`pnpm --filter workflows typecheck`, `pnpm --filter web typecheck`, `pnpm --filter var-room typecheck`,
`pnpm --filter studio typecheck`, `pnpm --filter var-room lint`, `pnpm --filter studio lint`, `pnpm --filter web lint`.

### Step 3: Add the root `verify` script

In the root `package.json` add:
```json
"typecheck": "pnpm -r --if-present typecheck",
"lint": "pnpm -r --if-present lint",
"test": "pnpm --filter workflows test",
"verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm --filter workflows check"
```

**Verify**: `pnpm verify` → exit 0; output ends with the workflows check line "1 definition(s) passed validation".

### Step 4: Ignore build info files

If `grep -n tsbuildinfo .gitignore` prints nothing, append `*.tsbuildinfo` to the root `.gitignore`.

**Verify**: `git status --short` shows no `*.tsbuildinfo` files.

## Test plan

No new tests — this plan creates the harness. The existing 22 workflow tests must still pass via `pnpm test`.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `workflows/tsconfig.json` exists and `pnpm --filter workflows typecheck` exits 0
- [ ] `git status --short` lists only: root `package.json`, the four package `package.json` files, `workflows/tsconfig.json`, and optionally `.gitignore`
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

- A `typecheck` or `lint` fails on existing source code (not config). Report the exact errors; do not edit source files.
- `pnpm --filter workflows check` fails. That touches the workflow definition, which is out of scope.
- `pnpm install` wants to change versions in `pnpm-lock.yaml` beyond adding nothing (this plan adds no dependencies).

## Maintenance notes

- Every later plan uses `pnpm verify` as its final gate; keep it fast (it currently takes well under a minute).
- If a package is added to `pnpm-workspace.yaml`, give it `typecheck`/`lint` scripts so `pnpm -r --if-present` picks it up.
- Deferred on purpose: CI. Worth adding after Oct 4.
