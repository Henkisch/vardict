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
  offside: 'possible offside',
  handball: 'possible handball',
  penalty: 'possible penalty',
  redCard: 'possible red card',
  mistakenIdentity: 'player identity',
  goalLine: 'goal-line',
}

// What the big screen shows between votes: the VAR room at work on the next decision.
export function VarRoomScene({incident, start}: Props) {
  return (
    <MatchScene
      incident={incident}
      barLeft={<>VAR check · {CHECK[incident.incidentType ?? ''] ?? 'review'}</>}
      barRight={
        <span className="flex flex-col items-end">
          <span className="font-sans text-xs font-normal normal-case">the real check took</span>
          {formatClock(incident.realDelaySeconds)}
        </span>
      }
      media={<MonitorWall incident={incident} />}
      mediaRatio={WALL_RATIO}
      actionLabel="Does the VAR get it right? Let the stadium decide."
      action={start}
    />
  )
}
