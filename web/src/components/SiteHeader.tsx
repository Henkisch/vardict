import Link from 'next/link'

import {SoundToggle} from '@/components/SoundToggle'

// The one header every page shares (design.md, L5 chrome): wordmark + tagline left, an optional centre slot (the
// step bar on /live), and quiet links right with the current page marked.
export function SiteHeader({
  current,
  center,
  extra,
}: {
  current: 'live' | 'results'
  center?: React.ReactNode
  // Page-specific controls before the links (the sound toggle on /live).
  extra?: React.ReactNode
}) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`whitespace-nowrap hover:text-chalk ${active ? 'font-semibold text-chalk' : ''}`}
    >
      {label}
    </Link>
  )
  return (
    <header className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 md:grid-cols-[auto_1fr_auto]">
      <Link href="/live" className="font-display text-2xl font-extrabold uppercase leading-none">
        VAR<span className="text-var">dict</span>
        <span className="ml-3 hidden font-sans text-sm font-normal normal-case text-muted lg:inline">
          VAR, finally in the fans&apos; hands.
        </span>
      </Link>
      <div className="col-span-2 row-start-2 mt-3 md:col-span-1 md:row-start-auto md:mt-0 md:justify-self-center">{center}</div>
      <nav aria-label="Pages" className="col-start-2 row-start-1 flex items-center gap-5 justify-self-end text-sm text-muted md:col-start-3">
        {extra}
        <SoundToggle />
        {link('/live', 'Stadium', current === 'live')}
        {link('/incidents', 'Results', current === 'results')}
      </nav>
    </header>
  )
}
