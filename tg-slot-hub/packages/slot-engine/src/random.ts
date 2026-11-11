import type { Rng } from './types.js'

/** 가중치를 정수 눈금으로 환산할 때 쓰는 배율. 정수 가중치면 쓰지 않는다. */
export const WEIGHT_SCALE = 1_000_000

/**
 * 가중 추첨. 키 순서가 결과를 좌우하므로 정렬해 결정론을 보장한다.
 *
 * `nextInt`는 정수만 주므로 가중치를 정수 눈금으로 바꿔 쓴다.
 * **가중치가 전부 정수면 그대로 쓰므로 추첨 확률이 해석식과 정확히 같다.**
 * 소수 가중치가 섞이면 100만 눈금으로 반올림하며, 이때 확률 오차는 항목당 1e-6 이하다.
 * 해석적 RTP는 원래 가중치를 그대로 쓰므로, 소수 가중치를 쓰면 그만큼 어긋난다.
 * 게임 팩이 정수 가중치를 쓰는 이유가 이것이다.
 */
export function pickWeighted<T extends string | number>(weights: Record<T, number>, rng: Rng): T | undefined {
  const entries = (Object.entries(weights) as [string, number][])
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0)
  if (total <= 0) return undefined

  const exact = entries.every(([, weight]) => Number.isInteger(weight))
  const ticks = exact
    ? entries.map(([key, weight]) => [key, weight] as const)
    : entries.map(
        ([key, weight]) => [key, Math.max(1, Math.round((weight / total) * WEIGHT_SCALE))] as const,
      )
  const ceiling = ticks.reduce((acc, [, tick]) => acc + tick, 0)
  let roll = rng.nextInt(ceiling)
  for (const [key, tick] of ticks) {
    if (roll < tick) return key as T
    roll -= tick
  }
  return ticks[ticks.length - 1]?.[0] as T | undefined
}
