import { useCallback, useEffect, useRef, useState } from 'react'
import { signalCompletion } from './browserEffects'
import { currentZone, dateKey } from './domain/dates'
import type { Action, AppState } from './domain/pomodoro'
import { readState, saveAction } from './store'

const storageError = '작업을 완료하지 못했어요. 브라우저 데이터 저장을 확인하고 다시 시도해 주세요.'
const channelName = 'pomodoro-web-updates'

export function usePomodoro(selectedTask: string | null) {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [today, setToday] = useState(() => dateKey(Date.now(), currentZone()))
  const channel = useRef<BroadcastChannel>(null)
  const acceptState = useCallback((next: AppState) => {
    setState((previous) => !previous || next.revision > previous.revision ? next : previous)
  }, [])

  const dispatch = useCallback(async (action: Action) => {
    let result
    try {
      result = await saveAction(action)
    } catch {
      setError(storageError)
      return null
    }
    acceptState(result.state)
    if (result.changed) channel.current?.postMessage(null)
    if (result.completed) signalCompletion(result.state.settings)
    return result.state
  }, [acceptState])

  useEffect(() => {
    const updates = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : null
    channel.current = updates
    const refresh = () => {
      void readState().then(acceptState, () => setError(storageError))
    }
    const recover = () => {
      const inForeground = document.visibilityState === 'visible'
      setVisible(inForeground)
      if (inForeground) {
        setToday(dateKey(Date.now(), currentZone()))
        void dispatch({ type: 'recover', autoStart: false })
      }
    }

    if (document.visibilityState === 'visible') recover()
    else refresh()
    updates?.addEventListener('message', refresh)
    document.addEventListener('visibilitychange', recover)
    window.addEventListener('pageshow', recover)
    return () => {
      document.removeEventListener('visibilitychange', recover)
      window.removeEventListener('pageshow', recover)
      updates?.close()
      channel.current = null
    }
  }, [acceptState, dispatch])

  const timer = state?.timer
  useEffect(() => {
    if (!visible || !timer) return
    const { id, version, dueWallMs, anchorWallMs } = timer
    const target = { id, version }
    const canAutoStart = dueWallMs !== null && dueWallMs > Date.now()
    let timeout: number
    let cancelled = false
    async function check() {
      if (document.visibilityState !== 'visible' || cancelled) return
      const now = Date.now()
      const remaining = dueWallMs === null ? Infinity : dueWallMs - now
      if (remaining <= 0 || now < anchorWallMs) {
        const saved = await dispatch({ type: 'recover', target, autoStart: canAutoStart, taskId: selectedTask })
        if (!saved && !cancelled) timeout = window.setTimeout(check, 1_000)
      } else {
        timeout = window.setTimeout(check, Math.min(1_000, remaining))
      }
    }

    void check()
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [dispatch, selectedTask, timer, visible])

  useEffect(() => {
    if (!visible) return
    const interval = window.setInterval(() => setToday(dateKey(Date.now(), currentZone())), 1_000)
    return () => window.clearInterval(interval)
  }, [visible])

  return { state, dispatch, visible, today, error, clearError: () => setError('') }
}

export type Dispatch = ReturnType<typeof usePomodoro>['dispatch']
