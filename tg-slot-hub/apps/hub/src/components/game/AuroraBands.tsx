/**
 * 오로라 4단(×1·×2·×3·×5). 얼음 보너스에만 곱해지는 배수 사다리다.
 * CSS 그라데이션 세로 커튼이고 **사선 광택은 쓰지 않는다**. 단계가 오르면(`rise`가 늘면) 새로 켜진 칸이 번쩍인다.
 */
import type { ReactNode } from 'react'
import { useT } from '../../i18n'

interface AuroraBandsProps {
  /** `math.frostRespin.aurora.ladder` — 단계별 배수. */
  ladder: readonly number[]
  /** 지금 단계(0부터). */
  level: number
  /** 오로라가 오를 때마다 늘어나는 번호. 같은 단계라도 값이 바뀌면 번쩍임을 다시 튼다. */
  rise: number
}

export function AuroraBands({ ladder, level, rise }: AuroraBandsProps): ReactNode {
  const t = useT()
  const safe = Math.min(Math.max(0, level), Math.max(0, ladder.length - 1))
  const mult = ladder[safe] ?? 1
  return (
    <div className="hub-aurora" role="img" aria-label={t('auroraMeterAria', { level: safe + 1, mult })}>
      <span className="hub-aurora__label" aria-hidden="true">
        {t('auroraMeterLabel')}
      </span>
      <ol className="hub-aurora__steps" aria-hidden="true">
        {ladder.map((value, index) => (
          <li
            key={index}
            className="hub-aurora__step"
            data-step={index}
            data-lit={index <= safe ? 'true' : undefined}
            data-current={index === safe ? 'true' : undefined}
            data-rise={index === safe && rise > 0 ? rise : undefined}
          >
            <span>×{value}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
