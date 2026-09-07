/**
 * 일반 스핀의 빅윈 오버레이 — 릴 위에 전면으로 떠서 "얼마를 땄는지"를 알린다.
 *
 * 계약:
 * - **10× 미만이면 아무것도 뜨지 않는다.** 작은 당첨은 WinStrip만으로 충분하고, 배너가 뜨면
 *   판마다 흐름이 끊긴다. 등급 판정에 쓸 총 베팅을 모를 때도 마찬가지로 뜨지 않는다.
 * - **화면을 장악한다.** 스크림이 게임 화면을 거의 완전히 덮고(WinCelebration.css의
 *   `.hub-win-overlay`), 무게는 프리스핀 세리머니 팝업(backdrop + 불투명 카드)과 같은 급이다.
 *   심볼 연출이 이 뒤가 아니라 이 **다음**에 오므로 뒤를 비춰 줄 이유가 없다.
 * - 세 박자로 흐른다 — **굴리고(rolling) → 못 박고(emphasis) → 붙든다(hold)**. 롤업 길이는
 *   등급이 아니라 **금액**이 정하고(10× 1.4초 ~ 500× 6초, `bigWinTimeline`), 등급은 결(팔레트·
 *   파티클·고리)만 정한다. 붙드는 동안은 프리스핀 세리머니 팝업과 같은 10초 계약이다.
 * - 탭의 뜻은 박자마다 다르다: **굴러가는 중이면 결과로 건너뛰기**(닫히지 않는다 — 숫자가 그
 *   자리에 앉고 강조가 그때부터 시작된다), **결과 화면이면 닫기**. Esc도 같은 뜻이다
 *   (포커스 트랩·스크롤 잠금은 `useDialog`가 맡는다).
 * - 자동 닫힘 시계는 **마운트가 아니라 결과에 닿은 순간**부터 돈다. 그래서 건너뛰기로 일찍
 *   앉혀도 결과를 볼 시간이 줄지 않는다(예전에는 마운트에서 한 번 걸어 둔 탓에 건너뛰면 곧장
 *   닫혔다). 오토스핀·프리스핀이 도는 동안(`hurried`)에는 붙드는 시간이 짧다 — 판 사이를
 *   막지 않기 위해서다(winTiers.ts의 `BIG_WIN_HURRIED_HOLD_MS`).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDialog } from '../../hooks/useDialog'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { WinCelebration, WinCelebrationFx, useWinRollup } from './WinCelebration'
import { bigWinTimeline, celebrationTier, type WinTierLabels } from './winTiers'
import './WinCelebration.css'

const TITLE_ID = 'hub-win-overlay-title'

/**
 * 지금 어느 박자인가. `rolling`은 아직 목표에 닿기 전, `emphasis`는 닿은 직후의 강조,
 * `hold`는 그 뒤로 사용자를 기다리는 결과 화면이다. 탭의 뜻(건너뛰기 vs 닫기)은 첫 박자와
 * 나머지 사이에서 갈린다 — 사용자가 말한 "빅윈연출 중"과 "결과화면"이 정확히 그 경계다.
 */
type CelebrationBeat = 'rolling' | 'emphasis' | 'hold'

interface WinCelebrationOverlayProps {
  totalWin: number
  /** 등급 판정의 분모이자 롤업 길이의 분모. 없으면 오버레이 자체가 뜨지 않는다 — 베팅을 짐작하지 않는다. */
  totalBet?: number
  /** 오토스핀 또는 프리스핀 진행 중 — 롤업·강조가 줄고 붙드는 시간이 짧아진다. */
  hurried?: boolean
  /** 게임팩이 `theme.json`으로 덮어쓴 등급 이름. 빠진 등급은 허브 기본값. */
  labels?: WinTierLabels
  /** 붙드는 시간이 지났거나(자동) 사용자가 결과 화면을 탭했을 때. */
  onDismiss: () => void
}

export function WinCelebrationOverlay({
  totalWin,
  totalBet,
  hurried,
  labels,
  onDismiss,
}: WinCelebrationOverlayProps): ReactNode {
  const t = useT()
  // 스토어의 reducedMotion은 초기값 자체가 OS의 prefers-reduced-motion을 반영한다(store/settings.ts).
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  const tier = celebrationTier(totalWin, totalBet)
  const timing = bigWinTimeline(totalWin, totalBet ?? 0, { hurried, reducedMotion })
  const roll = useWinRollup(totalWin, timing.rollupMs)

  /** 강조 비트가 지났는가. 숫자가 앉은 뒤에만 의미가 있다(그 전에는 항상 false에서 다시 시작한다). */
  const [emphasisDone, setEmphasisDone] = useState(false)
  const beat: CelebrationBeat =
    roll.phase === 'rolling' ? 'rolling' : emphasisDone ? 'hold' : 'emphasis'

  // 닫기는 렌더마다 새 함수로 와도 시계를 다시 걸면 안 된다 — 그러면 영영 닫히지 않는다.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  // 강조 비트 — 숫자가 **앉는 순간**부터 잰다. 탭으로 감아 앉혔어도 똑같이 여기서 시작하므로
  // 건너뛴 사용자도 강조를 온전히 본다.
  useEffect(() => {
    if (roll.phase !== 'settled') {
      setEmphasisDone(false)
      return
    }
    const id = setTimeout(() => setEmphasisDone(true), timing.emphasisMs)
    return () => clearTimeout(id)
  }, [roll.phase, timing.emphasisMs])

  // 자동 닫힘 — 강조가 끝난 뒤에야 시작한다(프리스핀 세리머니 팝업과 같은 10초 계약).
  useEffect(() => {
    if (beat !== 'hold') return
    const id = setTimeout(() => dismissRef.current(), timing.holdMs)
    return () => clearTimeout(id)
  }, [beat, timing.holdMs])

  const handleTap = (): void => {
    // 굴러가는 중의 탭은 "결과로 건너뛰기"다 — 닫기가 아니다(사용자 요구). 숫자가 그 자리에 앉고
    // 강조가 그때부터 재생되며, 자동 닫힘 시계도 그 순간부터 돈다.
    if (roll.phase === 'rolling') {
      roll.complete()
      return
    }
    onDismiss()
  }

  // 포커스 트랩·Esc·스크롤 잠금은 앱의 다른 다이얼로그와 같은 훅에 맡긴다.
  const dialogRef = useDialog<HTMLDivElement>(handleTap, tier !== 'none')

  // 등급이 없으면 화면에 아무 것도 두지 않는다. 호출부가 실수로 띄워도 여기서 막힌다.
  if (tier === 'none') return null

  return (
    <div
      className={reducedMotion ? 'hub-win-overlay hub-win-overlay--still' : 'hub-win-overlay'}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      data-beat={beat}
      tabIndex={-1}
    >
      <WinCelebrationFx tier={tier} reducedMotion={reducedMotion} />
      {/* 화면 전체가 하나의 탭 영역이다 — 탭/클릭은 물론 키보드(Enter/Space)로도 같은 뜻이고,
          다이얼로그가 열릴 때 포커스가 여기로 온다(useDialog가 첫 포커스 가능 요소를 찾는다). */}
      <button type="button" className="hub-win-overlay__tap" onClick={handleTap}>
        <WinCelebration
          tier={tier}
          value={roll.value}
          labels={labels}
          titleId={TITLE_ID}
          reducedMotion={reducedMotion}
        >
          {/* 중간값이 아니라 최종 문장만, 한 번만 읽힌다. 등급이 붙었다는 건 금액이 0보다
              크다는 뜻이라 롤업은 항상 'rolling'에서 시작한다 — 그래서 이 영역은 빈 채로
              마운트됐다가 값이 **바뀌면서** 읽힌다(처음부터 차 있으면 읽히지 않는다).
              문구는 프리스핀 종료 팝업과 같은 문장을 쓴다(키 이름만 프리스핀 시절 것이다). */}
          <span className="hub-win__live" aria-live="polite">
            {roll.phase === 'settled' ? t('freeSpinsPopupTotal', { amount: totalWin.toLocaleString('en-US') }) : ''}
          </span>
        </WinCelebration>
        {/* 탭의 뜻이 박자마다 다르니 힌트도 그대로 따라간다. 카드 안(숫자 바로 밑)이 아니라
            화면 바닥에 두는 이유는 CSS에 적어 두었다 — 게임 프레임 아트와 부딪치는 자리였다.
            프리스핀 종료 팝업은 자기 카드 안에 그대로 둔다(그쪽은 부딪칠 아트가 없다). */}
        <span className="hub-win-overlay__hint">
          {t(beat === 'rolling' ? 'popupTapToSkip' : 'popupTapToClose')}
        </span>
      </button>
    </div>
  )
}
