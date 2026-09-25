import {Scorebug} from '@/components/Scorebug'
import {CALL_LABELS, formatClock, type Fixture, type IncidentCard} from '@/lib/queries'

// Before the VAR check (design.md): nothing is running, so nothing plays. The next incident waits on a pre-match
// plate with the one press that starts its VAR check. Anyone on /live can press it (judges test alone; no admin
// needed); the VAR Room can too, and this screen notices either way (useLiveState keeps it awake).
export function WaitingScene({incident, fixtures, start}: {incident: IncidentCard; fixtures: Fixture[]; start: React.ReactNode}) {
  const {homeTeam: home, awayTeam: away} = incident.match
  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <section className="grid gap-8 rounded-xl bg-pitch p-5 lg:flex-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center lg:p-10">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 rounded-full bg-var motion-safe:animate-pulse" aria-hidden />
            Waiting for the VAR check
          </p>
          <p className="text-sm text-muted">Next up{incident.controlCase ? ' · the control case' : ''}</p>
          <Scorebug home={home} away={away} minute={incident.minute} size="lg" />
          <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.95] text-balance xl:text-6xl">{incident.title}</h2>
          {incident.situation && <p className="max-w-2xl text-xl leading-snug text-muted">{incident.situation}</p>}
          <p className="text-muted">
            The referee said <span className="font-semibold text-chalk">{CALL_LABELS[incident.originalCall] ?? incident.originalCall}</span>.
            The real VAR check took <span className="font-semibold text-chalk tabular">{formatClock(incident.realDelaySeconds)}</span>.
          </p>
          <div className="pt-2 sm:self-start">{start}</div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Tonight&apos;s decisions</p>
          <ol className="divide-y divide-line">
            {fixtures.map((f, i) => {
              const next = f._id === incident._id
              // Decided: the fans kept the VAR's call (upheld) or the referee's stands (overturned).
              const upheld = f.finalCall !== undefined && f.finalCall === f.varRecommendation
              return (
                <li key={f._id} className={`flex items-baseline gap-3 py-2.5 ${next ? 'text-chalk' : 'text-muted'}`}>
                  <span className="w-4 font-display text-lg font-bold">{i + 1}</span>
                  <span className={`min-w-0 flex-1 font-display text-lg uppercase leading-tight ${next ? 'font-extrabold' : 'font-bold'}`}>
                    {f.title}
                  </span>
                  {f.finalCall ? (
                    <span className={`shrink-0 text-sm font-semibold ${upheld ? 'text-uphold' : 'text-overturn'}`}>
                      {upheld ? 'Upheld' : 'Overturned'} · {CALL_LABELS[f.finalCall] ?? f.finalCall}
                    </span>
                  ) : next ? (
                    <span className="shrink-0 text-sm font-semibold text-var">Next up</span>
                  ) : (
                    <span className="shrink-0 text-sm">To play</span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </section>
    </div>
  )
}
