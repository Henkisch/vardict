import {useQuery} from '@sanity/sdk-react'
import {useEffect, useRef, useState} from 'react'

import {CALL_LABELS, closeWindow, INCIDENT_FIELDS, roundLabel, sendToThePeople} from '../api'
import {useNow} from '../useNow'

type Incident = {
  _id: string
  title: string
  minute: number
  originalCall: string
  varRecommendation: string
  controlCase?: boolean
  fixture: string
}
type Ref = {_id: string; round: string; result?: string; windowOpensAt: string; closesAt: string; incident: Incident}
type Board = {ref: Ref | null; next: Incident | null}

// The booth's one button: the same step-by-step press /live has (it posts to the same /api/start), labelled
// for whatever the run is waiting for. Derived from the latest round, like /live's runPhase.
export function TheCall() {
  const {data} = useQuery<Board>({
    query: `{
      "ref": *[_type == "referendum"] | order(windowOpensAt desc)[0]{
        _id, round, result, windowOpensAt, closesAt, "incident": incident->{${INCIDENT_FIELDS}}
      },
      "next": *[_type == "incident" && !defined(finalCall) && !(_id in path("drafts.**"))]{
        ${INCIDENT_FIELDS},
        "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt
      } | order(coalesce(last, "0") asc)[0]
    }`,
  })
  const now = useNow(250)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const ticked = useRef<string>(undefined)

  const ref = data?.ref
  const opens = ref ? Date.parse(ref.windowOpensAt) : 0
  const closes = ref ? Date.parse(ref.closesAt) : 0
  const phase = !ref
    ? 'send'
    : !ref.result
      ? now < opens
        ? 'kickoff'
        : now < closes
          ? 'voting'
          : 'counting'
      : ref.result === 'tooClose'
        ? 'between'
        : ref.result === 'noVotes'
          ? 'parked'
          : 'decided'

  // The crowd and /live close windows too; the booth nudges once in case it's the only screen open.
  useEffect(() => {
    if (phase !== 'counting' || !ref || ticked.current === ref._id) return
    const id = setTimeout(() => {
      ticked.current = ref._id
      void closeWindow()
    }, 2000)
    return () => clearTimeout(id)
  }, [phase, ref])

  const incident = phase === 'decided' || phase === 'send' ? data?.next : ref?.incident
  const label =
    phase === 'kickoff'
      ? `Kick-off in ${Math.ceil((opens - now) / 1000)}`
      : phase === 'voting'
        ? `Fans voting · ${Math.ceil((closes - now) / 1000)} s`
        : phase === 'counting'
          ? 'Counting…'
          : phase === 'between'
            ? ref?.round === 'regular'
              ? 'Go to extra time'
              : 'Penalties!'
            : incident
              ? 'Send to the people'
              : 'Start a new season'
  const locked = busy || phase === 'kickoff' || phase === 'voting' || phase === 'counting'

  async function press() {
    setBusy(true)
    setMessage(undefined)
    const result = await sendToThePeople().catch(() => ({status: 'unreachable'}) as const)
    setBusy(false)
    setMessage(
      result.status === 'started' || result.status === 'recommended' || result.status === 'kickedOff'
        ? undefined
        : result.status === 'busy'
          ? 'Busy, press again in a moment.'
          : result.status === 'coolingDown' && 'retryInSeconds' in result
            ? `Cooling down: ${result.retryInSeconds} s.`
            : `Refused: ${result.status}`,
    )
  }

  return (
    <section className="panel call">
      <header className="panel-head">
        <h2>The call</h2>
        {ref && !['decided', 'send', 'parked'].includes(phase) && <p className="mono small accent">{roundLabel(ref.round).toUpperCase()}</p>}
      </header>
      {incident ? (
        <div className="call-incident">
          <p className="mono small muted">
            {incident.fixture} · {incident.minute}&apos;{incident.controlCase ? ' · CONTROL CASE' : ''}
          </p>
          <p className="call-title">{incident.title}</p>
          <dl className="calls">
            <div>
              <dt>On the pitch</dt>
              <dd>{CALL_LABELS[incident.originalCall]}</dd>
            </div>
            <div>
              <dt>VAR recommends</dt>
              <dd className="accent">{CALL_LABELS[incident.varRecommendation]}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="muted">Every incident has a final call. The next press starts a new season.</p>
      )}
      <button type="button" className={`big-button ${locked ? '' : 'armed'}`} onClick={press} disabled={locked}>
        {busy ? 'Sending…' : label}
      </button>
      {message && <p className="small warn">{message}</p>}
      {phase === 'parked' && <p className="small muted">No fans voted last round: back from the VAR room.</p>}
    </section>
  )
}
