'use client'

import {createClient} from '@sanity/client'
import {useEffect, useState} from 'react'

// Public, token-free client: the production dataset is public, so browsers read it directly.
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-03-01',
  // Vote counts change every second; don't let a CDN hand out a stale "no vote live".
  useCdn: false,
})

const POLL_MS = 3_000

// Live Content API: fetch with sync tags, refetch when a live event touches them. Polls as well, so a failed
// first fetch or a silent event stream (blockers, proxies) can't leave a screen stuck (session 3).
export function useLiveQuery<T>(query: string, params: Record<string, unknown> = {}) {
  const [data, setData] = useState<T | undefined>()
  const key = JSON.stringify(params)

  useEffect(() => {
    let tags: string[] = []
    let cancelled = false
    const load = async (lastLiveEventId?: string) => {
      const response = await client
        .fetch<T>(query, JSON.parse(key), {filterResponse: false, lastLiveEventId})
        .catch(() => undefined)
      if (cancelled || !response) return
      tags = response.syncTags ?? []
      setData(response.result)
    }
    void load()
    const poll = setInterval(() => void load(), POLL_MS)
    const subscription = client.live.events().subscribe({
      next: (event) => {
        if (event.type === 'message' && event.tags.some((tag) => tags.includes(tag))) void load(event.id)
        if (event.type === 'welcome' || event.type === 'restart' || event.type === 'reconnect') void load()
      },
      error: () => {},
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearInterval(poll)
    }
  }, [query, key])

  return data
}

// Ticks every 250 ms so countdowns stay smooth.
export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return now
}
