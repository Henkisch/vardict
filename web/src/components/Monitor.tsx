'use client'

import {useEffect, useRef, useState, useSyncExternalStore} from 'react'

import {embedSrc, loadYouTube, type YTPlayer} from '@/lib/youtube'

type Props = {
  youtubeId: string
  // The window this monitor plays, in video seconds. It loops back to `from` at `to`.
  from: number
  to: number
  rate?: number
  // Scales the picture up inside its frame. Kept subtle: the YouTube logo must stay visible.
  zoom?: number
  label: string
  // Flash a "REWIND" tag each time the loop jumps back, like an operator scrubbing.
  rewind?: boolean
  // A side screen: below desktop size it's a small tile, so the label shrinks and the timecode hides.
  small?: boolean
  className?: string
}

const TICK_MS = 200
const PLAYER_W = 1280
const PLAYER_H = 720

// One screen on the VAR wall: a muted, controls-free YouTube player that loops its own window at its own speed.
export function Monitor({youtubeId, from, to, rate = 1, zoom = 1, label, rewind = false, small = false, className = ''}: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)

  // Scale the fixed-size player to cover the tile (both are 16:9, so this is a straight fit).
  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const {width, height} = entry.contentRect
      setScale(Math.max(width / PLAYER_W, height / PLAYER_H))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const [time, setTime] = useState(from)
  const [rewinding, setRewinding] = useState(false)

  // The src needs the page's origin, so the iframe only renders in the browser.
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => null)
  const src = origin ? embedSrc(youtubeId, from, origin) : undefined

  useEffect(() => {
    if (!src || !frame.current) return
    let player: YTPlayer | undefined
    let tick: ReturnType<typeof setInterval> | undefined
    let flash: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const backToStart = () => {
      player?.seekTo(from, true)
      player?.playVideo()
      if (rewind) {
        setRewinding(true)
        clearTimeout(flash)
        flash = setTimeout(() => setRewinding(false), 700)
      }
    }

    loadYouTube().then((YT) => {
      if (cancelled || !frame.current) return
      player = new YT.Player(frame.current, {
        events: {
          onReady: () => {
            player!.mute()
            player!.setPlaybackRate(rate)
            player!.seekTo(from, true)
            player!.playVideo()
            tick = setInterval(() => {
              const t = player?.getCurrentTime() ?? from
              setTime(t)
              if (t >= to - 0.05 || t < from - 1) backToStart()
            }, TICK_MS)
          },
          onStateChange: ({data}) => {
            if (data === YT.PlayerState.ENDED) backToStart()
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearInterval(tick)
      clearTimeout(flash)
      player?.destroy()
    }
  }, [src, from, to, rate, rewind])

  return (
    <div ref={box} className={`relative h-full w-full overflow-hidden rounded-md border border-line bg-black ${className}`}>
      {/* The player renders at a fixed 1280x720 and is scaled to the tile: at small sizes YouTube switches to its
          mobile interface, which flashes a big pause circle over the picture on every loop. */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{width: PLAYER_W, height: PLAYER_H, transform: `translate(-50%, -50%) scale(${scale * zoom})`}}
      >
        {src && (
          <iframe
            ref={frame}
            src={src}
            title={label}
            className="pointer-events-none h-full w-full"
            allow="autoplay; encrypted-media"
            // Without a referrer YouTube refuses the embed (error 153).
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={-1}
          />
        )}
      </div>
      <span
        className={`absolute rounded bg-ink/80 font-display font-bold uppercase ${
          small ? 'left-1 top-1 px-1 text-[9px] tracking-[0.1em] lg:left-2 lg:top-2 lg:px-1.5 lg:py-0.5 lg:text-xs lg:tracking-[0.15em]' : 'left-2 top-2 px-1.5 py-0.5 text-xs tracking-[0.15em]'
        }`}
      >
        {label}
      </span>
      <span className={`absolute bottom-2 left-2 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-xs tabular ${small ? 'hidden lg:inline' : ''}`}>
        {timecode(time)}
      </span>
      {rewinding && (
        <span className={`absolute inset-0 flex items-center justify-center bg-ink/40 font-display font-extrabold uppercase text-var ${small ? 'text-sm lg:text-3xl' : 'text-3xl'}`}>
          ◀◀ Rewind
        </span>
      )}
    </div>
  )
}

const noop = () => () => {}

function timecode(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}
