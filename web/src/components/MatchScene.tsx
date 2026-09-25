'use client'

import {useLayoutEffect, useRef, useState} from 'react'

import {FitBox} from '@/components/FitBox'
import {Scorebug} from '@/components/Scorebug'
import {CALL_LABELS, type IncidentCard} from '@/lib/queries'

type Props = {
  incident: IncidentCard
  // The lower-third (design.md, L2): what's happening now, and a figure (the countdown, the real check time).
  barLeft: React.ReactNode
  barRight?: React.ReactNode
  // A live moment (the vote) gets the red tab; the VAR room gets amber.
  live?: boolean
  // The tab pulses while something is under way (the VAR check), so the step reads as running.
  pulse?: boolean
  // The footage, and its shape (16:9 for one screen, wider for the monitor wall).
  media: React.ReactNode | ((stacked: boolean) => React.ReactNode)
  mediaRatio: number
  // The media's stacked shape, if it has one (the monitor wall): FitBox picks the better fit.
  mediaStackedRatio?: number
  // The last step of the strip under the panel: the button, or the vote.
  // A question over the action, only where the action alone doesn't explain itself (the vote).
  actionLabel?: string
  action: React.ReactNode
}

// The frame every step on /live shares (design.md). L1: the incident under review on the left rail (scorebug, title,
// situation) beside the footage (above it on phones). L2: one lower-third under it. Then the strip that tells the
// decision left to right: what the referee said, what the VAR says, and the fans' part (L3).
export function MatchScene({incident, barLeft, barRight, live = false, pulse = false, media, mediaRatio, mediaStackedRatio, actionLabel, action}: Props) {
  const {homeTeam: home, awayTeam: away} = incident.match
  // The panel has auto height and the strip under it takes the rest of the screen (Henrik). The footage's height
  // limit is the whole frame minus the strip's own content, measured here, so it never outgrows the screen.
  const frame = useRef<HTMLDivElement>(null)
  const stripContent = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<number>()
  useLayoutEffect(() => {
    const outer = frame.current
    const inner = stripContent.current
    if (!outer || !inner) return
    const measure = () =>
      setRoom(Math.max(0, outer.clientHeight - GAP - (inner.offsetHeight + STRIP_PAD_Y) - MEDIA_PAD_Y))
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={frame} className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-pitch lg:flex-row">
        <div className="flex shrink-0 flex-col gap-6 p-5 lg:w-96 xl:w-[26rem]">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Under review{incident.controlCase ? ' · the control case' : ''}</p>
            <Scorebug home={home} away={away} minute={incident.minute} />
            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] text-balance xl:text-5xl">
              {incident.title}
            </h2>
            {incident.situation && <p className="text-lg leading-snug text-muted">{incident.situation}</p>}
          </div>
          <div className="flex items-stretch gap-3">
            <span className={`w-1.5 shrink-0 ${live ? 'bg-overturn' : 'bg-var'} ${pulse ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-display text-2xl font-extrabold uppercase leading-tight">{barLeft}</p>
              {barRight && <div className="text-muted">{barRight}</div>}
            </div>
          </div>
        </div>
        <FitBox ratio={mediaRatio} align="end" valign="start" maxHeight={room} stackedRatio={mediaStackedRatio} className="p-2 lg:flex-1 lg:py-5 lg:pl-0 lg:pr-5">
          {media}
        </FitBox>
      </section>

      <section className="flex shrink-0 flex-col justify-center rounded-xl bg-pitch p-5 lg:flex-1">
        <div ref={stripContent} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex items-end gap-5">
            <Call label="Referee" value={CALL_LABELS[incident.originalCall] ?? incident.originalCall} />
            <span className="pb-1 font-display text-3xl leading-none text-muted" aria-hidden>
              →
            </span>
            <Call label="VAR" value={CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation} highlight />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:items-end">
            {actionLabel && <p className="text-sm text-muted">{actionLabel}</p>}
            {action}
          </div>
        </div>
      </section>
    </div>
  )
}

// Taken off the measured frame: the footage's vertical padding (lg:py-5), the strip's (p-5) and the gap (gap-4).
const MEDIA_PAD_Y = 40
const STRIP_PAD_Y = 40
const GAP = 16

function Call({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) {
  return (
    <p className="flex flex-col gap-1 whitespace-nowrap">
      <span className="text-sm text-muted">{label}</span>
      <span className={`font-display text-4xl font-extrabold uppercase leading-none ${highlight ? 'text-var' : ''}`}>{value}</span>
    </p>
  )
}
