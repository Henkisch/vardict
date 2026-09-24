'use client'

import {Clip} from '@/components/Clip'
import {Monitor} from '@/components/Monitor'
import type {IncidentCard} from '@/lib/queries'

// The VAR room's wall of screens: the clip at normal speed on the main monitor, and three operator views of the
// same official clip: slow motion, the key moment on a rewind loop, and a zoomed crop. Below lg the three sit in
// a row under the main monitor.
export const WALL_RATIO = 64 / 27

export function MonitorWall({incident}: {incident: IncidentCard}) {
  const clip = incident.clip
  if (!clip?.youtubeId || !clip.embedAllowed) return <Clip clip={clip} fallbackText={incident.fallbackText} />

  const {youtubeId, startSeconds: start, endSeconds: end} = clip
  // The key moment: set in Studio, or the middle of the clip.
  const key = clip.keySeconds ?? start + (end - start) / 2
  const loopFrom = Math.max(start, key - 2)
  const loopTo = Math.min(end, key + 2)

  // Every screen is 16:9. Main is 3/4 of the wall's width and the three side screens stack beside it, which
  // makes the whole wall 64:27 (WALL_RATIO). The parent fits it to the screen with a FitBox.
  return (
    <div className="grid w-full grid-cols-3 gap-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="relative col-span-3 aspect-video lg:col-span-1 lg:row-span-3 lg:aspect-auto">
        <Monitor youtubeId={youtubeId} from={start} to={end} label="Cam 1 · Live" />
      </div>
      <div className="aspect-video">
        <Monitor youtubeId={youtubeId} from={start} to={end} rate={0.25} small label="Slow-mo 0.25×" />
      </div>
      <div className="aspect-video">
        <Monitor youtubeId={youtubeId} from={loopFrom} to={loopTo} rate={0.5} rewind small label="Replay" />
      </div>
      <div className="aspect-video">
        <Monitor youtubeId={youtubeId} from={loopFrom} to={loopTo} zoom={1.5} small label="Zoom ×1.5" />
      </div>
    </div>
  )
}
