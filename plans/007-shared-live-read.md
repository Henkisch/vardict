# Plan 007: All screens share one cached read, so viewers can't exhaust the Sanity quota

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/lib/live.ts web/src/lib/queries.ts web/src/app/api/live web/src/app/incidents`
> Plan 006 is expected to have changed `live.ts` (phase-based polling, response ordering). Compare the
> `useLiveQuery` fetch call with the excerpt below; if the fetch itself changed, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — freshness of the live screen must stay within ~2 s.
- **Depends on**: plans/006-live-state-logic.md (so the two don't conflict in `live.ts`)
- **Category**: perf
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The Sanity project is on the Free plan: **250,000 API requests per month, hard cap**. At 100% every request fails
with HTTP 402 and the site stops loading until the 1st of next month (UTC). Today every browser tab queries Sanity
directly, uncached: about 1,200 requests/hour per tab during a vote and 450/hour idle. **One idle tab left open for a
month is ~324k requests — over the whole quota.** A judging window runs for weeks after Oct 4. Routing all screens
through one server route with a 1–2 s shared cache makes Sanity cost scale with time, not with viewers, and a slow
"asleep" cadence stops forgotten tabs from draining it.

## Current state

- `web/src/lib/live.ts` — browsers read Sanity directly:
  ```ts
  export const client = createClient({...config, useCdn: false})
  const FAST_POLL_MS = 3_000
  const IDLE_POLL_MS = 8_000
  ...
  const response = await client
    .fetch<T>(query, JSON.parse(key), {filterResponse: false, lastLiveEventId})
  ```
  Plus a `client.live.events()` subscription that reloads on matching sync tags (those events arrive 5–20 s late;
  measured). The Sanity API CDN also lags 5–20 s, which is why reads are uncached today.
- Callers: `web/src/app/live/page.tsx` (`useLiveState(LIVE_QUERY)`) and `web/src/app/incidents/[slug]/page.tsx`
  (`useLiveQuery(INCIDENT_QUERY, {slug})`). `/vote` redirects to `/live`.
- Queries: `web/src/lib/queries.ts` exports `LIVE_QUERY` (no params) and `INCIDENT_QUERY` (param `$slug`).
- Server-side Sanity access lives in `web/src/lib/runtime.ts` (`getRuntime().content` is a token-bearing client,
  server-only via `import 'server-only'`). The production dataset is public, so the route can use a token-free client
  instead; prefer a token-free `createClient({projectId, dataset, apiVersion: '2026-03-01', useCdn: false})` for reads.
- Next.js 16.3.6. Per `web/AGENTS.md`: "This version has breaking changes… Read the relevant guide in
  `node_modules/next/dist/docs/` before writing any code." Relevant: `web/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  (route handlers are not cached by default; GET can opt in). Hosting is Vercel; Vercel's CDN caches responses that
  send `Cache-Control: public, s-maxage=N` (or `CDN-Cache-Control`). Verify against current Vercel docs before relying on it.
- Existing route style: `web/src/app/api/tick/route.ts` (small `POST` handler returning `Response.json(...)`, CORS
  headers from `web/src/lib/runtime.ts`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck/lint | `pnpm --filter web typecheck && pnpm --filter web lint` | exit 0 |
| Build | `pnpm --filter web build` | exit 0; `/api/live` listed as a route |
| All | `pnpm verify` | exit 0 |

## Suggested executor toolkit

- If available, use the `vercel:cdn-caching` or `vercel:nextjs` skill when choosing cache headers.

## Scope

**In scope**: `web/src/app/api/live/route.ts` (create), `web/src/lib/live.ts`, `web/src/app/incidents/[slug]/page.tsx`
(poll cadence only).

**Out of scope**: `web/src/lib/queries.ts` query text (keep queries identical; the route runs them server-side),
`/api/tick`, `/api/vote`, the workflow runtime.

## Git workflow

Branch `advisor/007-shared-live-read`. Imperative subjects. No push — **a push to `main` deploys production**; the
operator verifies the cache on a deployment.

## Steps

### Step 1: A cached read route

Create `web/src/app/api/live/route.ts` with `GET(request)`:
- `?q=live` → run `LIVE_QUERY`; `?q=incident&slug=<slug>` → run `INCIDENT_QUERY` with `{slug}`. Reject anything else
  with 400. Validate `slug` with `/^[a-z0-9-]{1,96}$/`.
- Response: `Response.json(result, {headers})` with
  - live and a referendum is open or counting (`result.referendum && !result.referendum.result`):
    `Cache-Control: public, s-maxage=1, stale-while-revalidate=1`
  - otherwise: `Cache-Control: public, s-maxage=5, stale-while-revalidate=5`
  - incident: `s-maxage=10, stale-while-revalidate=30`
- Use a token-free client (`useCdn: false`). No CORS needed (same origin).

**Verify**: `pnpm --filter web build` → exit 0 and the route table lists `ƒ /api/live`.

### Step 2: Browsers read through the route

In `web/src/lib/live.ts`, change `useLiveQuery` to take a **route URL** instead of GROQ:
`useLiveQuery<T>(url: string, {fast})` fetching `fetch(url).then(r => r.ok ? r.json() : undefined)`. Keep plan 006's
request ordering and phase-based cadence. Remove the `client.live.events()` subscription (the shared cache makes
polling cheap; events are late anyway) and the `@sanity/client` browser client if nothing else imports it
(`grep -rn "from '@/lib/live'" web/src` first — the exported `client` may be unused).

Update callers: `/live` → `useLiveState('/api/live?q=live')`; incident page → `useLiveQuery(\`/api/live?q=incident&slug=${slug}\`)`.

**Verify**: typecheck + lint exit 0; `grep -rn "useCdn" web/src/lib/live.ts` → nothing.

### Step 3: Forgotten tabs go to sleep

In `useLiveQuery`, track the time of the last user interaction (`pointerdown`, `keydown`) and the last phase change.
If neither happened for 5 minutes and the phase is `decided` or `parked` (nothing live), poll every **60 s** instead of
8 s. Any interaction or phase change wakes it. Hidden tabs keep not polling.

**Verify**: typecheck + lint exit 0.

### Step 4: Incident pages poll slowly

`/incidents/[slug]` → poll every 30 s (it's a record, not a live screen).

**Verify**: `pnpm verify` → exit 0.

### Step 5: Confirm the cache on a deployment (operator-run)

After the operator deploys (preview or production), run twice within a second:
`curl -sI https://<host>/api/live?q=live | grep -i -E "cache-control|x-vercel-cache"` → the second shows
`x-vercel-cache: HIT` (or `STALE`). Report the output. If it's always `MISS`, STOP (see below).

## Test plan

No web test runner exists (plan 006 may have added vitest; if so, add a test that the route rejects bad `q`/`slug`).
Otherwise: build, and step 5's header check.

## Done criteria

- [ ] `pnpm verify` exits 0
- [ ] `grep -rn "client.fetch" web/src/app web/src/components` → nothing (browsers no longer query Sanity)
- [ ] `/api/live` exists with the cache headers above
- [ ] Only in-scope files modified; `plans/README.md` updated
- [ ] Step 5 output included in the report (or marked "not deployed yet")

## STOP conditions

- Vercel doesn't cache the route response (always `MISS`) even with `s-maxage`. Report the headers; don't add a custom
  cache layer.
- The `/live` screen visibly lags more than ~2 s behind the countdown in a manual check. Report the observed lag.
- Next.js 16 requires a config change (e.g. `cacheComponents`) to allow the headers. Report; don't enable new
  framework features.

## Maintenance notes

- Sanity load is now ≈ one request per `s-maxage` window while anyone watches, independent of viewer count. Vercel
  function invocations rise instead (cheap, but billed on the Pro team — see CLAUDE.md "Cost guards").
- If the route ever gets auth or per-viewer data, the `public` cache headers must go.
