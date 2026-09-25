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
  last?: {result?: string; windowOpensAt: string}
  home: {shortName: string}
  away: {shortName: string}
}

// The match-day list: which incidents are decided, which is live, which are still to play. Read only; the
// order the booth plays them in is /api/start's "next in line".
// The live run from the private workflows dataset, so a VAR check or a parked run shows as live too (plan 016 #19).
export function IncidentBoard() {
  const {data: runIncident} = useQuery<string | null>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: `*[_type == "sanity.workflow.instance" && tag == "dev" && !defined(completedAt)] | order(startedAt desc)[0].fields[name == "subject"][0].value.id`,
  })
  return <Board runIncident={runIncident ? runIncident.split(':').at(-1)! : undefined} />
}

function Board({runIncident}: {runIncident?: string}) {
  const {data} = useQuery<Row[]>({
    query: `*[_type == "incident" && !(_id in path("drafts.**"))] | order(match->date asc){
      ${INCIDENT_FIELDS}, finalCall,
      "rounds": count(*[_type == "referendum" && references(^._id)]),
      "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0]{result, windowOpensAt}
    }`,
  })
  const liveId = runIncident ?? data.find((row) => row.last && !row.last.result)?._id
  // Next in line, the same rule as /api/start (ties go to the earliest match; `data` is already in match order): undecided, longest since its last round (never played first).
  const nextId = liveId
    ? undefined
    : data
        .filter((row) => !row.finalCall)
        .sort((a, b) => (a.last?.windowOpensAt ?? '0').localeCompare(b.last?.windowOpensAt ?? '0'))[0]?._id // stable: ties keep match-date order

  return (
    <section className="board" aria-label="Match day">
      <p className="feed-head">Match day</p>
      <ol className="fixtures">
        {data.map((row) => {
          const live = row._id === liveId
          const next = row._id === nextId
          const status = live
            ? 'Live'
            : row.finalCall
              ? CALL_LABELS[row.finalCall]
              : next
                ? 'Next up'
                : row.rounds
                  ? `${row.rounds} ${row.rounds === 1 ? 'round' : 'rounds'}`
                  : 'To play'
          return (
            <li key={row._id} className={`fixture ${live ? 'live' : next ? 'next' : row.finalCall ? 'done' : ''}`}>
              <span className="fixture-teams">
                {row.home.shortName} <span className="lower">v</span> {row.away.shortName}
              </span>
              <span className="fixture-name">{row.title}</span>
              <span className="fixture-status">{status}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
