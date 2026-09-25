import type {Metadata} from 'next'

// The page is a client component, so its tab title lives here: "Stadium · VARdict".
export const metadata: Metadata = {title: 'Stadium'}

export default function Layout({children}: {children: React.ReactNode}) {
  return children
}
