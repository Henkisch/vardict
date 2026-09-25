import {closeWindow, liveInstances} from 'workflows/runtime'

import {clientKey, CORS, getRuntime, preflight, rateLimited} from '@/lib/runtime'

// The bot crowd keeps running after the response: one round is at most ~75 s (60 s window, plus closing).
export const maxDuration = 300

// Closes the live vote window once its time is up. Called by /live when the countdown hits zero, by the VAR
// Room and by the bot crowd. Too early or twice is harmless: closeWindow checks the clock and the stage.
export async function POST(request: Request) {
  if (rateLimited(`tick:${clientKey(request)}`, 30, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429, headers: CORS})
  }
  try {
    const runtime = getRuntime()
    const [live] = await liveInstances(runtime)
    if (!live) return Response.json({status: 'idle'}, {headers: CORS})
    const result = await closeWindow(runtime, live._id)
    return Response.json({instanceId: live._id, ...result}, {headers: CORS})
  } catch (error) {
    console.error('tick failed', error)
    return Response.json({status: 'error'}, {status: 500, headers: CORS})
  }
}

export const OPTIONS = preflight
