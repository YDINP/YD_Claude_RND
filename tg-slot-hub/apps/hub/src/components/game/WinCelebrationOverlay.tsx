/**
 * 일반 스핀의 빅윈 오버레이 — 릴 위에 전면으로 떠서 "얼마를 땄는지"를 알린다.
 *
 * 계약:
 * - **10× 미만이면 아무것도 뜨지 않는다.** 작은 당첨은 WinStrip만으로 충분하고, 배너가 뜨면
 *   판마다 흐름이 끊긴다. 등급 판정에 쓸 총 베팅을 모를 때도 마찬가지로 뜨지 않는다.
 * - 등급별 체류 시간(2000/3000/4500/6500ms)이 지나면 **스스로 닫힌다**. 오토스핀·프리스핀이
 *   도는 동안(`hurried`)에는 타임라인이 절반이라 판 사이를 막지 않는다.
 * - 탭 규칙은 프리스핀 팝업과 같다 — 굴러가는 중의 첫 탭은 "끝까지 감기", 그 뒤의 탭은 닫기.
 *   Esc도 같은 뜻이다(포커스 트랩·스크롤 잠금은 `useDialog`가 맡는다).
 */
import { useEffect, type ReactNode } from 'react'
import { useDialog } from '../../hooks/useDialog'
import { useT } from '../../i18n'
import { useSettingsStore } from '../../store/settings'
import { WinCelebration, WinCelebrationFx, useWinRollup } from './WinCelebration'
import { celebrationTier, celebrationTiming, type WinTierLabels } from './winTiers'
import './WinCelebration.css'

const TITLE_ID = 'hub-win-overlay-title'

interface WinCelebrationOverlayProps {
  totalWin: number
  /** 등급 판정의 분모. 없으면 오버레이 자체가 뜨지 않는다 — 베팅을 짐작하지 않는다. */
  totalBet?: number
  /** 오토스핀 또는 프리스핀 진행 중 — 타임라인 전체가 절반이 된다. */
  hurried?: boolean
  /** 게임팩이 `theme.json`으로 덮어쓴 등급 이름. 빠진 등급은 허브 기본값. */
  labels?: WinTierLabels
  /** 체류 시간이 지났거나(자동) 사용자가 닫았을 때. */
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
  const timing = celebrationTiming(tier, { hurried, reducedMotion })
  const roll = useWinRollup(totalWin, timing.rollupMs)

  const handleTap = (): void => {
    if (roll.phase === 'rolling') {
      roll.complete()
      return
    }
    onDismiss()
  }

  // 포커스 트랩·Esc·스크롤 잠금은 앱의 다른 다이얼로그와 같은 훅에 맡긴다.
  const dialogRef = useDialog<HTMLDivElement>(handleTap, tier !== 'none')

  // 체류 시계는 마운트에서 한 번만 돈다 — 탭으로 롤업을 앞당겨도 닫히는 시각은 그대로다
  // (`displayMs`가 롤업을 포함한 총 시간이고, 다 굴러간 뒤 읽을 시간까지 품고 있다).
  useEffect(() => {
    if (timing.displayMs <= 0) return
    const id = setTimeout(onDismiss, timing.displayMs)
    return () => clearTimeout(id)
    // onDismiss가 렌더마다 새 함수여도 시계를 다시 걸지 않는다 — 그러면 영영 닫히지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timing.displayMs])

  // 등급이 없으면 화면에 아무 것도 두지 않는다. 호출부가 실수로 띄워도 여기서 막힌다.
  if (tier === 'none') return null

  return (
    <div
      className="hub-win-overlay"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
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
          {/* 탭의 뜻이 단계마다 다르니 힌트도 그대로 따라간다. */}
          <span className="hub-win__hint">
            {t(roll.phase === 'rolling' ? 'popupTapToSkip' : 'popupTapToClose')}
          </span>
          {/* 중간값이 아니라 최종 문장만, 한 번만 읽힌다. 등급이 붙었다는 건 금액이 0보다
              크다는 뜻이라 롤업은 항상 'rolling'에서 시작한다 — 그래서 이 영역은 빈 채로
              마운트됐다가 값이 **바뀌면서** 읽힌다(처음부터 차 있으면 읽히지 않는다).
              문구는 프리스핀 종료 팝업과 같은 문장을 쓴다(키 이름만 프리스핀 시절 것이다). */}
          <span className="hub-win__live" aria-live="polite">
            {roll.phase === 'settled' ? t('freeSpinsPopupTotal', { amount: totalWin.toLocaleString('en-US') }) : ''}
          </span>
        </WinCelebration>
      </button>
    </div>
  )
}
