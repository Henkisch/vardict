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
    <section className="board" aria-label="Match day">
      <p className="feed-head">Match day</p>
      <ol className="fixtures">
        {data.map((row) => {
          const live = Boolean(row.last && !row.last.result)
          const status = live ? 'Live' : row.finalCall ? CALL_LABELS[row.finalCall] : row.rounds ? `${row.rounds} rounds` : 'To play'
          return (
            <li key={row._id} className={`fixture ${live ? 'live' : row.finalCall ? 'done' : ''}`}>
              <span className="fixture-name">{row.title}</span>
              <span className="fixture-status">{status}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
