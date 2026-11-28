import type { GameMath } from '@tgslot/slot-engine'

export type AnticipationMath = Pick<GameMath, 'reels' | 'rows' | 'strips' | 'scatter'> &
  Partial<Pick<GameMath, 'orderRound' | 'boardBonus' | 'stageRoulette'>>

/**
 * 보너스(프리스핀·주문 카드 라운드·말판 보너스·무대 룰렛)를 여는 스캐터 개수. 엔진 `featureTriggerCount`와 같다(테스트가 비교한다).
 * 렌더러 루트는 slot-engine을 타입으로만 가져오므로 같은 규칙을 여기 둔다.
 */
export function featureTriggerCount(math: AnticipationMath): number | undefined {
  return math.orderRound?.trigger ?? math.scatter?.freeSpins?.trigger ?? math.boardBonus?.trigger ?? math.stageRoulette?.trigger
}

/** 릴마다 화면 창에 멈출 스캐터 개수. 스캐터가 없는 게임이면 null. */
export function scatterCountsByReel(math: AnticipationMath, stops: readonly number[]): number[] | null {
  const scatter = math.scatter?.symbol
  if (scatter === undefined) return null
  const counts: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    const stop = stops[reel]
    let count = 0
    if (strip !== undefined && strip.length > 0 && stop !== undefined) {
      for (let row = 0; row < math.rows; row += 1) {
        if (strip[(stop + row) % strip.length] === scatter) count += 1
      }
    }
    counts.push(count)
  }
  return counts
}

/**
 * 기대감을 걸 릴 목록(왼쪽부터). 앞 릴들에 이미 떨어진 스캐터가 `trigger - 1`개 이상이고
 * 아직 `trigger`개에는 못 미친 상태에서 멈출 릴이 남아 있으면 그 릴이 대상이다.
 * 프리스핀 트리거가 없는 게임은 비어 있다. 결과가 아니라 연출 시간만 정한다.
 *
 * 스트립에 스캐터가 하나도 없는 릴은 건너뛴다 — 거기서는 트리거가 완성될 수 없으니 감속은 가짜 기대감이다
 * (말판 팩은 스캐터가 릴 1·3·5에만 있다). 모든 릴에 스캐터가 있는 팩은 결과가 그대로다.
 */
export function anticipatedReels(math: AnticipationMath, stops: readonly number[]): number[] {
  const trigger = featureTriggerCount(math)
  if (trigger === undefined) return []
  const counts = scatterCountsByReel(math, stops)
  if (counts === null) return []
  const scatter = math.scatter?.symbol
  const result: number[] = []
  let landed = 0
  for (let reel = 0; reel < counts.length; reel += 1) {
    const canHold = scatter !== undefined && (math.strips[reel]?.includes(scatter) ?? false)
    if (canHold && landed > 0 && landed >= trigger - 1 && landed < trigger) result.push(reel)
    landed += counts[reel] ?? 0
  }
  return result
}

/**
 * 기대 릴이 설 때 트리거가 완성됐는지. 그 릴이 서는 시각까지(같은 시각에 서는 묶음 포함) 선 릴의 개수를 모두 더한다.
 * 결과는 이미 정해져 있고 이 값은 «터질지, 조용히 꺼질지»만 고른다.
 */
export function anticipationOutcome(
  counts: readonly number[],
  endMsByReel: readonly number[],
  reel: number,
  trigger: number,
): 'hit' | 'miss' {
  const end = endMsByReel[reel]
  if (end === undefined) return 'miss'
  let landed = 0
  counts.forEach((count, r) => {
    const e = endMsByReel[r]
    if (e !== undefined && e <= end) landed += count
  })
  return landed >= trigger ? 'hit' : 'miss'
}
