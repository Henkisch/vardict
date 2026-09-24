import {timingSafeEqual} from 'node:crypto'
import {after} from 'next/server'
import {runCrowd} from 'workflows/runtime'

import {crowdKey, getRuntime, paused, readJson} from '@/lib/runtime'

// A round is at most 45 s (30 s + one 15 s extension) plus closing.
export const maxDuration = 90

// Runs one referendum's bot crowd, then closes the window. Internal: called by this server when a round opens.
// Safe to repeat: waves are numbered on the referendum's counters, so a restarted crowd only adds missing waves.
export async function POST(request: Request) {
  const off = paused()
  if (off) return off
  const expected = crowdKey()
  if (!expected) return Response.json({status: 'unavailable'}, {status: 503})
  // timingSafeEqual needs equal-length buffers, so the length check (and a missing header) is checked first.
  const provided = request.headers.get('x-crowd-key') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({status: 'forbidden'}, {status: 403})
  const parsed = await readJson<{referendumId?: unknown}>(request)
  if ('error' in parsed) return parsed.error
  const {referendumId} = parsed.body
  if (typeof referendumId !== 'string' || !referendumId.startsWith('referendum-')) {
    return Response.json({status: 'invalid'}, {status: 400})
  }
  after(() => runCrowd(getRuntime(), referendumId))
  return Response.json({status: 'started', referendumId}, {status: 202})
}
