import { useState } from 'react'
import { supportsSound, supportsVibration, supportsWakeLock } from '../browserEffects'
import { validNumber } from '../domain/pomodoro'
import type { DisplayMode, NumberSetting, Settings } from '../domain/pomodoro'
import { Button, Field, Modal, Switch } from '../ui'

const modes: { id: DisplayMode; title: string; description: string }[] = [
  { id: 'WINDOW', title: '숲속 창가', description: '창가 풍경 아래 시간을 크게 표시해요.' },
  { id: 'BOOKMARK', title: '서재의 책갈피', description: '왼쪽에 시간, 오른쪽에 책갈피 삽화를 표시해요.' },
  { id: 'RING', title: '둥근 타이머', description: '둥근 진행 표시 안에 시간과 작은 삽화를 담아요.' },
]

const fields: { key: NumberSetting; label: string }[] = [
  { key: 'focusMinutes', label: '집중 시간 (5–120분)' },
  { key: 'shortBreakMinutes', label: '짧은 휴식 (1–30분)' },
  { key: 'longBreakMinutes', label: '긴 휴식 (5–60분)' },
  { key: 'cycleLength', label: '긴 휴식 주기 (2–8회)' },
]

export function SettingsScreen({ saved, onChange }: { saved: Settings; onChange: (change: Partial<Settings>) => void }) {
  const [drafts, setDrafts] = useState<Partial<Record<NumberSetting, string>>>({})
  const [showModes, setShowModes] = useState(false)
  const current = modes.find((mode) => mode.id === saved.displayMode) ?? modes[0]
  const hasBrowserOptions = supportsSound || supportsVibration || supportsWakeLock

  return (
    <section className="screen-scroll settings-screen" aria-labelledby="settings-heading">
      <h1 id="settings-heading">설정</h1>
      <Button variant="outline" className="mode-button" onClick={() => setShowModes(true)}>화면 모드: {current.title}</Button>
      <hr />
      <h2>시간과 주기</h2>
      {fields.map(({ key, label }) => {
        const value = drafts[key] ?? String(saved[key])
        return <Field key={key} label={label} value={value} inputMode="numeric" invalid={!validNumber(key, Number(value))} onChange={(event) => {
          const text = event.target.value.replace(/\D/g, '').slice(0, 3)
          setDrafts((previous) => ({ ...previous, [key]: text }))
          if (validNumber(key, Number(text))) onChange({ [key]: Number(text) })
        }} />
      })}
      <p className="body-small">유효한 값은 자동 저장됩니다.</p>
      <p className="body-small">진행 중인 세션에는 변경이 적용되지 않으며, 주기 횟수는 다음 주기부터 적용됩니다.</p>
      <hr />
      <h2>자동 시작</h2>
      <Switch label="휴식 자동 시작" checked={saved.autoStartBreak} onChange={(autoStartBreak) => onChange({ autoStartBreak })} />
      <Switch label="집중 자동 시작" checked={saved.autoStartFocus} onChange={(autoStartFocus) => onChange({ autoStartFocus })} />
      <p className="body-small">앱이 화면에 보일 때만 자동으로 시작합니다.</p>
      {hasBrowserOptions ? (
        <>
          <hr />
          <h2>알림과 집중 화면</h2>
          {supportsSound ? <Switch label="알림 소리" checked={saved.sound} onChange={(sound) => onChange({ sound })} /> : null}
          {supportsVibration ? <Switch label="알림 진동" checked={saved.vibration} onChange={(vibration) => onChange({ vibration })} /> : null}
          {supportsWakeLock ? <Switch label="집중 화면에서 화면 유지" checked={saved.keepScreenOn} onChange={(keepScreenOn) => onChange({ keepScreenOn })} /> : null}
        </>
      ) : null}
      <hr />
      <p className="body-small">기록은 이 브라우저에만 저장되며, 브라우저 데이터를 삭제하거나 기기를 바꾸면 자동 복원되지 않습니다.</p>

      {showModes ? (
        <Modal title="화면 모드" onDismiss={() => setShowModes(false)}>
          <div className="modal-body mode-picker" role="group" aria-label="화면 모드 선택">
            {modes.map((mode) => (
              <button type="button" className="mode-option" aria-pressed={mode.id === current.id} key={mode.id} onClick={() => {
                onChange({ displayMode: mode.id })
                setShowModes(false)
              }}>
                <span className="radio-mark" aria-hidden="true" />
                <span>
                  <span className="mode-title">{mode.title}</span>
                  <span className="body-medium">{mode.description}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="modal-actions"><Button onClick={() => setShowModes(false)}>닫기</Button></div>
        </Modal>
      ) : null}
    </section>
  )
}
