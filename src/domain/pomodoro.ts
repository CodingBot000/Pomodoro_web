import { collectibles } from './collection'
import type { CollectibleId } from './collection'
import { dateKey } from './dates'

export const MINUTE = 60_000
export const HISTORY_PAGE_SIZE = 50
export type TimerKind = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK'
export type DisplayMode = 'WINDOW' | 'BOOKMARK' | 'RING'

export const kindLabels: Record<TimerKind, string> = {
  FOCUS: '집중',
  SHORT_BREAK: '짧은 휴식',
  LONG_BREAK: '긴 휴식',
}

export const settingLimits = {
  focusMinutes: [5, 120],
  shortBreakMinutes: [1, 30],
  longBreakMinutes: [5, 60],
  cycleLength: [2, 8],
} as const

export type NumberSetting = keyof typeof settingLimits

export interface Settings extends Record<NumberSetting, number> {
  autoStartBreak: boolean
  autoStartFocus: boolean
  sound: boolean
  vibration: boolean
  keepScreenOn: boolean
  displayMode: DisplayMode
}

const defaults: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cycleLength: 4,
  autoStartBreak: false,
  autoStartFocus: false,
  sound: true,
  vibration: true,
  keepScreenOn: false,
  displayMode: 'WINDOW',
}

const durationFields = {
  FOCUS: 'focusMinutes',
  SHORT_BREAK: 'shortBreakMinutes',
  LONG_BREAK: 'longBreakMinutes',
} as const

export function durationMs(settings: Settings, kind: TimerKind) {
  return settings[durationFields[kind]] * MINUTE
}

export function validNumber(key: NumberSetting, value: number) {
  const [min, max] = settingLimits[key]
  return Number.isInteger(value) && value >= min && value <= max
}

export interface TaskDetails {
  title: string
  memo: string
  estimatedSessions: number
  priority: number
}

export interface Task extends TaskDetails {
  id: string
  done: boolean
  archived: boolean
  sortOrder: number
  createdAtMs: number
  completedAtMs: number | null
}

interface Session {
  id: string
  kind: TimerKind
  plannedMs: number
  startedWallMs: number
  zoneIdAtStart: string
  taskId: string | null
  taskTitle: string | null
}

export interface ActiveTimer extends Session {
  status: 'RUNNING' | 'PAUSED'
  accumulatedMs: number
  anchorWallMs: number
  dueWallMs: number | null
  autoStartNext: boolean
  version: number
}

export interface SessionRecord extends Session {
  status: 'COMPLETED' | 'CANCELLED' | 'INTERRUPTED'
  activeMs: number
  finishedWallMs: number
  completionDate: string | null
  cancellationReason: string | null
}

interface Cycle {
  kind: TimerKind
  count: number
  target: number
  awaiting: boolean
}

export interface Capsule {
  eventId: string
  earnedAt: number
  itemId: CollectibleId | null
  acknowledged: boolean
}

export interface AppState {
  revision: number
  settings: Settings
  timer: ActiveTimer | null
  cycle: Cycle
  tasks: Task[]
  history: SessionRecord[]
  rewards: Capsule[]
}

export function initialState(): AppState {
  return {
    revision: 0,
    settings: { ...defaults },
    timer: null,
    cycle: { kind: 'FOCUS', count: 0, target: 0, awaiting: false },
    tasks: [],
    history: [],
    rewards: [],
  }
}

interface TimerTarget {
  id: string
  version: number
}

type TimerUpdate =
  | { type: 'recover'; target?: TimerTarget; autoStart: boolean; taskId?: string | null }
  | { type: 'pause' | 'resume' | 'cancel'; target: TimerTarget; taskId: string | null; reason?: string }

type TaskAction =
  | { type: 'saveTask'; details: TaskDetails; id?: string }
  | { type: 'toggleTask' | 'archiveTask' | 'deleteTask'; id: string }
  | { type: 'moveTask'; id: string; beforeId: string }

export type Action =
  | TimerUpdate
  | TaskAction
  | { type: 'start'; kind: TimerKind; taskId: string | null }
  | { type: 'skipBreak'; kind: TimerKind }
  | { type: 'settings'; change: Partial<Settings> }
  | { type: 'openCapsule' | 'acknowledgeCapsule'; id: string }

export interface Mutation {
  state: AppState
  completed?: TimerKind
}

interface CommandTime {
  now: number
  zone: string
  foreground: boolean
}

function createId() {
  return crypto.randomUUID?.() ?? Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function remainingMs(timer: ActiveTimer, now: number) {
  if (timer.dueWallMs !== null) {
    return Math.max(0, Math.min(timer.plannedMs - timer.accumulatedMs, timer.dueWallMs - now))
  }
  return timer.plannedMs - timer.accumulatedMs
}

function startTimer(state: AppState, kind: TimerKind, taskId: string | null, { now, zone }: CommandTime): AppState {
  if (state.timer || state.cycle.kind !== kind) return state
  const task = kind === 'FOCUS'
    ? state.tasks.find((item) => item.id === taskId && !item.done && !item.archived)
    : undefined
  const plannedMs = durationMs(state.settings, kind)
  return {
    ...state,
    cycle: {
      ...state.cycle,
      target: kind === 'FOCUS' && state.cycle.target === 0 ? state.settings.cycleLength : state.cycle.target,
      awaiting: false,
    },
    timer: {
      id: createId(),
      kind,
      status: 'RUNNING',
      plannedMs,
      accumulatedMs: 0,
      anchorWallMs: now,
      dueWallMs: now + plannedMs,
      startedWallMs: now,
      zoneIdAtStart: zone,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      autoStartNext: kind === 'FOCUS' ? state.settings.autoStartBreak : state.settings.autoStartFocus,
      version: 1,
    },
  }
}

function afterBreak(cycle: Cycle): Cycle {
  return cycle.kind === 'LONG_BREAK'
    ? { kind: 'FOCUS', count: 0, target: 0, awaiting: true }
    : { ...cycle, kind: 'FOCUS', awaiting: true }
}

function afterSession(cycle: Cycle, kind: TimerKind, status: SessionRecord['status']): Cycle {
  if (kind !== 'FOCUS') {
    return status === 'INTERRUPTED' ? { ...cycle, awaiting: true } : afterBreak(cycle)
  }
  if (status !== 'COMPLETED') return { ...cycle, awaiting: false }

  const count = cycle.count + 1
  return { ...cycle, count, kind: count >= cycle.target ? 'LONG_BREAK' : 'SHORT_BREAK', awaiting: true }
}

function finishTimer(
  state: AppState,
  timer: ActiveTimer,
  status: SessionRecord['status'],
  action: TimerUpdate,
  time: CommandTime,
): Mutation {
  const completed = status === 'COMPLETED'
  const finishedWallMs = completed ? timer.anchorWallMs + timer.plannedMs - timer.accumulatedMs : time.now
  const { id, kind, startedWallMs, plannedMs, taskId, taskTitle, zoneIdAtStart } = timer
  const record: SessionRecord = {
    id, kind, startedWallMs, plannedMs, taskId, taskTitle, zoneIdAtStart, status, finishedWallMs,
    activeMs: completed ? plannedMs
      : status === 'INTERRUPTED' ? timer.accumulatedMs : plannedMs - remainingMs(timer, time.now),
    completionDate: completed ? dateKey(finishedWallMs, zoneIdAtStart) : null,
    cancellationReason: status === 'CANCELLED' && action.type === 'cancel'
      ? action.reason?.trim() || null
      : null,
  }
  const rewards = completed && kind === 'FOCUS'
    ? [...state.rewards, { eventId: 'focus:' + id, earnedAt: finishedWallMs, itemId: null, acknowledged: false }]
    : state.rewards
  const cycle = afterSession(state.cycle, kind, status)
  const next = { ...state, timer: null, cycle, history: [record, ...state.history], rewards }
  const autoStart = action.type !== 'recover' || action.autoStart
  return {
    state: completed && timer.autoStartNext && autoStart && time.foreground
      ? startTimer(next, cycle.kind, action.taskId ?? null, time)
      : next,
    completed: completed && autoStart && time.foreground ? kind : undefined,
  }
}

function changeTimer(state: AppState, action: TimerUpdate, time: CommandTime): Mutation {
  const timer = state.timer
  if (!timer || action.target && (action.target.id !== timer.id || action.target.version !== timer.version)) return { state }

  const { now } = time
  if (now < timer.anchorWallMs) return finishTimer(state, timer, 'INTERRUPTED', action, time)
  const remaining = remainingMs(timer, now)
  if (timer.status === 'RUNNING' && remaining === 0) return finishTimer(state, timer, 'COMPLETED', action, time)
  if (action.type === 'cancel') return finishTimer(state, timer, 'CANCELLED', action, time)

  if (action.type === 'pause' && timer.status === 'RUNNING') {
    return {
      state: {
        ...state,
        timer: {
          ...timer,
          status: 'PAUSED',
          anchorWallMs: now,
          dueWallMs: null,
          accumulatedMs: timer.plannedMs - remaining,
          version: timer.version + 1,
        },
      },
    }
  }
  if (action.type === 'resume' && timer.status === 'PAUSED') {
    return {
      state: {
        ...state,
        timer: {
          ...timer,
          status: 'RUNNING',
          anchorWallMs: now,
          dueWallMs: now + remaining,
          version: timer.version + 1,
        },
      },
    }
  }
  return { state }
}

export function compareTasks(a: Task, b: Task) {
  return Number(a.archived) - Number(b.archived)
    || Number(a.done) - Number(b.done)
    || b.priority - a.priority
    || a.sortOrder - b.sortOrder
    || a.id.localeCompare(b.id)
}

export function sameTaskGroup(a: Task, b: Task) {
  return a.done === b.done && a.archived === b.archived && a.priority === b.priority
}

export function validTask({ title, memo, estimatedSessions, priority }: TaskDetails) {
  return title.trim().length > 0 && title.length <= 120 && memo.length <= 500
    && Number.isInteger(estimatedSessions) && estimatedSessions >= 1 && estimatedSessions <= 99
    && Number.isInteger(priority) && priority >= 0 && priority <= 2
}

function changeTasks(tasks: Task[], action: TaskAction, now: number) {
  const task = tasks.find((item) => item.id === action.id)
  if (!task && action.type !== 'saveTask') return tasks
  switch (action.type) {
    case 'saveTask': {
      if (!validTask(action.details) || (action.id && !task)) return tasks
      const details = { ...action.details, title: action.details.title.trim(), memo: action.details.memo.trim() }
      if (task) return tasks.map((item) => item.id === task.id ? { ...task, ...details } : item)
      return [...tasks, {
        ...details, id: createId(), sortOrder: now, createdAtMs: now, completedAtMs: null, done: false, archived: false,
      }]
    }
    case 'toggleTask':
      return tasks.map((item) => item.id === action.id
        ? { ...item, done: !item.done, archived: false, completedAtMs: item.done ? null : now } : item)
    case 'archiveTask':
      return tasks.map((item) => item.id === action.id ? { ...item, archived: !item.archived } : item)
    case 'deleteTask':
      return tasks.filter((item) => item.id !== action.id)
    case 'moveTask': {
      const before = tasks.find((item) => item.id === action.beforeId)
      if (!task || !before || before.id === task.id || !sameTaskGroup(task, before)) return tasks
      const group = tasks.filter((item) => item.id !== task.id && sameTaskGroup(task, item)).sort(compareTasks)
      group.splice(group.indexOf(before), 0, task)
      const order = new Map(group.map((item, index) => [item.id, index]))
      return tasks.map((item) => {
        const sortOrder = order.get(item.id)
        return sortOrder === undefined ? item : { ...item, sortOrder }
      })
    }
  }
}

export function applyAction(state: AppState, action: Action, time: CommandTime): Mutation {
  switch (action.type) {
    case 'recover':
    case 'pause':
    case 'resume':
    case 'cancel':
      return changeTimer(state, action, time)
    case 'start':
      return { state: startTimer(state, action.kind, action.taskId, time) }
    case 'skipBreak':
      return { state: !state.timer && state.cycle.kind === action.kind && action.kind !== 'FOCUS'
        ? { ...state, cycle: afterBreak(state.cycle) } : state }
    case 'settings': {
      const settings = { ...state.settings, ...action.change }
      const keys = Object.keys(settingLimits) as NumberSetting[]
      return { state: keys.every((key) => validNumber(key, settings[key])) ? { ...state, settings } : state }
    }
    case 'saveTask':
    case 'toggleTask':
    case 'archiveTask':
    case 'deleteTask':
    case 'moveTask': {
      const tasks = changeTasks(state.tasks, action, time.now)
      return { state: tasks === state.tasks ? state : { ...state, tasks } }
    }
    case 'openCapsule':
    case 'acknowledgeCapsule': {
      const capsule = state.rewards.find((item) => item.eventId === action.id)
      if (!capsule || (action.type === 'openCapsule' ? capsule.itemId : !capsule.itemId || capsule.acknowledged)) {
        return { state }
      }
      const updated = action.type === 'openCapsule'
        ? { ...capsule, itemId: collectibles[Math.floor(Math.random() * collectibles.length)].id }
        : { ...capsule, acknowledged: true }
      return { state: { ...state, rewards: state.rewards.map((item) => item === capsule ? updated : item) } }
    }
  }
}
