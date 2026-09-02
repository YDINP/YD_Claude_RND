import { describe, expect, it } from 'vitest'
import { chromaKey, type RawImage } from './chromaKey.js'

const SIZE = 16
/** 5..10 (포함) 6x6 빨간 정사각형. 가장자리에서 최소 2px 안쪽까지 확보해 1px 피더링에 안 걸리게 한다. */
const SQUARE_START = 5
const SQUARE_END = 10

function buildGreenBgRedSquare(): RawImage {
  const data = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = (y * SIZE + x) * 4
      const inSquare = x >= SQUARE_START && x <= SQUARE_END && y >= SQUARE_START && y <= SQUARE_END
      if (inSquare) {
        data[offset] = 255
        data[offset + 1] = 0
        data[offset + 2] = 0
      } else {
        data[offset] = 0
        data[offset + 1] = 255
        data[offset + 2] = 0
      }
      data[offset + 3] = 255
    }
  }
  return { data, width: SIZE, height: SIZE, channels: 4 }
}

function alphaAt(image: RawImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? -1
}

describe('chromaKey', () => {
  it('초록 배경은 alpha 0, 빨간 정사각형 안쪽은 alpha 255가 된다', () => {
    const result = chromaKey(buildGreenBgRedSquare())

    // 초록 배경 코너 (정사각형에서 충분히 떨어짐)
    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 15, 15)).toBe(0)
    expect(alphaAt(result, 15, 0)).toBe(0)

    // 정사각형 중심부 (경계에서 2px 이상 안쪽 → 1px 피더링 영향 없음)
    expect(alphaAt(result, 7, 7)).toBe(255)
    expect(alphaAt(result, 8, 8)).toBe(255)
  })

  it('항상 4채널을 반환한다', () => {
    const result = chromaKey(buildGreenBgRedSquare())
    expect(result.channels).toBe(4)
    expect(result.data.length).toBe(SIZE * SIZE * 4)
  })

  it('featherPx=0이면 경계가 이진(binary)이다', () => {
    const result = chromaKey(buildGreenBgRedSquare(), { featherPx: 0 })
    // 정사각형 바로 바깥(초록)은 0, 바로 안쪽(빨강)은 255 — 중간값이 없다
    expect(alphaAt(result, SQUARE_START - 1, SQUARE_START - 1)).toBe(0)
    expect(alphaAt(result, SQUARE_START, SQUARE_START)).toBe(255)
  })

  it('featherPx>0이면 경계가 부드러워진다 (0과 255 사이 값이 생긴다)', () => {
    const result = chromaKey(buildGreenBgRedSquare(), { featherPx: 1 })
    const edgeAlpha = alphaAt(result, SQUARE_START, SQUARE_START)
    expect(edgeAlpha).toBeGreaterThan(0)
    expect(edgeAlpha).toBeLessThan(255)
  })

  it('회색조(저채도) 픽셀은 초록 hue와 가까워도 키잉하지 않는다', () => {
    const size = 4
    const data = Buffer.alloc(size * size * 4, 0)
    for (let i = 0; i < size * size; i += 1) {
      const offset = i * 4
      data[offset] = 200
      data[offset + 1] = 200
      data[offset + 2] = 200
      data[offset + 3] = 255
    }
    const result = chromaKey({ data, width: size, height: size, channels: 4 }, { featherPx: 0 })
    expect(alphaAt(result, 1, 1)).toBe(255)
  })

  it('3채널(RGB) 입력도 alpha=255로 간주해 처리한다', () => {
    const size = 2
    const data = Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0])
    const result = chromaKey({ data, width: size, height: size, channels: 3 }, { featherPx: 0 })
    expect(result.channels).toBe(4)
    expect(alphaAt(result, 0, 0)).toBe(0)
  })
})
