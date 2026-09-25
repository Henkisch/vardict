import type {Metadata} from 'next'

// The page is a client component, so its tab title lives here: "Results · VARdict".
export const metadata: Metadata = {title: 'Results'}

export default function Layout({children}: {children: React.ReactNode}) {
  return children
}
