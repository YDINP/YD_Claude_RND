/**
 * 더블업(갬블) 코인 던지기 팝업 — 화면 중앙에 뜨는 작은 모달(Modal 재사용). 앞면/뒷면을 고르면
 * GameScreen이 store를 통해 서버에 판정을 묻고, 그 결과(side/outcome)를 다시 이 컴포넌트에
 * 넘겨준다 — 이 컴포넌트는 절대 스스로 승패를 계산하지 않는다. 동전 뒤집기는 순수 CSS 애니메이션.
 *
 * 연출은 `gambleToss.ts`의 명시적 상태 머신을 따른다:
 *   idle → tossing → nearMiss → settling → revealed
 * 타이밍/금액/파티클 계산은 전부 그쪽 순수 함수에 있고, 여기서는 그 결과를 타이머와 클래스로
 * 재생하기만 한다.
 *
 * 지켜야 할 원칙 두 가지:
 *  1. "쪼는 맛" — 서버 응답이 이미 도착해 있어도 `revealed` 전에는 결과를 눈으로 알아챌 수
 *     없어야 한다. 판돈 표시까지 픽 시점 값으로 얼려두는 이유가 이것이다(응답이 오면 prop이
 *     먼저 바뀌어 결과가 새어나간다).
 *  2. 결과 문구는 응답이 도착한 순간 DOM에 들어간다(aria-live가 그때 읽어준다). 착지가 끝날
 *     때까지는 CSS가 시각적으로만 감춘다 — 애니메이션을 못 보는 사용자가 결과를 늦게 받으면 안 된다.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { GambleSide } from '@tgslot/shared'
import { Modal } from '../Modal'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import {
  ACTIONS_DELAY_MS,
  MAX_WIN_STEP,
  burstParticles,
  isAirborne,
  rollupAmount,
  rollupDuration,
  targetAmount,
  tossSchedule,
  type GamblePhase,
} from './gambleToss'
import './GambleModal.css'

interface GambleModalProps {
  onClose: () => void
  onPick: (pick: GambleSide) => void
  /** 서버 응답을 기다리는 동안(코인이 도는 동안) 픽 버튼을 잠그고 닫기를 막는다. */
  flipping: boolean
  /**
   * 서버가 실제로 알려준 면. 결과가 아직 없거나(대기) 판정 자체가 없었으면(collected) null이다 —
   * 추측한 면을 보여주지 않는다(동전은 앞면을 보여준 채 가만히 있는다, 즉 "안 뒤집힘").
   */
  revealedSide: GambleSide | null
  /**
   * 'collected'는 서버가 판정 없이(만료 등으로) 이미 회수해버렸거나, 이겼지만 상한(단계/금액)에
   * 닿아 즉시 회수된 경우다 — 두 경우 다 코인은 뒤집히지 않은 것으로 보여준다.
   */
  outcome: 'win' | 'lose' | 'collected' | null
  pendingWin: number
  /** 성공하면 판돈이 몇 배가 되는지(코인 던지기는 보통 2) — 모달 제목에 보여준다. */
  payout: number
  /**
   * 재시도 가능한 실패 뒤에는 처음 고른 면으로만 다시 시도할 수 있다(서버가 같은 idempotencyKey로
   * 재전송을 판별하므로 다른 면을 고르면 원래 픽 기준 결과를 그대로 돌려받을 수 있다) — null이면
   * 아무 제약이 없다.
   */
  lockedPick: GambleSide | null
  /**
   * 성공 확률(%). 게임 math의 `gamble.chance`에서 오는 값으로, 순수 표시용이다 —
   * 없으면 확률 칩을 아예 렌더하지 않는다(50%를 짐작해서 보여주지 않는다).
   */
  chancePercent?: number
}

export function GambleModal({
  onClose,
  onPick,
  flipping,
  revealedSide,
  outcome,
  pendingWin,
  payout,
  lockedPick,
  chancePercent,
}: GambleModalProps): ReactNode {
  const t = useT()
  // 스토어의 reducedMotion은 초기값 자체가 OS의 prefers-reduced-motion을 반영한다(store/settings.ts) —
  // 그래서 여기선 이 값 하나만 보면 두 조건을 모두 존중하는 셈이다.
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  const [phase, setPhase] = useState<GamblePhase>('idle')
  /** 크게 보여주는 금액 — 결과가 확정된 뒤 롤업/롤다운으로 움직인다. */
  const [displayAmount, setDisplayAmount] = useState(pendingWin)
  /** 이번 모달이 떠 있는 동안 연달아 성공한 횟수(1부터) — 연출 강도를 올리는 데만 쓴다. */
  const [winStep, setWinStep] = useState(0)
  /** 결과 연출이 끝나 액션 버튼이 다시 눌릴 수 있는 상태 */
  const [actionsReady, setActionsReady] = useState(true)

  /** 판돈 — 픽을 누르는 순간의 금액으로 얼려둔다. */
  const stakeRef = useRef(pendingWin)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // 아직 아무것도 안 굴린 평상시에만 판돈을 prop에 맞춰 갱신한다. 픽이 들어간 뒤(flipping) 또는
  // 결과가 나온 뒤(outcome)에는 prop이 바뀌어도 무시한다 — 그 변화가 곧 정답이기 때문이다.
  useEffect(() => {
    if (outcome !== null || flipping) return
    stakeRef.current = pendingWin
    setDisplayAmount(pendingWin)
  }, [pendingWin, outcome, flipping])

  // 상태 머신 재생 — 스케줄을 계산하는 건 순수 함수고, 여기선 타이머로 그대로 밟기만 한다.
  useEffect(() => {
    const { initial, transitions } = tossSchedule({ flipping, outcome, revealedSide, reducedMotion })
    setPhase(initial)
    const timers = transitions.map(({ phase: next, delay }) => setTimeout(() => setPhase(next), delay))
    return () => timers.forEach(clearTimeout)
  }, [flipping, outcome, revealedSide, reducedMotion])

  // 공개 순간의 금액 연출 — 이겼으면 두 배까지 굴러 올라가고, 졌으면 짧게 0으로 떨어진다.
  useEffect(() => {
    if (phase !== 'revealed' || outcome === null) return

    const from = stakeRef.current
    const to = targetAmount({ outcome, stake: from, pendingWin, payout })

    if (outcome === 'win') setWinStep((s) => Math.min(s + 1, MAX_WIN_STEP))
    // 모달을 닫지 않고 이어서 고르는 경우, 다음 판의 판돈은 이번 결과 금액이다.
    stakeRef.current = to

    if (reducedMotion || to === from) {
      setDisplayAmount(to)
      return
    }

    const duration = rollupDuration(outcome)
    let raf = 0
    let start = 0
    const step = (now: number): void => {
      if (start === 0) start = now
      const progress = (now - start) / duration
      setDisplayAmount(rollupAmount(from, to, progress, outcome))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    // rAF가 멈춘 탭/환경에서도 최종 금액은 반드시 맞춘다.
    const backstop = setTimeout(() => setDisplayAmount(to), duration + 150)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(backstop)
    }
    // pendingWin/payout은 결과와 함께 확정되므로 공개 시점의 값이면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, outcome, reducedMotion])

  // 버튼은 팝인이 끝난 뒤에야 다시 살아난다 — 그 전에는 화면에 안 보이는 버튼이 탭에 반응한다.
  useEffect(() => {
    if (outcome === null) {
      setActionsReady(true)
      return
    }
    setActionsReady(false)
    if (phase !== 'revealed') return
    const delay = reducedMotion ? 0 : ACTIONS_DELAY_MS
    const id = setTimeout(() => setActionsReady(true), delay)
    return () => clearTimeout(id)
  }, [phase, outcome, reducedMotion])

  // 연출이 자리를 잡은 뒤에야 포커스를 옮긴다 — 애니메이션 도중 포커스가 튀면
  // 스크린리더가 아직 감춰진 버튼을 읽게 된다.
  useEffect(() => {
    if (!actionsReady || outcome === null) return
    const target =
      outcome === 'win'
        ? (actionsRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])') ?? closeRef.current)
        : closeRef.current
    target?.focus()
  }, [actionsReady, outcome])

  /** 결과는 도착했지만 아직 공중에 있는 구간 — 결과를 시각적으로 감춰둔다. */
  const suspense = outcome !== null && phase !== 'revealed'
  /** 서버 응답을 기다리는 무한 회전 구간(착지 감속과 CSS가 다르다) */
  const waiting = outcome === null && isAirborne(phase)
  /** 착지 choreography를 도는 구간 — 그림자 대위법을 이 클래스가 넘겨받는다. */
  const landing = revealedSide !== null && outcome !== null && !reducedMotion
  const showWinFx = phase === 'revealed' && outcome === 'win' && !reducedMotion

  const rootClass = [
    'hub-gamble',
    isAirborne(phase) ? 'hub-gamble--airborne' : '',
    waiting ? 'hub-gamble--waiting' : '',
    landing ? 'hub-gamble--landing' : '',
    phase === 'nearMiss' ? 'hub-gamble--near-miss' : '',
    phase === 'revealed' && outcome ? `hub-gamble--${outcome}` : '',
    outcome === 'win' && winStep > 0 ? `hub-gamble--step-${Math.min(winStep, MAX_WIN_STEP)}` : '',
    reducedMotion ? 'hub-gamble--no-motion' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const coinClass = [
    'hub-gamble-coin__inner',
    reducedMotion ? 'hub-gamble-coin__inner--no-motion' : '',
    !reducedMotion && waiting ? 'hub-gamble-coin__inner--spin' : '',
    !reducedMotion && revealedSide === 'heads' ? 'hub-gamble-coin__inner--land-heads' : '',
    !reducedMotion && revealedSide === 'tails' ? 'hub-gamble-coin__inner--land-tails' : '',
    reducedMotion && revealedSide === 'tails' ? 'hub-gamble-coin__inner--land-tails-instant' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const liftClass = [
    'hub-gamble-coin__lift',
    !reducedMotion && waiting ? 'hub-gamble-coin__lift--toss' : '',
    landing ? 'hub-gamble-coin__lift--arc' : '',
    phase === 'revealed' && outcome === 'lose' && !reducedMotion ? 'hub-gamble-coin__lift--drop' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const resultClass = [
    'hub-gamble__result',
    outcome === 'win' ? 'hub-gamble__result--win' : '',
    outcome === 'lose' ? 'hub-gamble__result--lose' : '',
    suspense ? 'hub-gamble__result--suspense' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const actionsDisabled = flipping || suspense || !actionsReady
  // 결과가 확정될 때까지 액션은 잠시 물러나 있다가(--hold) 연출이 끝나면 팝인한다(--pop).
  const actionsState = suspense
    ? ' hub-gamble-actions--hold'
    : phase === 'revealed' && outcome !== null
      ? ' hub-gamble-actions--pop'
      : ''

  return (
    <Modal onClose={flipping ? () => {} : onClose} titleId="hub-gamble-title">
      <div className={rootClass}>
        {showWinFx && <div className="hub-gamble__flash" aria-hidden="true" />}

        <header className="hub-gamble__head">
          <h2 className="hub-sheet__title hub-gamble__title" id="hub-gamble-title">
            {t('gambleTitle', { payout })}
          </h2>
          <div className="hub-gamble__chips">
            <span className="hub-gamble__chip hub-gamble__chip--payout">
              {t('gamblePayoutChip', { payout })}
            </span>
            {chancePercent !== undefined && (
              <span className="hub-gamble__chip">{t('gambleChanceChip', { percent: chancePercent })}</span>
            )}
          </div>
        </header>

        <div className="hub-gamble__stake">
          <span className="hub-gamble__stake-label">{t('gambleStakeLabel')}</span>
          <strong className="hub-gamble__amount" data-testid="gamble-amount">
            {displayAmount.toLocaleString('en-US')}
          </strong>
        </div>

        <div className="hub-gamble-coin" aria-hidden="true">
          <span className="hub-gamble-coin__shadow" />
          <div className={liftClass}>
            <div className={coinClass}>
              <div className="hub-gamble-coin__face hub-gamble-coin__face--heads">
                <span className="hub-gamble-coin__glyph">7</span>
                <span className="hub-gamble-coin__label">{t('gambleHeads')}</span>
              </div>
              <div className="hub-gamble-coin__face hub-gamble-coin__face--tails">
                <span className="hub-gamble-coin__glyph">◆</span>
                <span className="hub-gamble-coin__label">{t('gambleTails')}</span>
              </div>
            </div>
          </div>
          {showWinFx && (
            <div className="hub-gamble-burst">
              {burstParticles(winStep).map((p, i) => (
                <span
                  key={i}
                  className="hub-gamble-burst__particle"
                  style={
                    {
                      '--hub-burst-angle': `${p.angle}deg`,
                      '--hub-burst-distance': `${p.distance}px`,
                      '--hub-burst-delay': `${p.delay}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="hub-gamble__status">
          <p className={resultClass} role="status" aria-live="polite">
            {outcome === 'win'
              ? t('gambleWin')
              : outcome === 'lose'
                ? t('gambleLose')
                : outcome === 'collected'
                  ? t('gambleCollected')
                  : ''}
          </p>
          {isAirborne(phase) && (
            <p className="hub-gamble__hint" aria-hidden="true">
              {t('gambleTossing')}
            </p>
          )}
        </div>

        <div className={`hub-gamble-picks${actionsState}`} aria-busy={isAirborne(phase)} ref={actionsRef}>
          <button
            type="button"
            className="hub-sheet__reveal"
            onClick={() => onPick('heads')}
            disabled={actionsDisabled || (lockedPick !== null && lockedPick !== 'heads')}
          >
            {lockedPick === 'heads' ? t('gambleRetry') : t('gambleHeads')}
          </button>
          <button
            type="button"
            className="hub-sheet__reveal"
            onClick={() => onPick('tails')}
            disabled={actionsDisabled || (lockedPick !== null && lockedPick !== 'tails')}
          >
            {lockedPick === 'tails' ? t('gambleRetry') : t('gambleTails')}
          </button>
        </div>

        <button
          type="button"
          className={`hub-sheet__close${actionsState}`}
          onClick={onClose}
          disabled={actionsDisabled}
          ref={closeRef}
        >
          {t('close')}
        </button>
      </div>
    </Modal>
  )
}
