import {groupRuns, incidentOutcome} from '@/lib/outcome'
import {runPath} from '@/lib/path'
import type {IncidentOverviewRow} from '@/lib/queries'

// The night in numbers, once every incident has been through the workflow (and as it fills up before that): what
// the people decided, how far the runs went, and how much workflow that took. From the latest run per incident.
export function NightSummary({incidents}: {incidents: IncidentOverviewRow[]}) {
  const latest = incidents.map((incident) => {
    const runs = groupRuns(incident.rounds)
    const run = runs.at(-1) ?? []
    return {incident, outcome: incidentOutcome(incident.rounds), run, path: runPath(run)}
  })
  const played = latest.filter((l) => l.run.length > 0)
  if (played.length === 0) return null
  const count = (f: (l: (typeof latest)[number]) => boolean) => latest.filter(f).length
  const upheld = count((l) => l.outcome === 'upheld')
  const overturned = count((l) => l.outcome === 'overturned')
  const extraTime = count((l) => l.path.some((s) => s.stage === 'extraTime'))
  const penalties = count((l) => l.path.some((s) => s.stage === 'shootout'))
  const noVotes = latest.reduce((n, l) => n + l.run.filter((r) => r.result === 'noVotes').length, 0)
  const rounds = latest.reduce((n, l) => n + l.run.filter((r) => r.result && r.result !== 'aborted' && r.result !== 'noVotes').length, 0)
  const stages = latest.reduce((n, l) => n + l.path.length, 0)
  const control = latest.find((l) => l.incident.controlCase && (l.outcome === 'upheld' || l.outcome === 'overturned'))

  const stats: [string, number, string?][] = [
    ['Upheld', upheld, 'text-uphold'],
    ['Overturned', overturned, 'text-overturn'],
    ['Went to extra time', extraTime],
    ['Sudden-death penalties', penalties],
    ['Rounds nobody human voted in', noVotes],
    ['Rounds voted', rounds],
    ['Workflow stages walked', stages, 'text-var'],
  ]
  return (
    <section aria-label="The night in numbers" className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        The night in numbers{played.length < incidents.length ? ` · ${played.length} of ${incidents.length} played` : ''}
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={`font-display text-4xl font-extrabold leading-none tabular ${tone ?? ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {control && (
        <p className={`text-sm font-semibold ${control.outcome === 'overturned' ? 'text-uphold' : 'text-overturn'}`}>
          The control case ({control.incident.title}):{' '}
          {control.outcome === 'overturned' ? 'the people got it right.' : 'the people upheld a call the referees admit was wrong.'}
        </p>
      )}
    </section>
  )
}
