import {
  SPARKLE_MAX_COUNT,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_SCALE,
  SPARKLE_MIN_COUNT,
  SPARKLE_MIN_SCALE,
  SWEEP_ANGLE_DEG,
  SWEEP_TRAVEL_MS,
  SWEEP_WIDTH_RATIO,
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

/**
 * 배경에 흩뿌릴 반짝임 배치. 개수는 항상 하한과 상한 사이로 묶는다.
 * 순수 함수라 난수만 고정하면 그대로 검증할 수 있다.
 */
export function planSparkles(area: Rect, count: number, random: RandomFn): SparklePlacement[] {
  const total = Math.max(SPARKLE_MIN_COUNT, Math.min(SPARKLE_MAX_COUNT, Math.floor(count)))
  const placements: SparklePlacement[] = []
  for (let i = 0; i < total; i += 1) {
    placements.push({
      x: area.x + random() * area.width,
      y: area.y + random() * area.height,
      scale: SPARKLE_MIN_SCALE + random() * (SPARKLE_MAX_SCALE - SPARKLE_MIN_SCALE),
      delayMs: random() * SPARKLE_MAX_DELAY_MS,
    })
  }
  return placements
}

export interface SweepPlan {
  /** 띠의 시작 x (영역 왼쪽 바깥). */
  fromX: number
  /** 띠의 끝 x (영역 오른쪽 바깥). */
  toX: number
  /** 띠 중심의 y. */
  y: number
  /** 띠 폭. */
  width: number
  /** 띠 길이. 기울여도 영역을 덮도록 넉넉히 잡는다. */
  height: number
  /** 가로지르는 데 걸리는 시간(ms). */
  travelMs: number
  /** 기울기(라디안). */
  rotation: number
}

/**
 * 대각선 빛 쓸기의 이동 계획. 띠가 영역 밖에서 시작해 밖에서 끝나도록 여유를 둔다.
 * 기울여 놓기 때문에 길이는 대각선 길이만큼 잡아야 모서리까지 훑는다.
 */
export function planLightSweep(area: Rect, travelMs: number = SWEEP_TRAVEL_MS): SweepPlan {
  const width = Math.max(1, area.width * SWEEP_WIDTH_RATIO)
  const diagonal = Math.hypot(area.width, area.height)
  return {
    fromX: area.x - width,
    toX: area.x + area.width + width,
    y: area.y + area.height / 2,
    width,
    height: diagonal * 1.4,
    travelMs,
    rotation: (SWEEP_ANGLE_DEG * Math.PI) / 180,
  }
}
