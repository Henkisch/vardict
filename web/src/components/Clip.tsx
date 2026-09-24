import type {IncidentCard} from '@/lib/queries'

type Props = {clip: IncidentCard['clip']; fallbackText: string}

// Embed only, at the exact start and end. Without a referrer YouTube refuses the embed (error 153).
export function Clip({clip, fallbackText}: Props) {
  if (!clip?.youtubeId || !clip.embedAllowed) {
    return (
      <div className="flex aspect-video w-full flex-col justify-center gap-4 rounded-lg border border-line bg-pitch p-6">
        <p className="text-lg leading-relaxed">{fallbackText}</p>
        {clip?.youtubeId && (
          <a
            className="text-var underline"
            href={`https://www.youtube.com/watch?v=${clip.youtubeId}&t=${clip.startSeconds}`}
            target="_blank"
            rel="noreferrer"
          >
            Watch it on YouTube
          </a>
        )}
      </div>
    )
  }
  const src =
    `https://www.youtube-nocookie.com/embed/${clip.youtubeId}?start=${clip.startSeconds}&end=${clip.endSeconds}` +
    '&autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1'
  return (
    <iframe
      className="aspect-video w-full rounded-lg border border-line bg-black"
      src={src}
      title="Incident clip"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}
