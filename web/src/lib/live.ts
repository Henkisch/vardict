'use client'

import {useEffect, useState} from 'react'

import type {Phase} from '@/lib/run-status'

// Every screen reads through /api/live (plan 007) instead of hitting Sanity directly. That route sits behind
// Vercel's CDN with a short s-maxage, so a stampede of tabs still costs Sanity about one read per cache
// window, not one per tab: cost scales with time, not with viewers. The API CDN and the Live Content API both
// lag 5-20 s (measured session 3), most of a 30 s window, so freshness comes from short polling here, not from
// a subscription - a live-events listener was tried and dropped for the same reason.
const FAST_POLL_MS = 3_000
const IDLE_POLL_MS = 8_000
const SLEEPY_POLL_MS = 60_000

// Every request still counts against Vercel's CDN, so hidden tabs don't poll at all, and a tab with nothing
// left to show can be told to sleep (see useLiveState below).
export function useLiveQuery<T>(
  url: string,
  {fast = false, sleepy = false, intervalMs}: {fast?: boolean; sleepy?: boolean; intervalMs?: number} = {},
) {
  const [data, setData] = useState<T | undefined>()

  useEffect(() => {
    let cancelled = false
    // Requests can resolve out of order (a slow response outrun by a later, faster one); only ever apply the
    // most recently *issued* response, never one older than what's already on screen.
    let seq = 0
    let applied = 0
    const load = async () => {
      const mine = ++seq
      const response: T | undefined = await fetch(url)
        .then((r) => (r.ok ? r.json() : undefined))
        .catch(() => undefined)
      if (cancelled || response === undefined || mine < applied) return
      applied = mine
      setData(response)
    }
    void load()
    const ms = fast ? FAST_POLL_MS : sleepy ? SLEEPY_POLL_MS : (intervalMs ?? IDLE_POLL_MS)
    const poll = setInterval(() => document.visibilityState === 'visible' && void load(), ms)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, fast, sleepy, intervalMs])

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

const CLICK_BOOST_MS = 30_000
const PHASE_BOOST_MS = 20_000
const SLEEP_AFTER_MS = 5 * 60_000

// The big screen's and phone's shared state. Polls fast while the run's phase is voting, counting or between
// (a round has a result but the run continues, e.g. mid-shootout) — plus for 20 s after the phase last
// changed, to bridge the gap before the next round's referendum exists in the query result, and for 30 s
// after pressing Send to the people.
export function useLiveState<T>(url: string, phaseOf: (state: T | undefined) => Phase) {
  const [fast, setFast] = useState(false)
  // A screen that just pressed Send to the people polls fast for 30 s, until its round shows up.
  const [boosted, setBoosted] = useState(false)
  const [phaseBoosted, setPhaseBoosted] = useState(false)
  const [sleepy, setSleepy] = useState(false)
  const state = useLiveQuery<T>(url, {fast, sleepy})

  const phase = phaseOf(state)
  const active = phase === 'voting' || phase === 'counting' || phase === 'between'
  // Only a run with nothing left to show is a candidate for sleep - an active run already polls fast.
  const canSleep = phase === 'decided' || phase === 'parked'

  // Adjusting state during render in response to a change — React's documented pattern for this, not an
  // effect: boost for a beat whenever the phase itself changes, to bridge the gap before the next round's
  // referendum exists in the query result (e.g. between shootout rounds).
  const [prevPhase, setPrevPhase] = useState(phase)
  if (prevPhase !== phase) {
    setPrevPhase(phase)
    if (!phaseBoosted) setPhaseBoosted(true)
  }

  const shouldPollFast = active || boosted || phaseBoosted
  if (shouldPollFast !== fast) setFast(shouldPollFast)

  useEffect(() => {
    if (!boosted) return
    const id = setTimeout(() => setBoosted(false), CLICK_BOOST_MS)
    return () => clearTimeout(id)
  }, [boosted])

  useEffect(() => {
    if (!phaseBoosted) return
    const id = setTimeout(() => setPhaseBoosted(false), PHASE_BOOST_MS)
    return () => clearTimeout(id)
  }, [phaseBoosted])

  // Adjusting state during render, same pattern as prevPhase above: wake immediately (no effect round-trip)
  // whenever the run stops being sleep-eligible, or moves to a different decided/parked run.
  const [prevCanSleep, setPrevCanSleep] = useState(canSleep)
  const [prevSleepPhase, setPrevSleepPhase] = useState(phase)
  if (prevCanSleep !== canSleep || prevSleepPhase !== phase) {
    setPrevCanSleep(canSleep)
    setPrevSleepPhase(phase)
    if (sleepy) setSleepy(false)
  }

  // A forgotten tab (decided or parked, nobody touching it) drops to a 60 s poll after 5 minutes of quiet.
  // One timer, reset by an interaction, rather than a 250 ms tick checking elapsed time - this must not
  // re-render every frame. Any interaction wakes it, and useLiveQuery's effect re-running (sleepy flips to
  // false) fires the immediate load; a phase change wakes it via the render-time adjustment above.
  useEffect(() => {
    if (!canSleep) return
    let id = setTimeout(() => setSleepy(true), SLEEP_AFTER_MS)
    const wake = () => {
      setSleepy(false)
      clearTimeout(id)
      id = setTimeout(() => setSleepy(true), SLEEP_AFTER_MS)
    }
    document.addEventListener('pointerdown', wake)
    document.addEventListener('keydown', wake)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', wake)
      document.removeEventListener('keydown', wake)
    }
  }, [canSleep, phase])

  return {state, boost: () => setBoosted(true)}
}
