# Plan 013: The VAR Room runs in the Sanity Dashboard with operator controls (pick, new season)

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md`. **Deploying the app is an operator decision** — prepare everything, then ask before `sanity deploy`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- var-room web/src/app/api/start/route.ts workflows/runtime.ts`

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/005-start-flow-safe.md (operator key), plans/009-seasons.md
- **Category**: direction
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The contest rewards using the Sanity App SDK with real-time data; VARdict's App SDK app is the **VAR Room**, the
operator's console. It only runs locally today (`pnpm dev:var-room`), so the demo video and screenshots would show
localhost. Deploying it to the organization's Dashboard makes it real. Operator controls (start a specific incident,
start a new season) let the operator reset the demo between judging sessions without scripts.

## Current state

- `var-room/sanity.cli.ts`:
  ```ts
  export default defineCliConfig({app: {organizationId: 'o7aI6GMzu', entry: './src/App.tsx'}})
  ```
  No `deployment.appId` yet (compare `studio/sanity.cli.ts`, which has `deployment: {appId: ...}` after its first deploy).
- `var-room/src/App.tsx` — `SanityApp` with two configs (`production`, `workflows` datasets); components
  `IncidentList` (per-incident "Send to the people" → `sendToThePeople(incidentId)`), `LiveRound` (live split by
  persona), `WorkflowStage` (current run's stage from the private `workflows` dataset).
- `var-room/src/api.ts` — POSTs to `${SANITY_APP_WEB_URL ?? 'https://live-vardict.vercel.app'}/api/start` and `/api/tick`;
  after plan 005 it sends `x-operator-key` from `SANITY_APP_OPERATOR_KEY`.
- App SDK rules (Sanity's maintained guide): wrap data components in `<Suspense>`, one fetching hook per component,
  never set `app.visibility: 'disabled'` (use `'unlisted'` to hide from the sidebar; the link still works). Deploy with
  `npx sanity deploy` from `var-room/`.
- CORS: deployed App SDK apps are served from a Sanity-hosted origin; `/api/start` and `/api/tick` already answer
  `access-control-allow-origin: *` and allow the `x-operator-key` header after plan 005.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build | `pnpm --filter var-room build` | exit 0 |
| All | `pnpm verify` | exit 0 |
| Deploy (operator OK first) | `cd var-room && npx sanity deploy` | prints an app URL; `sanity.cli.ts` gains `deployment.appId` |

## Scope

**In scope**: `var-room/src/**`, `var-room/sanity.cli.ts`, `web/src/app/api/start/route.ts` (accept
`{newSeason: true}` from operators), `workflows/runtime.ts` (a `startNewSeason` export reusing plan 009's logic),
`workflows/runtime.test.ts`.

**Out of scope**: the public `/live` page, the workflow definition, destructive resets (deleting referendums/votes stays
a script).

## Steps

1. **New-season control**: export `startNewSeason(runtime)` from `workflows/runtime.ts` (unset every `finalCall`,
   refuse with `busy` if a run is live). `/api/start` accepts `{newSeason: true}` only with a valid operator key.
   Test in `workflows/runtime.test.ts`. **Verify**: `pnpm --filter workflows test` → pass.
2. **VAR Room UI**: add a "New season" button (with an inline confirm step in the page — the Dashboard iframe may block
   `confirm()`), showing the API's response status. **Verify**: `pnpm --filter var-room typecheck && pnpm --filter var-room build` → exit 0.
3. **Local check (operator)**: `pnpm dev:var-room`, open through the Dashboard with the operator logged in; pick an
   incident and press "Send to the people"; watch the persona table fill. Report what you saw, or mark "needs operator".
4. **Deploy (operator OK)**: ask the operator; then `npx sanity deploy` in `var-room/`; commit the `appId` it writes to
   `sanity.cli.ts`. Leave `visibility` default (listed) unless told otherwise.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] New-season test passes; the button exists
- [ ] Either deployed (app URL in the report, `appId` committed) or explicitly "awaiting operator"

## STOP conditions

- The deployed app can't reach `/api/start` (CORS or mixed content). Report the browser error.
- `sanity deploy` asks interactive questions you can't answer from this plan (app title, hostname). Stop and ask.

## Maintenance notes

- The operator key is in the VAR Room bundle, visible only to org members. Rotate both env values if a member leaves.
