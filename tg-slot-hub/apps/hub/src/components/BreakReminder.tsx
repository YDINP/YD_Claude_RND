/**
 * 휴식 안내 — 이번 세션에서 화면을 본 시간이 60분, 120분… 을 넘으면 중앙 작은 카드를 한 번씩 띄운다.
 * 판이 도는 중이면 끝난 뒤(idle)에 띄우고, 오토스핀이 돌고 있으면 멈춘다(이유 토스트).
 * [계속하기]는 안내만 닫고, [로비로]는 로비로 나간다. 강제로 막지 않는다.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { navigateToLobby } from '../router'
import { useGameStore } from '../store/game'
import { BREAK_INTERVAL_MS, breakStepOf, formatSigned, usePlaySessionStore } from '../store/playSession'
import { Modal } from './Modal'
import './BreakReminder.css'

const TITLE_ID = 'hub-break-title'

export function BreakReminder(): ReactNode {
  const t = useT()
  const due = usePlaySessionStore((s) => breakStepOf(s.visibleMs) > s.breakStep)
  const spinNet = usePlaySessionStore((s) => s.spinNet)
  // 로비(gameId 없음)는 늘 idle로 본다. 게임 화면에서는 판이 완전히 끝났을 때만 — 프리스핀 사이의 짧은 idle에
  // 띄우면 모달 뒤에서 프리스핀이 계속 돈다. 프리스핀 라운드가 끝날 때까지 기다린다.
  const idle = useGameStore(
    (s) =>
      s.gameId === null ||
      (s.phase === 'idle' && s.roundFlow.kind === 'idle' && s.winCelebration === null && s.freeSpins === null),
  )
  const [shownStep, setShownStep] = useState<number | null>(null)

  const show = due && idle
  useEffect(() => {
    if (!show || shownStep !== null) return
    setShownStep(breakStepOf(usePlaySessionStore.getState().visibleMs))
    useGameStore.getState().stopAutoSpin('breakReminder')
  }, [show, shownStep])

  if (shownStep === null) return null

  const close = (): void => {
    usePlaySessionStore.getState().ackBreak()
    setShownStep(null)
  }
  const minutes = Math.round((shownStep * BREAK_INTERVAL_MS) / 60_000)

  return (
    <Modal onClose={() => {}} titleId={TITLE_ID}>
      <h2 id={TITLE_ID} className="hub-sheet__title">
        {t('breakTitle', { minutes })}
      </h2>
      <p className="hub-break__net">{t('breakNet', { net: formatSigned(spinNet) })}</p>
      <p className="hub-break__hint">{t('breakHint')}</p>
      <div className="hub-break__actions">
        <button type="button" className="hub-sheet__reveal hub-break__continue" onClick={close}>
          {t('breakContinue')}
        </button>
        <button
          type="button"
          className="hub-sheet__reveal hub-break__lobby"
          onClick={() => {
            close()
            navigateToLobby()
          }}
        >
          {t('breakLobby')}
        </button>
      </div>
    </Modal>
  )
}
