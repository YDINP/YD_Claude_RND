import type { GameMath } from '@tgslot/slot-engine'

export type AnticipationMath = Pick<GameMath, 'reels' | 'rows' | 'strips' | 'scatter'>

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
 */
export function anticipatedReels(math: AnticipationMath, stops: readonly number[]): number[] {
  const trigger = math.scatter?.freeSpins?.trigger
  if (trigger === undefined) return []
  const counts = scatterCountsByReel(math, stops)
  if (counts === null) return []
  const result: number[] = []
  let landed = 0
  for (let reel = 0; reel < counts.length; reel += 1) {
    if (landed > 0 && landed >= trigger - 1 && landed < trigger) result.push(reel)
    landed += counts[reel] ?? 0
  }
  return result
}
