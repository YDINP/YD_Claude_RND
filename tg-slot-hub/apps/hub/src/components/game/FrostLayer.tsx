/**
 * 얼림 화면 층 — 마퀴 띠(얼린 그림·칸 수·눈금·다음 보너스)와 오로라 4단을 릴 캔버스 바로 위에 높이 고정으로 둔다.
 *
 * 값은 전부 `store/frost.ts`(렌더러 이벤트를 접은 표시용 진행)에서 읽는다. 공용 `GameScreen.tsx`에는 이 컴포넌트를
 * 마운트하는 몇 줄만 두고 로직은 여기와 새 파일에 모았다(여러 팀이 함께 고치는 파일이라 충돌을 줄이려는 것이다).
 *
 * - 기본 판: «오로라 구슬 3개 → 얼려 두기 프리스핀 8~12회» 안내 띠(보너스까지 거리를 늘 보여 준다).
 * - 프리스핀: 얼린 그림 아이콘 + 칸 수 + 눈금 6·9·12·15·18·19(15에 오로라 표시) + 다음 눈금 보너스 «12칸이면 ×11».
 * - 끝: 곱셈식 «12칸 ×11 × 오로라 ×2 = 22배». 보너스 0이거나 1배 미만이면 곱셈식 없이 칸 수와 작은 금액만.
 * 규칙 설명은 여기 쓰지 않는다(도움말 페이지 몫). 높이는 모드와 상관없이 같아 릴 캔버스가 흔들리지 않는다.
 */
import type { ReactNode } from 'react'
import type { Locale } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { formatCoinAmount } from '../../lib/coinFormat'
import { symbolLabel } from '../../game/labels'
import { useFrostStore, type FrostView } from '../../store/frost'
import { AuroraBands } from './AuroraBands'
import './FrostLayer.css'

interface FrostLayerProps {
  math: GameMath
  /** 테마 심볼 그림. 없으면 글자 배지로 대신한다. */
  symbols?: Record<string, string> | undefined
  locale: Locale
  /** 프리스핀 라운드 중인가(표시용 freeSpins). */
  inFreeSpins: boolean
  /** 서버가 이월해 준 오로라 단계(`carry.frost.level`). 새로고침 복원에 쓴다. */
  carryLevel: number
}

/** 곱셈식 총 배수를 사람이 읽는 숫자로. 정수면 그대로, 아니면 소수 둘째 자리까지. */
export function formatMultiple(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 100) / 100)
}

/** 눈금 `t`에 해당하는 보너스표 값. 등급이 아직 없으면 null. */
export function nextBonusMultiple(math: GameMath, view: Pick<FrostView, 'tier' | 'nextThreshold'>): number | null {
  const config = math.frostRespin
  if (config === undefined || view.tier === null || view.nextThreshold === null) return null
  const index = config.thresholds.indexOf(view.nextThreshold)
  if (index < 0) return null
  return config.bonus[view.tier][index] ?? null
}

export function FrostLayer({ math, symbols, locale, inFreeSpins, carryLevel }: FrostLayerProps): ReactNode {
  const t = useT()
  const view = useFrostStore((state) => state.view)
  const config = math.frostRespin
  if (config === undefined) return null

  const level = view.auroraLevel ?? carryLevel
  const ladder = config.aurora.ladder
  const targetImage = view.target === null ? undefined : symbols?.[view.target]
  const nextMultiple = nextBonusMultiple(math, view)
  const counts = config.freeSpins.counts
  const spinCounts = Object.values(counts)
  const minSpins = spinCounts.length > 0 ? Math.min(...spinCounts) : 0
  const maxSpins = spinCounts.length > 0 ? Math.max(...spinCounts) : 0

  let infoText: string
  let infoKind: 'wait' | 'next' | 'done' | 'quiet' | 'palace' = 'wait'
  const end = view.end
  if (end !== null && !view.active && !view.showingEnd && end.count === view.count) {
    // 끝난 뒤 다음 판 전까지 마지막 결과가 남는다.
    infoKind = end.palace ? 'palace' : end.quiet ? 'quiet' : 'done'
  }
  if (end !== null && (view.showingEnd || infoKind !== 'wait')) {
    const total = formatMultiple(end.bonusMultiple * end.auroraMultiplier)
    if (end.palace) {
      infoKind = 'palace'
      infoText = t('auroraPalace')
    } else if (end.bonus <= 0) {
      infoKind = 'quiet'
      infoText = t('auroraBonusNone')
    } else if (end.quiet) {
      infoKind = 'quiet'
      infoText = t('auroraBonusQuiet', { coins: formatCoinAmount(end.bonus, locale) })
    } else {
      infoKind = 'done'
      infoText =
        end.auroraMultiplier > 1
          ? t('auroraBonusFormula', {
              mult: formatMultiple(end.bonusMultiple),
              aurora: end.auroraMultiplier,
              total,
            })
          : t('auroraBonusFormulaNoAurora', { mult: formatMultiple(end.bonusMultiple), total })
    }
  } else if (view.target === null) {
    infoText = t('auroraBandWait')
  } else if (nextMultiple !== null && view.nextThreshold !== null) {
    infoKind = 'next'
    infoText = t('auroraNextBonus', { n: view.nextThreshold, mult: formatMultiple(nextMultiple) })
  } else {
    infoKind = 'next'
    infoText = t('auroraNextNone')
  }

  if (!inFreeSpins) {
    return (
      <section className="hub-frost hub-frost--guide" aria-label={t('auroraBandLabel')}>
        <div className="hub-frost__guide">
          {symbols?.[math.scatter?.symbol ?? ''] ? (
            <img className="hub-frost__guide-icon" src={symbols[math.scatter?.symbol ?? '']} alt="" width={36} height={36} />
          ) : (
            <span className="hub-frost__guide-icon hub-frost__guide-icon--fallback" aria-hidden="true">
              ◎
            </span>
          )}
          <span className="hub-frost__guide-text">
            {t('auroraBandGuide', { trigger: config.freeSpins.trigger, min: minSpins, max: maxSpins })}
          </span>
        </div>
      </section>
    )
  }

  const thresholds = config.thresholds
  return (
    <section className="hub-frost" aria-label={t('auroraBandLabel')} data-active={view.active ? 'true' : undefined}>
      <div className="hub-frost__row">
        <div className="hub-frost__target">
          {targetImage !== undefined ? (
            <img className="hub-frost__target-icon" src={targetImage} alt={view.target === null ? '' : symbolLabel(math, view.target, locale)} width={30} height={30} />
          ) : (
            <span className="hub-frost__target-icon hub-frost__target-icon--fallback" aria-hidden="true">
              ❄
            </span>
          )}
          <strong key={`${view.count}:${view.crossedKey}`} className="hub-frost__count" data-pop={view.count > 0 ? 'true' : undefined}>
            {t('auroraCellCount', { n: view.count })}
          </strong>
        </div>
        <div className="hub-frost__info" data-kind={infoKind} aria-live="polite">
          {infoText}
        </div>
      </div>
      <div className="hub-frost__bottom">
        <ol className="hub-frost__ticks" aria-hidden="true" key={view.crossedKey} data-flash={view.crossed.length > 0 ? 'true' : undefined}>
          {thresholds.map((threshold) => (
            <li
              key={threshold}
              className="hub-frost__tick"
              data-lit={view.count >= threshold ? 'true' : undefined}
              data-aurora={threshold === config.aurora.threshold ? 'true' : undefined}
              data-crossed={view.crossed.includes(threshold) ? 'true' : undefined}
            >
              <span>{threshold}</span>
            </li>
          ))}
        </ol>
        <AuroraBands ladder={ladder} level={level} rise={view.auroraRise} />
      </div>
    </section>
  )
}
