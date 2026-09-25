'use client'

import {AnimatePresence, motion, useReducedMotion} from 'motion/react'

// Moves /live between its scenes (VAR room, vote, verdict, next incident) without a hard cut, and holds the old
// scene on screen until its exit has played (Henrik: "don't swap the content before the transition plays"):
// AnimatePresence mode="wait" keeps the old scene, frozen as it was, until it's gone, then mounts the new one.
// A new sceneKey plays it; the same key updates in place. Reduced motion: opacity only.
const EASE_OUT_EXPO = [0.19, 1, 0.22, 1] as const
const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const

export function SceneTransition({sceneKey, className = '', children}: {sceneKey: string; className?: string; children: React.ReactNode}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={sceneKey}
        className={className}
        initial={reduce ? {opacity: 0} : {opacity: 0, transform: 'translateY(10px)', filter: 'blur(2px)'}}
        animate={
          reduce
            ? {opacity: 1, transition: {duration: 0.15}}
            : {
                opacity: 1,
                transform: 'translateY(0px)',
                filter: 'blur(0px)',
                transition: {duration: 0.42, ease: EASE_OUT_EXPO},
                // A leftover transform/filter would trap position:fixed children and cost a layer: clear them.
                transitionEnd: {transform: 'none', filter: 'none'},
              }
        }
        exit={
          reduce
            ? {opacity: 0, transition: {duration: 0.12}}
            : {opacity: 0, transform: 'translateY(-6px)', transition: {duration: 0.18, ease: EASE_OUT_QUAD}}
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
