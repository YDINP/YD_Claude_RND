import { getLineCandidates, getWildChampions, getWildIds, reelHeight } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'

/** 가운데부터 지급 기본 게임 해석값. 전부 **총 베팅액 배수**이고 지급 상한은 걸지 않은 값이다. */
export interface CenterWaysAnalytic {
  /** 기본 판 길 지급 기대값. */
  lines: number
  /** 후보(심볼)별 몫. 합이 `lines`다. */
  bySymbol: Record<string, number>
}

/**
 * `ways.from: 'center'` 팩의 기본 게임(유료 판) 길 지급 기대값을 닫힌 식으로 구한다(aurora 기획서 §5-4).
 *
 * 릴은 서로 독립이고 정지 위치는 균등하다. 릴 r의 창(높이 h_r, 스트립 연속 칸)에서 후보 c의
 * 맞는 칸 수 `n_r`, 와일드 칸 수 `w_r`의 분포를 스트립에서 정확히 센다. 줄(L, R)이 정해지면
 *
 *   E[길 수 x 지급 표시] = Π_{r∈줄} E[n_r] x Π_{경계 릴 b} P(n_b = 0)
 *
 * 이다(줄 안 릴은 n_r > 0이 곱에 이미 들어 있다). 챔피언이 아닌 후보는 순수 와일드 경로
 * `Π_{r∈줄} E[w_r] x Π P(n_b = 0)`을 뺀다(`evaluateCenterWays`와 같은 규칙, `analytic.ts`의 방식).
 * 몬테카를로 기본 몫과 3SE 안에서 맞는지 감사·테스트가 교차 검증한다(감사 도구가 새 규칙을 잘못 재는 사고 방지).
 */
export function centerWaysAnalytic(math: GameMath): CenterWaysAnalytic {
  if (math.ways?.from !== 'center') throw new RangeError(`${math.id}: ways.from이 'center'가 아니다`)
  const candidates = getLineCandidates(math)
  const wildIds = getWildIds(math)
  const champions = getWildChampions(math)
  const divisor = math.ways.betDivisor
  const reels = math.reels
  const center = (reels - 1) >> 1
  const bySymbol: Record<string, number> = {}
  let lines = 0

  for (const candidate of candidates) {
    const meanCount: number[] = []
    const meanWild: number[] = []
    const zero: number[] = []
    for (let reel = 0; reel < reels; reel += 1) {
      const strip = math.strips[reel] ?? []
      const height = reelHeight(math, reel)
      let sumCount = 0
      let sumWild = 0
      let zeros = 0
      for (let stop = 0; stop < strip.length; stop += 1) {
        let count = 0
        let wild = 0
        for (let row = 0; row < height; row += 1) {
          const symbol = strip[(stop + row) % strip.length] as string
          if (!candidate.matches.has(symbol)) continue
          count += 1
          if (wildIds.has(symbol)) wild += 1
        }
        sumCount += count
        sumWild += wild
        if (count === 0) zeros += 1
      }
      meanCount.push(sumCount / strip.length)
      meanWild.push(sumWild / strip.length)
      zero.push(zeros / strip.length)
    }

    let expected = 0
    for (let left = 0; left <= center; left += 1) {
      for (let right = 0; right <= reels - 1 - center; right += 1) {
        const n = 1 + left + right
        const pay = candidate.bestPayout[n] ?? 0
        if (pay <= 0) continue
        let ways = 1
        let wildOnly = 1
        for (let reel = center - left; reel <= center + right; reel += 1) {
          ways *= meanCount[reel] ?? 0
          wildOnly *= meanWild[reel] ?? 0
        }
        let boundary = 1
        if (center - left - 1 >= 0) boundary *= zero[center - left - 1] ?? 0
        if (center + right + 1 < reels) boundary *= zero[center + right + 1] ?? 0
        const paths = champions[n] === candidate.key ? ways : ways - wildOnly
        expected += pay * paths * boundary
      }
    }
    // 지급 = 길 수 x 배당 x 길당 베팅(총 베팅 ÷ divisor) → 총 베팅액 배수로 나누면 ÷ divisor.
    const share = expected / divisor
    bySymbol[candidate.key] = share
    lines += share
  }
  return { lines, bySymbol }
}
