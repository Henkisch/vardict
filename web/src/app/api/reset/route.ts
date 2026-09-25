import {wipeRunData} from 'workflows/runtime'

import {CORS, getRuntime, isOperator, preflight, readJson} from '@/lib/runtime'

// The booth's "Full wipe" (Stockley Park): deletes every vote and referendum, aborts live runs and clears every
// finalCall. Content is never deleted (see RUN_DATA_TYPES). Operator only, and the body must say {"confirm": "WIPE"}
// so no stray request can trigger it.
export async function POST(request: Request) {
  if (!isOperator(request)) return Response.json({status: 'forbidden'}, {status: 403, headers: CORS})
  const parsed = await readJson<{confirm?: unknown}>(request, {headers: CORS})
  if ('error' in parsed) return parsed.error
  if (parsed.body.confirm !== 'WIPE') return Response.json({status: 'unconfirmed'}, {status: 400, headers: CORS})
  try {
    const result = await wipeRunData(getRuntime())
    return Response.json(result, {status: result.status === 'busy' ? 409 : 200, headers: CORS})
  } catch (error) {
    console.error('wipe failed', error)
    return Response.json({status: 'error'}, {status: 500, headers: CORS})
  }
}

export const OPTIONS = preflight
