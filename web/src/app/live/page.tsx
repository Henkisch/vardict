'use client'

import Link from 'next/link'
import {useEffect, useState, useSyncExternalStore} from 'react'

import {Bars} from '@/components/Bars'
import {Clip} from '@/components/Clip'
import {EnterStadium} from '@/components/EnterStadium'
import {KickOff} from '@/components/KickOff'
import {MatchScene} from '@/components/MatchScene'
import {PunditTicker} from '@/components/PunditTicker'
import {PageTransition} from '@/components/PageTransition'
import {SceneTransition} from '@/components/SceneTransition'
import {SiteHeader} from '@/components/SiteHeader'
import {useSound} from '@/components/SoundToggle'
import {StepIndicator, type Step} from '@/components/StepIndicator'
import {VarRoomScene} from '@/components/VarRoomScene'
import {WaitingScene} from '@/components/WaitingScene'
import {Verdict} from '@/components/Verdict'
import {VoteButtons} from '@/components/VoteButtons'
import {useCloseWhenCounting, useLiveState, useNow} from '@/lib/live'
import {CALL_LABELS, HUMAN_VOTE_WEIGHT, roundLabel, type LiveState} from '@/lib/queries'
import {runPhase} from '@/lib/run-status'
import {cue, setIntensity, startStadium} from '@/lib/stadium-audio'

export default function LivePage() {
  const now = useNow()
  // Nothing running (no workflow run live) is the waiting screen, which must never sleep: someone else may start
  // the VAR check at any moment.
  const {state, refresh, boost} = useLiveState<LiveState>(
    '/api/live?q=live',
    // A live run (the VAR room included) polls like a vote: the booth can send it on at any moment.
    (s) => {
      const phase = runPhase(s?.referendum, now)
      // A live run (VAR check, or parked after a round nobody voted in) polls like a vote: the booth can press on.
      return s?.run && (phase === 'decided' || phase === 'parked') ? 'between' : phase
    },
    (s) => !s?.run,
  )
  const ref = state?.referendum
  const closesAt = ref ? Date.parse(ref.closesAt) : 0
  // A new round opens KICKOFF_SECONDS after it's created: every screen counts down to windowOpensAt.
  const opensAt = ref ? Date.parse(ref.windowOpensAt) : 0
  const kickoffLeft = ref && !ref.result ? Math.max(0, (opensAt - now) / 1000) : 0
  const countingDown = kickoffLeft > 0
  const secondsLeft = ref && !ref.result ? Math.max(0, (closesAt - Math.max(now, opensAt)) / 1000) : 0
  const phase = runPhase(ref, now)
  const voting = phase === 'voting'
  const counting = phase === 'counting'
  const between = phase === 'between'

  useCloseWhenCounting(counting)

  // Experience v3: nothing moves on by itself. Every press (Let the fans decide, Go to extra time, Take the next
  // penalty, Start a new season) runs the 3-2-1 kick-off, then asks the server to open the next vote.
  const [startMessage, setStartMessage] = useState<string>()
  // The press only asks the server; the button says so. The screen changes once, when the new round exists, and
  // the 3-2-1 then plays over the vote screen (timed by the round's windowOpensAt).
  const [starting, setStarting] = useState<{from?: string; check?: boolean} | null>(null)
  function press() {
    if (starting) return
    setStartMessage(undefined)
    setStarting({from: ref?._id})
    void startNextRound()
  }
  // The waiting screen's press: start the VAR check only (the run waits in the VAR room for the next press).
  function pressCheck() {
    if (starting) return
    setStartMessage(undefined)
    setStarting({from: ref?._id, check: true})
    void startNextRound(true)
  }
  async function startNextRound(check = false) {
    boost()
    const response = await fetch(
      '/api/start',
      // Every press names its step, so the server never starts a run straight into a vote from a stale screen.
      {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({step: check ? 'check' : 'send'})},
    ).catch(() => undefined)
    const body = response ? await response.json().catch(() => ({})) : {}
    // Fetch the new round straight away (and once more, in case the effect was still being drained).
    refresh()
    setTimeout(refresh, 1500)
    const message =
      body.status === 'busy'
        ? "Something's already under way. Give it a few seconds."
        : body.status === 'nothingToSend'
          ? 'That VAR check has ended. The screen is catching up.'
          : body.status === 'coolingDown'
            ? `The VAR room needs a moment. Try again in ${body.retryInSeconds} s.`
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
      setStarting(null)
      setStartMessage(message)
    }
  }
  // Done starting once the new round is on screen, or for a VAR check once the run shows up (or after 15 s).
  const run = state?.run
  if (starting && ref && ref._id !== starting.from) setStarting(null)
  if (starting?.check && run) setStarting(null)
  useEffect(() => {
    if (!starting) return
    // Longer than the slowest first press (~13 s) plus a poll, so the button doesn't unlock mid-start.
    const id = setTimeout(() => setStarting(null), 30_000)
    return () => clearTimeout(id)
  }, [starting])

  // A result holds on the verdict screen until someone presses. Rounds this tab watched live get their verdict;
  // a visitor arriving later goes straight to the VAR room (except mid-run, where the verdict carries the button).
  const [watched, setWatched] = useState<string>()
  const [acknowledged, setAcknowledged] = useState<string>()
  if ((voting || counting) && ref && watched !== ref._id) setWatched(ref._id)
  // ...unless someone (the VAR Room, another tab) has already started the next incident's VAR check.
  const movedOn = Boolean(state?.run && ref && state.run.incidentId !== ref.incident._id)
  const showVerdict = Boolean(ref?.result && !movedOn && (between || (ref._id === watched && acknowledged !== ref._id)))

  const parked = phase === 'parked'
  const decided = phase === 'decided'

  // Enter the stadium: shown once per browser session. The click also starts the sound (autoplay policy).
  const sessionEntered = useSyncExternalStore(noop, readEntered, () => true)
  const [enteredNow, setEnteredNow] = useState(false)
  const sound = useSound()
  const soundOn = sound !== 'off'
  function enter() {
    void startStadium()
    setEnteredNow(true)
    try {
      sessionStorage.setItem(ENTERED_KEY, '1')
    } catch {
      // Private mode or blocked storage: the intro just shows again next visit.
    }
  }

  // The crowd follows the vote: louder the closer it is, loudest while counting, quiet between votes.
  const total = ref ? ref.uphold + ref.overturn : 0
  const upholdPct = total ? (ref!.uphold / total) * 100 : 50
  useEffect(() => {
    if (!soundOn) return
    const tension = 1 - Math.min(1, Math.abs(upholdPct - 50) / 25)
    setIntensity(voting ? 0.4 + 0.45 * tension : counting ? 0.85 : 0.12)
  }, [soundOn, voting, counting, upholdPct])

  // And reacts once to each result: an "ooh" at too close, a roar at a decision.
  const verdictKey = showVerdict && ref?.result ? `${ref._id}:${ref.result}` : undefined
  useEffect(() => {
    if (!soundOn || !verdictKey || !ref?.result) return
    // A decision gets a roar either way (the fans won something); nobody voting gets a groan.
    if (ref.result === 'tooClose') cue('gasp')
    else if (ref.result === 'noVotes') cue('groan')
    else cue('roar')
    // One reaction per result: keyed on verdictKey only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictKey, soundOn])

  // What the pundits talk about right now.
  const trigger = countingDown
    ? 'kickoff'
    : voting || counting
      ? 'voting'
      : showVerdict && ref?.result
        ? ref.result === 'noVotes'
          ? 'noVotes'
          : ref.result === 'tooClose'
            ? 'tooClose'
            : ref.result === 'upheld'
              ? 'upheld'
              : 'overturned'
        : 'review'
  // Which of the three steps the screen is on.
  const step: Step = voting || counting ? 'vote' : showVerdict ? 'verdict' : 'var-room'
  const roundName = ref?.round === 'regular' ? 'Regular time' : ref?.round === 'extraTime' ? 'Extra time' : ref ? 'Penalty' : undefined
  const tickerIncident = showVerdict || voting || counting || parked ? ref?.incident._id : state?.next?._id
  const start = <StartButton onClick={press} busy={Boolean(starting)} message={startMessage} />
  const nextLabel =
    ref?.round === 'regular' ? 'Go to extra time' : 'Take the penalty'
  const verdictAction = between ? (
    <StartButton onClick={press} busy={Boolean(starting)} message={startMessage} label={nextLabel} />
  ) : (
    !parked && state && !state.next ? (
      // The last decision of the night: nothing is next, so the press goes to the results.
      <FullTimeLink />
    ) : (
      <StartButton
        onClick={() => setAcknowledged(ref?._id)}
        busy={false}
        label={parked ? 'Back to the VAR room' : 'Next incident'}
      />
    )
  )

  const incident = ref?.incident
  // A run in the VAR room (a fresh VAR check, or back after a round nobody voted in): the VAR room at work on its
  // incident. Its incident is the latest round's when that's this run's, else the next in line.
  // Also while a run has left the VAR room but its vote round doesn't exist yet (the moment after "Send to the
  // people"): with a run live and no vote or verdict to show, the VAR room holds the screen, never the waiting one.
  const checking = Boolean(run) && !voting && !counting && !showVerdict
  const checkIncident = checking && run ? (run.incident ?? (ref?.incident._id === run.incidentId ? ref.incident : undefined)) : undefined
  // Which scene is on screen: a change of key plays the transition (SceneTransition), the same key updates in place.
  const sceneKey =
    showVerdict && ref
      ? `verdict:${ref._id}`
      : checking && checkIncident
        ? `var-room:${checkIncident._id}:${ref?._id ?? ''}`
        : decided || parked
          ? state?.next
            ? `waiting:${state.next._id}`
            : state
              ? 'season'
              : 'connecting'
          : ref
            ? `vote:${ref._id}`
            : 'empty'
  // A message belongs to the scene it was written for: a new scene clears it (plan 016 #18).
  const [messageScene, setMessageScene] = useState(sceneKey)
  if (messageScene !== sceneKey) {
    setMessageScene(sceneKey)
    if (startMessage) setStartMessage(undefined)
  }

  return (
    <div className="stadium flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
    {/* While the kick-off countdown covers the screen, nothing behind it can be reached (no early votes by keyboard). */}
    <main inert={countingDown} className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 px-4 py-3 sm:px-6 lg:min-h-0 lg:overflow-hidden">
      <SiteHeader
        current="live"
        center={state && <StepIndicator step={step} detail={step === 'var-room' ? undefined : roundName} />}
      />

      {!sessionEntered && !enteredNow && state && <EnterStadium fixtures={state.fixtures} onEnter={enter} />}
      {countingDown && <KickOff seconds={Math.ceil(kickoffLeft)} />}

      <PageTransition>
      <div className="flex flex-col lg:min-h-0 lg:flex-1">
      <SceneTransition sceneKey={sceneKey} className="flex flex-col lg:min-h-0 lg:flex-1">
        {showVerdict && ref ? (
          <Verdict round={ref} phase={phase} action={verdictAction} />
        ) : checking && checkIncident ? (
          <VarRoomScene incident={checkIncident} loop={ref ? ref.loop + 1 : undefined} start={start} />
        ) : decided || parked ? (
          state?.next ? (
            <WaitingScene
              incident={state.next}
              fixtures={state.fixtures}
              start={<StartButton onClick={pressCheck} busy={Boolean(starting)} message={startMessage} label="Start the VAR check" align="start" />}
            />
          ) : state ? (
            <section className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <p className="text-sm text-muted">Full time</p>
              <p className="font-display text-5xl font-extrabold uppercase">Every decision is in</p>
              <p className="max-w-xl text-lg text-muted">The people have spoken. Eventually.</p>
              <FullTimeLink />
              <button
                type="button"
                onClick={pressCheck}
                disabled={Boolean(starting)}
                className="text-sm text-muted underline underline-offset-4 hover:text-chalk disabled:cursor-progress"
              >
                {starting ? 'Starting a new season…' : 'Or start a new season'}
              </button>
              {startMessage && <p className="text-sm text-muted">{startMessage}</p>}
            </section>
          ) : (
            <p className="py-16 text-center text-muted">Opening the stadium…</p>
          )
        ) : incident && ref ? (
          <MatchScene
            incident={incident}
            barLeft={<>Fans vote · {roundLabel(ref.round)}</>}
            live={voting}
            barRight={
              voting || counting ? (
                <span className="font-display text-5xl font-extrabold leading-none text-chalk tabular">{Math.ceil(secondsLeft)}</span>
              ) : undefined
            }
            media={<Clip clip={incident.clip} fallbackText={incident.fallbackText} />}
            mediaRatio={16 / 9}
            actionLabel={voting ? 'Keep the VAR\'s call, or overturn it?' : 'The fans have voted'}
            action={
              <div className="flex w-full flex-col gap-2 sm:w-[40rem]">
                <div className="jumbotron rounded-lg p-2">
                  <Bars uphold={ref.uphold} overturn={ref.overturn} size="small" />
                </div>
                <VoteButtons
                  key={ref._id}
                  referendumId={ref._id}
                  size="panel"
                  outcomes={{
                    uphold: CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation,
                    overturn: CALL_LABELS[incident.overturnedCall] ?? incident.overturnedCall,
                  }}
                  onVoted={() => {
                    refresh()
                    setTimeout(refresh, 2000)
                    setTimeout(refresh, 4000)
                  }}
                  closed={counting}
                  locked={countingDown}
                  weight={HUMAN_VOTE_WEIGHT}
                />
                <p className="text-xs text-muted">
                  Over 55% keeps it · under 45% overturns · in between: {ref.round === 'regular' ? 'extra time' : 'a sudden-death penalty'}.
                  Your vote counts ×{HUMAN_VOTE_WEIGHT} and closes the round. Everyone else is a simulated fan.
                </p>
              </div>
            }
          />
        ) : null}
      </SceneTransition>
      </div>
      </PageTransition>
    </main>
    {state && <PunditTicker lines={state.pundits} trigger={trigger} incidentId={tickerIncident} />}
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

// Full time: the one press left goes to the results (a forward navigation, see PageTransition).
function FullTimeLink() {
  return (
    <Link
      href="/incidents"
      transitionTypes={['nav-forward']}
      className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg bg-var px-10 py-3 font-display text-2xl font-extrabold uppercase text-ink transition-transform duration-150 hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk active:scale-[0.97] sm:w-auto sm:min-w-80"
    >
      Full time: see the results
    </Link>
  )
}

function StartButton({
  onClick,
  busy,
  message,
  label = 'Send to the people',
  busyLabel = label === 'Start the VAR check' ? 'Starting the VAR check' : 'Opening the vote',
  align = 'end',
}: {
  onClick: () => void
  busy: boolean
  message?: string
  label?: string
  busyLabel?: string
  // Where the button and its status line sit on wider screens: right (the decision strip) or left (waiting).
  align?: 'start' | 'end'
}) {
  // A press can take a few seconds (the server starts the run, then the screen polls for it). Busy stays amber
  // with a spinner and a moving sweep so it reads as working, not disabled; after 4 s a line says what it's
  // waiting for.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!busy) return
    const id = setTimeout(() => setSlow(true), 4000)
    return () => {
      clearTimeout(id)
      setSlow(false)
    }
  }, [busy])
  return (
    <div className={`flex flex-col items-center gap-2 ${align === 'start' ? 'sm:items-start' : 'sm:items-end'}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy || undefined}
        className={`relative w-full overflow-hidden whitespace-nowrap rounded-lg bg-var px-10 py-3 font-display text-2xl font-extrabold uppercase text-ink transition-transform duration-150 hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk active:scale-[0.97] disabled:cursor-progress sm:w-auto sm:min-w-80 ${busy ? 'btn-busy' : ''}`}
      >
        <span className="relative flex items-center justify-center gap-3">
          {busy && <span className="btn-spinner h-5 w-5 rounded-full border-[3px] border-ink/25 border-t-ink" aria-hidden />}
          {busy ? `${busyLabel}…` : label}
        </span>
      </button>
      {message ? (
        <p className="text-sm text-muted">{message}</p>
      ) : (
        busy && slow && <p className="text-sm text-muted" role="status">Waiting for the stadium to catch up…</p>
      )}
    </div>
  )
}
