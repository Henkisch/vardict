import {useQuery} from '@sanity/sdk-react'

import {CALL_LABELS, INCIDENT_FIELDS} from '../api'

type Row = {
  _id: string
  title: string
  minute: number
  fixture: string
  controlCase?: boolean
  finalCall?: string
  rounds: number
  last?: {result?: string}
}

// The match-day list: which incidents are decided, which is live, which are still to play. Read only; the
// order the booth plays them in is /api/start's "next in line".
export function IncidentBoard() {
  const {data} = useQuery<Row[]>({
    query: `*[_type == "incident" && !(_id in path("drafts.**"))] | order(match->date asc){
      ${INCIDENT_FIELDS}, finalCall,
      "rounds": count(*[_type == "referendum" && references(^._id)]),
      "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0]{result}
    }`,
  })
  return (
    <section className="panel board">
      <header className="panel-head">
        <h2>Match day</h2>
      </header>
      <ol className="fixtures">
        {data.map((row) => {
          const live = row.last && !row.last.result
          const status = live
            ? 'LIVE'
            : row.finalCall
              ? `FT · ${CALL_LABELS[row.finalCall]}`
              : row.rounds
                ? `${row.rounds} ROUNDS · open`
                : 'TO PLAY'
          return (
            <li key={row._id} className={`fixture ${live ? 'live' : row.finalCall ? 'done' : ''}`}>
              <span className="mono small muted">{row.minute}&apos;</span>
              <span className="fixture-name">
                {row.title}
                <span className="muted small"> · {row.fixture}{row.controlCase ? ' · control case' : ''}</span>
              </span>
              <span className="mono small fixture-status">{status}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
