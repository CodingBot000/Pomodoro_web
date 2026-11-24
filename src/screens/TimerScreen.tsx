import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { compareTasks, durationMs, kindLabels, remainingMs } from '../domain/pomodoro'
import type { ActiveTimer, AppState, DisplayMode, Task, TimerKind } from '../domain/pomodoro'
import { asset, Button, Field, Modal } from '../ui'
import type { Dispatch } from '../usePomodoro'

interface TimerProps {
  state: AppState
  dispatch: Dispatch
  visible: boolean
  focusMode: boolean
  toggleFocus: () => void
  selectedTask: string | null
  selectTask: (id: string | null) => void
  openGallery: () => void
  showReward?: () => void
}

export function TimerScreen({
  state, dispatch, visible, focusMode, toggleFocus, selectedTask, selectTask, openGallery, showReward,
}: TimerProps) {
  const { timer, cycle, settings } = state
  const [cancelId, setCancelId] = useState<string | null>(null)
  const kind = timer?.kind ?? cycle.kind
  const paused = timer?.status === 'PAUSED'
  const status = paused ? '일시정지됨' : timer ? '진행 중' : '준비됨'
  const primary = paused ? '계속하기' : timer ? '일시정지' : kindLabels[kind] + ' 시작'
  const latest = state.history[0]
  const lastCompleted = !timer && cycle.awaiting && latest?.status === 'COMPLETED' ? latest : null
  const completion = lastCompleted?.kind === 'FOCUS' && kind !== 'FOCUS'
    ? Math.floor(lastCompleted.activeMs / 60_000) + '분 집중했어요'
    : lastCompleted && lastCompleted.kind !== 'FOCUS' && kind === 'FOCUS' ? '휴식이 끝났어요' : null

  const controls = (
    <div className="timer-secondary">
      {kind !== 'FOCUS' ? (
        <Button onClick={() => {
          if (timer) void dispatch({ type: 'cancel', target: timer, taskId: selectedTask, reason: '휴식 건너뛰기' })
          else void dispatch({ type: 'skipBreak', kind })
        }}>휴식 건너뛰기</Button>
      ) : null}
      {timer ? <Button onClick={() => setCancelId(timer.id)}>취소</Button> : null}
    </div>
  )
  const showControls = Boolean(timer) || kind !== 'FOCUS'

  return (
    <section className={`timer-screen ${focusMode ? 'timer-screen--focus' : ''}`} aria-labelledby="timer-heading">
      <div className="timer-scroll">
        <header className="timer-header">
          <h1 className="serif" id="timer-heading">{focusMode ? '집중 화면' : '나의 뽀모도로'}</h1>
          <Button onClick={toggleFocus}>{focusMode ? '닫기' : '집중 화면'}</Button>
          {!focusMode ? <Button onClick={openGallery}>전시관</Button> : null}
          {showReward ? <Button onClick={showReward}>받은 캡슐 보기</Button> : null}
        </header>

        <TimerFace
          mode={settings.displayMode}
          kind={kind}
          duration={timer?.plannedMs ?? durationMs(settings, kind)}
          timer={timer}
          visible={visible}
          status={status}
          completion={completion}
        />

        {!focusMode ? (
          <div className={`timer-notes timer-notes--${settings.displayMode.toLowerCase()}`}>
            <p className="cycle-note">이번 주기 {cycle.count} / {cycle.target || settings.cycleLength}</p>
            {!timer && kind === 'FOCUS' ? (
              <TaskPicker tasks={state.tasks} selected={selectedTask} onSelect={selectTask} />
            ) : null}
          </div>
        ) : null}
        {timer?.taskTitle ? <p className="timer-task">연결된 할 일: {timer.taskTitle}</p> : null}
        {showControls ? <div className="timer-secondary-scroll">{controls}</div> : null}
      </div>

      <div className="timer-actions">
        <Button variant="filled" className="timer-primary" onClick={() => {
          if (timer) void dispatch({ type: paused ? 'resume' : 'pause', target: timer, taskId: selectedTask })
          else void dispatch({ type: 'start', kind, taskId: selectedTask })
        }}>{primary}</Button>
        {showControls
          ? <div className="timer-secondary-fixed">{controls}</div>
          : <div className="timer-action-space" aria-hidden="true" />}
      </div>
      {timer && cancelId === timer.id ? (
        <CancelDialog key={timer.id} onDismiss={() => setCancelId(null)} onConfirm={async (reason) => {
          const saved = await dispatch({ type: 'cancel', target: timer, taskId: selectedTask, reason })
          if (saved) setCancelId(null)
        }} />
      ) : null}
    </section>
  )
}

function CancelDialog({ onDismiss, onConfirm }: {
  onDismiss: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal title="타이머를 취소할까요?" onDismiss={onDismiss}>
      <form onSubmit={(event) => {
        event.preventDefault()
        void onConfirm(reason)
      }}>
        <div className="modal-body">
          <p>취소한 세션은 집중 통계에 포함되지 않습니다.</p>
          <Field label="취소 이유 (선택)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} multiline rows={2} />
        </div>
        <div className="modal-actions">
          <Button onClick={onDismiss}>계속하기</Button>
          <Button type="submit">취소하기</Button>
        </div>
      </form>
    </Modal>
  )
}

function TaskPicker({ tasks, selected, onSelect }: {
  tasks: Task[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const optionsId = useId()
  const eligible = tasks.filter((task) => !task.archived && !task.done).sort(compareTasks)
  const label = eligible.find((task) => task.id === selected)?.title ?? '할 일 선택'

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function choose(id: string | null) {
    onSelect(id)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div className="task-picker" ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button className="button button--text task-picker-trigger" type="button" aria-expanded={open}
        aria-controls={optionsId} ref={trigger} onClick={() => setOpen(!open)}>
        {label}
      </button>
      <div id={optionsId} className="task-menu" role="group" aria-label="할 일 선택" hidden={!open}>
        <button type="button" onClick={() => choose(null)}>선택 안 함</button>
        {eligible.map((task) => <button type="button" key={task.id} onClick={() => choose(task.id)}>{task.title}</button>)}
      </div>
    </div>
  )
}

function TimerFace({ mode, kind, duration, timer, visible, status, completion }: {
  mode: DisplayMode
  kind: TimerKind
  duration: number
  timer: ActiveTimer | null
  visible: boolean
  status: string
  completion: string | null
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (timer?.status !== 'RUNNING' || !visible) return
    const running = timer
    let timeout: number
    function tick() {
      const time = Date.now()
      setNow(time)
      const left = remainingMs(running, time)
      if (left > 0) timeout = window.setTimeout(tick, left % 1_000 || 1_000)
    }
    tick()
    return () => window.clearTimeout(timeout)
  }, [timer, visible])

  const left = timer ? remainingMs(timer, now) : duration
  const progress = (duration - left) / duration
  const state = kind === 'FOCUS' ? 'focus' : 'break'
  const label = kindLabels[kind]
  const completionLine = completion ? <p className="timer-completion" role="status">{completion}</p> : null
  const reading = (
    <>
      {completionLine}
      <p className="timer-kind">{label}</p>
      <TimerDigits left={left} />
      <p className="timer-status">{status}</p>
    </>
  )
  const line = (
    <div className="timer-progress" aria-hidden="true">
      <div style={{ width: `${progress * 100}%` }} />
    </div>
  )

  if (mode === 'BOOKMARK') {
    return (
      <div className={`timer-face timer-face--bookmark timer-face--${state}`}>
        <hr />
        <div className="bookmark-row">
          <div className="bookmark-reading">{reading}{line}</div>
          <TimerArt name={`bookmark_${state}`} className="bookmark-art" />
        </div>
      </div>
    )
  }

  if (mode === 'RING') {
    return (
      <div className="timer-face timer-face--ring">
        <TimerArt name="ring_header" className="ring-header" />
        {completionLine}
        <p className="timer-kind">{label}</p>
        <div className="timer-ring">
          <svg className="ring-progress" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="ring-track" cx="50" cy="50" r="49.35" />
            {progress > 0 ? <circle cx="50" cy="50" r="49.35" pathLength="100"
              strokeDasharray={`${progress * 100} 100`} transform="rotate(-90 50 50)" /> : null}
          </svg>
          <div className="ring-reading">
            <TimerDigits left={left} />
            <p className="timer-status">{status}</p>
            <TimerArt name={`ring_${state}`} className="ring-art" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`timer-face timer-face--window timer-face--${state}`}>
      <TimerArt name={`window_${state}`} className="window-art" />
      {reading}
      {line}
    </div>
  )
}

function TimerDigits({ left }: { left: number }) {
  const seconds = Math.ceil(left / 1_000)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  const time = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  return (
    <div className="digits-frame">
      <div className="timer-digits" role="timer" aria-label={`남은 시간 ${minutes}분 ${remainder}초`}
        style={{ '--fit-size': `${100 / (0.64 * time.length)}cqi` } as CSSProperties}>
        {time}
      </div>
    </div>
  )
}

function TimerArt({ name, className }: { name: string; className: string }) {
  return <img className={`timer-art ${className}`} src={asset(`art/timer_${name}.webp`)} alt="" />
}
