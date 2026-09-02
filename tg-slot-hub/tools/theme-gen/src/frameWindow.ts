import { featherAlpha, toRgbaBuffer, type RawImage } from './chromaKey.js'
import {
  FRAME_WINDOW_ALPHA_THRESHOLD,
  FRAME_WINDOW_CORNER_RADIUS_RATIO,
  FRAME_WINDOW_DOWNSCALE,
  FRAME_WINDOW_EXPAND_RATIO,
  FRAME_WINDOW_FEATHER_PX,
  FRAME_WINDOW_GREEN_MARGIN,
  FRAME_WINDOW_GREEN_MIN_GREEN,
  FRAME_WINDOW_REGION,
  FRAME_WINDOW_WHITE_MIN_CHANNEL,
} from './constants.js'

/** `theme.json`의 `frameLayout.window`와 같은 모양. 전부 이미지 크기 대비 분수(0-1)다. */
export interface FrameWindowFraction {
  x: number
  y: number
  w: number
  h: number
}

export interface DetectFrameWindowOptions {
  /** 탐지 대상으로 볼 중앙 영역 (이미지 크기 대비 분수). 바깥 투명 여백을 제외하기 위함. */
  region?: { xMin: number; xMax: number; yMin: number; yMax: number }
  /** 다운샘플 배율. 4면 가로세로 4픽셀당 1개만 본다. */
  downscale?: number
  /** 이 알파값 이하 픽셀은 이미 투명하다고 보고 색상 판정에서 뺀다. */
  alphaThreshold?: number
  greenMinGreen?: number
  greenMargin?: number
  whiteMinChannel?: number
  /** 찾은 바운딩 박스를 이미지 폭의 이 비율만큼 사방으로 늘린다(안티에일리어싱 초록 테두리 포함용). */
  expandRatio?: number
}

function isGreenOrWhite(r: number, g: number, b: number, greenMinGreen: number, greenMargin: number, whiteMinChannel: number): boolean {
  const isGreen = g > greenMinGreen && g > r + greenMargin && g > b + greenMargin
  const isWhite = r > whiteMinChannel && g > whiteMinChannel && b > whiteMinChannel
  return isGreen || isWhite
}

interface Blob {
  minGx: number
  minGy: number
  maxGx: number
  maxGy: number
  size: number
}

/** 다운샘플 그리드 위에서 4-연결 성분을 BFS로 찾아 가장 큰 덩어리를 돌려준다. */
function findLargestBlob(mask: Uint8Array, gridW: number, gridH: number): Blob | null {
  const visited = new Uint8Array(mask.length)
  let best: Blob | null = null

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue

    let minGx = gridW
    let minGy = gridH
    let maxGx = -1
    let maxGy = -1
    let size = 0
    const queue: number[] = [start]
    visited[start] = 1

    while (queue.length > 0) {
      const idx = queue.pop()
      if (idx === undefined) break
      const gx = idx % gridW
      const gy = Math.floor(idx / gridW)
      size += 1
      if (gx < minGx) minGx = gx
      if (gx > maxGx) maxGx = gx
      if (gy < minGy) minGy = gy
      if (gy > maxGy) maxGy = gy

      const left = gx > 0 ? idx - 1 : -1
      const right = gx < gridW - 1 ? idx + 1 : -1
      const up = gy > 0 ? idx - gridW : -1
      const down = gy < gridH - 1 ? idx + gridW : -1
      for (const n of [left, right, up, down]) {
        if (n >= 0 && mask[n] === 1 && visited[n] === 0) {
          visited[n] = 1
          queue.push(n)
        }
      }
    }

    if (best === null || size > best.size) best = { minGx, minGy, maxGx, maxGy, size }
  }

  return best
}

/**
 * 프레임 이미지 중앙 영역에서 가장 큰 초록/흰색 연결 덩어리(=릴 창 placeholder)의
 * 바운딩 박스를 이미지 크기 대비 분수로 돌려준다. 다운샘플 그리드에서 BFS로 연결 성분을
 * 찾기 때문에 큰 이미지에서도 빠르다. 못 찾으면 null — 호출부는 frameLayout을 쓰지 말고
 * 경고만 남겨야 한다.
 */
export function detectFrameWindow(image: RawImage, options: DetectFrameWindowOptions = {}): FrameWindowFraction | null {
  const region = options.region ?? FRAME_WINDOW_REGION
  const downscale = options.downscale ?? FRAME_WINDOW_DOWNSCALE
  const alphaThreshold = options.alphaThreshold ?? FRAME_WINDOW_ALPHA_THRESHOLD
  const greenMinGreen = options.greenMinGreen ?? FRAME_WINDOW_GREEN_MIN_GREEN
  const greenMargin = options.greenMargin ?? FRAME_WINDOW_GREEN_MARGIN
  const whiteMinChannel = options.whiteMinChannel ?? FRAME_WINDOW_WHITE_MIN_CHANNEL
  const expandRatio = options.expandRatio ?? FRAME_WINDOW_EXPAND_RATIO

  const { data, width, height, channels } = image
  const gridW = Math.max(1, Math.ceil(width / downscale))
  const gridH = Math.max(1, Math.ceil(height / downscale))
  const mask = new Uint8Array(gridW * gridH)

  for (let gy = 0; gy < gridH; gy += 1) {
    const y = Math.min(height - 1, gy * downscale)
    const yFrac = y / height
    if (yFrac < region.yMin || yFrac > region.yMax) continue
    for (let gx = 0; gx < gridW; gx += 1) {
      const x = Math.min(width - 1, gx * downscale)
      const xFrac = x / width
      if (xFrac < region.xMin || xFrac > region.xMax) continue

      const offset = (y * width + x) * channels
      const alpha = channels === 4 ? (data[offset + 3] ?? 255) : 255
      if (alpha <= alphaThreshold) continue

      const r = data[offset] ?? 0
      const g = data[offset + 1] ?? 0
      const b = data[offset + 2] ?? 0
      if (isGreenOrWhite(r, g, b, greenMinGreen, greenMargin, whiteMinChannel)) {
        mask[gy * gridW + gx] = 1
      }
    }
  }

  const best = findLargestBlob(mask, gridW, gridH)
  if (best === null) return null

  const x0 = (best.minGx * downscale) / width
  const y0 = (best.minGy * downscale) / height
  const x1 = Math.min(1, ((best.maxGx + 1) * downscale) / width)
  const y1 = Math.min(1, ((best.maxGy + 1) * downscale) / height)

  // expandRatio는 "이미지 폭의 N%" 픽셀량이다. x는 폭 기준 분수라 그대로 쓰지만,
  // y는 높이 기준 분수라 같은 픽셀량을 height로 나눠 변환해야 정사각이 아닌 이미지에서도
  // 실제로 사방으로 같은 픽셀 수만큼 늘어난다.
  const expandXFrac = expandRatio
  const expandYFrac = (expandRatio * width) / height

  const ex0 = Math.max(0, x0 - expandXFrac)
  const ey0 = Math.max(0, y0 - expandYFrac)
  const ex1 = Math.min(1, x1 + expandXFrac)
  const ey1 = Math.min(1, y1 + expandYFrac)

  return { x: ex0, y: ey0, w: ex1 - ex0, h: ey1 - ey0 }
}

export interface PunchWindowOptions {
  /** 둥근 모서리 반경 = 이미지 폭 x 이 비율. */
  cornerRadiusRatio?: number
  /** 경계 페더링 반경(px). 0이면 이진 마스크 그대로. */
  featherPx?: number
}

/** (px, py)가 (rx,ry)-(rx+rw,ry+rh) 둥근 사각형 안쪽인지. 픽셀 중심 좌표 기준. */
function isInsideRoundedRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number, radius: number): boolean {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false
  const r = Math.min(radius, rw / 2, rh / 2)
  const withinX = px >= rx + r && px <= rx + rw - r
  const withinY = py >= ry + r && py <= ry + rh - r
  if (withinX || withinY) return true

  const cx = px < rx + r ? rx + r : rx + rw - r
  const cy = py < ry + r ? ry + r : ry + rh - r
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * `window`(이미지 크기 대비 분수) 안쪽 알파를 0으로 뚫는다. 바깥 픽셀의 알파는 건드리지 않는다
 * (프레임 테두리 바깥은 이미 투명하거나 나름의 알파를 갖고 있을 수 있어서 그대로 둔다).
 * 모서리를 살짝 둥글리고 2px(기본) 페더링해 딱딱한 경계선이 생기지 않게 한다.
 */
export function punchWindowAlpha(image: RawImage, window: FrameWindowFraction, options: PunchWindowOptions = {}): RawImage {
  const cornerRadiusRatio = options.cornerRadiusRatio ?? FRAME_WINDOW_CORNER_RADIUS_RATIO
  const featherPx = options.featherPx ?? FRAME_WINDOW_FEATHER_PX

  const { width, height } = image
  const rgba = toRgbaBuffer(image)

  const rx = window.x * width
  const ry = window.y * height
  const rw = window.w * width
  const rh = window.h * height
  const radius = cornerRadiusRatio * width

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInsideRoundedRect(x + 0.5, y + 0.5, rx, ry, rw, rh, radius)) {
        rgba[(y * width + x) * 4 + 3] = 0
      }
    }
  }

  const data = featherPx > 0 ? featherAlpha(rgba, width, height, featherPx) : rgba
  return { data, width, height, channels: 4 }
}
