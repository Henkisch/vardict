import {createClient} from '@sanity/client'

import {INCIDENT_QUERY, LIVE_QUERY, type IncidentResult, type LiveState} from '@/lib/queries'

// One token-free client per server instance, reused across requests (the dataset is public, so no write
// token belongs here). useCdn: false because the CDN itself lags 5-20 s (measured session 3) - freshness
// comes from this route's own short s-maxage instead.
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-03-01',
  useCdn: false,
})

const SLUG = /^[a-z0-9-]{1,96}$/

// The one read every screen shares. Vercel's CDN caches this response for every viewer for s-maxage seconds,
// so cost scales with time, not with tabs - a stampede of viewers still costs Sanity one read per window.
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url)
  const q = searchParams.get('q')

  if (q === 'live') {
    let result: LiveState
    try {
      result = await client.fetch<LiveState>(LIVE_QUERY)
    } catch (error) {
      console.error('live fetch failed', error)
      return Response.json(null, {status: 502, headers: {'Cache-Control': 'no-store'}})
    }
    const counting = result.referendum && !result.referendum.result
    const cache = counting
      ? 'public, s-maxage=1, stale-while-revalidate=1'
      : 'public, s-maxage=5, stale-while-revalidate=5'
    return Response.json(result, {headers: {'Cache-Control': cache}})
  }

  if (q === 'incident') {
    const slug = searchParams.get('slug') ?? ''
    if (!SLUG.test(slug)) return Response.json({status: 'invalid'}, {status: 400})
    let result: IncidentResult | null
    try {
      result = await client.fetch<IncidentResult | null>(INCIDENT_QUERY, {slug})
    } catch (error) {
      console.error('incident fetch failed', error)
      return Response.json(null, {status: 502, headers: {'Cache-Control': 'no-store'}})
    }
    // A slug that matches nothing is a valid answer (the page shows "No incident called ..."), not an error.
    return Response.json(result, {headers: {'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30'}})
  }

  return Response.json({status: 'invalid'}, {status: 400})
}
