import {startNext} from 'workflows/runtime'

import {clientKey, CORS, getRuntime, preflight, rateLimited} from '@/lib/runtime'

// The bot crowd keeps running after the response: a full run (regular, extra time, 5 shootout rounds) is ~2 min.
export const maxDuration = 300

// "Send to the people": starts the next incident's referendum, or sends a run that was overturned back to the
// people. One live vote at a time. Public on purpose, so judges can test without a Sanity login.
export async function POST(request: Request) {
  if (rateLimited(`start:${clientKey(request)}`, 3, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429, headers: CORS})
  }
  const body = (await request.json().catch(() => ({}))) as {incidentId?: unknown}
  const pick = typeof body.incidentId === 'string' ? body.incidentId : undefined

  const result = await startNext(getRuntime(), pick)
  const status = result.status === 'busy' ? 409 : result.status === 'coolingDown' ? 429 : 200
  return Response.json(result, {status, headers: CORS})
}

export const OPTIONS = preflight
