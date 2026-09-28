import type {Metadata, Viewport} from 'next'
import {Barlow, Barlow_Condensed} from 'next/font/google'
import './globals.css'

const barlow = Barlow({variable: '--font-barlow', subsets: ['latin'], weight: ['400', '500', '600']})
const condensed = Barlow_Condensed({variable: '--font-condensed', subsets: ['latin'], weight: ['500', '700', '800']})

export const metadata: Metadata = {
  title: {default: 'VARdict', template: '%s · VARdict'},
  description: 'VAR was supposed to end the arguments. It didn’t. So VARdict hands the final call to the people. Power to the people.',
}

export const viewport: Viewport = {themeColor: '#0b0f0c'}

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${barlow.variable} ${condensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
