import { Activity, useEffect, useMemo, useState } from 'react'
import { prepareSound, useWakeLock } from './browserEffects'
import type { AppState } from './domain/pomodoro'
import { GalleryScreen, RewardDialog } from './screens/CollectionScreens'
import { HistoryScreen, StatisticsScreen } from './screens/RecordsScreens'
import { SettingsScreen } from './screens/SettingsScreen'
import { TasksScreen } from './screens/TasksScreen'
import { TimerScreen } from './screens/TimerScreen'
import { asset, Button } from './ui'
import { usePomodoro } from './usePomodoro'
import type { Dispatch } from './usePomodoro'

const tabs = [
  { route: 'timer', label: '타이머' },
  { route: 'tasks', label: '할 일' },
  { route: 'history', label: '기록' },
  { route: 'stats', label: '통계' },
  { route: 'settings', label: '설정' },
] as const
type Route = (typeof tabs)[number]['route'] | 'gallery'

function readRoute(): Route {
  const hash = window.location.hash.slice(1)
  if (hash === 'gallery') return 'gallery'
  return tabs.find((tab) => tab.route === hash)?.route ?? 'timer'
}

function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  function navigate(next: Route, replace = false) {
    if (readRoute() === next) return
    window.history[replace ? 'replaceState' : 'pushState']({ fromApp: true }, '', '#' + next)
    setRoute(next)
  }

  return { route, navigate }
}

function Navigation({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  return (
    <nav className="bottom-nav" aria-label="주 메뉴">
      <div className="bottom-nav-items">
        {tabs.map((tab) => (
          <a className="nav-item" href={'#' + tab.route} aria-current={route === tab.route ? 'page' : undefined}
            key={tab.route} onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              navigate(tab.route)
            }}>
            <span className="nav-indicator">
              <span className="nav-icon" aria-hidden="true" style={{ maskImage: 'url(' + asset('icons/' + tab.route + '.svg') + ')' }} />
            </span>
            <span className="nav-label">{tab.label}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const { state, dispatch, today, visible, error, clearError } = usePomodoro(selectedTask)
  if (!state) {
    return (
      <main className="loading-screen">
        <p role={error ? 'alert' : 'status'}>{error || '불러오는 중…'}</p>
        {error ? <Button variant="outline" onClick={() => {
          clearError()
          void dispatch({ type: 'recover', autoStart: false })
        }}>다시 시도</Button> : null}
      </main>
    )
  }
  return <Pomodoro state={state} today={today} visible={visible} dispatch={dispatch}
    selectedTask={selectedTask} selectTask={setSelectedTask} error={error} clearError={clearError} />
}

function Pomodoro({ state, today, visible, dispatch: save, selectedTask, selectTask, error, clearError }: {
  state: AppState
  today: string
  visible: boolean
  dispatch: Dispatch
  selectedTask: string | null
  selectTask: (id: string | null) => void
  error: string
  clearError: () => void
}) {
  const { route, navigate } = useRoute()
  const [focusScreen, setFocusScreen] = useState(false)
  const [selectedReward, setSelectedReward] = useState<string | null>(null)
  const [deferredRewards, setDeferredRewards] = useState<string[]>([])
  const focusMode = route === 'timer' && focusScreen
  useWakeLock(focusMode && state.settings.keepScreenOn && state.timer !== null)
  const pending = useMemo(() => state.rewards.filter((item) => !item.acknowledged)
    .sort((a, b) => b.earnedAt - a.earnedAt || b.eventId.localeCompare(a.eventId)), [state.rewards])
  const nextReward = pending[0]?.eventId
  const reward = pending.find((item) => item.eventId === selectedReward)

  useEffect(() => {
    if (!visible || !nextReward || deferredRewards.includes(nextReward)) return
    setSelectedReward((current) => pending.some((item) => item.eventId === current) ? current : nextReward)
  }, [deferredRewards, nextReward, pending, visible])

  const dispatch: Dispatch = (action) => {
    if (((action.type === 'start' || action.type === 'resume') && state.settings.sound)
      || (action.type === 'settings' && action.change.sound)) prepareSound()
    return save(action)
  }
  const showReward = () => setSelectedReward(nextReward ?? null)
  function openGallery() {
    setFocusScreen(false)
    navigate('gallery')
  }

  return (
    <div className="app-shell" onClickCapture={() => {
      if (state.settings.sound && state.timer) prepareSound()
    }}>
      <main className="app-main">
        <Activity mode={route === 'timer' ? 'visible' : 'hidden'}>
          <TimerScreen state={state} dispatch={dispatch} visible={visible} focusMode={focusMode}
            toggleFocus={() => setFocusScreen(!focusScreen)} selectedTask={selectedTask}
            selectTask={selectTask} openGallery={openGallery} showReward={nextReward ? showReward : undefined} />
        </Activity>
        <Activity mode={route === 'tasks' ? 'visible' : 'hidden'}>
          <TasksScreen tasks={state.tasks} dispatch={dispatch} onDelete={(id) => {
            if (selectedTask === id) selectTask(null)
          }} />
        </Activity>
        <Activity mode={route === 'history' ? 'visible' : 'hidden'}>
          <HistoryScreen history={state.history} tasks={state.tasks} />
        </Activity>
        <Activity mode={route === 'stats' ? 'visible' : 'hidden'}>
          <StatisticsScreen history={state.history} today={today} />
        </Activity>
        <Activity mode={route === 'settings' ? 'visible' : 'hidden'}>
          <SettingsScreen saved={state.settings} onChange={(change) => void dispatch({ type: 'settings', change })} />
        </Activity>
        {route === 'gallery' ? (
          <GalleryScreen rewards={state.rewards} pendingCount={pending.length} onShowReward={showReward} onBack={() => {
            if (window.history.state?.fromApp) window.history.back()
            else navigate('timer', true)
          }} />
        ) : null}
      </main>
      {!focusMode ? <Navigation route={route} navigate={navigate} /> : null}
      {error ? (
        <div className="snackbar" role="alert">
          <span>{error}</span>
          <Button onClick={clearError}>닫기</Button>
        </div>
      ) : null}
      {reward ? (
        <RewardDialog key={reward.eventId} capsule={reward}
          onOpen={async () => {
            const saved = await dispatch({ type: 'openCapsule', id: reward.eventId })
            return Boolean(saved?.rewards.find((item) => item.eventId === reward.eventId)?.itemId)
          }}
          onClose={async (visitGallery) => {
            if (reward.eventId === nextReward) {
              const remaining = reward.itemId ? pending[1]?.eventId : undefined
              setDeferredRewards(remaining ? [reward.eventId, remaining] : [reward.eventId])
            }
            if (reward.itemId && !(await dispatch({ type: 'acknowledgeCapsule', id: reward.eventId }))) return
            setSelectedReward(null)
            if (visitGallery) openGallery()
          }}
        />
      ) : null}
    </div>
  )
}
