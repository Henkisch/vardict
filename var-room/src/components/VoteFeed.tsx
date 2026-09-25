import {useQuery} from '@sanity/sdk-react'
import {useEffect, useRef, useState} from 'react'

import {HUMAN_VOTE_WEIGHT, PERSONA_LABELS, PERSONAS, roundLabel} from '../api'
import {useNow} from '../useNow'

type Tally = {uphold: number; overturn: number}
type Round = {
  _id: string
  round: string
  result?: string
  closesAt: string
  title: string
  bots: Tally & {waves: number; byPersona: Record<string, Tally>}
  humansUp: number
  humansDown: number
  votes: {_id: string; choice: 'uphold' | 'overturn'; castAt: string}[]
}
type Entry = {key: string; at: number; kind: 'round' | 'wave' | 'human' | 'result'; text: string; tone?: string}

const PERSONA_COUNTERS = PERSONAS.map(
  (p) => `"${p}": {"uphold": coalesce(botVotes.byPersona.${p}.uphold, 0), "overturn": coalesce(botVotes.byPersona.${p}.overturn, 0)}`,
).join(', ')

const RESULTS: Record<string, string> = {
  upheld: "Upheld. The VAR's call stands",
  overturned: 'Overturned. The on-field call stands',
  tooClose: 'Too close. Waiting for the next press',
  noVotes: 'No humans voted. Back to the VAR room',
  aborted: 'Stopped. The run was aborted',
}

const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB')

// Every vote as it lands in the Content Lake, in real time: a fan's phone (a `vote` document) or a wave of the
// simulated crowd (an atomic `inc` on the referendum's botVotes counters, so each wave is a diff between two
// updates of the same document). The persona split is what the stadium never sees.
export function VoteFeed() {
  const {data} = useQuery<Round | null>({
    query: `*[_type == "referendum"] | order(windowOpensAt desc)[0]{
      _id, round, result, closesAt, "title": incident->title,
      "bots": {
        "uphold": coalesce(botVotes.uphold, 0), "overturn": coalesce(botVotes.overturn, 0),
        "waves": coalesce(botVotes.waves, 0), "byPersona": {${PERSONA_COUNTERS}}
      },
      "humansUp": count(*[_type == "vote" && references(^._id) && choice == "uphold"]),
      "humansDown": count(*[_type == "vote" && references(^._id) && choice == "overturn"]),
      "votes": *[_type == "vote" && references(^._id)] | order(castAt desc)[0...40]{_id, choice, castAt}
    }`,
  })
  const now = useNow()
  const [entries, setEntries] = useState<Entry[]>([])
  const seen = useRef<{id?: string; waves: number; bots?: Round['bots']; votes: Set<string>; result?: string}>({
    waves: 0,
    votes: new Set(),
  })

  useEffect(() => {
    if (!data) return
    const last = seen.current
    const fresh: Entry[] = []
    const first = last.id === undefined
    if (data._id !== last.id) {
      // A new round (or the booth just opened): start counting from here, without replaying history as news.
      if (!first) fresh.push({key: `round-${data._id}`, at: Date.now(), kind: 'round', text: `Whistle: ${roundLabel(data.round).toLowerCase()} opens`})
      seen.current = {id: data._id, waves: first ? data.bots.waves : 0, bots: first ? data.bots : undefined, votes: new Set(first ? data.votes.map((v) => v._id) : []), result: first ? data.result : undefined}
    }
    const state = seen.current
    if (data.bots.waves > state.waves) {
      const parts = PERSONAS.flatMap((p) => {
        const before = state.bots?.byPersona[p] ?? {uphold: 0, overturn: 0}
        const now = data.bots.byPersona[p]
        const up = now.uphold - before.uphold
        const down = now.overturn - before.overturn
        return up || down ? [`${PERSONA_LABELS[p]} ${up ? `+${up}↑` : ''}${down ? `+${down}↓` : ''}`] : []
      })
      const up = data.bots.uphold - (state.bots?.uphold ?? 0)
      const down = data.bots.overturn - (state.bots?.overturn ?? 0)
      fresh.push({
        key: `wave-${data._id}-${data.bots.waves}`,
        at: Date.now(),
        kind: 'wave',
        text: `Wave ${data.bots.waves}: ${up} uphold, ${down} overturn (${parts.join(', ')})`,
      })
      state.waves = data.bots.waves
      state.bots = data.bots
    }
    for (const vote of [...data.votes].reverse()) {
      if (state.votes.has(vote._id)) continue
      state.votes.add(vote._id)
      fresh.push({
        key: vote._id,
        at: Date.parse(vote.castAt),
        kind: 'human',
        tone: vote.choice,
        text: `A fan votes ${vote.choice} (counts ×${HUMAN_VOTE_WEIGHT})`,
      })
    }
    if (data.result && data.result !== state.result) {
      state.result = data.result
      fresh.push({key: `result-${data._id}`, at: Date.now(), kind: 'result', tone: data.result, text: RESULTS[data.result] ?? data.result})
    }
    if (fresh.length) setEntries((old) => [...fresh.reverse(), ...old].slice(0, 80))
  }, [data])

  if (!data) {
    return (
      <section className="feed">
        <p className="feed-head">Live from the Content Lake</p>
        <p className="feed-empty">Waiting for the first whistle. Every bot wave and every fan's vote lands here as it happens.</p>
      </section>
    )
  }

  const {humansUp, humansDown} = data
  const up = data.bots.uphold + HUMAN_VOTE_WEIGHT * humansUp
  const down = data.bots.overturn + HUMAN_VOTE_WEIGHT * humansDown
  const pct = up + down ? Math.round((100 * up) / (up + down)) : 50
  const left = Math.max(0, Math.ceil((Date.parse(data.closesAt) - now) / 1000))
  const onAir = !data.result && left > 0

  return (
    <section className="feed" aria-label="Live vote feed">
      <p className="feed-head">
        Live from the Content Lake
        <span className={`feed-state ${onAir ? 'on' : ''}`}>{onAir ? `voting · ${left}` : data.result ? 'closed' : 'counting'}</span>
      </p>
      <div className="split" role="img" aria-label={`${pct}% uphold, ${100 - pct}% overturn`}>
        <div className="split-uphold" style={{width: `${pct}%`}} />
        <span className="split-mark" style={{left: '45%'}} aria-hidden />
        <span className="split-mark" style={{left: '55%'}} aria-hidden />
      </div>
      <p className="split-words">
        <span className="uphold">Uphold {pct}%</span>
        <span className="overturn">{100 - pct}% Overturn</span>
      </p>
      <p className="feed-counts">
        {data.bots.uphold + data.bots.overturn} simulated in {data.bots.waves} waves · {humansUp + humansDown} fans ×{HUMAN_VOTE_WEIGHT}
      </p>
      <ol className="entries">
        {entries.length === 0 && <li className="muted">Listening for votes…</li>}
        {entries.map((e) => (
          <li key={e.key} className={`entry ${e.kind} ${e.tone ?? ''}`}>
            <time className="mono">{clock(e.at)}</time>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
