/**
 * 연쇄 배수 사다리 미터 — `×1 … ×20` 칸을 한 줄로 보여 주고 지금 배수 칸에 불을 켠다.
 * 값은 렌더러의 `cascadeStep` 이벤트에서 오며 스핀마다 첫 칸으로 되돌아간다(GameScreen).
 * 릴 위 텍스트는 두지 않는 규칙(UX 4차)에 따라 캔버스가 아닌 DOM이다.
 */
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import './LadderMeter.css'

interface LadderMeterProps {
  ladder: readonly number[]
  /** 지금 배수 칸(0부터). */
  activeIndex: number
}

export function LadderMeter({ ladder, activeIndex }: LadderMeterProps): ReactNode {
  const t = useT()
  const current = ladder[Math.min(Math.max(activeIndex, 0), ladder.length - 1)] ?? 1
  return (
    <div className="hub-ladder" role="img" aria-label={`${t('ladderLabel')} ×${current}`}>
      {ladder.map((multiplier, index) => {
        const state = index === activeIndex ? 'active' : index < activeIndex ? 'reached' : 'idle'
        return (
          <span key={index} className={`hub-ladder__step hub-ladder__step--${state}`} aria-hidden="true">
            ×{multiplier}
          </span>
        )
      })}
    </div>
  )
}
