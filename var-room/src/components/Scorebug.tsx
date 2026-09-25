import type {Team} from '../api'

// The TV scorebug: team colour chips, short names and the minute. Same component idea as /live's.
export function Scorebug({home, away, minute}: {home: Team; away: Team; minute: number}) {
  return (
    <p className="scorebug">
      <TeamChip team={home} />
      <span className="scorebug-v">v</span>
      <TeamChip team={away} />
      <span className="scorebug-minute">{minute}&apos;</span>
    </p>
  )
}

function TeamChip({team}: {team: Team}) {
  return (
    <span className="team">
      <span className="team-chip" style={{background: team.primaryColor ?? 'var(--color-ink-2)'}} aria-hidden />
      {team.shortName}
    </span>
  )
}
