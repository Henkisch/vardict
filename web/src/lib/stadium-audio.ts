'use client'

// The stadium's sound, made in the browser with the Web Audio API: a crowd murmur that swells with the vote, a
// referee's whistle, a roar, a gasp and a groan. Synthesised, so there's nothing to license or download; recorded
// CC0 samples can replace any cue later behind the same functions. Browsers only allow audio after a click, which
// is what the "Enter the stadium" button is for.

export type Cue = 'whistle' | 'roar' | 'gasp' | 'groan' | 'fullTime'

let ctx: AudioContext | undefined
let master: GainNode | undefined
let murmurGain: GainNode | undefined
let murmurFilter: BiquadFilterNode | undefined
let noise: AudioBuffer | undefined

// Two seconds of brown-ish noise, looped: the raw material of every crowd sound here.
function noiseBuffer(context: AudioContext) {
  const length = context.sampleRate * 2
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function noiseSource(context: AudioContext) {
  const source = context.createBufferSource()
  source.buffer = noise!
  source.loop = true
  return source
}

// Starts the murmur. Call from a click handler (autoplay policy). Safe to call twice.
export async function startStadium() {
  if (typeof window === 'undefined') return
  if (!ctx) {
    ctx = new AudioContext()
    noise = noiseBuffer(ctx)
    master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)

    murmurFilter = ctx.createBiquadFilter()
    murmurFilter.type = 'bandpass'
    murmurFilter.frequency.value = 500
    murmurFilter.Q.value = 0.7
    murmurGain = ctx.createGain()
    murmurGain.gain.value = 0.12
    const source = noiseSource(ctx)
    source.connect(murmurFilter).connect(murmurGain).connect(master)
    source.start()
  }
  if (ctx.state === 'suspended') await ctx.resume()
}

export function setMuted(muted: boolean) {
  if (!ctx || !master) return
  master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.1)
}

// 0 = a quiet ground between votes, 1 = a packed stand on its feet. Glides, never jumps.
export function setIntensity(level: number) {
  if (!ctx || !murmurGain || !murmurFilter) return
  const l = Math.max(0, Math.min(1, level))
  murmurGain.gain.setTargetAtTime(0.08 + l * 0.32, ctx.currentTime, 0.6)
  murmurFilter.frequency.setTargetAtTime(420 + l * 480, ctx.currentTime, 0.6)
}

// A burst of crowd: filtered noise with an envelope. `sweep` bends the filter (down for a groan).
function crowdBurst({peak, attack, hold, release, freq, sweep = 0, q = 0.8}: {
  peak: number
  attack: number
  hold: number
  release: number
  freq: number
  sweep?: number
  q?: number
}) {
  if (!ctx || !master) return
  const t = ctx.currentTime
  const source = noiseSource(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(freq, t)
  if (sweep) filter.frequency.linearRampToValueAtTime(freq + sweep, t + attack + hold + release)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + attack)
  gain.gain.setValueAtTime(peak, t + attack + hold)
  gain.gain.exponentialRampToValueAtTime(0.001, t + attack + hold + release)
  source.connect(filter).connect(gain).connect(master)
  source.start(t)
  source.stop(t + attack + hold + release + 0.1)
}

// A pea whistle: a high tone with a fast warble. `blasts` short peeps (3 for full time).
function whistle(blasts: number[]) {
  if (!ctx || !master) return
  let t = ctx.currentTime
  for (const length of blasts) {
    const tone = ctx.createOscillator()
    tone.type = 'square'
    tone.frequency.value = 2900
    const warble = ctx.createOscillator()
    warble.frequency.value = 38
    const depth = ctx.createGain()
    depth.gain.value = 160
    warble.connect(depth).connect(tone.frequency)
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 4200
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.09, t + 0.02)
    gain.gain.setValueAtTime(0.09, t + length - 0.04)
    gain.gain.linearRampToValueAtTime(0, t + length)
    tone.connect(soften).connect(gain).connect(master)
    tone.start(t)
    warble.start(t)
    tone.stop(t + length)
    warble.stop(t + length)
    t += length + 0.12
  }
}

export function cue(name: Cue) {
  if (!ctx) return
  if (name === 'whistle') whistle([0.55])
  if (name === 'fullTime') whistle([0.3, 0.3, 0.9])
  if (name === 'roar') crowdBurst({peak: 0.9, attack: 0.25, hold: 1.4, release: 2.5, freq: 900, q: 0.5})
  if (name === 'gasp') crowdBurst({peak: 0.5, attack: 0.08, hold: 0.3, release: 1.2, freq: 1200, q: 1.2})
  if (name === 'groan') crowdBurst({peak: 0.6, attack: 0.3, hold: 0.6, release: 1.8, freq: 700, sweep: -450, q: 1})
}
