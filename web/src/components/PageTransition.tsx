import {ViewTransition} from 'react'

// Route changes (Stadium → Results → incident and back) as React view transitions, Next 16's native way: Motion
// can't play an exit when the App Router swaps a page. Forward (deeper) slides left, back slides right; links say
// which with transitionTypes. Anything untyped (browser back, refreshes, polling) doesn't animate. The header
// is anchored (SiteHeader's view-transition-name), so only the content moves. CSS in globals.css.
const DIRECTIONS = {'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none'}

export function PageTransition({children}: {children: React.ReactNode}) {
  return (
    <ViewTransition enter={DIRECTIONS} exit={DIRECTIONS} default="none">
      {children}
    </ViewTransition>
  )
}
