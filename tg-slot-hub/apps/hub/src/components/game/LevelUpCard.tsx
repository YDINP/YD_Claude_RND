/**
 * 레벨업 카드 — 레벨이 오른 스핀의 연출이 모두 끝나 화면이 idle일 때만 무대 위쪽에 3초 뜬다.
 * 딤이 없고 카드만 입력을 받는다(아래 SPIN은 그대로 눌리고, 누르면 카드가 닫힌다).
 * 오토스핀 중에는 카드 대신 한 줄 토스트(1.6초)로 줄여 흐름을 끊지 않는다.
 * 소리는 기존 UI 소리 'up' 재사용.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Level } from '@tgslot/shared'
import { useT } from '../../i18n'
import { playUiSound } from '../../lib/audio'
import './LevelUpCard.css'

export const LEVEL_UP_CARD_MS = 3000
export const LEVEL_UP_TOAST_MS = 1600

export interface LevelUpCardProps {
  /** 이번 판의 levelUp 응답. 없으면 아무것도 그리지 않는다. */
  levelUp: { from: number; to: number; bonus: number } | null | undefined
  /** levelUp을 가져온 판의 id — 같은 판에서 한 번만 보이게 하는 키 */
  roundId: string | undefined
  /** 게임 화면이 idle(릴 정지·정산 끝)인지 */
  idle: boolean
  /** 빅윈 오버레이·세리머니 팝업·더블업 등 가려선 안 되는 연출이 떠 있는지 */
  blocked: boolean
  autoSpinning: boolean
  /** 서버의 최신 레벨 상태(다음 보상·다음 해금용). 새 레벨과 같을 때만 쓴다. */
  levelInfo: Level | null
  /** 예전 보상 굴림용. 지금은 카드 팝 모션만 CSS가 줄인다(보상은 처음부터 최종 값). */
  reducedMotion?: boolean
}

type LevelUpInfo = { from: number; to: number; bonus: number }
type Shown = { roundId: string; mode: 'card' | 'toast'; levelUp: LevelUpInfo }

export function LevelUpCard(props: LevelUpCardProps): ReactNode {
  const { levelUp, roundId, idle, blocked, autoSpinning, levelInfo } = props
  const t = useT()
  const [shown, setShown] = useState<Shown | null>(null)
  const handledRef = useRef<string | null>(null)
  // 레벨업 판이 프리스핀을 열면 lastResult가 프리스핀 결과로 계속 바뀐다(프리스핀은 levelUp 없음).
  // 그래서 받은 levelUp을 따로 들고 있다가 라운드가 다 끝난 뒤(blocked 해제) 띄운다.
  const [queued, setQueued] = useState<{ roundId: string; levelUp: LevelUpInfo } | null>(null)
  useEffect(() => {
    if (!levelUp || roundId === undefined || handledRef.current === roundId) return
    setQueued((q) => (q?.roundId === roundId ? q : { roundId, levelUp }))
  }, [levelUp, roundId])

  const pending = queued && handledRef.current !== queued.roundId ? queued : null

  // 뜨는 시점: 새 levelUp이 있고, 오토면 즉시 토스트, 아니면 idle이며 가리는 연출이 없을 때 카드.
  useEffect(() => {
    if (pending === null) return
    if (autoSpinning) {
      handledRef.current = pending.roundId
      setShown({ roundId: pending.roundId, mode: 'toast', levelUp: pending.levelUp })
      return
    }
    if (idle && !blocked) {
      handledRef.current = pending.roundId
      setShown({ roundId: pending.roundId, mode: 'card', levelUp: pending.levelUp })
    }
  }, [pending, autoSpinning, idle, blocked])

  // 새 스핀이 시작되면(idle 아님) 카드는 즉시 닫는다.
  useEffect(() => {
    if (shown?.mode === 'card' && !idle) setShown(null)
  }, [idle, shown])

  useEffect(() => {
    if (!shown) return
    if (shown.mode === 'card') playUiSound('up')
    const id = setTimeout(() => setShown(null), shown.mode === 'card' ? LEVEL_UP_CARD_MS : LEVEL_UP_TOAST_MS)
    return () => clearTimeout(id)
  }, [shown])

  if (!shown) return null
  const shownLevelUp = shown.levelUp
  const fmt = (n: number): string => n.toLocaleString('en-US')

  if (shown.mode === 'toast') {
    return (
      <div className="hub-levelup-toast" role="status" data-testid="levelup-toast">
        {t('levelUpAutoToast', { level: shownLevelUp.to, amount: fmt(shownLevelUp.bonus) })}
      </div>
    )
  }

  const info = levelInfo && levelInfo.level === shownLevelUp.to ? levelInfo : null
  return (
    <div
      className="hub-levelup-card"
      role="status"
      data-testid="levelup-card"
      onClick={(e) => {
        e.stopPropagation()
        setShown(null)
      }}
    >
      <div className="hub-levelup-card__title">{t('levelUpCardTitle')}</div>
      <div className="hub-levelup-card__levels">{t('levelUpCardFromTo', { from: shownLevelUp.from, to: shownLevelUp.to })}</div>
      {shownLevelUp.bonus > 0 && <div className="hub-levelup-card__bonus">🪙 +{fmt(shownLevelUp.bonus)}</div>}
      {info?.nextLevelBonus !== undefined && (
        <div className="hub-levelup-card__next">{t('levelUpCardNextBonus', { amount: fmt(info.nextLevelBonus) })}</div>
      )}
      {info?.nextUnlock && (
        <div className="hub-levelup-card__next">
          {t('levelUpCardNextUnlock', { level: info.nextUnlock.level, maxBet: fmt(info.nextUnlock.maxBet) })}
        </div>
      )}
    </div>
  )
}
