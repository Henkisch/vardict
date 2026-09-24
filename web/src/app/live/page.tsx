'use client'

import {useState} from 'react'

import {Bars} from '@/components/Bars'
import {Clip} from '@/components/Clip'
import {QrCode} from '@/components/QrCode'
import {VarRoomScene} from '@/components/VarRoomScene'
import {VoteButtons} from '@/components/VoteButtons'
import {useCloseWhenCounting, useLiveState, useNow} from '@/lib/live'
import {CALL_LABELS, formatClock, HUMAN_VOTE_WEIGHT, LIVE_QUERY, roundLabel, type LiveState} from '@/lib/queries'
import {runPhase} from '@/lib/run-status'

export default function LivePage() {
  const now = useNow()
  const {state, boost} = useLiveState<LiveState>(LIVE_QUERY, (s) => runPhase(s?.referendum, now))
  const ref = state?.referendum
  const closesAt = ref ? Date.parse(ref.closesAt) : 0
  const secondsLeft = ref && !ref.result ? Math.max(0, (closesAt - now) / 1000) : 0
  const phase = runPhase(ref, now)
  const voting = phase === 'voting'
  const counting = phase === 'counting'
  const between = phase === 'between'

  useCloseWhenCounting(counting)

  const [startMessage, setStartMessage] = useState<string>()
  const [starting, setStarting] = useState(false)
  async function sendToThePeople() {
    setStarting(true)
    setStartMessage(undefined)
    boost()
    const response = await fetch('/api/start', {method: 'POST'})
    const body = await response.json().catch(() => ({}))
    setStarting(false)
    if (body.status === 'busy') setStartMessage('A vote is already live.')
    else if (body.status === 'coolingDown') setStartMessage(`The VAR room needs ${body.retryInSeconds} more seconds.`)
    else if (body.status === 'rateLimited') setStartMessage('Easy. Try again in a minute.')
    else if (body.status === 'dailyLimit') setStartMessage('The VAR room has done enough for today. Come back tomorrow.')
    else if (body.status === 'paused') setStartMessage('The VAR room is closed for now.')
    else if (!response.ok) setStartMessage('Something went wrong. Try again.')
  }

  // Between votes the big screen shows the VAR room. A run that was just overturned (and isn't at the loop cap)
  // is back there for another look; otherwise the next incident in line is on the monitor.
  const parked = phase === 'parked'
  const decided = phase === 'decided'
  const start = <StartButton onClick={sendToThePeople} busy={starting} message={startMessage} />

  const incident = ref?.incident
  const home = incident?.match.homeTeam
  const away = incident?.match.awayTeam
  const won = ref?.shootout.filter((r) => r === 'upheld').length ?? 0
  const lost = ref?.shootout.filter((r) => r === 'overturned').length ?? 0

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold uppercase tracking-wide">
            VAR<span className="text-var">dict</span>
          </h1>
          <p className="text-muted">The VAR room decides. The people confirm. It takes longer.</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Time added by democracy</p>
          <p className="font-display text-4xl font-bold text-var tabular">
            {state ? formatClock(state.democracySeconds) : '--:--'}
          </p>
        </div>
      </header>

      {parked && ref ? (
        <VarRoomScene incident={ref.incident} loop={ref.loop + 1} start={start} />
      ) : decided ? (
        state?.next ? (
          <VarRoomScene incident={state.next} last={ref ?? undefined} start={start} />
        ) : state ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="font-display text-4xl font-extrabold uppercase">Every call has been confirmed</p>
            <p className="max-w-xl text-muted">The people have upheld all five. Democracy is complete, and slower.</p>
          </section>
        ) : (
          <p className="py-16 text-center text-muted">Connecting to the VAR room…</p>
        )
      ) : incident && ref ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-bold uppercase tracking-wide">
                <span style={{color: home?.primaryColor}}>■</span> {home?.shortName} v {away?.shortName}{' '}
                <span style={{color: away?.primaryColor}}>■</span>
                <span className="ml-3 text-muted">{incident.minute}&apos;</span>
              </p>
              <p className="text-sm text-muted">{incident.match.competition}</p>
            </div>
            <Clip clip={incident.clip} fallbackText={incident.fallbackText} />
            {incident.situation && <p className="text-xl leading-snug">{incident.situation}</p>}
          </section>

          <aside className="flex flex-col gap-5 rounded-lg border border-line bg-pitch p-5">
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

            <Bars uphold={ref.uphold} overturn={ref.overturn} />

            {counting ? (
              <p className="font-display text-3xl font-bold uppercase text-var">Counting…</p>
            ) : between ? (
              <p className="text-center text-muted">The next round opens in a moment.</p>
            ) : null}

            {voting && (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">Your vote counts ×{HUMAN_VOTE_WEIGHT} against the simulated crowd.</p>
                  <VoteButtons key={ref._id} referendumId={ref._id} size="panel" />
                </div>
                <QrCode />
              </>
            )}
            <p className="text-xs text-muted">
              {ref.humans} human and {ref.bots} simulated {ref.bots === 1 ? 'vote' : 'votes'} this round. Humans are
              rare, so each human vote counts ×{HUMAN_VOTE_WEIGHT}. Bots are flagged as simulated.
            </p>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

function StartButton({onClick, busy, message}: {onClick: () => void; busy: boolean; message?: string}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full rounded-lg bg-var px-8 py-4 font-display text-3xl font-extrabold uppercase text-ink hover:brightness-110 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-chalk disabled:opacity-60"
      >
        {busy ? 'Checking the monitor…' : 'Send to the people'}
      </button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  )
}
