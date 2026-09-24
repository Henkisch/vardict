import {startNext} from 'workflows/runtime'

import {clientKey, CORS, getRuntime, isOperator, paused, preflight, rateLimited, readJson} from '@/lib/runtime'

// The bot crowd keeps running after the response: a full run (regular, extra time, 5 shootout rounds) is ~2 min.
export const maxDuration = 300

// Loose enough for a Sanity document id, tight enough to keep this out of a GROQ query as anything but a
// literal string match (startNext parameterizes the query anyway, but this is cheap and catches typos fast).
const INCIDENT_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/

// "Send to the people": starts the next incident's referendum, or sends a run that was overturned back to the
// people. One live vote at a time. Public on purpose, so judges can test without a Sanity login - but only an
// operator (the VAR Room, carrying the shared secret) may pick which incident. A public caller always gets
// "next in line", so it can't abort a run in progress by naming a different incident.
export async function POST(request: Request) {
  const off = paused()
  if (off) return off
  if (rateLimited(`start:${clientKey(request)}`, 3, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429, headers: CORS})
  }
  const parsed = await readJson<{incidentId?: unknown}>(request, {headers: CORS, allowEmpty: true})
  if ('error' in parsed) return parsed.error
  const requested = isOperator(request) && typeof parsed.body.incidentId === 'string' ? parsed.body.incidentId : undefined
  if (requested !== undefined && !INCIDENT_ID_PATTERN.test(requested)) {
    return Response.json({status: 'invalid'}, {status: 400, headers: CORS})
  }

  try {
    const result = await startNext(getRuntime(), requested)
    const status =
      result.status === 'busy'
        ? 409
        : result.status === 'coolingDown' || result.status === 'dailyLimit'
          ? 429
          : result.status === 'unknownIncident'
            ? 400
            : 200
    return Response.json(result, {status, headers: CORS})
  } catch (error) {
    console.error('start failed', error)
    return Response.json({status: 'error'}, {status: 500, headers: CORS})
  }
}

export const OPTIONS = preflight
