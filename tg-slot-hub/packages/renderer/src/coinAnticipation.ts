import type { GameMath } from '@tgslot/slot-engine'
import { COIN_ANTICIPATION_TRIGGER_OFFSETS } from './respinConstants.js'

export type CoinAnticipationMath = Pick<GameMath, 'reels' | 'rows' | 'strips'> & {
  coinRespin?: { symbol: string; trigger: number } | undefined
}

/** 릴마다 화면 창에 멈출 코인 개수. 코인 리스핀이 없는 게임이면 null. */
export function coinCountsByReel(math: CoinAnticipationMath, stops: readonly number[]): number[] | null {
  const coin = math.coinRespin?.symbol
  if (coin === undefined) return null
  const counts: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    const stop = stops[reel]
    let count = 0
    if (strip !== undefined && strip.length > 0 && stop !== undefined) {
      for (let row = 0; row < math.rows; row += 1) {
        if (strip[(stop + row) % strip.length] === coin) count += 1
      }
    }
    counts.push(count)
  }
  return counts
}

/**
 * 코인 기대감을 걸 릴 목록(왼쪽부터). 시간만 늘고 결과는 바뀌지 않는다.
 *
 * 규칙(기획서 §7-3): 릴 3이 멈춘 뒤 코인이 `trigger - 2`개 이상이면 릴 4·5를, 릴 4가 멈춘 뒤 `trigger - 1`개 이상이면
 * 릴 5를 늦춘다. 이미 트리거(`trigger`개)에 닿았으면 더 늦출 이유가 없다. 스캐터 기대감(`anticipation.ts`)과 규칙이 달라
 * 같은 함수에 섞지 않는다 — 기존 `featureTriggerCount`는 건드리지 않는다.
 */
export function coinAnticipatedReels(math: CoinAnticipationMath, stops: readonly number[]): number[] {
  const trigger = math.coinRespin?.trigger
  if (trigger === undefined) return []
  const counts = coinCountsByReel(math, stops)
  if (counts === null) return []
  const last = math.reels - 1
  const [early, late] = COIN_ANTICIPATION_TRIGGER_OFFSETS
  const result: number[] = []
  let landed = 0
  for (let reel = 0; reel < counts.length; reel += 1) {
    const fromEnd = last - reel
    // 맨 마지막 두 릴만 대상이다. 앞의 릴은 아직 남은 릴이 너무 많아 기대감이라 부를 수 없다.
    if (fromEnd <= 1 && landed < trigger) {
      const threshold = fromEnd === 1 ? trigger - early : trigger - late
      // 마지막 릴은 «앞 세 릴 기준»도 함께 따른다 — 릴 3에서 이미 늦춘 흐름이 릴 5까지 이어진다.
      const carried = fromEnd === 0 && coinsBefore(counts, reel - 1) >= trigger - early
      if (landed >= threshold || carried) result.push(reel)
    }
    landed += counts[reel] ?? 0
  }
  return result
}

function coinsBefore(counts: readonly number[], reel: number): number {
  let sum = 0
  for (let i = 0; i < reel; i += 1) sum += counts[i] ?? 0
  return sum
}
