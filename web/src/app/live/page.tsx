'use client'

import Link from 'next/link'
import {useEffect, useState, useSyncExternalStore} from 'react'

import {Bars} from '@/components/Bars'
import {Clip} from '@/components/Clip'
import {EnterStadium} from '@/components/EnterStadium'
import {FitBox} from '@/components/FitBox'
import {KickOff} from '@/components/KickOff'
import {PunditTicker} from '@/components/PunditTicker'
import {VarRoomScene} from '@/components/VarRoomScene'
import {Verdict} from '@/components/Verdict'
import {VoteButtons} from '@/components/VoteButtons'
import {useCloseWhenCounting, useLiveState, useNow} from '@/lib/live'
import {CALL_LABELS, HUMAN_VOTE_WEIGHT, roundLabel, type LiveState} from '@/lib/queries'
import {runPhase} from '@/lib/run-status'
import {cue, setIntensity, setMuted, startStadium} from '@/lib/stadium-audio'

export default function LivePage() {
  const now = useNow()
  const {state, refresh, boost} = useLiveState<LiveState>('/api/live?q=live', (s) => runPhase(s?.referendum, now))
  const ref = state?.referendum
  const closesAt = ref ? Date.parse(ref.closesAt) : 0
  const secondsLeft = ref && !ref.result ? Math.max(0, (closesAt - now) / 1000) : 0
  const phase = runPhase(ref, now)
  const voting = phase === 'voting'
  const counting = phase === 'counting'
  const between = phase === 'between'

  useCloseWhenCounting(counting)

  // Experience v3: nothing moves on by itself. Every press (Let the fans decide, Go to extra time, Take the next
  // penalty, Start a new season) runs the 3-2-1 kick-off, then asks the server to open the next vote.
  const [startMessage, setStartMessage] = useState<string>()
  const [kickingOff, setKickingOff] = useState<{from?: string} | null>(null)
  // The server starts on the press, while the 3-2-1 plays, so the round is usually ready by the whistle.
  function press() {
    if (kickingOff) return
    setStartMessage(undefined)
    setKickingOff({from: ref?._id})
    void startNextRound()
  }
  function whistle() {
    cue('whistle')
  }
  async function startNextRound() {
    boost()
    const response = await fetch('/api/start', {method: 'POST'}).catch(() => undefined)
    const body = response ? await response.json().catch(() => ({})) : {}
    // Fetch the new round straight away (and once more, in case the effect was still being drained).
    refresh()
    setTimeout(refresh, 1500)
    const message =
      body.status === 'busy'
        ? 'A vote is already live.'
        : body.status === 'coolingDown'
          ? `The VAR room needs ${body.retryInSeconds} more seconds.`
          : body.status === 'rateLimited'
            ? 'Easy. Try again in a minute.'
            : body.status === 'dailyLimit'
              ? 'The VAR room has done enough for today. Come back tomorrow.'
              : body.status === 'paused'
                ? 'The VAR room is closed for now.'
                : !response?.ok
                  ? 'Something went wrong. Try again.'
                  : undefined
    if (message) {
      setKickingOff(null)
      setStartMessage(message)
    }
  }
  // The kick-off stays up until the new round is on screen (or 10 s, if it never shows).
  if (kickingOff && ref && ref._id !== kickingOff.from && voting) setKickingOff(null)
  useEffect(() => {
    if (!kickingOff) return
    const id = setTimeout(() => setKickingOff(null), 10_000)
    return () => clearTimeout(id)
  }, [kickingOff])

  // A result holds on the verdict screen until someone presses. Rounds this tab watched live get their verdict;
  // a visitor arriving later goes straight to the VAR room (except mid-run, where the verdict carries the button).
  const [watched, setWatched] = useState<string>()
  const [acknowledged, setAcknowledged] = useState<string>()
  if ((voting || counting) && ref && watched !== ref._id) setWatched(ref._id)
  const showVerdict = Boolean(ref?.result && (between || (ref._id === watched && acknowledged !== ref._id)))

  const parked = phase === 'parked'
  const decided = phase === 'decided'

  // Enter the stadium: shown once per browser session. The click also starts the sound (autoplay policy).
  const sessionEntered = useSyncExternalStore(noop, readEntered, () => true)
  const [enteredNow, setEnteredNow] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [muted, setMutedState] = useState(false)
  function enter() {
    void startStadium()
    setSoundOn(true)
    setEnteredNow(true)
    try {
      sessionStorage.setItem(ENTERED_KEY, '1')
    } catch {
      // Private mode or blocked storage: the intro just shows again next visit.
    }
  }
  function toggleSound() {
    if (!soundOn) {
      void startStadium()
      setSoundOn(true)
      return
    }
    void setMuted(!muted)
    setMutedState(!muted)
  }

  // The crowd follows the vote: louder the closer it is, loudest while counting, quiet between votes.
  const total = ref ? ref.uphold + ref.overturn : 0
  const upholdPct = total ? (ref!.uphold / total) * 100 : 50
  useEffect(() => {
    if (!soundOn) return
    const tension = 1 - Math.min(1, Math.abs(upholdPct - 50) / 25)
    setIntensity(voting ? 0.4 + 0.45 * tension : counting ? 0.85 : 0.12)
  }, [soundOn, voting, counting, upholdPct])

  // And reacts once to each result: a gasp at too close, a roar at a decision, the full-time whistle at the end.
  const verdictKey = showVerdict && ref?.result ? `${ref._id}:${ref.result}` : undefined
  useEffect(() => {
    if (!soundOn || !verdictKey || !ref?.result) return
    if (ref.result === 'tooClose') cue('gasp')
    else if (phase === 'decided') {
      cue('fullTime')
      cue(ref.result === 'upheld' ? 'roar' : 'groan')
    } else cue('roar')
    // One reaction per result: keyed on verdictKey only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictKey, soundOn])

  // What the pundits talk about right now.
  const trigger = kickingOff
    ? 'kickoff'
    : voting || counting
      ? 'voting'
      : showVerdict && ref?.result
        ? ref.round.startsWith('shootout') && between
          ? ref.result === 'upheld'
            ? 'penaltyScored'
            : 'penaltySaved'
          : ref.result === 'tooClose'
            ? 'tooClose'
            : phase === 'decided'
              ? ref.result === 'upheld'
                ? 'upheld'
                : 'abandoned'
              : 'overturned'
        : 'review'
  const tickerIncident = showVerdict || voting || counting || parked ? ref?.incident._id : state?.next?._id
  const start = <StartButton onClick={press} busy={Boolean(kickingOff)} message={startMessage} />
  const nextLabel =
    ref?.round === 'regular' ? 'Go to extra time' : ref?.round === 'extraTime' ? 'Penalties!' : 'Take the next penalty'
  const verdictAction = between ? (
    <StartButton onClick={press} busy={Boolean(kickingOff)} message={startMessage} label={nextLabel} />
  ) : (
    <StartButton
      onClick={() => setAcknowledged(ref?._id)}
      busy={false}
      label={parked ? 'Back to the VAR room' : 'Next incident'}
    />
  )

  const incident = ref?.incident
  const home = incident?.match.homeTeam
  const away = incident?.match.awayTeam
  const won = ref?.shootout.filter((r) => r === 'upheld').length ?? 0
  const lost = ref?.shootout.filter((r) => r === 'overturned').length ?? 0

  return (
    <div className="stadium flex min-h-dvh flex-col">
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 px-4 py-3 sm:px-6 lg:h-dvh lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-1">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide">
            VAR<span className="text-var">dict</span>
          </h1>
          <p className="text-lg text-muted">VAR, finally in the fans&apos; hands.</p>
        </div>
        <div className="flex items-baseline gap-5">
          <button
            type="button"
            onClick={toggleSound}
            className="font-display text-lg font-bold uppercase tracking-[0.15em] text-muted hover:text-chalk"
          >
            {!soundOn ? '🔈 Sound on' : muted ? '🔇 Unmute' : '🔊 Mute'}
          </button>
          <Link href="/incidents" className="font-display text-lg font-bold uppercase tracking-[0.15em] text-muted hover:text-chalk">
            Results →
          </Link>
        </div>
      </header>

      {!sessionEntered && !enteredNow && state && <EnterStadium fixtures={state.fixtures} onEnter={enter} />}
      {kickingOff && <KickOff onWhistle={whistle} />}

      {showVerdict && ref ? (
        <Verdict round={ref} phase={phase} action={verdictAction} />
      ) : parked && ref ? (
        <VarRoomScene incident={ref.incident} loop={ref.loop + 1} start={start} />
      ) : decided ? (
        state?.next ? (
          <VarRoomScene incident={state.next} last={ref ?? undefined} start={start} />
        ) : state ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="font-display text-4xl font-extrabold uppercase">Every call has been confirmed</p>
            <p className="max-w-xl text-muted">The people have upheld all five. Democracy is complete, and slower.</p>
            <StartButton onClick={press} busy={Boolean(kickingOff)} message={startMessage} label="Start a new season" />
          </section>
        ) : (
          <p className="py-16 text-center text-muted">Connecting to the VAR room…</p>
        )
      ) : incident && ref ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-h-0 min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-bold uppercase tracking-wide">
                <span style={{color: home?.primaryColor}}>■</span> {home?.shortName} v {away?.shortName}{' '}
                <span style={{color: away?.primaryColor}}>■</span>
                <span className="ml-3 text-muted">{incident.minute}&apos;</span>
              </p>
              <p className="text-sm text-muted">{incident.match.competition}</p>
            </div>
            <FitBox ratio={16 / 9} className="w-full lg:flex-1">
              <Clip clip={incident.clip} fallbackText={incident.fallbackText} />
            </FitBox>
            {incident.situation && <p className="text-xl leading-snug">{incident.situation}</p>}
          </section>

          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-pitch p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted">The VAR room recommends</p>
              <p className="font-display text-5xl font-extrabold uppercase text-var">
                {CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation}
              </p>
              <p className="text-sm text-muted">
                On the pitch: {CALL_LABELS[incident.originalCall] ?? incident.originalCall}
              </p>
            </div>

            <div className="flex items-baseline justify-between">
              <p className="font-display text-xl font-bold uppercase">{roundLabel(ref.round)}</p>
              {(voting || counting) && (
                <p className="font-display text-5xl font-extrabold tabular">
                  {Math.ceil(secondsLeft)}
                  <span className="text-xl text-muted">s</span>
                </p>
              )}
            </div>
            {ref.round.startsWith('shootout') && (
              <p className="font-display text-2xl font-bold tabular">
                Shootout <span className="text-uphold">{won}</span> – <span className="text-overturn">{lost}</span>
                <span className="ml-2 text-base font-medium text-muted">first to 3</span>
              </p>
            )}

            <div className="jumbotron rounded-lg p-3">
              <Bars uphold={ref.uphold} overturn={ref.overturn} />
            </div>

            {counting && <p className="font-display text-3xl font-bold uppercase text-var">Counting…</p>}

            {voting && (
              <div className="flex flex-col gap-2">
                <VoteButtons key={ref._id} referendumId={ref._id} size="panel" />
                <p className="text-sm text-muted">
                  Your vote counts ×{HUMAN_VOTE_WEIGHT} against {ref.bots} simulated fans.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
      {state && <PunditTicker lines={state.pundits} trigger={trigger} incidentId={tickerIncident} />}
    </main>
    </div>
  )
}

const ENTERED_KEY = 'vardict-entered'
const noop = () => () => {}
function readEntered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1'
  } catch {
    return false
  }
}

function StartButton({
  onClick,
  busy,
  message,
  label = 'Let the fans decide',
}: {
  onClick: () => void
  busy: boolean
  message?: string
  label?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full rounded-lg bg-var px-8 py-4 font-display text-3xl font-extrabold uppercase text-ink hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk disabled:opacity-60"
      >
        {busy ? 'Checking the monitor…' : label}
      </button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  )
}
