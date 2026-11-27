import type { Graphics } from 'pixi.js'
import { CASCADE_OUTLINE_STROKE_PX } from '../constants.js'
import { symbolCenter, type Layout } from '../layout.js'

/** 칸 한 변에 대한 고리 한 변의 비율. 1보다 살짝 커서 그림 둘레를 감싼다. */
const RING_SIZE_RATIO = 1.0
const RING_RADIUS_RATIO = 0.22
const RING_GLOW_ALPHA = 0.2

/**
 * 위치 무관 지불의 당첨 칸마다 빛 고리를 그린다. 흩어진 칸이라 합집합 테두리가 아니라 칸 하나하나에 둘러
 * «어디서 이겼는지»를 보인다. 선을 긋지 않는다(당첨 경로는 이펙트로 표시).
 */
export function drawCellRings(
  graphics: Graphics,
  groups: readonly (readonly (readonly [number, number])[])[],
  layout: Layout,
  color: string,
): void {
  graphics.clear()
  const size = layout.symbolSize * RING_SIZE_RATIO
  const radius = size * RING_RADIUS_RATIO
  let drew = false
  for (const group of groups) {
    for (const [reel, row] of group) {
      const center = symbolCenter(layout, reel, row)
      graphics.roundRect(center.x - size / 2, center.y - size / 2, size, size, radius)
      drew = true
    }
  }
  if (!drew) return
  graphics.fill({ color, alpha: RING_GLOW_ALPHA })
  for (const group of groups) {
    for (const [reel, row] of group) {
      const center = symbolCenter(layout, reel, row)
      graphics.roundRect(center.x - size / 2, center.y - size / 2, size, size, radius)
    }
  }
  graphics.stroke({ width: CASCADE_OUTLINE_STROKE_PX, color, alpha: 0.95 })
}
