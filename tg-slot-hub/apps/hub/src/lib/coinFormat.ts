import type { Locale } from '@tgslot/shared'

/**
 * 코인 얼굴·보물 띠에 찍는 압축 금액. 한 줄에 **5글자 안팎**으로 줄여, 390px 화면의 칸(71px)에서도
 * 코인 폭의 80% 안에 글자가 든다. 언어마다 읽는 단위가 달라 표기가 다르다.
 *
 * - ko: 1만 미만은 천 단위 쉼표(`2,500`), 1만 이상은 «만»(`2만`·`1.5만`·`100만`), 1억 이상은 «억».
 * - en: 1,000 미만은 그대로, 그 위는 `2.5K`·`20K`·`124K`·`1M`.
 *
 * 줄이는 것은 **표시뿐**이다. 서버가 준 코인 금액은 그대로이고, 정산 합계(WinStrip)는 줄이지 않는다.
 */
export function formatCoinAmount(amount: number, locale: Locale): string {
  const value = Math.max(0, Math.round(amount))
  return locale === 'ko' ? formatKo(value) : formatEn(value)
}

/** 소수점 이하 끝의 0을 걷는다(`2.50` → `2.5`, `2.00` → `2`). */
function trim(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

function formatKo(value: number): string {
  if (value < 10_000) return value.toLocaleString('en-US')
  if (value < 100_000_000) return `${trim((value / 10_000).toFixed(2))}만`
  return `${trim((value / 100_000_000).toFixed(2))}억`
}

function formatEn(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) {
    const digits = value < 10_000 ? 2 : value < 100_000 ? 1 : 0
    return `${trim((value / 1_000).toFixed(digits))}K`
  }
  const digits = value < 10_000_000 ? 2 : 1
  return `${trim((value / 1_000_000).toFixed(digits))}M`
}
