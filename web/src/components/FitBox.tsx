'use client'

import {useLayoutEffect, useRef, useState} from 'react'

type Props = {
  // Width / height of the content, e.g. 16 / 9 for one screen.
  ratio: number
  className?: string
  // Where the fitted box sits when there's room to spare: centred, or against the right edge (desktop).
  align?: 'center' | 'end'
  // Vertically: centred, or against the top so it lines up with content beside it (desktop).
  valign?: 'center' | 'start'
  // The tallest the content may be. Given: the box sizes to its content (auto height) and only its width is
  // measured; the height limit comes from outside (MatchScene measures the free space). Not given: the box fills
  // its parent and fits inside it.
  maxHeight?: number
  // A second shape the content can take (the monitor wall stacked: main on top, three below). Given, the box picks
  // whichever makes the main monitor wider - stacked shows it at full width, side by side at MAIN_SHARE of it - and
  // tells the children which one through a render function. Below lg (no fitting) it's always stacked.
  stackedRatio?: number
  children: React.ReactNode | ((stacked: boolean) => React.ReactNode)
}

// Side by side, the main monitor is 3/4 of the wall's width (MonitorWall).
const MAIN_SHARE = 0.75

// Fills the space its parent gives it and centres the largest box of `ratio` that fits, so screens keep their
// shape at any window size. Measured with a ResizeObserver: CSS container-height units resolve to 0 inside this
// nested flex layout in Chrome. Before the first measurement (and on phones, where the page scrolls) the child
// just takes the full width.
export function FitBox({ratio, className = '', align = 'center', valign = 'center', maxHeight, stackedRatio, children}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const [stacked, setStacked] = useState(true)

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const {width: w, height: h} = entry.contentRect
      const limit = maxHeight ?? h
      // Only fit when there's a real height (the desktop shell); a scrolling page has no height to fit.
      if (!(limit > 0 && window.matchMedia('(min-width: 64rem)').matches)) {
        setWidth(undefined)
        setStacked(true)
        return
      }
      const side = Math.min(w, limit * ratio)
      const stack = stackedRatio ? Math.min(w, limit * stackedRatio) : 0
      const useStack = stack > side * MAIN_SHARE
      setStacked(useStack)
      setWidth(useStack ? stack : side)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ratio, maxHeight, stackedRatio])

  return (
    // contain:size so the box is sized by the layout alone, never by the (fitted) content it measures.
    <div ref={box} className={`flex min-h-0 items-center justify-center ${maxHeight === undefined ? 'lg:[contain:size]' : 'lg:[contain:inline-size]'} ${align === 'end' ? 'lg:justify-end' : ''} ${valign === 'start' ? 'lg:items-start' : ''} ${className}`}>
      <div className="w-full" style={width ? {width} : undefined}>
        {typeof children === 'function' ? children(stacked) : children}
      </div>
    </div>
  )
}
