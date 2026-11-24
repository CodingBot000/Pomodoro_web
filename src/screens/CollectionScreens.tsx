import { useEffect, useMemo, useState } from 'react'
import { supportsVibration } from '../browserEffects'
import { collectibles } from '../domain/collection'
import type { CollectibleId } from '../domain/collection'
import type { Capsule } from '../domain/pomodoro'
import { asset, Button, Modal } from '../ui'

const itemTitles = new Map<CollectibleId, string>(collectibles.map(({ id, title }) => [id, title]))
const itemImage = (id: CollectibleId) => asset('art/collectible_' + id.replaceAll('-', '_') + '.webp')

function groupItems(rewards: Capsule[]) {
  const counts = new Map<CollectibleId, { id: CollectibleId; count: number; lastEarned: number }>()
  for (const reward of rewards) {
    if (!reward.itemId) continue
    const existing = counts.get(reward.itemId)
    if (existing) {
      existing.count += 1
      existing.lastEarned = Math.max(existing.lastEarned, reward.earnedAt)
    } else {
      counts.set(reward.itemId, { id: reward.itemId, count: 1, lastEarned: reward.earnedAt })
    }
  }
  return [...counts.values()].sort((a, b) => b.lastEarned - a.lastEarned || a.id.localeCompare(b.id))
}

export function GalleryScreen({ rewards, pendingCount, onBack, onShowReward }: {
  rewards: Capsule[]
  pendingCount: number
  onBack: () => void
  onShowReward: () => void
}) {
  const collection = useMemo(() => groupItems(rewards), [rewards])
  const totalCount = collection.reduce((sum, item) => sum + item.count, 0)

  return (
    <section className="screen-scroll gallery-screen" aria-labelledby="gallery-heading">
      <div className="gallery-header">
        <Button className="gallery-back" onClick={onBack}>뒤로</Button>
        <h1 className="serif" id="gallery-heading">나의 전시관</h1>
        {collection.length ? <p className="muted">{collection.length}종 · 총 {totalCount}개</p> : null}
        {pendingCount > 0 ? <Button variant="outline" onClick={onShowReward}>받은 캡슐 {pendingCount}개 보기</Button> : null}
      </div>
      {collection.length === 0 ? (
        <div className="gallery-empty">
          <h2>아직 수집품이 없어요</h2>
          <p className="muted">집중을 마치고 캡슐을 열면 여기에 미니어처가 전시돼요.</p>
        </div>
      ) : (
        <ul className="gallery-grid">
          {collection.map(({ id, count }) => (
            <li key={id} className="gallery-tile">
              <img src={itemImage(id)} alt="" loading="lazy" />
              <h2>{itemTitles.get(id)}</h2>
              <p className="body-small muted">{count}개 보유</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Phase = 'idle' | 'saving' | 'shaking' | 'bursting' | 'revealing'

const animation: Partial<Record<Phase, { duration: number; next: Phase }>> = {
  shaking: { duration: 540, next: 'bursting' },
  bursting: { duration: 242, next: 'revealing' },
  revealing: { duration: 198, next: 'idle' },
}

const rays = Array.from({ length: 12 }, (_, index) => {
  const r = index % 2 === 0 ? 18 : 14
  return { index, points: `98,75 97,${r} 92,75`, color: index % 2 === 0 ? '#ffd572' : '#ffedb3' }
})

export function RewardDialog({ capsule, onOpen, onClose }: {
  capsule: Capsule
  onOpen: () => Promise<boolean>
  onClose: (visitGallery: boolean) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [failed, setFailed] = useState(false)
  const opening = phase !== 'idle'
  const burst = phase === 'bursting' || phase === 'revealing'
  const revealed = capsule.itemId !== null && (phase === 'idle' || phase === 'revealing')
  const dismiss = () => { if (!opening) onClose(false) }

  useEffect(() => {
    const transition = animation[phase]
    if (!transition) return
    const timeout = window.setTimeout(() => setPhase(transition.next), transition.duration)
    return () => window.clearTimeout(timeout)
  }, [phase])

  async function open() {
    if (opening) return
    setPhase('saving')
    setFailed(false)
    if (supportsVibration) navigator.vibrate(20)
    const saved = await onOpen()
    if (!saved) {
      setFailed(true)
      setPhase('idle')
    } else {
      setPhase(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'idle' : 'shaking')
    }
  }

  return (
    <Modal title={revealed ? '수집품을 얻었어요!' : '집중 완료!'} className="reward-modal" onDismiss={dismiss}>
      <div className="reward-art">
        {burst ? (
          <svg className="reward-burst" viewBox="0 0 194 194" aria-hidden="true">
            {rays.map(({ index, color, points }) => <polygon key={index} points={points} fill={color} transform={`rotate(${index * 30} 97 97)`} />)}
          </svg>
        ) : null}
        {revealed && capsule.itemId ? (
          <img src={itemImage(capsule.itemId)} alt="" />
        ) : (
          <button type="button" className={`capsule capsule--${phase}`} aria-label="캡슐 열기" disabled={opening} onClick={() => void open()}>
            <span className="capsule-ball" aria-hidden="true">
              <span className="capsule-bottom" />
              <span className="capsule-latch" />
            </span>
          </button>
        )}
      </div>
      {revealed && capsule.itemId ? (
        <>
          <p className="reward-name" role="status">{itemTitles.get(capsule.itemId)}</p>
          <Button variant="filled" disabled={opening} onClick={() => onClose(true)}>전시관 보기</Button>
        </>
      ) : (
        <p className="muted" role="status">
          {failed ? '캡슐을 열지 못했어요. 다시 탭해 주세요.' : opening ? '캡슐을 여는 중…' : '캡슐을 탭해 수집품을 열어 보세요.'}
        </p>
      )}
      <Button onClick={dismiss} disabled={opening}>{revealed ? '닫기' : '나중에'}</Button>
    </Modal>
  )
}
