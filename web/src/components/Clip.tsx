import {Monitor} from '@/components/Monitor'
import type {IncidentCard} from '@/lib/queries'

type Props = {clip: IncidentCard['clip']; fallbackText: string}

// Embed only, looping the exact start-to-end window (see Monitor). Falls back to text plus a link out.
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
  return <Monitor youtubeId={clip.youtubeId} from={clip.startSeconds} to={clip.endSeconds} label="Live" />
}
