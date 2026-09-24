import {FitBox} from '@/components/FitBox'
import {CALL_LABELS, type IncidentCard} from '@/lib/queries'

type Props = {
  incident: IncidentCard
  // The bar across the top of the panel: what's happening (left) and a figure (right).
  barLeft: React.ReactNode
  barRight?: React.ReactNode
  // The footage, and its shape (16:9 for one screen, wider for the monitor wall).
  media: React.ReactNode
  mediaRatio: number
  // The last step of the strip under the panel: the button, or the vote.
  actionLabel: string
  action: React.ReactNode
}

// The frame every step on /live shares: a panel with the incident beside the footage (above it on phones), and a
// strip that tells the decision left to right: what the referee said, what the VAR says, and the fans' part.
export function MatchScene({incident, barLeft, barRight, media, mediaRatio, actionLabel, action}: Props) {
  const {homeTeam: home, awayTeam: away} = incident.match
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-pitch lg:min-h-0 lg:flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-pitch px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-overturn motion-safe:animate-pulse" aria-hidden />
            {barLeft}
          </span>
          {barRight && <span className="tabular text-muted">{barRight}</span>}
        </div>
        <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
          <div className="flex shrink-0 flex-col justify-between gap-4 p-4 lg:w-80 xl:w-96">
            <div>
              <p className="font-display text-lg font-bold uppercase tracking-wide">
                {home.name} v {away.name} <span className="text-muted">{incident.minute}&apos;</span>
              </p>
              <p className="text-sm text-muted">{incident.match.competition}</p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-3xl font-extrabold uppercase leading-tight text-balance xl:text-4xl">
                {incident.title}
              </h2>
              {incident.situation && <p className="text-lg leading-snug">{incident.situation}</p>}
            </div>
          </div>
          <FitBox ratio={mediaRatio} className="p-2 lg:flex-1">
            {media}
          </FitBox>
        </div>
      </section>

      <section className="grid shrink-0 items-stretch gap-3 rounded-xl border border-line bg-pitch p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.4fr)] sm:items-center">
        <Step label="The referee said" value={CALL_LABELS[incident.originalCall] ?? incident.originalCall} />
        <span className="hidden font-display text-3xl text-muted sm:block" aria-hidden>→</span>
        <Step label="The VAR says" value={CALL_LABELS[incident.varRecommendation] ?? incident.varRecommendation} highlight />
        <span className="hidden font-display text-3xl text-muted sm:block" aria-hidden>→</span>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{actionLabel}</p>
          {action}
        </div>
      </section>
    </div>
  )
}

function Step({label, value, highlight = false}: {label: string; value: string; highlight?: boolean}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-var/60' : 'border-line'}`}>
      <p className={`text-xs uppercase tracking-[0.2em] ${highlight ? 'text-var' : 'text-muted'}`}>{label}</p>
      <p className={`font-display text-3xl font-extrabold uppercase leading-none ${highlight ? 'text-var' : ''}`}>{value}</p>
    </div>
  )
}
