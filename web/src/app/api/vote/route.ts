import {after} from 'next/server'
import {RULES} from 'workflows/rules'
import {finishEarly} from 'workflows/runtime'

import {clientKey, getRuntime, paused, rateLimited, readJson} from '@/lib/runtime'

// finishEarly runs after the response: the rest of the crowd's waves plus closing, a few seconds.
export const maxDuration = 60

const SESSION = /^[a-zA-Z0-9-]{16,64}$/

// One vote per phone per round. The phone sends a random session id it keeps in localStorage; nothing
// identifying is stored, because the production dataset (and so every vote) is public.
export async function POST(request: Request) {
  const off = paused()
  if (off) return off
  if (rateLimited(`vote:${clientKey(request)}`, 20, 60_000)) {
    return Response.json({status: 'rateLimited'}, {status: 429})
  }
  const parsed = await readJson(request)
  if ('error' in parsed) return parsed.error
  const {referendumId, choice, sessionId} = parsed.body
  if (typeof referendumId !== 'string' || !referendumId.startsWith('referendum-')) {
    return Response.json({status: 'invalid', field: 'referendumId'}, {status: 400})
  }
  if (choice !== 'uphold' && choice !== 'overturn') return Response.json({status: 'invalid', field: 'choice'}, {status: 400})
  if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) {
    return Response.json({status: 'invalid', field: 'sessionId'}, {status: 400})
  }

  const {content} = getRuntime()
  const referendum = await content.fetch<{closesAt: string; result?: string; humans: number; humansToday: number} | null>(
    `*[_type == "referendum" && _id == $id][0]{closesAt, result,
      "humans": count(*[_type == "vote" && referendum._ref == $id && simulated != true]),
      "humansToday": count(*[_type == "vote" && simulated != true && dateTime(castAt) > dateTime(now()) - 60*60*24])}`,
    {id: referendumId},
  )
  if (!referendum) return Response.json({status: 'notFound'}, {status: 404})
  if (referendum.result || Date.now() >= Date.parse(referendum.closesAt)) {
    return Response.json({status: 'closed'}, {status: 409})
  }

  // Caps the documents one round, and one day across all rounds, can create; fresh session ids would
  // otherwise be unlimited, and the Free plan's document count is a hard cap.
  if (referendum.humans >= RULES.maxHumanVotesPerRound) return Response.json({status: 'full'}, {status: 429})
  if (referendum.humansToday >= RULES.maxHumanVotesPerDay) return Response.json({status: 'full'}, {status: 429})

  // The id is the lock: a second vote from the same session in the same round hits the same document.
  // createIfNotExists resolves to the existing document, unchanged, when one is already there (confirmed
  // against the Sanity docs for @sanity/client), so comparing castAt tells voted from alreadyVoted without
  // a second read.
  const id = `vote-${referendumId}-${sessionId}`
  const castAt = new Date().toISOString()
  const doc = await content.createIfNotExists({
    _id: id,
    _type: 'vote',
    referendum: {_type: 'reference', _ref: referendumId},
    choice,
    sessionId,
    simulated: false,
    castAt,
  })
  if (doc.castAt !== castAt) return Response.json({status: 'alreadyVoted', choice: doc.choice}, {status: 409})
  // One judge alone shouldn't wait out the clock: a human vote closes the round now (the rest of the seeded
  // crowd votes at once first). After the response, so the phone gets its confirmation straight away.
  after(() =>
    finishEarly(getRuntime(), referendumId)
      .then(() => undefined)
      .catch((error: unknown) => console.error('finish early failed', referendumId, error)),
  )
  return Response.json({status: 'voted', choice})
}
