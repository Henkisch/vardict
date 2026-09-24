'use client'

import {createClient} from '@sanity/client'
import {useEffect, useState} from 'react'

// Public, token-free clients: the production dataset is public, so browsers read it directly.
const config = {
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: '2026-03-01',
}
// Reads skip the API CDN: the CDN and the Live Content API both lag by 5–20 s (measured session 3), most of a 30 s
// window. Cost per visible tab: ~1,200 requests/h during a vote, ~450/h idle (Free: 250k/month). Hidden tabs: none.
export const client = createClient({...config, useCdn: false})

const FAST_POLL_MS = 3_000
const IDLE_POLL_MS = 8_000

// Every request counts against the Free plan's monthly quota, so hidden tabs don't poll at all.
export function useLiveQuery<T>(query: string, params: Record<string, unknown> = {}, {fast = false} = {}) {
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
    const poll = setInterval(
      () => document.visibilityState === 'visible' && void load(),
      fast ? FAST_POLL_MS : IDLE_POLL_MS,
    )
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    // A bonus, not the transport: events arrive, just late.
    const subscription = client.live.events().subscribe({
      next: (event) => {
        if (event.type === 'message' && event.tags.some((tag) => tags.includes(tag))) void load(event.id)
        if (event.type === 'restart' || event.type === 'reconnect') void load()
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
  // A screen that just pressed Send to the people polls fast for 30 s, until its round shows up.
  const [boosted, setBoosted] = useState(false)
  const state = useLiveQuery<T>(query, {}, {fast})
  const live = Boolean(state?.referendum && !state.referendum.result)
  if ((live || boosted) !== fast) setFast(live || boosted)
  useEffect(() => {
    if (!boosted) return
    const id = setTimeout(() => setBoosted(false), 30_000)
    return () => clearTimeout(id)
  }, [boosted])
  return {state, boost: () => setBoosted(true)}
}
