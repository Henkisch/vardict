import {startNext} from 'workflows/runtime'

import {clientKey, CORS, getRuntime, isOperator, paused, preflight, rateLimited, readJson} from '@/lib/runtime'

// The bot crowd keeps running after the response: one round is at most ~75 s (60 s window, plus closing).
export const maxDuration = 300

// Loose enough for a Sanity document id, tight enough to keep this out of a GROQ query as anything but a
// literal string match (startNext parameterizes the query anyway, but this is cheap and catches typos fast).
const INCIDENT_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/

// "Start the VAR check" / "Send to the people": starts the next incident's VAR check, or moves a live run on
// (sends it to the people, or kicks off extra time / the penalty). One live vote at a time. Public on purpose, so judges can test without a Sanity login - but only an
// operator (the VAR Room, carrying the shared secret) may pick which incident. A public caller always gets
// "next in line", so it can't abort a run in progress by naming a different incident.
export async function POST(request: Request) {
  const off = paused()
  if (off) return off
  // A judge alone presses fast: Start the VAR check, Send to the people, Go to extra time, Penalty can be four
  // presses in 30 s (a human vote ends a round early). 12 a minute still stops a script hammering it.
  if (rateLimited(`start:${clientKey(request)}`, 12, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429, headers: CORS})
  }
  const parsed = await readJson<{incidentId?: unknown; step?: unknown}>(request, {headers: CORS, allowEmpty: true})
  if ('error' in parsed) return parsed.error
  const requested = isOperator(request) && typeof parsed.body.incidentId === 'string' ? parsed.body.incidentId : undefined
  if (requested !== undefined && !INCIDENT_ID_PATTERN.test(requested)) {
    return Response.json({status: 'invalid'}, {status: 400, headers: CORS})
  }

  try {
    // {step: 'check'}: start the VAR check only. {step: 'send'}: only move a run that's already live on (never start
    // one straight into a vote). Anyone may press either; neither can skip a step.
    const step = parsed.body.step
    const result = await startNext(getRuntime(), requested, {checkOnly: step === 'check', sendOnly: step === 'send'})
    const status =
      result.status === 'busy'
        ? 409
        : result.status === 'coolingDown' || result.status === 'dailyLimit'
          ? 429
          : result.status === 'unknownIncident'
            ? 400
            : result.status === 'nothingToSend'
              ? 409
              : 200
    return Response.json(result, {status, headers: CORS})
  } catch (error) {
    console.error('start failed', error)
    return Response.json({status: 'error'}, {status: 500, headers: CORS})
  }
}

export const OPTIONS = preflight
