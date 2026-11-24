import { useEffect } from 'react'
import type { Settings } from './domain/pomodoro'

export const supportsSound = 'AudioContext' in window
export const supportsVibration = typeof navigator.vibrate === 'function'
export const supportsWakeLock = 'wakeLock' in navigator
let audio: AudioContext | undefined

export function prepareSound() {
  if (!supportsSound) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined)
  } catch {
    // A browser may block playback until it receives a user gesture.
  }
}

export function signalCompletion(settings: Settings) {
  if (document.visibilityState !== 'visible') return
  if (settings.vibration && supportsVibration) navigator.vibrate([120, 65, 120])
  if (!settings.sound || audio?.state !== 'running') return
  const context = audio
  const start = context.currentTime
  for (const [index, frequency] of [660, 880].entries()) {
    const time = start + index * 0.15
    const note = context.createOscillator()
    const volume = context.createGain()
    note.frequency.value = frequency
    volume.gain.setValueAtTime(0.001, time)
    volume.gain.exponentialRampToValueAtTime(0.15, time + 0.025)
    volume.gain.exponentialRampToValueAtTime(0.001, time + 0.3)
    note.connect(volume).connect(context.destination)
    note.start(time)
    note.stop(time + 0.3)
    note.onended = () => {
      note.disconnect()
      volume.disconnect()
    }
  }
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !supportsWakeLock) return
    let active = true
    let acquiring = false
    let lock: WakeLockSentinel | undefined

    async function acquire() {
      if (document.visibilityState !== 'visible' || acquiring || (lock && !lock.released)) return
      acquiring = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (active) lock = next
        else await next.release()
      } catch {
        // The browser or device may deny a wake lock.
      } finally {
        acquiring = false
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', acquire)
      if (lock) void lock.release().catch(() => undefined)
    }
  }, [enabled])
}
