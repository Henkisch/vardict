'use client'

import {useLayoutEffect, useRef, useState} from 'react'

type Props = {
  // Width / height of the content, e.g. 16 / 9 for one screen.
  ratio: number
  className?: string
  children: React.ReactNode
}

// Fills the space its parent gives it and centres the largest box of `ratio` that fits, so screens keep their
// shape at any window size. Measured with a ResizeObserver: CSS container-height units resolve to 0 inside this
// nested flex layout in Chrome. Before the first measurement (and on phones, where the page scrolls) the child
// just takes the full width.
export function FitBox({ratio, className = '', children}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const {width: w, height: h} = entry.contentRect
      // Only fit when the box has a real height (the desktop shell); a scrolling page has no height to fit.
      setWidth(h > 0 && window.matchMedia('(min-width: 64rem)').matches ? Math.min(w, h * ratio) : undefined)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ratio])

  return (
    // contain:size so the box is sized by the layout alone, never by the (fitted) content it measures.
    <div ref={box} className={`flex min-h-0 items-center justify-center lg:[contain:size] ${className}`}>
      <div className="w-full" style={width ? {width} : undefined}>
        {children}
      </div>
    </div>
  )
}
