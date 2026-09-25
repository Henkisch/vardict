import {useQuery} from '@sanity/sdk-react'
import {useEffect, useRef, useState} from 'react'

import {CALL_LABELS, CHECK, closeWindow, INCIDENT_FIELDS, roundLabel, sendToThePeople, type Team} from '../api'
import {useNow} from '../useNow'
import {Scorebug} from './Scorebug'

type Incident = {
  _id: string
  title: string
  minute: number
  originalCall: string
  varRecommendation: string
  controlCase?: boolean
  incidentType?: string
  home: Team
  away: Team
}
type Ref = {_id: string; round: string; result?: string; windowOpensAt: string; closesAt: string; incident: Incident}
type Board = {ref: Ref | null; next: Incident | null}

// L1-L3 of the booth (design.md): the incident under review, what's happening to it now, and the one press. The
// press posts to the same /api/start as /live's button, so it follows the run step by step.
type Run = {currentStage: string} | null

// The live run from the private workflows dataset: whether a VAR check is running decides the first press.
export function UnderReview() {
  const {data: run} = useQuery<Run>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: `*[_type == "sanity.workflow.instance" && tag == "dev" && !defined(completedAt)] | order(startedAt desc)[0]{currentStage}`,
  })
  return <Review run={run} />
}

function Review({run}: {run: Run}) {
  const {data} = useQuery<Board>({
    query: `{
      "ref": *[_type == "referendum"] | order(windowOpensAt desc)[0]{
        _id, round, result, windowOpensAt, closesAt, "incident": incident->{${INCIDENT_FIELDS}}
      },
      "next": *[_type == "incident" && !defined(finalCall) && !(_id in path("drafts.**"))]{
        ${INCIDENT_FIELDS},
        "last": *[_type == "referendum" && references(^._id)] | order(windowOpensAt desc)[0].windowOpensAt,
        "date": match->date
      } | order(coalesce(last, "0") asc, date asc)[0]
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
    ? 'next'
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
          : 'next'

  // The crowd and /live close windows too; the booth nudges once in case it's the only screen open.
  useEffect(() => {
    if (phase !== 'counting' || !ref || ticked.current === ref._id) return
    const id = setTimeout(() => {
      ticked.current = ref._id
      void closeWindow()
    }, 2000)
    return () => clearTimeout(id)
  }, [phase, ref])

  // No run: the next incident waits for its VAR check. A run in the VAR room: its check is under way.
  const checking = run?.currentStage === 'varRoom'
  const incident = phase === 'next' ? data?.next : ref?.incident
  const check = `VAR check · ${CHECK[incident?.incidentType ?? ''] ?? 'review'}`
  const now_ =
    phase === 'kickoff'
      ? {label: `Kick-off in ${Math.ceil((opens - now) / 1000)}`, live: true}
      : phase === 'voting'
        ? {label: `Fans vote · ${Math.ceil((closes - now) / 1000)}`, live: true, detail: roundLabel(ref!.round)}
        : phase === 'counting'
          ? {label: 'Counting', live: true}
          : phase === 'between'
            ? {label: 'Too close to call', detail: `after ${roundLabel(ref!.round).toLowerCase()}`}
            : phase === 'parked'
              ? {label: check, detail: 'back from the fans: nobody voted'}
              : {label: check}
  const button =
    phase === 'between'
      ? ref?.round === 'regular'
        ? 'Go to extra time'
        : 'Penalties!'
      : !incident
        ? 'Start a new season'
        : checking || phase === 'parked'
          ? 'Send to the people'
          : 'Start the VAR check'
  const locked = busy || phase === 'kickoff' || phase === 'voting' || phase === 'counting'

  async function press() {
    setBusy(true)
    setMessage(undefined)
    const startCheck = phase === 'next' && !checking
    const result = await sendToThePeople(undefined, {check: startCheck}).catch(() => ({status: 'unreachable'}) as const)
    setBusy(false)
    setMessage(
      result.status === 'started' || result.status === 'recommended' || result.status === 'kickedOff' || result.status === 'checking'
        ? undefined
        : result.status === 'busy'
          ? 'Busy. Press again in a moment.'
          : result.status === 'coolingDown' && 'retryInSeconds' in result
            ? `Cooling down: ${result.retryInSeconds} s.`
            : `Refused: ${result.status}`,
    )
  }

  if (!incident) {
    return (
      <section className="review">
        <p className="review-kicker">Every incident has a final call</p>
        <div className="review-action">
          <button type="button" className="press" onClick={press} disabled={busy}>
            {busy ? 'Starting…' : 'Start a new season'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="review" aria-label={phase === 'next' ? 'Next up' : 'Under review'}>
      <div className="review-subject">
        <p className="review-kicker">
          {phase === 'next' && !checking ? 'Next up · waiting for the VAR check' : 'Under review'}
          {incident.controlCase && ' · control case'}
        </p>
        <Scorebug home={incident.home} away={incident.away} minute={incident.minute} />
        <h2 className="review-title">{incident.title}</h2>
        <div className="calls">
          <p className="call">
            <span>Referee</span>
            <strong>{CALL_LABELS[incident.originalCall]}</strong>
          </p>
          <span className="call-arrow" aria-hidden>
            →
          </span>
          <p className="call">
            <span>VAR</span>
            <strong className="accent">{CALL_LABELS[incident.varRecommendation]}</strong>
          </p>
        </div>
      </div>
      <div className="review-action">
        <p className={`lower-third ${now_.live ? 'live' : ''}`}>
          <span className="lower-third-tab" aria-hidden />
          <span className="lower-third-label">{now_.label}</span>
          {now_.detail && <span className="lower-third-detail">{now_.detail}</span>}
        </p>
        <button type="button" className="press" onClick={press} disabled={locked}>
          {busy ? 'Sending…' : locked ? 'Fans have the call' : button}
        </button>
        {message && <p className="warn">{message}</p>}
      </div>
    </section>
  )
}
