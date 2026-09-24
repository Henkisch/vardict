'use client'

import {createClient} from '@sanity/client'
import {useEffect, useState} from 'react'

// Public, token-free client: the production dataset is public, so browsers read it directly. The API CDN has
// a 4x bigger Free quota than the live API, and Live Content API events refetch past it when content changes.
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-03-01',
  useCdn: true,
})

// Polling is the safety net, not the transport. Every request counts against the Free plan's monthly quota, so
// it runs only while the tab is visible and the event stream has been quiet, fast only while something is live.
const FAST_POLL_MS = 3_000
const SLOW_POLL_MS = 20_000
const STREAM_HEALTHY_MS = 10_000

export function useLiveQuery<T>(query: string, params: Record<string, unknown> = {}, {fast = false} = {}) {
  const [data, setData] = useState<T | undefined>()
  const key = JSON.stringify(params)

  useEffect(() => {
    let tags: string[] = []
    let cancelled = false
    let lastEventAt = 0
    let lastLoadAt = 0
    const load = async (lastLiveEventId?: string) => {
      lastLoadAt = Date.now()
      const response = await client
        .fetch<T>(query, JSON.parse(key), {filterResponse: false, lastLiveEventId})
        .catch(() => undefined)
      if (cancelled || !response) return
      tags = response.syncTags ?? []
      setData(response.result)
    }
    void load()
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastEventAt < STREAM_HEALTHY_MS) return
      if (now - lastLoadAt >= (fast ? FAST_POLL_MS : SLOW_POLL_MS)) void load()
    }, 1_000)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    const subscription = client.live.events().subscribe({
      next: (event) => {
        lastEventAt = Date.now()
        if (event.type === 'message' && event.tags.some((tag) => tags.includes(tag))) void load(event.id)
        if (event.type === 'welcome' || event.type === 'restart' || event.type === 'reconnect') void load()
      },
      error: () => {},
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [query, key, fast])

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

// While a window is over but has no result, keep asking the server to close it. The bot crowd normally does,
// but if its function died, any open screen finishes the job. closeWindow is idempotent.
export function useCloseWhenCounting(counting: boolean) {
  useEffect(() => {
    if (!counting) return
    const close = () => void fetch('/api/tick', {method: 'POST'}).catch(() => {})
    const first = setTimeout(close, 2_000)
    const again = setInterval(close, 5_000)
    return () => {
      clearTimeout(first)
      clearInterval(again)
    }
  }, [counting])
}

// The big screen's and phone's shared state. Polls fast only while a referendum has no result yet.
export function useLiveState<T extends {referendum: {result?: string} | null}>(query: string) {
  const [fast, setFast] = useState(false)
  const state = useLiveQuery<T>(query, {}, {fast})
  const live = Boolean(state?.referendum && !state.referendum.result)
  if (live !== fast) setFast(live)
  return state
}
