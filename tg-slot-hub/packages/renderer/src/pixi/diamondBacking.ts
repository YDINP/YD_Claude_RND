import type { Graphics } from 'pixi.js'
import { cellPitch, type Layout } from '../layout.js'
import { shapeCellRect, voidVeilRects } from '../shapeLayout.js'

/**
 * 릴 높이가 다른 판(마름모)의 받침판과 서리 막. 전부 코드 드로잉이다 — 마름모 윤곽은 프레임 그림이 아니라 이것이 만든다.
 *
 * - 받침판: 판 안 19칸 하나하나에 깔리는 얼음빛 어두운 패널. 칸 사이 간격이 그대로 보인다.
 * - 서리 막: 판 밖 모서리를 «빈칸»이 아니라 서리 낀 유리로 덮는다(사용자 규칙: 빈칸 금지). 사선 광택은 쓰지 않는다.
 *
 * 레이아웃이 바뀔 때만 다시 그린다. 매 프레임 그리지 않는다.
 */

export interface BackingColors {
  /** 칸 받침 색. */
  panel: number
  panelAlpha: number
  /** 칸 테두리·서리 가지 색. */
  rim: number
}

export const DEFAULT_BACKING: BackingColors = { panel: 0x0b1d3d, panelAlpha: 0.62, rim: 0xbfefff }

/** 결정이 같은 자리에 늘 같게 그려지도록 쓰는 작은 난수(칸 좌표 기반). */
function hash(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}

export function drawDiamondBacking(
  panels: Graphics,
  veil: Graphics,
  layout: Layout,
  heights: readonly number[],
  colors: BackingColors = DEFAULT_BACKING,
): void {
  panels.clear()
  veil.clear()
  const radius = layout.symbolSize * 0.12
  for (let reel = 0; reel < heights.length; reel += 1) {
    const h = heights[reel] ?? 0
    for (let row = 0; row < h; row += 1) {
      const r = shapeCellRect(layout, reel, row)
      panels.roundRect(r.x, r.y, r.width, r.height, radius).fill({ color: colors.panel, alpha: colors.panelAlpha })
    }
  }
  for (let reel = 0; reel < heights.length; reel += 1) {
    const h = heights[reel] ?? 0
    for (let row = 0; row < h; row += 1) {
      const r = shapeCellRect(layout, reel, row)
      panels.roundRect(r.x, r.y, r.width, r.height, radius).stroke({ width: 1.5, color: colors.rim, alpha: 0.28 })
    }
  }

  // 서리 막: 판 밖 구간을 옅은 서리빛으로 덮고, 가장자리에서 자란 결정 가지를 몇 줄 그린다.
  const pitch = cellPitch(layout)
  for (const rect of voidVeilRects(layout, heights)) {
    veil.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0xdff4ff, alpha: 0.2 })
  }
  for (const rect of voidVeilRects(layout, heights)) {
    const seed = Math.round(rect.x * 3 + rect.y * 7)
    // 판 안쪽 가장자리(마름모 변)에서 바깥으로 자라는 가지. 위 막은 아래 변, 아래 막은 위 변에 뿌리를 둔다.
    const isTop = rect.y < layout.reelArea.y + layout.reelArea.height / 2
    const rootY = isTop ? rect.y + rect.height : rect.y
    const dir = isTop ? -1 : 1
    const branches = Math.max(2, Math.round(rect.height / (pitch * 0.45)))
    for (let i = 0; i < branches; i += 1) {
      const x0 = rect.x + rect.width * (0.2 + 0.6 * hash(seed, i))
      const len = rect.height * (0.45 + 0.5 * hash(seed + 1, i))
      const x1 = x0 + (hash(seed + 2, i) - 0.5) * rect.width * 0.4
      const y1 = rootY + dir * len
      veil.moveTo(x0, rootY).lineTo(x1, y1).stroke({ width: 1.4, color: colors.rim, alpha: 0.55 })
      const mx = (x0 + x1) / 2
      const my = (rootY + y1) / 2
      veil.moveTo(mx, my).lineTo(mx + rect.width * 0.14, my + dir * len * 0.2).stroke({ width: 1, color: colors.rim, alpha: 0.4 })
      veil.moveTo(mx, my).lineTo(mx - rect.width * 0.14, my + dir * len * 0.2).stroke({ width: 1, color: colors.rim, alpha: 0.4 })
    }
  }
}
