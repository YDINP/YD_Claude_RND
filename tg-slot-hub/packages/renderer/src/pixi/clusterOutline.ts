import type { Graphics } from 'pixi.js'
import { CASCADE_OUTLINE_STROKE_PX } from '../constants.js'
import { clusterOutlineSegments } from '../cascade.js'
import { cellPitch, type Layout } from '../layout.js'

/**
 * 그룹마다 합집합 경계를 긋는다. 칸 변을 간격의 절반만큼 밖으로 밀어 이웃 칸과 변을 공유하게 한다 —
 * 그래야 안쪽 변이 사라지고 바깥 테두리만 한 줄로 이어진다.
 */
export function drawClusterOutlines(
  graphics: Graphics,
  groups: readonly (readonly (readonly [number, number])[])[],
  layout: Layout,
  color: string,
): void {
  graphics.clear()
  const pitch = cellPitch(layout)
  const half = layout.gap / 2
  const x = (unit: number): number => layout.reelArea.x - half + unit * pitch
  const y = (unit: number): number => layout.reelArea.y - half + unit * pitch
  let drew = false
  for (const group of groups) {
    for (const segment of clusterOutlineSegments(group)) {
      graphics.moveTo(x(segment.x1), y(segment.y1)).lineTo(x(segment.x2), y(segment.y2))
      drew = true
    }
  }
  if (drew) graphics.stroke({ width: CASCADE_OUTLINE_STROKE_PX, color, alpha: 0.95, cap: 'square', join: 'miter' })
}
