'use client'

import {useSyncExternalStore} from 'react'

import {setMuted, soundState, startStadium, subscribeSound} from '@/lib/stadium-audio'

// The crowd's sound switch, on every page (Henrik): the sound keeps playing across pages, so the switch goes too.
export function useSound() {
  return useSyncExternalStore(subscribeSound, soundState, () => 'off' as const)
}

export function SoundToggle() {
  const sound = useSound()
  return (
    <button
      type="button"
      onClick={() => void (sound === 'off' ? startStadium() : setMuted(sound === 'on'))}
      className="whitespace-nowrap hover:text-chalk"
    >
      {sound === 'off' ? 'Sound on' : sound === 'muted' ? 'Unmute' : 'Mute'}
    </button>
  )
}
