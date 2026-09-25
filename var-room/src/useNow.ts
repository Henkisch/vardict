import {useEffect, useState} from 'react'

// A ticking clock for countdowns and the booth's wall clock.
export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
