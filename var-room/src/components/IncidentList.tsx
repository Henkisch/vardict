import {useDocumentProjection, useDocuments, type DocumentHandle} from '@sanity/sdk-react'
import {Suspense, useState} from 'react'

import {CALL_LABELS, sendToThePeople} from '../api'

export function IncidentList() {
  const {data} = useDocuments({documentType: 'incident', orderings: [{field: 'title', direction: 'asc'}]})
  return (
    <ul className="incidents">
      {data.map((handle) => (
        <Suspense key={handle.documentId} fallback={<li className="incident muted">Loading…</li>}>
          <IncidentRow {...handle} />
        </Suspense>
      ))}
    </ul>
  )
}

type Row = {
  title: string
  minute: number
  situation?: string
  controlCase?: boolean
  varRecommendation: string
  finalCall?: string
  fixture: string
  rounds: number
  lastResult?: string
}

function IncidentRow(handle: DocumentHandle) {
  const {data} = useDocumentProjection<Row>({
    ...handle,
    projection: `{
      title, minute, situation, controlCase, varRecommendation, finalCall,
      "fixture": match->homeTeam->shortName + " v " + match->awayTeam->shortName,
      "rounds": count(*[_type == "referendum" && references(^._id)]),
      "lastResult": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].result
    }`,
  })
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (!data) return null

  async function send() {
    setBusy(true)
    const result = await sendToThePeople(handle.documentId)
    setBusy(false)
    setMessage(
      result.status === 'started' || result.status === 'recommended'
        ? 'Sent to the people.'
        : result.status === 'busy'
          ? `Another run is live (${result.stage}).`
          : result.status === 'coolingDown'
            ? `Cooling down: ${result.retryInSeconds} s.`
            : result.status,
    )
  }

  return (
    <li className="incident">
      <div className="incident-head">
        <strong>{data.title}</strong>
        {data.controlCase && <span className="badge">Control case</span>}
      </div>
      <p className="muted">
        {data.fixture} · {data.minute}&apos; · VAR recommends {CALL_LABELS[data.varRecommendation]}
      </p>
      <p className="muted small">
        {data.finalCall
          ? `Final call: ${CALL_LABELS[data.finalCall]} (upheld by the people)`
          : data.rounds
            ? `${data.rounds} rounds so far, last: ${data.lastResult ?? 'open'}`
            : 'Not yet sent to the people'}
      </p>
      <div className="row">
        <button type="button" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send to the people'}
        </button>
        {message && <span className="small">{message}</span>}
      </div>
    </li>
  )
}
