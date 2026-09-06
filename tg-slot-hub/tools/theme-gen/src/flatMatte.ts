import { featherAlpha, toRgbaBuffer, type RawImage } from './chromaKey.js'
import {
  FLAT_MATTE_BORDER_BAND_RATIO,
  FLAT_MATTE_FEATHER_PX,
  FLAT_MATTE_MAX_REMOVED_RATIO,
  FLAT_MATTE_MIN_REMOVED_RATIO,
  FLAT_MATTE_TOLERANCE,
} from './constants.js'

/**
 * 크로마키 없이 **평평한 배경**을 지우는 갈래.
 *
 * 왜 필요한가: 로컬 SDXL 체크포인트는 "isolated on #00FF00" 지시를 지키지 않는다. 실측하면
 * 초록을 배경이 아니라 **오브젝트 안에** 칠해 버리고 배경은 제멋대로 중성색이 된다. 그래서
 * "배경은 이 색이다"를 프롬프트로 정하는 대신 **이미지에서 읽는다.**
 *
 * 색만 보고 지우면 오브젝트 안의 같은 색까지 사라지므로, **테두리에서 시작하는 연결 성분만**
 * 지운다(플러드필). 배경은 정의상 이미지 가장자리에 닿아 있고, 오브젝트 안쪽 구멍은 닿아
 * 있지 않다 — 이 한 가지 성질이 "배경"과 "우연히 같은 색인 부분"을 가른다.
 */

export interface FlatMatteOptions {
  /**
   * 오브젝트 안쪽에 있는 **배경색과 같은 영역**을 어떻게 볼지.
   *
   * - `'cut'`(기본) — 배경으로 보고 함께 지운다. 톱니 사이 틈, 손잡이 안쪽 구멍처럼
   *   «비쳐 보이는 자리»가 대부분이라서다. 생성 프롬프트가 배경색을 오브젝트 팔레트에서
   *   빼 두는 것이 이 기본값의 전제다.
   * - `'keep'` — 테두리와 이어진 것만 지운다. 배경색이 오브젝트에도 쓰였을 때 쓴다.
   *
   * 어느 쪽이든 **배경색 추정과 «지울 만한 그림인가» 판정은 테두리 연결로만** 한다.
   */
  holes?: 'keep' | 'cut'
  /** 배경색 추정에 쓸 테두리 띠 두께(짧은 변 대비 비율). */
  borderBandRatio?: number
  /** 배경으로 볼 색상 거리(0-255 채널 유클리드). */
  tolerance?: number
  /** 알파 경계 페더링 반경(px). */
  featherPx?: number
}

export interface FlatMatteResult {
  image: RawImage
  /** 추정한 배경색. 로그로 남겨 두면 실패했을 때 원인을 바로 안다. */
  background: { r: number; g: number; b: number }
  /** 투명하게 바꾼 픽셀 비율(0-1). */
  removedRatio: number
}

/** 배경 추정·판정에 쓰는 채널 유클리드 거리의 제곱. sqrt를 피해 픽셀 루프를 가볍게 둔다. */
function distanceSquared(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return dr * dr + dg * dg + db * db
}

/**
 * 테두리 띠의 **채널별 중앙값**으로 배경색을 추정한다.
 *
 * 평균이 아니라 중앙값인 이유: 오브젝트가 한쪽에서 테두리에 닿아 있어도 그쪽 픽셀이
 * 소수면 중앙값은 흔들리지 않는다. 평균은 그 한 덩어리에 그대로 끌려간다.
 */
export function estimateBackgroundColor(
  image: RawImage,
  borderBandRatio: number = FLAT_MATTE_BORDER_BAND_RATIO,
): { r: number; g: number; b: number } {
  const { data, width, height, channels } = image
  const band = Math.max(1, Math.round(Math.min(width, height) * borderBandRatio))
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []

  const sample = (x: number, y: number): void => {
    const offset = (y * width + x) * channels
    reds.push(data[offset] ?? 0)
    greens.push(data[offset + 1] ?? 0)
    blues.push(data[offset + 2] ?? 0)
  }

  for (let y = 0; y < height; y += 1) {
    const isTopOrBottom = y < band || y >= height - band
    for (let x = 0; x < width; x += 1) {
      if (isTopOrBottom || x < band || x >= width - band) sample(x, y)
    }
  }

  const median = (values: number[]): number => {
    if (values.length === 0) return 0
    values.sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)] ?? 0
  }
  return { r: median(reds), g: median(greens), b: median(blues) }
}

/**
 * 추정한 배경색과 가까우면서 **이미지 테두리와 이어져 있는** 픽셀만 알파 0으로 만든다.
 *
 * 지운 비율이 지나치게 작거나(배경이 평평하지 않았다) 지나치게 크면(오브젝트까지 먹었다)
 * `removedRatio`로 알려 주고 **원본을 그대로 돌려준다** — 호출부가 판단하도록 남기는 편이,
 * 여기서 조용히 반쯤 지운 이미지를 내보내는 것보다 낫다.
 */
export function removeFlatBackground(image: RawImage, options: FlatMatteOptions = {}): FlatMatteResult {
  const borderBandRatio = options.borderBandRatio ?? FLAT_MATTE_BORDER_BAND_RATIO
  const tolerance = options.tolerance ?? FLAT_MATTE_TOLERANCE
  const featherPx = options.featherPx ?? FLAT_MATTE_FEATHER_PX
  const holes = options.holes ?? 'cut'

  const { width, height } = image
  const background = estimateBackgroundColor(image, borderBandRatio)
  const rgba = toRgbaBuffer(image)
  const pixelCount = width * height
  const toleranceSquared = tolerance * tolerance

  const isBackground = (index: number): boolean => {
    const offset = index * 4
    return (
      distanceSquared(
        rgba[offset] ?? 0,
        rgba[offset + 1] ?? 0,
        rgba[offset + 2] ?? 0,
        background.r,
        background.g,
        background.b,
      ) <= toleranceSquared
    )
  }

  // 테두리 픽셀을 씨앗으로 4-연결 플러드필. 스택으로 돌려 재귀 깊이 문제를 피한다.
  const removed = new Uint8Array(pixelCount)
  const stack: number[] = []
  const push = (index: number): void => {
    if (removed[index] === 1 || !isBackground(index)) return
    removed[index] = 1
    stack.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width)
    push(y * width + width - 1)
  }

  let removedCount = stack.length
  while (stack.length > 0) {
    const index = stack.pop()
    if (index === undefined) break
    const x = index % width
    const y = (index - x) / width
    const before = stack.length
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
    removedCount += stack.length - before
  }

  const removedRatio = removedCount / pixelCount
  if (removedRatio < FLAT_MATTE_MIN_REMOVED_RATIO || removedRatio > FLAT_MATTE_MAX_REMOVED_RATIO) {
    return { image: { data: rgba, width, height, channels: 4 }, background, removedRatio }
  }

  for (let index = 0; index < pixelCount; index += 1) {
    // 'cut'이면 테두리와 안 이어져 있어도 배경색이면 지운다. 판정 자체는 위 플러드필이
    // 이미 통과했으므로 "배경색 추정이 맞다"는 근거를 갖고 확장하는 것이다.
    if (removed[index] === 1 || (holes === 'cut' && isBackground(index))) rgba[index * 4 + 3] = 0
  }

  const data = featherPx > 0 ? featherAlpha(rgba, width, height, featherPx) : rgba
  return { image: { data, width, height, channels: 4 }, background, removedRatio }
}
