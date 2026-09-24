import 'server-only'

import {createHash} from 'node:crypto'
import {after} from 'next/server'
import {createRuntime, type Runtime} from 'workflows/runtime'

let runtime: Runtime | undefined

// Proves a /api/crowd call came from this server. Derived from the write token, so there's no extra secret.
export const crowdKey = () => createHash('sha256').update(`crowd:${process.env.SANITY_WRITE_TOKEN}`).digest('hex')

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
  after(async () => {
    const response = await fetch(`${base}/api/crowd`, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-crowd-key': crowdKey()},
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
