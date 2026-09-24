import {after} from 'next/server'
import {runCrowd} from 'workflows/runtime'

import {crowdKey, getRuntime, paused} from '@/lib/runtime'

// A round is at most 45 s (30 s + one 15 s extension) plus closing.
export const maxDuration = 90

// Runs one referendum's bot crowd, then closes the window. Internal: called by this server when a round opens.
// Safe to repeat: waves are numbered on the referendum's counters, so a restarted crowd only adds missing waves.
export async function POST(request: Request) {
  const off = paused()
  if (off) return off
  if (request.headers.get('x-crowd-key') !== crowdKey()) return Response.json({status: 'forbidden'}, {status: 403})
  const {referendumId} = (await request.json().catch(() => ({}))) as {referendumId?: unknown}
  if (typeof referendumId !== 'string' || !referendumId.startsWith('referendum-')) {
    return Response.json({status: 'invalid'}, {status: 400})
  }
  after(() => runCrowd(getRuntime(), referendumId))
  return Response.json({status: 'started', referendumId}, {status: 202})
}
