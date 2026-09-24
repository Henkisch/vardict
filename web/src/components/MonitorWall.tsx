'use client'

import {Clip} from '@/components/Clip'
import {Monitor} from '@/components/Monitor'
import type {IncidentCard} from '@/lib/queries'

// What the VAR is checking, broadcast-style. Keyed by incident.incidentType.
const CHECK: Record<string, string> = {
  offside: 'Checking goal · possible offside',
  handball: 'Checking penalty · possible handball',
  penalty: 'Checking penalty',
  redCard: 'Checking possible red card',
  mistakenIdentity: 'Checking player identity',
  goalLine: 'Checking goal-line',
}

// The VAR room's wall of screens: the clip at normal speed on the main monitor, and three operator views of the
// same official clip: slow motion, the key moment on a rewind loop, and a zoomed crop. Phones get the main monitor.
export function MonitorWall({incident}: {incident: IncidentCard}) {
  const clip = incident.clip
  if (!clip?.youtubeId || !clip.embedAllowed) return <Clip clip={clip} fallbackText={incident.fallbackText} />

  const {youtubeId, startSeconds: start, endSeconds: end} = clip
  // The key moment: set in Studio, or the middle of the clip.
  const key = clip.keySeconds ?? start + (end - start) / 2
  const loopFrom = Math.max(start, key - 2)
  const loopTo = Math.min(end, key + 2)

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="relative">
        <Monitor youtubeId={youtubeId} from={start} to={end} label="Cam 1 · Live" />
        <p className="pointer-events-none absolute inset-x-0 top-10 mx-auto w-fit bg-var px-4 py-1.5 font-display text-lg font-extrabold uppercase tracking-[0.12em] text-ink motion-safe:animate-pulse sm:text-2xl">
          VAR check · {CHECK[incident.incidentType ?? ''] ?? 'Reviewing the decision'}
        </p>
      </div>
      <div className="hidden flex-col gap-2 sm:flex">
        <Monitor youtubeId={youtubeId} from={start} to={end} rate={0.25} label="Slow-mo · 0.25×" />
        <Monitor youtubeId={youtubeId} from={loopFrom} to={loopTo} rate={0.5} rewind label="Replay · key moment" />
        <Monitor youtubeId={youtubeId} from={loopFrom} to={loopTo} zoom={1.5} label="Zoom · ×1.5" />
      </div>
    </div>
  )
}
