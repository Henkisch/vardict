'use client'

// The 3-2-1 before every vote, over the vote screen. Pure display: the page counts down to the round's own
// windowOpensAt, so every screen shows the same number at the same moment.
export function KickOff({seconds}: {seconds: number}) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/80 backdrop-blur-sm"
    >
      <p className="font-display text-3xl font-bold uppercase tracking-[0.2em] text-muted">Get ready to vote</p>
      <p key={seconds} className="kickoff-beat font-display text-[12rem] font-extrabold leading-none text-var tabular">
        {seconds}
      </p>
    </div>
  )
}
