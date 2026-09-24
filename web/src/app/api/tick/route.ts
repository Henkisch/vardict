import {closeWindow, liveInstances} from 'workflows/runtime'

import {clientKey, getRuntime, rateLimited} from '@/lib/runtime'

// Closes the live vote window once its time is up. Called by /live when the countdown hits zero, by the VAR
// Room and by the bot crowd. Too early or twice is harmless: closeWindow checks the clock and the stage.
export async function POST(request: Request) {
  if (rateLimited(`tick:${clientKey(request)}`, 30, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429})
  }
  const runtime = getRuntime()
  const [live] = await liveInstances(runtime)
  if (!live) return Response.json({status: 'idle'})
  const result = await closeWindow(runtime, live._id)
  return Response.json({instanceId: live._id, ...result})
}
