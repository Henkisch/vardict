import {clientKey, getRuntime, rateLimited} from '@/lib/runtime'

const SESSION = /^[a-zA-Z0-9-]{16,64}$/

// One vote per phone per round. The phone sends a random session id it keeps in localStorage; nothing
// identifying is stored, because the production dataset (and so every vote) is public.
export async function POST(request: Request) {
  if (rateLimited(`vote:${clientKey(request)}`, 20, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429})
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const {referendumId, choice, sessionId} = body
  if (typeof referendumId !== 'string' || !referendumId.startsWith('referendum-')) {
    return Response.json({status: 'invalid', field: 'referendumId'}, {status: 400})
  }
  if (choice !== 'uphold' && choice !== 'overturn') return Response.json({status: 'invalid', field: 'choice'}, {status: 400})
  if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) {
    return Response.json({status: 'invalid', field: 'sessionId'}, {status: 400})
  }

  const {content} = getRuntime()
  const referendum = await content.fetch<{closesAt: string; result?: string} | null>(
    '*[_type == "referendum" && _id == $id][0]{closesAt, result}',
    {id: referendumId},
  )
  if (!referendum) return Response.json({status: 'notFound'}, {status: 404})
  if (referendum.result || Date.now() >= Date.parse(referendum.closesAt)) {
    return Response.json({status: 'closed'}, {status: 409})
  }

  // The id is the lock: a second vote from the same session in the same round hits the same document.
  const id = `vote-${referendumId}-${sessionId}`
  const existing = await content.getDocument(id)
  if (existing) return Response.json({status: 'alreadyVoted', choice: existing.choice}, {status: 409})
  await content.createIfNotExists({
    _id: id,
    _type: 'vote',
    referendum: {_type: 'reference', _ref: referendumId},
    choice,
    sessionId,
    simulated: false,
    castAt: new Date().toISOString(),
  })
  return Response.json({status: 'voted', choice})
}
