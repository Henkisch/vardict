import {startNext} from 'workflows/runtime'

import {clientKey, getRuntime, rateLimited} from '@/lib/runtime'

// "Send to the people": starts the next incident's referendum, or sends a run that was overturned back to the
// people. One live vote at a time. Public on purpose, so judges can test without a Sanity login.
export async function POST(request: Request) {
  if (rateLimited(`start:${clientKey(request)}`, 3, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429})
  }
  const body = (await request.json().catch(() => ({}))) as {incidentId?: unknown}
  const pick = typeof body.incidentId === 'string' ? body.incidentId : undefined

  const result = await startNext(getRuntime(), pick)
  const status = result.status === 'busy' ? 409 : result.status === 'coolingDown' ? 429 : 200
  return Response.json(result, {status})
}
