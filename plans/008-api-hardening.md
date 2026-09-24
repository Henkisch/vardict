# Plan 008: The public API routes reject cross-site, oversized and malformed requests and fail cleanly

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/app/api web/src/lib/runtime.ts workflows/definitions/peoplesVar.ts`
> Plan 005 changes `api/start/route.ts` and `lib/runtime.ts` (operator key). Compare with the excerpts below;
> unexpected differences → STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-start-flow-safe.md (same files)
- **Category**: security
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

VARdict's API routes are public by design (judges vote without logging in). A few gaps make abuse cheap:
- `/api/vote` parses any body as JSON regardless of `Content-Type`. That means another website can make its visitors'
  browsers send votes (a "simple" cross-site POST needs no CORS preflight), each from a different IP, which also gets
  past the per-IP limiter.
- Bodies aren't size-limited.
- Thrown errors in `/api/start` and `/api/tick` come back as bare 500s without CORS headers, so the Dashboard's VAR Room
  sees opaque failures.
- There's no global cap on human vote documents. The Free plan's hard limit of 10,000 documents could be filled.
- The internal `/api/crowd` key accepts a guessable value if the token env var is missing.

## Current state

- `web/src/app/api/vote/route.ts` (excerpt):
  ```ts
  export async function POST(request: Request) {
    const off = paused()
    if (off) return off
    if (rateLimited(`vote:${clientKey(request)}`, 20, 60_000)) { return Response.json({status: 'rateLimited'}, {status: 429}) }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const {referendumId, choice, sessionId} = body
    ...
    const referendum = await content.fetch<{closesAt: string; result?: string; humans: number} | null>(
      `*[_type == "referendum" && _id == $id][0]{closesAt, result,
        "humans": count(*[_type == "vote" && referendum._ref == $id && simulated != true])}`, {id: referendumId})
    ...
    if (referendum.humans >= RULES.maxHumanVotesPerRound) return Response.json({status: 'full'}, {status: 429})
    const id = `vote-${referendumId}-${sessionId}`
    const existing = await content.getDocument(id)
    if (existing) return Response.json({status: 'alreadyVoted', choice: existing.choice}, {status: 409})
    await content.createIfNotExists({...})
  ```
- `web/src/app/api/start/route.ts` and `web/src/app/api/tick/route.ts` call `startNext` / `closeWindow` without
  try/catch; `web/src/lib/runtime.ts` exports `CORS` and `preflight`.
- `web/src/lib/runtime.ts:10`:
  `export const crowdKey = () => createHash('sha256').update(\`crowd:${process.env.SANITY_WRITE_TOKEN}\`).digest('hex')`,
  compared with `!==` in `web/src/app/api/crowd/route.ts`.
- `web/src/components/VoteButtons.tsx` sends `headers: {'Content-Type': 'application/json'}` — legitimate clients
  already comply.
- Caps live in `workflows/definitions/peoplesVar.ts` `RULES` (`maxRunsPerDay: 40`, `maxHumanVotesPerRound: 300`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck/lint | `pnpm --filter web typecheck && pnpm --filter web lint` | exit 0 |
| All | `pnpm verify` | exit 0 |

## Scope

**In scope**: `web/src/app/api/{vote,start,tick,crowd}/route.ts`, `web/src/lib/runtime.ts`,
`workflows/definitions/peoplesVar.ts` (**only** adding one constant to `RULES`; `RULES` is read by the runtime, not
by the deployed workflow definition's stages — confirm `maxHumanVotesPerRound` is not referenced inside
`defineWorkflow(...)` before adding a sibling; if adding to `RULES` would change the deployed definition, put the new
constant in `web/src/lib/runtime.ts` instead).

**Out of scope**: Vercel Firewall configuration (dashboard, operator's call), `/api/live` (plan 007), the runtime.

## Git workflow

Branch `advisor/008-api-hardening`. Imperative subjects. No push.

## Steps

### Step 1: JSON only, small bodies

In `web/src/lib/runtime.ts` add `readJson(request, maxBytes = 1024)`: return `{error: Response}` with 415 unless
`content-type` starts with `application/json`; 413 when `content-length` exceeds `maxBytes` or the read text is longer;
otherwise `{body}` from `JSON.parse` (400 on parse error). Include `CORS` headers on these responses for start/tick.
Use it in all four routes.

**Verify**: typecheck/lint exit 0. With a local dev server (optional):
`curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/vote -H 'content-type: text/plain' -d '{}'` → `415`.

### Step 2: Clean failures with CORS

Wrap the bodies of `start` and `tick` in try/catch: `console.error` server-side, return
`Response.json({status: 'error'}, {status: 500, headers: CORS})`. No error message in the response.

**Verify**: typecheck/lint exit 0.

### Step 3: One fewer read per vote, and a global cap

- Drop `content.getDocument(id)` in `/api/vote`: call `createIfNotExists` and compare the returned document's
  `choice`/`_createdAt` to decide `voted` vs `alreadyVoted` (a pre-existing document is returned unchanged).
- Add a global ceiling: `RULES.maxHumanVotesPerDay = 3000` (or a web-local constant, see Scope). In the existing
  referendum query, also count `*[_type == "vote" && simulated != true && dateTime(castAt) > dateTime(now()) - 60*60*24]`;
  at the ceiling return `{status: 'full'}` (429).

**Verify**: typecheck/lint exit 0.

### Step 4: A sturdier crowd key

`crowdKey()`: return `undefined` when `SANITY_WRITE_TOKEN` is unset; otherwise
`createHmac('sha256', token).update('vardict-crowd').digest('hex')`. In `/api/crowd`, respond 503 when the key is
undefined and compare with `timingSafeEqual` on equal-length buffers. Update the caller in `web/src/lib/runtime.ts`
(`startCrowdElsewhere`) to use the same function.

**Verify**: `pnpm verify` → exit 0.

## Test plan

If plan 006 added vitest to `web`, add route tests: vote with `text/plain` → 415; body over 1 KB → 413; crowd without key
→ 403; crowd with key unset → 503. Otherwise, run the optional curl checks against a local dev server and paste outputs.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `grep -n "request.json()" web/src/app/api -r` → nothing (all go through `readJson`)
- [ ] `grep -n "getDocument" web/src/app/api/vote/route.ts` → nothing
- [ ] Only in-scope files modified; `plans/README.md` updated

## STOP conditions

- `createIfNotExists` in the installed `@sanity/client` doesn't return the existing document (so `alreadyVoted` can't
  be detected). Keep `getDocument` and report.
- Adding a constant to `RULES` changes the output of `pnpm --filter workflows check` (the deployed definition). Move it
  to web and report.

## Maintenance notes

- If the VAR Room ever sends non-JSON, it will now get 415 — it currently sends JSON.
- Optional, operator-side: Vercel Firewall rate-limit rules on `/api/tick` and `/api/vote` stop floods before a
  function is invoked. Worth it only if the link spreads beyond judges.
