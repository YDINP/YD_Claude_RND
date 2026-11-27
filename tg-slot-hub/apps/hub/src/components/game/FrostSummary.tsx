/**
 * 얼려 두기 프리스핀 라운드 결과 — 종료 팝업(`RoundPopupView`) 안에 들어가는 요약 블록.
 * 베팅의 몇 배를 땄는지, 가장 많이 얼린 판, 오로라 최종 단계, 얼음 보너스 합계를 보여 준다(점검 C2: «베팅의 ×N»을 처음부터).
 * 값은 전부 서버 응답(`freeSpinsSummary.frost`)에서 오고, 이 컴포넌트는 그리기만 한다.
 * 줄 모양은 주문 카드 요약(`hub-round-popup__orders*`)을 그대로 빌려 팝업 안에서 같은 결로 읽히게 한다.
 */
import type { ReactNode } from 'react'
import { useT } from '../../i18n'
import './FrostSummary.css'

export interface FrostSummaryData {
  /** 한 판에 가장 많이 얼린 칸 수. */
  bestCount: number
  /** 라운드 끝 오로라 단계(0부터). */
  auroraLevel: number
  /** 얼음 보너스 합계 코인. */
  bonusTotal: number
  /** 오로라 단계별 배수(`aurora.ladder`). */
  ladder: readonly number[]
  /** 이 라운드 총 획득 ÷ 총 베팅. 모르면 생략한다. */
  multipleOfBet?: number
  /** 라운드에서 실제로 돈 프리스핀 횟수. 모르면 생략한다. */
  spins?: number
  /** 얼린 그림 아이콘(없으면 눈송이 글자). */
  iconUrl?: string
}

/** «베팅의 ×38.2». 100배 이상은 소수 없이, 그 아래는 소수 첫째 자리까지. */
export function formatBetMultiple(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

export function FrostSummary({ data }: { data: FrostSummaryData }): ReactNode {
  const t = useT()
  const level = Math.min(Math.max(0, data.auroraLevel), Math.max(0, data.ladder.length - 1))
  const multiplier = data.ladder[level] ?? 1
  return (
    <span className="hub-round-popup__orders hub-frost-summary">
      <span className="hub-round-popup__orders-title">{t('auroraSummaryTitle')}</span>
      {data.multipleOfBet !== undefined && (
        <span className="hub-frost-summary__big">{t('auroraSummaryMultiple', { n: formatBetMultiple(data.multipleOfBet) })}</span>
      )}
      <span className="hub-round-popup__orders-row">
        <span className="hub-round-popup__orders-name hub-frost-summary__name">
          {data.iconUrl !== undefined ? (
            <img className="hub-frost-summary__icon" src={data.iconUrl} alt="" width={22} height={22} />
          ) : (
            <span aria-hidden="true">❄</span>
          )}
          {t('auroraSummaryBestCount')}
        </span>
        <span>{t('auroraCellCount', { n: data.bestCount })}</span>
      </span>
      <span className="hub-round-popup__orders-row">
        <span className="hub-round-popup__orders-name">{t('auroraSummaryAurora')}</span>
        <span>×{multiplier}</span>
      </span>
      <span className="hub-round-popup__orders-row">
        <span className="hub-round-popup__orders-name">{t('auroraSummaryBonus')}</span>
        <span>+{data.bonusTotal.toLocaleString('en-US')}</span>
      </span>
      {data.spins !== undefined && data.spins > 0 && (
        <span className="hub-round-popup__orders-row hub-round-popup__orders-row--sum">
          {t('auroraSummarySpins', { n: data.spins })}
        </span>
      )}
    </span>
  )
}
