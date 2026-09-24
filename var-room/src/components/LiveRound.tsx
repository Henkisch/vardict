import {useQuery} from '@sanity/sdk-react'
import {useEffect, useState} from 'react'

import {CALL_LABELS, closeWindow, HUMAN_VOTE_WEIGHT} from '../api'

type Persona = {persona: string; uphold: number; overturn: number}
type Round = {
  _id: string
  round: string
  loop: number
  closesAt: string
  result?: string
  title: string
  varRecommendation: string
  humansUphold: number
  humansOverturn: number
  personas: Persona[]
}

// Must match workflows/shared.ts PERSONAS (see the comment on CALL_LABELS in ../api.ts for why this isn't an import).
const PERSONAS = ['homeFan', 'awayFan', 'neutral', 'pundit', 'chaos']
// One entry per persona, read from the referendum's counters.
const PERSONA_COUNTERS = PERSONAS.map(
  (p) =>
    `{"persona": "${p}", "uphold": coalesce(botVotes.byPersona.${p}.uphold, 0), "overturn": coalesce(botVotes.byPersona.${p}.overturn, 0)}`,
).join(', ')
const PERSONA_LABELS: Record<string, string> = {
  homeFan: 'Home fans',
  awayFan: 'Away fans',
  neutral: 'Neutrals',
  pundit: 'Pundits',
  chaos: 'Chaos voter',
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return now
}

// The latest referendum with its crowd broken down by persona: what the operator sees and the public doesn't.
// Raw GROQ on purpose: human votes are counted from documents, which a projection of one handle can't do.
// The bots are counters on the referendum (botVotes.byPersona).
export function LiveRound() {
  const {data} = useQuery<Round | null>({
    query: `*[_type == "referendum"] | order(windowOpensAt desc)[0]{
      _id, round, loop, closesAt, result,
      "title": incident->title, "varRecommendation": incident->varRecommendation,
      "humansUphold": count(*[_type == "vote" && references(^._id) && choice == "uphold"]),
      "humansOverturn": count(*[_type == "vote" && references(^._id) && choice == "overturn"]),
      "personas": [${PERSONA_COUNTERS}]
    }`,
  })
  const now = useNow()
  const [closing, setClosing] = useState<string>()
  if (!data) return <p className="muted">No referendum yet.</p>

  const left = Math.max(0, (Date.parse(data.closesAt) - now) / 1000)
  const botsUp = data.personas.reduce((n, p) => n + p.uphold, 0)
  const botsDown = data.personas.reduce((n, p) => n + p.overturn, 0)
  const up = botsUp + HUMAN_VOTE_WEIGHT * data.humansUphold
  const down = botsDown + HUMAN_VOTE_WEIGHT * data.humansOverturn
  const pct = up + down ? Math.round((100 * up) / (up + down)) : 50

  return (
    <div className="live">
      <p className="muted">
        {data.title} · loop {data.loop} · {data.round}
      </p>
      <p className="big">
        {data.result ? data.result : left > 0 ? `${Math.ceil(left)} s` : 'Counting…'}
        <span className="muted small"> uphold {CALL_LABELS[data.varRecommendation]}?</span>
      </p>
      <div className="bar">
        <div className="bar-fill" style={{width: `${pct}%`}} />
      </div>
      <p className="small">
        {pct}% uphold (weighted) · humans {data.humansUphold} up / {data.humansOverturn} down at ×{HUMAN_VOTE_WEIGHT}
      </p>
      <table className="personas">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Uphold</th>
            <th>Overturn</th>
          </tr>
        </thead>
        <tbody>
          {data.personas.map((p) => (
            <tr key={p.persona}>
              <td>{PERSONA_LABELS[p.persona]}</td>
              <td>{p.uphold}</td>
              <td>{p.overturn}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.result && left === 0 && (
        <div className="row">
          <button type="button" onClick={async () => setClosing((await closeWindow()).status)}>
            Close the window now
          </button>
          {closing && <span className="small">{closing}</span>}
        </div>
      )}
    </div>
  )
}
