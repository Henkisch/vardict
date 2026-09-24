import {MatchScene} from '@/components/MatchScene'
import {MonitorWall, WALL_RATIO} from '@/components/MonitorWall'
import {formatClock, type IncidentCard} from '@/lib/queries'

type Props = {
  incident: IncidentCard
  // Set when the run was overturned and is back here for another look.
  loop?: number
  start: React.ReactNode
}

// What the VAR is checking, shown small in the monitor bar. Keyed by incident.incidentType.
const CHECK: Record<string, string> = {
  offside: 'Checking goal · possible offside',
  handball: 'Checking penalty · possible handball',
  penalty: 'Checking penalty',
  redCard: 'Checking possible red card',
  mistakenIdentity: 'Checking player identity',
  goalLine: 'Checking goal-line',
}

// What the big screen shows between votes: the VAR room at work on the next decision.
export function VarRoomScene({incident, start}: Props) {
  return (
    <MatchScene
      incident={incident}
      barLeft={<>VAR · {CHECK[incident.incidentType ?? ''] ?? 'Review'}</>}
      barRight={
        <>
          <span className="hidden sm:inline">Real VAR check took </span>
          {formatClock(incident.realDelaySeconds)}
        </>
      }
      media={<MonitorWall incident={incident} />}
      mediaRatio={WALL_RATIO}
      actionLabel="Your call · keep it or overturn it?"
      action={start}
    />
  )
}
