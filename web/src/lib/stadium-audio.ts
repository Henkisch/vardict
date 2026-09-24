'use client'

// The stadium's sound: real recordings (see public/sounds/CREDITS.md) played through the Web Audio API. A crowd
// bed loops under everything and swells with the vote; the roar, the "ooh" and the referee's whistle play on
// cue. Browsers only allow audio after a click, which is what the "Enter the stadium" button is for.

export type Cue = 'whistle' | 'roar' | 'gasp' | 'groan' | 'fullTime'

const FILES = {
  bed: '/sounds/crowd-bed.mp3',
  roar: '/sounds/crowd-roar.mp3',
  ooh: '/sounds/crowd-ooh.mp3',
  whistle: '/sounds/whistle.mp3',
} as const

type Buffers = Partial<Record<keyof typeof FILES, AudioBuffer>>
type Engine = {ctx: AudioContext; master: GainNode; bedGain: GainNode; buffers: Buffers}

// One engine per page, kept on window: a module reload (Fast Refresh in dev) must reuse it, or the old crowd
// keeps playing with nothing left that can mute it.
const holder = globalThis as unknown as {__vardictStadium?: Engine}
const engine = () => holder.__vardictStadium

async function load(ctx: AudioContext, url: string) {
  const response = await fetch(url)
  return ctx.decodeAudioData(await response.arrayBuffer())
}

// Starts the crowd. Call from a click handler (autoplay policy). Safe to call twice.
export async function startStadium() {
  if (typeof window === 'undefined') return
  if (!holder.__vardictStadium) {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    const bedGain = ctx.createGain()
    bedGain.gain.value = 0
    bedGain.connect(master)
    const e: Engine = {ctx, master, bedGain, buffers: {}}
    holder.__vardictStadium = e

    // Each file loads on its own, so the crowd starts as soon as the bed is in, even if a cue is slow.
    for (const [name, url] of Object.entries(FILES) as [keyof typeof FILES, string][]) {
      load(ctx, url)
        .then((buffer) => {
          e.buffers[name] = buffer
          if (name === 'bed') {
            const source = ctx.createBufferSource()
            source.buffer = buffer
            source.loop = true
            source.connect(bedGain)
            source.start()
            bedGain.gain.setTargetAtTime(0.35, ctx.currentTime, 1.5)
          }
        })
        .catch((error: unknown) => console.warn('stadium sound failed to load', url, error))
    }
  }
  const {ctx} = holder.__vardictStadium
  if (ctx.state === 'suspended') await ctx.resume()
}

// Muting suspends the whole context: nothing can leak through, and it costs no CPU while silent.
export async function setMuted(muted: boolean) {
  const e = engine()
  if (!e) return
  if (muted) await e.ctx.suspend()
  else await e.ctx.resume()
}

// 0 = a quiet ground between votes, 1 = a packed stand on its feet. Glides, never jumps.
export function setIntensity(level: number) {
  const e = engine()
  if (!e) return
  const l = Math.max(0, Math.min(1, level))
  e.bedGain.gain.setTargetAtTime(0.25 + l * 0.75, e.ctx.currentTime, 0.8)
}

function play(name: keyof typeof FILES, {gain = 1, rate = 1, at = 0}: {gain?: number; rate?: number; at?: number} = {}) {
  const e = engine()
  const buffer = e?.buffers[name]
  if (!e || !buffer) return
  const source = e.ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  const g = e.ctx.createGain()
  g.gain.value = gain
  source.connect(g).connect(e.master)
  source.start(e.ctx.currentTime + at)
}

export function cue(name: Cue) {
  if (engine()?.ctx.state !== 'running') return
  if (name === 'whistle') play('whistle', {gain: 0.6})
  // Full time: two short peeps and a long one, from the same whistle at different lengths via playback rate.
  if (name === 'fullTime') {
    play('whistle', {gain: 0.55, rate: 1.6})
    play('whistle', {gain: 0.55, rate: 1.6, at: 0.45})
    play('whistle', {gain: 0.6, at: 0.9})
  }
  if (name === 'roar') play('roar', {gain: 1})
  if (name === 'gasp') play('ooh', {gain: 0.9})
  // A groan: the "ooh", slowed and deeper.
  if (name === 'groan') play('ooh', {gain: 0.9, rate: 0.8})
}
