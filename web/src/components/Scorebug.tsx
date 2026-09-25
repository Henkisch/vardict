import type {Team} from '@/lib/queries'

// The TV scorebug (design.md, L1): team colour chips, short names and the minute. Shown in every step, so the
// incident under review is never in doubt.
export function Scorebug({home, away, minute, size = 'md'}: {home: Team; away: Team; minute: number; size?: 'md' | 'lg'}) {
  return (
    <p className={`flex items-center gap-3 font-display font-bold uppercase leading-none ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>
      <TeamChip team={home} />
      <span className="font-medium normal-case text-muted">v</span>
      <TeamChip team={away} />
      <span className="ml-1 text-muted">{minute}&apos;</span>
    </p>
  )
}

function TeamChip({team}: {team: Team}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-[1.1em] w-1.5 rounded-[1px] bg-muted ring-1 ring-chalk/35" style={team.primaryColor ? {background: team.primaryColor} : undefined} aria-hidden />
      {team.shortName}
    </span>
  )
}
