import 'server-only'

import {createHmac, timingSafeEqual} from 'node:crypto'
import {after} from 'next/server'
import {createRuntime, type Runtime} from 'workflows/runtime'

let runtime: Runtime | undefined

// Proves a /api/crowd call came from this server. Derived from the write token, so there's no extra secret
// to configure - undefined (never a guessable fallback) when the token itself is unset.
export function crowdKey() {
  const token = process.env.SANITY_WRITE_TOKEN
  return token ? createHmac('sha256', token).update('vardict-crowd').digest('hex') : undefined
}

// Where this deployment can reach itself. Preview URLs sit behind Vercel's login, so they run the crowd in-process.
function selfUrl() {
  if (process.env.VERCEL_ENV === 'production') return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_ENV) return undefined
  return `http://localhost:${process.env.PORT ?? 3000}`
}

// Each round's crowd gets its own request: one function dying mid-crowd can't strand the rest of the run
// (a chained crowd stopped at 55 of 60 votes on Vercel, session 3).
function startCrowdElsewhere(referendumId: string) {
  const base = selfUrl()
  const key = crowdKey()
  if (!key) return console.error('crowd start skipped: SANITY_WRITE_TOKEN unset', referendumId)
  after(async () => {
    const response = await fetch(`${base}/api/crowd`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-crowd-key': key},
      body: JSON.stringify({referendumId}),
    }).catch((error: unknown) => error)
    if (!(response instanceof Response) || !response.ok) console.error('crowd start failed', referendumId, response)
  })
}

// One engine per server instance. Holds the write token, so this module must never reach the browser.
export function getRuntime() {
  runtime ??= createRuntime({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    contentDataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    workflowsDataset: process.env.SANITY_WORKFLOWS_DATASET,
    token: process.env.SANITY_WRITE_TOKEN!,
    background: (task) => after(task),
    startCrowd: selfUrl() ? startCrowdElsewhere : undefined,
  })
  return runtime
}

// A small in-memory limiter per client. Good enough for a demo: serverless instances each keep their own,
// so it slows abuse down rather than stopping it.
const hits = new Map<string, number[]>()
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > limit
}

export const clientKey = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local'

// A "simple" cross-site POST needs no CORS preflight and can't set a custom content-type, so rejecting
// anything that isn't declared application/json blocks another site's form from voting through a visitor's
// browser. Also bounds body size before JSON.parse touches it. `headers` lets start/tick's error responses
// carry CORS; same-origin routes (vote, crowd) pass none.
export async function readJson<T = Record<string, unknown>>(
  request: Request,
  maxBytes = 1024,
  headers: HeadersInit = {},
): Promise<{body: T} | {error: Response}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.startsWith('application/json')) {
    return {error: Response.json({status: 'unsupportedType'}, {status: 415, headers})}
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBytes) {
    return {error: Response.json({status: 'tooLarge'}, {status: 413, headers})}
  }
  const text = await request.text()
  if (text.length > maxBytes) {
    return {error: Response.json({status: 'tooLarge'}, {status: 413, headers})}
  }
  try {
    return {body: JSON.parse(text) as T}
  } catch {
    return {error: Response.json({status: 'invalid'}, {status: 400, headers})}
  }
}

// True only for a request carrying the shared operator secret (the VAR Room, which ships it in its bundle -
// served only to logged-in org members). Public callers of /api/start (judges pressing "Send to the people")
// never send this header, so they can never pick an incident, only take "next in line". `timingSafeEqual`
// needs equal-length buffers, so a length mismatch (including VARDICT_OPERATOR_KEY being unset, which would
// otherwise compare a header against an empty string) is checked first and just fails closed.
export function isOperator(request: Request): boolean {
  const expected = process.env.VARDICT_OPERATOR_KEY
  if (!expected) return false
  const provided = request.headers.get('x-operator-key')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// /api/start and /api/tick are public (judges press the button), and the VAR Room calls them from the Sanity
// Dashboard's origin, so they answer any origin. No cookies or credentials are involved.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-operator-key',
}
export const preflight = () => new Response(null, {status: 204, headers: CORS})

// Kill switch: set VARDICT_PAUSED=1 in Vercel to stop new runs, votes and crowds without a deploy.
// Windows already open can still be closed, so nothing is left hanging.
export const paused = () =>
  process.env.VARDICT_PAUSED === '1'
    ? Response.json({status: 'paused'}, {status: 503, headers: CORS})
    : undefined
