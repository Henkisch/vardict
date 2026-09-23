import {defineField, defineType} from 'sanity'
import {PlayIcon} from '@sanity/icons/Play'
import {ClipInput} from '../../components/ClipInput'
import {MAX_CLIP_SECONDS} from '../constants'

export const clip = defineType({
  name: 'clip',
  title: 'Clip',
  type: 'object',
  icon: PlayIcon,
  description:
    'Embed only, from an official league, club or broadcaster channel. Never download or re-host footage.',
  components: {input: ClipInput},
  fields: [
    defineField({
      name: 'youtubeId',
      title: 'YouTube video ID',
      type: 'string',
      description: 'The 11-character ID, e.g. dQw4w9WgXcQ. Pasting a full YouTube URL also works.',
      validation: (rule) =>
        rule.custom((value) => {
          if (!value) return true
          return /^[A-Za-z0-9_-]{11}$/.test(value) || 'Must be an 11-character YouTube video ID'
        }),
    }),
    defineField({
      name: 'startSeconds',
      title: 'Start (seconds)',
      type: 'number',
      validation: (rule) => rule.min(0).integer(),
    }),
    defineField({
      name: 'endSeconds',
      title: 'End (seconds)',
      type: 'number',
      validation: (rule) =>
        rule
          .integer()
          .custom((end, context) => {
            const start = (context.parent as {startSeconds?: number} | undefined)?.startSeconds
            if (end === undefined || start === undefined) return true
            if (end <= start) return 'End must be after start'
            if (end - start > MAX_CLIP_SECONDS) return `Clip can be at most ${MAX_CLIP_SECONDS} seconds`
            return true
          }),
    }),
    defineField({
      name: 'channel',
      title: 'Channel',
      type: 'string',
      description: 'Name of the official channel that published the video.',
    }),
    defineField({
      name: 'official',
      title: 'Official channel',
      type: 'boolean',
      description: 'Only official league, club or broadcaster uploads. No fan uploads.',
      initialValue: false,
      validation: (rule) =>
        rule.custom((official, context) => {
          const youtubeId = (context.parent as {youtubeId?: string} | undefined)?.youtubeId
          return !youtubeId || official === true || 'Only clips from official channels may be embedded'
        }),
    }),
    defineField({
      name: 'embedAllowed',
      title: 'Embedding allowed',
      type: 'boolean',
      description: 'Check that the preview above actually plays. If not, the site shows the fallback text.',
      initialValue: false,
    }),
  ],
})
