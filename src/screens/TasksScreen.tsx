import { useMemo, useState } from 'react'
import { compareTasks, sameTaskGroup, validTask } from '../domain/pomodoro'
import type { Task, TaskDetails } from '../domain/pomodoro'
import { Button, Field, Modal } from '../ui'
import type { Dispatch } from '../usePomodoro'

const priorities = ['낮음', '보통', '높음']
const filters = ['할 일', '완료', '보관'] as const

export function TasksScreen({ tasks, dispatch, onDelete }: {
  tasks: Task[]
  dispatch: Dispatch
  onDelete: (id: string) => void
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>('할 일')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const editingTask = tasks.find((task) => task.id === editing)
  const sorted = useMemo(() => [...tasks].sort(compareTasks), [tasks])
  const visible = sorted.filter((task) => filter === '보관' ? task.archived : !task.archived && task.done === (filter === '완료'))

  return (
    <section className="screen-scroll tasks-screen" aria-labelledby="tasks-heading">
      <div className="tasks-header">
        <h1 id="tasks-heading">할 일</h1>
        <Button variant="filled" onClick={() => setEditing('new')}>추가</Button>
      </div>
      <div className="chips" role="group" aria-label="할 일 필터">
        {filters.map((value) => <button type="button" key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
      </div>

      {visible.length
        ? <ul className="card-list">
            {visible.map((task, index) => {
              const previous = visible[index - 1]
              const canMove = previous && sameTaskGroup(previous, task)
              return (
                <li key={task.id} className="card task-card">
                  <div className="task-card-heading">
                    <h2>{task.title}</h2>
                    <p>{priorities[task.priority]}</p>
                  </div>
                  {task.memo ? <p className="body-medium task-memo">{task.memo}</p> : null}
                  <p className="body-small">예상 {task.estimatedSessions}회</p>
                  <div className="task-actions">
                    <Button onClick={() => void dispatch({ type: 'toggleTask', id: task.id })}>{task.done ? '되돌리기' : '완료'}</Button>
                    <Button aria-label={task.title + ' 수정'} onClick={() => setEditing(task.id)}>수정</Button>
                    <Button onClick={() => void dispatch({ type: 'archiveTask', id: task.id })}>{task.archived ? '복원' : '보관'}</Button>
                    <Button aria-label={task.title + ' 삭제'} onClick={() => setDeleting(task.id)}>삭제</Button>
                  </div>
                  {canMove ? <Button onClick={() => void dispatch({ type: 'moveTask', id: task.id, beforeId: previous.id })}>위로 이동</Button> : null}
                </li>
              )
            })}
          </ul>
        : <p className="empty-message">표시할 할 일이 없어요.</p>}

      {editing === 'new' || editingTask ? (
        <TaskEditor key={editing} task={editingTask} onDismiss={() => setEditing(null)} onSave={async (details) => {
          const saved = await dispatch({ type: 'saveTask', id: editingTask?.id, details })
          if (saved) setEditing(null)
          return Boolean(saved)
        }} />
      ) : null}
      {deleting && tasks.some((task) => task.id === deleting) ? (
        <Modal title="할 일을 삭제할까요?" onDismiss={() => setDeleting(null)}>
          <div className="modal-body"><p>과거 집중 기록에는 당시의 작업명이 남습니다.</p></div>
          <div className="modal-actions">
            <Button onClick={() => setDeleting(null)}>닫기</Button>
            <Button onClick={async () => {
              const saved = await dispatch({ type: 'deleteTask', id: deleting })
              if (saved) {
                onDelete(deleting)
                setDeleting(null)
              }
            }}>삭제</Button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

function TaskEditor({ task, onDismiss, onSave }: {
  task?: Task
  onDismiss: () => void
  onSave: (details: TaskDetails) => Promise<boolean>
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [memo, setMemo] = useState(task?.memo ?? '')
  const [estimate, setEstimate] = useState(String(task?.estimatedSessions ?? 1))
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const details = { title, memo, estimatedSessions: Number(estimate), priority }
  const dismiss = () => { if (!saving) onDismiss() }

  return (
    <Modal title={task ? '할 일 수정' : '할 일 추가'} onDismiss={dismiss}>
      <form onSubmit={async (event) => {
        event.preventDefault()
        if (saving || !validTask(details)) return
        setSaving(true)
        const saved = await onSave(details)
        if (!saved) {
          setSaving(false)
          setFailed(true)
        }
      }}>
        <div className="modal-body task-form">
          <Field label="제목" value={title} maxLength={120} invalid={!title.trim()} onChange={(event) => setTitle(event.target.value)} />
          <Field label="메모 (선택)" value={memo} maxLength={500} onChange={(event) => setMemo(event.target.value)} multiline rows={2} />
          <Field label="예상 집중 횟수 (1–99)" value={estimate} inputMode="numeric"
            invalid={Number(estimate) < 1 || Number(estimate) > 99}
            onChange={(event) => setEstimate(event.target.value.replace(/\D/g, '').slice(0, 2))} />
          <p>우선순위</p>
          <div className="chips chips--small" role="group" aria-label="우선순위">
            {priorities.map((label, index) => <button type="button" key={label} className="chip" aria-pressed={priority === index} onClick={() => setPriority(index)}>{label}</button>)}
          </div>
          {failed ? <p className="form-error" role="alert">할 일을 저장하지 못했어요. 다시 시도해 주세요.</p> : null}
        </div>
        <div className="modal-actions">
          <Button onClick={dismiss} disabled={saving}>취소</Button>
          <Button type="submit" disabled={saving || !validTask(details)}>저장</Button>
        </div>
      </form>
    </Modal>
  )
}
