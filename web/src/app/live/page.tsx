'use client'

import Link from 'next/link'
import {useState} from 'react'

import {Bars} from '@/components/Bars'
import {Clip} from '@/components/Clip'
import {QrCode} from '@/components/QrCode'
import {useCloseWhenCounting, useLiveQuery, useNow} from '@/lib/live'
import {CALL_LABELS, formatClock, HUMAN_VOTE_WEIGHT, LIVE_QUERY, roundLabel, type LiveState} from '@/lib/queries'

const RESULT_COPY = {
  upheld: {title: 'Upheld', body: 'The people have spoken. The call stands.', tone: 'text-uphold'},
  overturned: {title: 'Overturned', body: 'Back to the VAR room.', tone: 'text-overturn'},
  tooClose: {title: 'Too close to call', body: 'Democracy needs more time.', tone: 'text-var'},
} as const

export default function LivePage() {
  const state = useLiveQuery<LiveState>(LIVE_QUERY)
  const now = useNow()
  const ref = state?.referendum
  const closesAt = ref ? Date.parse(ref.closesAt) : 0
  const secondsLeft = ref && !ref.result ? Math.max(0, (closesAt - now) / 1000) : 0
  const voting = Boolean(ref && !ref.result && secondsLeft > 0)
  const counting = Boolean(ref && !ref.result && secondsLeft === 0)

  useCloseWhenCounting(counting)

  const [startMessage, setStartMessage] = useState<string>()
  const [starting, setStarting] = useState(false)
  async function sendToThePeople() {
    setStarting(true)
    setStartMessage(undefined)
    const response = await fetch('/api/start', {method: 'POST'})
    const body = await response.json().catch(() => ({}))
    setStarting(false)
    if (body.status === 'busy') setStartMessage('A vote is already live.')
    else if (body.status === 'coolingDown') setStartMessage(`The VAR room needs ${body.retryInSeconds} more seconds.`)
    else if (body.status === 'rateLimited') setStartMessage('Easy. Try again in a minute.')
    else if (!response.ok) setStartMessage('Something went wrong. Try again.')
  }

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
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Time added by democracy</p>
          <p className="font-display text-4xl font-bold text-var tabular">
            {state ? formatClock(state.democracySeconds) : '--:--'}
          </p>
        </div>
      </header>

      {incident ? (
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

            {ref.result ? (
              <div>
                <p className={`font-display text-4xl font-extrabold uppercase ${RESULT_COPY[ref.result].tone}`}>
                  {RESULT_COPY[ref.result].title}
                </p>
                <p className="text-muted">{RESULT_COPY[ref.result].body}</p>
                {ref.result !== 'tooClose' && (
                  <Link href={`/incidents/${incident.slug}`} className="text-sm text-var underline">
                    Every round of this incident
                  </Link>
                )}
              </div>
            ) : counting ? (
              <p className="font-display text-3xl font-bold uppercase text-var">Counting…</p>
            ) : null}

            {voting ? (
              <QrCode />
            ) : ref.result === 'tooClose' || counting ? (
              <p className="text-center text-muted">The next round opens in a moment.</p>
            ) : (
              <StartButton onClick={sendToThePeople} busy={starting} message={startMessage} />
            )}
            <p className="text-xs text-muted">
              {ref.humans} human and {ref.bots} simulated {ref.bots === 1 ? 'vote' : 'votes'} this round. Humans are
              rare, so each human vote counts ×{HUMAN_VOTE_WEIGHT}. Bots are flagged as simulated.
            </p>
          </aside>
        </div>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
          <p className="max-w-xl text-2xl">
            Five real VAR decisions. The VAR room has made its call. Now it goes to the people.
          </p>
          <StartButton onClick={sendToThePeople} busy={starting} message={startMessage} />
        </section>
      )}
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
