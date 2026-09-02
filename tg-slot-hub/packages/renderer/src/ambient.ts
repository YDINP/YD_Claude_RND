import {
  SPARKLE_MAX_COUNT,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_SCALE,
  SPARKLE_MIN_COUNT,
  SPARKLE_MIN_SCALE,
  SPARKLE_PLACEMENT_ATTEMPTS,
  SPARKLE_WINDOW_MARGIN,
} from './constants.js'
import type { Rect } from './layout.js'

/** 0 이상 1 미만을 돌려주는 난수. 테스트에서 결정론 함수를 주입한다. */
export type RandomFn = () => number

export interface SparklePlacement {
  x: number
  y: number
  /** 스프라이트 배율. */
  scale: number
  /** 첫 등장까지의 대기(ms). 전부 동시에 반짝이지 않게 흩는다. */
  delayMs: number
}

export interface SparklePlanOptions {
  /** 이 사각형 안에는 놓지 않는다. 릴 창을 가리지 않게 하는 용도다. */
  exclude?: Rect
}

/** 여유를 둔 금지 구역. 창 가장자리에 딱 붙는 것도 막는다. */
function expand(rect: Rect, ratio: number): Rect {
  const dx = rect.width * ratio
  const dy = rect.height * ratio
  return { x: rect.x - dx, y: rect.y - dy, width: rect.width + dx * 2, height: rect.height + dy * 2 }
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

/**
 * 배경에 흩뿌릴 반짝임 배치. 개수는 항상 하한과 상한 사이로 묶는다.
 *
 * `exclude`를 주면 그 사각형을 피해 자리를 다시 뽑는다.
 * 정해진 횟수 안에 빈자리를 못 찾으면 그 하나는 그냥 버린다.
 * 창이 화면을 거의 다 덮는 경우에 무한히 도는 것을 막기 위해서다.
 *
 * 순수 함수라 난수만 고정하면 그대로 검증할 수 있다.
 */
export function planSparkles(
  area: Rect,
  count: number,
  random: RandomFn,
  options: SparklePlanOptions = {},
): SparklePlacement[] {
  const total = Math.max(SPARKLE_MIN_COUNT, Math.min(SPARKLE_MAX_COUNT, Math.floor(count)))
  const forbidden = options.exclude === undefined ? null : expand(options.exclude, SPARKLE_WINDOW_MARGIN)
  const placements: SparklePlacement[] = []

  for (let i = 0; i < total; i += 1) {
    let x = 0
    let y = 0
    let placed = false
    for (let attempt = 0; attempt < SPARKLE_PLACEMENT_ATTEMPTS; attempt += 1) {
      x = area.x + random() * area.width
      y = area.y + random() * area.height
      if (forbidden === null || !contains(forbidden, x, y)) {
        placed = true
        break
      }
    }
    if (!placed) continue

    placements.push({
      x,
      y,
      scale: SPARKLE_MIN_SCALE + random() * (SPARKLE_MAX_SCALE - SPARKLE_MIN_SCALE),
      delayMs: random() * SPARKLE_MAX_DELAY_MS,
    })
  }
  return placements
}
