import { CHROMA_GREEN_DOMINANCE, CHROMA_GREEN_MIN } from './constants.js'

/**
 * 크로마키 초록인지 판정한다.
 *
 * 아트 파이프라인(`tools/theme-gen`)이 `#00FF00` 배경을 이미 뚫지만,
 * 디스필이 덜 된 가장자리에 초록 테두리가 남는 일이 있다.
 * 렌더러는 프레임 텍스처를 올리기 전에 같은 판정을 한 번 더 돌려 잔여 초록을 지운다.
 *
 * 조건은 셋 다 만족해야 한다: 초록이 충분히 밝고, 빨강보다 확실히 크고, 파랑보다 확실히 크다.
 * 브라스(노랑 계열, r ≈ g)와 청록(파랑이 큼)은 이 조건에 걸리지 않는다.
 */
export function isChromaGreen(r: number, g: number, b: number): boolean {
  return g > CHROMA_GREEN_MIN && g > r + CHROMA_GREEN_DOMINANCE && g > b + CHROMA_GREEN_DOMINANCE
}

/**
 * RGBA 픽셀 배열에서 크로마키 초록을 투명하게 만든다. 배열을 **제자리에서** 고친다.
 * @returns 투명하게 바꾼 픽셀 수. 0이면 지울 초록이 없었다는 뜻이다.
 */
export function keyOutGreen(pixels: Uint8ClampedArray | number[]): number {
  if (pixels.length % 4 !== 0) {
    throw new RangeError(`RGBA 배열 길이가 4의 배수가 아니다: ${pixels.length}`)
  }
  let keyed = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (r === undefined || g === undefined || b === undefined || a === undefined) continue
    if (a === 0) continue
    if (!isChromaGreen(r, g, b)) continue
    pixels[i + 3] = 0
    keyed += 1
  }
  return keyed
}
