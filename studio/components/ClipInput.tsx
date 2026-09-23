import {useEffect, useState} from 'react'
import {set, type ObjectInputProps} from 'sanity'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {MAX_CLIP_SECONDS} from '../schemaTypes/constants'

type ClipValue = {
  youtubeId?: string
  startSeconds?: number
  endSeconds?: number
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

// Accepts a bare ID or any common YouTube URL shape (watch, youtu.be, embed, shorts).
function extractYoutubeId(input: string): string | undefined {
  const trimmed = input.trim()
  if (YOUTUBE_ID.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const fromQuery = url.searchParams.get('v')
    if (fromQuery && YOUTUBE_ID.test(fromQuery)) return fromQuery
    const lastSegment = url.pathname.split('/').filter(Boolean).pop()
    if (lastSegment && YOUTUBE_ID.test(lastSegment)) return lastSegment
  } catch {
    // Not a URL; leave it for validation to flag.
  }
  return undefined
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ClipInput(props: ObjectInputProps<ClipValue>) {
  const {value, onChange} = props
  const [replay, setReplay] = useState(0)

  // Turn a pasted URL into the bare ID, so editors can paste whatever they copied.
  useEffect(() => {
    const raw = value?.youtubeId
    if (!raw || YOUTUBE_ID.test(raw)) return
    const id = extractYoutubeId(raw)
    if (id) onChange(set(id, ['youtubeId']))
  }, [value?.youtubeId, onChange])

  const id = value?.youtubeId && YOUTUBE_ID.test(value.youtubeId) ? value.youtubeId : undefined
  const start = value?.startSeconds ?? 0
  const end = value?.endSeconds
  const length = end !== undefined ? end - start : undefined
  const rangeProblem =
    length === undefined ? undefined : length <= 0 ? 'End is before start' : length > MAX_CLIP_SECONDS ? `Longer than ${MAX_CLIP_SECONDS} s` : undefined

  const params = new URLSearchParams({start: String(start), rel: '0', playsinline: '1', origin: window.location.origin})
  if (end !== undefined && !rangeProblem) params.set('end', String(end))
  const src = id ? `https://www.youtube-nocookie.com/embed/${id}?${params}` : undefined

  return (
    <Stack gap={4}>
      {src ? (
        <Card radius={2} shadow={1} overflow="hidden">
          <Box style={{position: 'relative', paddingTop: '56.25%'}}>
            <iframe
              key={`${src}-${replay}`}
              src={src}
              title="Clip preview"
              allow="encrypted-media; picture-in-picture"
              // YouTube rejects embeds without a referrer (error 153); the Studio page policy strips it by default.
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0}}
            />
          </Box>
          <Flex padding={3} align="center" justify="space-between" gap={3}>
            <Text size={1} muted>
              {formatTime(start)} → {end !== undefined ? formatTime(end) : 'end of video'}
              {length !== undefined && !rangeProblem ? ` · ${length} s` : ''}
              {rangeProblem ? ` · ${rangeProblem}` : ''}
            </Text>
            <Button text="Replay clip" mode="ghost" fontSize={1} onClick={() => setReplay((n) => n + 1)} />
          </Flex>
        </Card>
      ) : (
        <Card padding={4} radius={2} tone="transparent" border>
          <Text size={1} muted>
            Add a YouTube ID or URL to preview the clip at the chosen start and end.
          </Text>
        </Card>
      )}
      {props.renderDefault(props)}
    </Stack>
  )
}
