import 'server-only'

import {createRuntime, type Runtime} from 'workflows/runtime'

let runtime: Runtime | undefined

// One engine per server instance. Holds the write token, so this module must never reach the browser.
export function getRuntime() {
  runtime ??= createRuntime({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    contentDataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    workflowsDataset: process.env.SANITY_WORKFLOWS_DATASET,
    token: process.env.SANITY_WRITE_TOKEN!,
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
