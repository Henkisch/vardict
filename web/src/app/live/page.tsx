'use client'

import Link from 'next/link'
import {useEffect, useState, useSyncExternalStore} from 'react'

import {Bars} from '@/components/Bars'
import {Clip} from '@/components/Clip'
import {EnterStadium} from '@/components/EnterStadium'
import {KickOff} from '@/components/KickOff'
import {MatchScene} from '@/components/MatchScene'
import {PunditTicker} from '@/components/PunditTicker'
import {StepIndicator, type Step} from '@/components/StepIndicator'
import {VarRoomScene} from '@/components/VarRoomScene'
import {Verdict} from '@/components/Verdict'
import {VoteButtons} from '@/components/VoteButtons'
import {useCloseWhenCounting, useLiveState, useNow} from '@/lib/live'
import {HUMAN_VOTE_WEIGHT, roundLabel, type LiveState} from '@/lib/queries'
import {runPhase} from '@/lib/run-status'
import {cue, setIntensity, setMuted, startStadium} from '@/lib/stadium-audio'

export default function LivePage() {
  const now = useNow()
  const {state, refresh, boost} = useLiveState<LiveState>('/api/live?q=live', (s) => runPhase(s?.referendum, now))
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
  const [starting, setStarting] = useState<{from?: string} | null>(null)
  function press() {
    if (starting) return
    setStartMessage(undefined)
    setStarting({from: ref?._id})
    void startNextRound()
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
      setStarting(null)
      setStartMessage(message)
    }
  }
  // Done starting once the new round is on screen (or after 15 s, if it never shows).
  if (starting && ref && ref._id !== starting.from) setStarting(null)
  useEffect(() => {
    if (!starting) return
    const id = setTimeout(() => setStarting(null), 15_000)
    return () => clearTimeout(id)
  }, [starting])

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
    ref?.round === 'regular' ? 'Go to extra time' : ref?.round === 'extraTime' ? 'Penalties!' : 'Take the next penalty'
  const verdictAction = between ? (
    <StartButton onClick={press} busy={Boolean(starting)} message={startMessage} label={nextLabel} />
  ) : (
    <StartButton
      onClick={() => setAcknowledged(ref?._id)}
      busy={false}
      label={parked ? 'Back to the VAR room' : 'Next incident'}
    />
  )

  const incident = ref?.incident

  return (
    <div className="stadium flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
    <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col gap-3 px-4 py-3 sm:px-6 lg:min-h-0 lg:overflow-hidden">
      <header className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 md:grid-cols-[auto_1fr_auto]">
        <p className="font-display text-2xl font-extrabold uppercase leading-none">
          VAR<span className="text-var">dict</span>
          <span className="ml-3 hidden font-sans text-sm font-normal normal-case text-muted lg:inline">
            VAR, finally in the fans&apos; hands.
          </span>
        </p>
        <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto md:justify-self-center">
          {state && <StepIndicator step={step} detail={step === 'var-room' ? undefined : roundName} />}
        </div>
        <div className="col-start-2 row-start-1 flex items-center gap-5 justify-self-end text-sm text-muted md:col-start-3">
          <button type="button" onClick={toggleSound} className="whitespace-nowrap hover:text-chalk">
            {!soundOn ? 'Sound on' : muted ? 'Unmute' : 'Mute'}
          </button>
          <Link href="/incidents" className="whitespace-nowrap hover:text-chalk">
            Results
          </Link>
        </div>
      </header>

      {!sessionEntered && !enteredNow && state && <EnterStadium fixtures={state.fixtures} onEnter={enter} />}
      {countingDown && <KickOff seconds={Math.ceil(kickoffLeft)} />}

      {showVerdict && ref ? (
        <Verdict round={ref} phase={phase} action={verdictAction} />
      ) : parked && ref ? (
        <VarRoomScene incident={ref.incident} loop={ref.loop + 1} start={start} />
      ) : decided ? (
        state?.next ? (
          <VarRoomScene incident={state.next} start={start} />
        ) : state ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="font-display text-4xl font-extrabold uppercase">Every call has been confirmed</p>
            <p className="max-w-xl text-muted">The people have upheld all five. Democracy is complete, and slower.</p>
            <StartButton onClick={press} busy={Boolean(starting)} message={startMessage} label="Start a new season" />
          </section>
        ) : (
          <p className="py-16 text-center text-muted">Connecting to the VAR room…</p>
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
              {voting ? (
                <VoteButtons
                  key={ref._id}
                  referendumId={ref._id}
                  size="panel"
                  onVoted={() => {
                    refresh()
                    setTimeout(refresh, 2000)
                    setTimeout(refresh, 4000)
                  }}
                />
              ) : (
                <p className="font-display text-3xl font-bold uppercase text-var">Counting…</p>
              )}
              <p className="text-xs text-muted">
                Over 55% keeps it · under 45% overturns · in between: {ref.round === 'regular' ? 'extra time' : 'a sudden-death penalty'}.
                Your vote counts ×{HUMAN_VOTE_WEIGHT} against {ref.bots} simulated fans.
              </p>
            </div>
          }
        />
      ) : null}
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
    <div className="flex flex-col items-center gap-2 sm:items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full whitespace-nowrap rounded-lg bg-var px-10 py-3 font-display text-2xl font-extrabold uppercase text-ink sm:w-auto sm:min-w-80 hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk disabled:opacity-60"
      >
        {busy ? 'Opening the vote…' : label}
      </button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  )
}
