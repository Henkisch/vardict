# Plan 005: Starting a run is serialized, idempotent, and only the operator can pick an incident

> **Executor instructions**: Follow the steps, run every verification, honour the STOP conditions, update this plan's
> row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- workflows/runtime.ts workflows/runtime.test.ts web/src/app/api/start/route.ts web/src/lib/runtime.ts var-room/src/api.ts var-room/.env.example web/.env.example .env.example`
> Plans 002–004 change `runtime.ts`; compare `startNext`/`sendToThePeople` with the excerpts below; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — this is the button judges press.
- **Depends on**: plans/002-runtime-test-seam.md (tests), plans/003-close-window-robust.md
- **Category**: bug + security
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

`POST /api/start` is public on purpose (judges start votes without logging in) and answers any origin (the private
"VAR Room" operator console in the Sanity Dashboard calls it too). Two problems:
1. **Anyone can pass any `incidentId`.** A pick that differs from the run parked in the VAR room **aborts** that run and
   skips the cooldown; a nonexistent or non-incident id can start a run that wedges the demo.
2. **Starting isn't atomic.** `startInstance` → `fireAction('recommend')` → `drainEffects` are three calls with no
   idempotency and no lock. Two presses at once, or a failure between the calls, leave a fresh run parked in the
   VAR room without `recommend`; the screen shows a different incident than the one the next press starts.

## Current state

- `workflows/runtime.ts` — `sendToThePeople` (~lines 122-133):
  ```ts
  export async function sendToThePeople({engine, projectId, contentDataset}: Runtime, incidentId: string) {
    const {instance} = await engine.startInstance({definition: DEFINITION, initialFields: [
      {type: 'subject', name: 'subject', value: {id: `dataset:${projectId}:${contentDataset}:${incidentId}`, type: 'incident'}},
    ]})
    await engine.fireAction({instanceId: instance._id, activity: 'review', action: 'recommend'})
    await engine.drainEffects({instanceId: instance._id})
    return instance._id
  }
  ```
- `workflows/runtime.ts` — `startNext(runtime, pick?)` (~lines 244-283): gets the newest unfinished instance
  (`liveInstances`); `busy` if it's in a voting stage; if `pick` differs from its subject → `abortInstance` and
  **skip** the 10 s cooldown (`if (!replacing && since < START_COOLDOWN_SECONDS)`); else fires `recommend` on the
  parked run. Then cooldown check, then the 24 h cap (`RULES.maxRunsPerDay` = 40, **after** the abort), then
  `incidentId = pick ?? <next in line GROQ>`, then `sendToThePeople`.
- `web/src/app/api/start/route.ts`:
  ```ts
  const body = (await request.json().catch(() => ({}))) as {incidentId?: unknown}
  const pick = typeof body.incidentId === 'string' ? body.incidentId : undefined
  const result = await startNext(getRuntime(), pick)
  ```
- `web/src/lib/runtime.ts` — `CORS` headers (`access-control-allow-origin: *`, methods `POST, OPTIONS`, headers
  `content-type`), `paused()`, `rateLimited()`, `clientKey()`.
- `var-room/src/api.ts` — the operator console's client: `sendToThePeople(incidentId?)` POSTs
  `{incidentId}` to `${WEB_URL}/api/start` where `WEB_URL = process.env.SANITY_APP_WEB_URL ?? 'https://live-vardict.vercel.app'`.
  App SDK apps expose env vars prefixed `SANITY_APP_` to the bundle; the bundle is only served to logged-in members
  of the Sanity organization.
- Env conventions: secrets live in gitignored `.env.local` files; `.env.example` files document names with empty
  values. Never commit a value.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `pnpm --filter workflows test` | all pass |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `workflows/runtime.ts` (`startNext`, `sendToThePeople`, a new start lock), `workflows/runtime.test.ts`,
`web/src/app/api/start/route.ts`, `web/src/lib/runtime.ts` (operator-key helper), `var-room/src/api.ts`,
`web/.env.example` (see note), `var-room/.env.example` (create), root `.env.example`.

Note: `web/.gitignore` currently ignores `.env*`, so `web/.env.example` isn't tracked. Plan 011 fixes that; in this
plan, add the new variable names to the **root** `.env.example` and create `var-room/.env.example`.

**Out of scope**: the workflow definition, `closeWindow`, `/live` UI (the public button sends no `incidentId` and
keeps working), setting real env values in Vercel or Sanity (the operator does that — list it in your report).

## Git workflow

Branch `advisor/005-start-flow-safe`. Imperative commit subjects. No push.

## Steps

### Step 1: Only an operator can pick

- `web/src/lib/runtime.ts`: add `isOperator(request)` — true when `request.headers.get('x-operator-key')` equals
  `process.env.VARDICT_OPERATOR_KEY` (non-empty), compared with `crypto.timingSafeEqual` on equal-length buffers;
  false when the env var is unset.
- Add `x-operator-key` to `CORS['access-control-allow-headers']`.
- `web/src/app/api/start/route.ts`: accept `incidentId` only when `isOperator(request)`; otherwise ignore it (public
  callers always get "next in line"). Validate a picked id with `/^[a-zA-Z0-9._-]{1,64}$/`, else 400
  `{status: 'invalid'}`.
- `var-room/src/api.ts`: send `x-operator-key: process.env.SANITY_APP_OPERATOR_KEY` when set.
- Document `VARDICT_OPERATOR_KEY=` in the root `.env.example` and `SANITY_APP_OPERATOR_KEY=` /
  `SANITY_APP_WEB_URL=` in `var-room/.env.example`, each with a one-line comment.

**Verify**: `pnpm verify` → exit 0.

### Step 2: Validate the pick in `startNext`

Before any abort, check `*[_type == "incident" && _id == $id && !(_id in path("drafts.**"))][0]._id` returns the
pick; if not, return a new result `{status: 'unknownIncident'}` (add it to `StartResult`; map it to HTTP 400 in the
route).

**Verify**: test "an unknown pick changes nothing": with a run parked in the VAR room, `startNext(runtime, 'nope')` →
`unknownIncident`, and the parked instance is still unfinished.

### Step 3: Checks before side effects

Reorder `startNext`: compute `busy`, cooldown and the 24 h cap **before** aborting anything. A replacing pick no
longer skips the cooldown.

**Verify**: test "a pick at the daily cap doesn't abort the parked run" (seed 40 instances' worth of `startedAt` in the
last 24 h — or set `RULES`-driven cap via a small test-only override if seeding instances is impractical; report
which you used).

### Step 4: Serialize starts with a lock document

Add `acquireStartLock(runtime)`: `createIfNotExists({_id: 'vardict-start-lock', _type: 'startLock', lockedUntil:
<epoch ISO>})`, then read `_rev, lockedUntil`; if `lockedUntil > now` return false; else
`patch(...).set({lockedUntil: now + 15 s}).ifRevisionId(_rev).commit()` → true on success, false on conflict.
`startNext` returns `busy` (with `stage: 'starting'`) when the lock isn't acquired, and releases it (set
`lockedUntil` to now) in a `finally`.

**Verify**: test "two simultaneous starts create one run": `Promise.all([startNext(r), startNext(r)])` → exactly one
`started`, the other `busy`; one unfinished instance.

### Step 5: Idempotent recommend

In `sendToThePeople` and in the parked-run branch of `startNext`, pass
`idempotencyKey: \`recommend-${instanceId}-${visits}\`` to the `recommend` `fireAction`, where `visits` is the number
of `varRoom` entries in `instance.stages` (read the instance first). Wrap the fire in try/catch: on failure, leave the
instance for the next press (it will be `recommended`), and return `{status: 'busy', stage: 'starting'}` instead of
throwing.

**Verify**: test "a failed recommend is recovered by the next press": make the first `fireAction('recommend')` throw
(wrap the engine), then `startNext` again → `recommended` on the same instance.

## Test plan

In `workflows/runtime.test.ts`, as listed per step. Model on the plan-002 tests.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] New tests (unknown pick, cap before abort, concurrent starts, recommend recovery) pass
- [ ] `curl -s -X POST localhost:3000/api/start -H 'content-type: application/json' -d '{"incidentId":"x"}'` against a local
  dev server with no `VARDICT_OPERATOR_KEY` behaves exactly like a start without a pick (optional manual check; skip if
  no local env)
- [ ] Only in-scope files modified; `plans/README.md` updated
- [ ] Report lists the env vars the operator must set: `VARDICT_OPERATOR_KEY` (Vercel), `SANITY_APP_OPERATOR_KEY` (var-room `.env`)

## STOP conditions

- The engine's `fireAction` doesn't accept `idempotencyKey` for `recommend` (type error or runtime rejection).
- The lock document can't be created in the public `production` dataset with the write token.
- The VAR Room turns out to need picks without a key in some flow you find in `var-room/src/**`.

## Maintenance notes

- The operator key ships in the VAR Room bundle, which only org members can load. Rotate it by changing both env vars.
- `vardict-start-lock` is a single tiny document; `scripts/reset.ts` doesn't need to delete it.
- Plan 009 (seasons) builds on `startNext`'s new ordering.
