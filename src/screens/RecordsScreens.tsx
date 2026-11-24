import { useMemo, useState } from 'react'
import { dateKey, dateStamp, offsetDate, weekStart } from '../domain/dates'
import { HISTORY_PAGE_SIZE, kindLabels, MINUTE } from '../domain/pomodoro'
import type { SessionRecord, Task } from '../domain/pomodoro'
import { Button } from '../ui'

const statusLabels = { COMPLETED: '완료', CANCELLED: '취소', INTERRUPTED: '중단' }
const minutes = (ms: number) => Math.floor(ms / MINUTE) + '분'

export function HistoryScreen({ history, tasks }: { history: SessionRecord[]; tasks: Task[] }) {
  const [page, setPage] = useState(0)
  const taskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks])
  const sorted = useMemo(() => [...history].sort((a, b) => b.startedWallMs - a.startedWallMs || b.id.localeCompare(a.id)), [history])
  const visible = sorted.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE)
  const entries = visible.map((record) => ({ record, date: dateKey(record.startedWallMs, record.zoneIdAtStart) }))

  return (
    <section className="screen-scroll history-screen" aria-labelledby="history-heading">
      <h1 id="history-heading">기록</h1>
      {entries.length === 0 ? <p className="empty-message">아직 기록이 없어요.</p> : null}
      <div className="history-list">
        {entries.map(({ record, date }, index) => {
          const { zoneIdAtStart: zone, taskId } = record
          return (
            <div key={record.id}>
              {date !== entries[index - 1]?.date ? <h2 className="history-date">{date}</h2> : null}
              <article className="card history-card">
                <h3>{kindLabels[record.kind]} · {statusLabels[record.status]}</h3>
                <p>{record.taskTitle ?? '할 일 연결 없음'}{taskId && !taskIds.has(taskId) ? ' (삭제된 할 일)' : ''}</p>
                <p>시작 {dateStamp(record.startedWallMs, zone)}</p>
                <p>종료 {dateStamp(record.finishedWallMs, zone)}</p>
                <p className="body-small">시간대 {zone}</p>
                <p>진행 {minutes(record.activeMs)} / {minutes(record.plannedMs)}</p>
                {record.cancellationReason ? <p>취소 이유: {record.cancellationReason}</p> : null}
              </article>
            </div>
          )
        })}
        <nav className="history-pagination" aria-label="기록 페이지">
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button>
          <span>{page + 1} 페이지</span>
          <Button disabled={entries.length !== HISTORY_PAGE_SIZE} onClick={() => setPage(page + 1)}>다음</Button>
        </nav>
      </div>
    </section>
  )
}

interface Total {
  ms: number
  count: number
}

const zero = { ms: 0, count: 0 }
const totalLabel = ({ ms, count }: Total) => minutes(ms) + ' · ' + count + '회'

function collectTotals(history: SessionRecord[], today: string) {
  const daily = new Map<string, Total>()
  const all = { ...zero }
  const week = { ...zero }
  const month = { ...zero }
  const firstWeekDay = weekStart(today)
  const firstMonthDay = today.slice(0, 8) + '01'

  for (const record of history) {
    if (record.kind !== 'FOCUS' || record.status !== 'COMPLETED' || !record.completionDate) continue
    const date = record.completionDate
    const add = (total: Total) => {
      total.ms += record.plannedMs
      total.count += 1
    }
    add(all)
    if (date > today) continue
    const entry = daily.get(date) ?? { ...zero }
    add(entry)
    daily.set(date, entry)
    if (date >= firstWeekDay) add(week)
    if (date >= firstMonthDay) add(month)
  }
  return { daily, all, week, month, firstMonthDay }
}

export function StatisticsScreen({ history, today }: { history: SessionRecord[]; today: string }) {
  const { daily, all, week, month, firstMonthDay } = useMemo(() => collectTotals(history, today), [history, today])
  const summaries = [
    { label: '오늘', value: daily.get(today) ?? zero },
    { label: '이번 주 · 월요일부터', value: week },
    { label: '이번 달', value: month },
    { label: '전체', value: all },
  ]
  const recent = Array.from({ length: 7 }, (_, index) => offsetDate(today, index - 6))
  const days = Array.from({ length: Number(today.slice(-2)) }, (_, index) => {
    const date = offsetDate(firstMonthDay, index)
    return { date, day: index + 1, ms: daily.get(date)?.ms ?? 0 }
  })
  const max = Math.max(MINUTE, ...days.map((day) => day.ms))

  return (
    <section className="screen-scroll stats-screen" aria-labelledby="stats-heading">
      <h1 id="stats-heading">통계</h1>
      {summaries.map(({ label, value }) => (
        <div className="card stats-summary" key={label}>
          <span>{label}</span>
          <strong>{totalLabel(value)}</strong>
        </div>
      ))}
      <h2>최근 7일</h2>
      {recent.map((date) => (
        <div className="stats-day" key={date}>
          <time dateTime={date}>{date}</time>
          <span>{totalLabel(daily.get(date) ?? zero)}</span>
        </div>
      ))}
      <h2 id="month-chart-heading">이번 달 일별 집중 시간</h2>
      <div className="month-chart" role="region" aria-labelledby="month-chart-heading" tabIndex={0}>
        {days.map(({ date, day, ms }) => (
          <div className="chart-day" role="img" aria-label={date + ' 집중 ' + minutes(ms)} key={date}>
            <span aria-hidden="true">{Math.floor(ms / MINUTE)}</span>
            <div className="chart-bar" style={{ height: 4 + 100 * ms / max }} aria-hidden="true" />
            <span aria-hidden="true">{day}</span>
          </div>
        ))}
      </div>
      <p className="body-small">완료한 집중 세션만 집계하며, 분 미만은 버립니다. 완료 날짜는 세션을 시작한 시간대를 기준으로 합니다.</p>
    </section>
  )
}
