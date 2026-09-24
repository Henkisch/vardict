'use client'

// The YouTube IFrame API, loaded once per page. We drive the players ourselves (loop the clip's window, set the
// speed) because the embed's own `end` parameter stops being honoured once a player has been interacted with,
// which let clips run on into YouTube's end screen.

export type YTPlayer = {
  playVideo(): void
  pauseVideo(): void
  mute(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

type YTNamespace = {
  Player: new (
    element: HTMLIFrameElement,
    options: {events?: {onReady?: () => void; onStateChange?: (event: {data: number}) => void}},
  ) => YTPlayer
  PlayerState: {ENDED: number; PLAYING: number; PAUSED: number}
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YTNamespace> | undefined

export function loadYouTube(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return new Promise(() => {})
  if (window.YT?.Player) return Promise.resolve(window.YT)
  loading ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT!)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    document.head.appendChild(script)
  })
  return loading
}

// Muted, no controls, no related videos: the embed is a monitor, not a player. Autoplay only works muted.
export function embedSrc(youtubeId: string, start: number, origin: string) {
  const params = new URLSearchParams({
    start: String(Math.floor(start)),
    autoplay: '1',
    mute: '1',
    controls: '0',
    disablekb: '1',
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
    iv_load_policy: '3',
    enablejsapi: '1',
    origin,
  })
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`
}
