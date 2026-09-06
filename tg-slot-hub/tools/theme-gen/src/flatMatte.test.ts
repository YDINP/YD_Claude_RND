import { describe, expect, it } from 'vitest'
import { estimateBackgroundColor, removeFlatBackground } from './flatMatte.js'
import type { RawImage } from './chromaKey.js'

const WIDTH = 120
const HEIGHT = 120

interface Rgb {
  r: number
  g: number
  b: number
}

const GREY: Rgb = { r: 200, g: 200, b: 204 }
const OBJECT: Rgb = { r: 42, g: 95, b: 191 }

/**
 * 배경(회색) 위에 사각형 오브젝트를 하나 놓는다. `holeColor`를 주면 오브젝트 한가운데에
 * 배경과 **같은 색**의 구멍을 뚫는다 — 색만 보고 지우면 사라지고, 연결을 보면 살아남는 부분이다.
 */
function buildFlatFrame(options: { holeIsBackgroundColor?: boolean; gradient?: boolean } = {}): RawImage {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4)
  const objX0 = 30
  const objX1 = 90
  const objY0 = 30
  const objY1 = 90
  const holeX0 = 50
  const holeX1 = 70
  const holeY0 = 50
  const holeY1 = 70

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4
      const inObject = x >= objX0 && x < objX1 && y >= objY0 && y < objY1
      const inHole = x >= holeX0 && x < holeX1 && y >= holeY0 && y < holeY1
      let color = GREY
      if (inObject) color = inHole && options.holeIsBackgroundColor === true ? GREY : OBJECT
      // 완만한 그라데이션 배경(SDXL 실측)을 재현한다. 허용 오차 안에 들어와야 한다.
      const drift = options.gradient === true && !inObject ? Math.round((y / HEIGHT) * 24) : 0
      data[offset] = Math.min(255, color.r + drift)
      data[offset + 1] = Math.min(255, color.g + drift)
      data[offset + 2] = Math.min(255, color.b + drift)
      data[offset + 3] = 255
    }
  }
  return { data, width: WIDTH, height: HEIGHT, channels: 4 }
}

const alphaAt = (image: RawImage, x: number, y: number): number => image.data[(y * WIDTH + x) * 4 + 3] ?? -1

describe('estimateBackgroundColor', () => {
  it('테두리 띠의 채널별 중앙값을 돌려준다', () => {
    expect(estimateBackgroundColor(buildFlatFrame())).toEqual(GREY)
  })

  it('오브젝트가 테두리에 조금 닿아 있어도 중앙값은 배경을 가리킨다', () => {
    const image = buildFlatFrame()
    // 위쪽 테두리 일부(폭의 15%)를 오브젝트 색으로 덮는다.
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 18; x += 1) {
        const offset = (y * WIDTH + x) * 4
        image.data[offset] = OBJECT.r
        image.data[offset + 1] = OBJECT.g
        image.data[offset + 2] = OBJECT.b
      }
    }
    expect(estimateBackgroundColor(image)).toEqual(GREY)
  })
})

describe('removeFlatBackground', () => {
  it('배경만 투명해지고 오브젝트는 그대로다', () => {
    const { image, background, removedRatio } = removeFlatBackground(buildFlatFrame(), { featherPx: 0 })
    expect(background).toEqual(GREY)
    // 120x120 중 60x60이 오브젝트 -> 배경 75%.
    expect(removedRatio).toBeCloseTo(0.75, 2)
    expect(alphaAt(image, 5, 5)).toBe(0)
    expect(alphaAt(image, 60, 60)).toBe(255)
  })

  it("holes: 'keep'이면 오브젝트 안쪽의 배경색 구멍을 살린다 (테두리와 안 이어져 있다)", () => {
    const { image } = removeFlatBackground(buildFlatFrame({ holeIsBackgroundColor: true }), {
      featherPx: 0,
      holes: 'keep',
    })
    expect(alphaAt(image, 60, 60)).toBe(255)
    expect(alphaAt(image, 5, 5)).toBe(0)
  })

  it("기본값 holes: 'cut'은 안쪽 구멍도 지운다 (톱니 사이 틈이 비쳐 보여야 한다)", () => {
    const { image } = removeFlatBackground(buildFlatFrame({ holeIsBackgroundColor: true }), { featherPx: 0 })
    expect(alphaAt(image, 60, 60)).toBe(0)
    // 오브젝트 본체는 그대로다.
    expect(alphaAt(image, 35, 35)).toBe(255)
  })

  it('완만한 그라데이션 배경도 허용 오차 안에서 지운다', () => {
    const { image, removedRatio } = removeFlatBackground(buildFlatFrame({ gradient: true }), { featherPx: 0 })
    expect(removedRatio).toBeGreaterThan(0.7)
    expect(alphaAt(image, 5, 5)).toBe(0)
    expect(alphaAt(image, 5, HEIGHT - 5)).toBe(0)
    expect(alphaAt(image, 60, 60)).toBe(255)
  })

  it('배경이 평평하지 않으면 원본을 그대로 둔다', () => {
    // 전면 노이즈: 테두리와 이어진 동색 덩어리가 거의 없다.
    const noisy = buildFlatFrame()
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
      const offset = i * 4
      noisy.data[offset] = (i * 37) % 256
      noisy.data[offset + 1] = (i * 91) % 256
      noisy.data[offset + 2] = (i * 53) % 256
    }
    const { image, removedRatio } = removeFlatBackground(noisy, { featherPx: 0 })
    expect(removedRatio).toBeLessThan(0.05)
    // 아무것도 뚫지 않았다.
    expect(alphaAt(image, 5, 5)).toBe(255)
    expect(alphaAt(image, 60, 60)).toBe(255)
  })

  it('이미지 전체가 단색이면 오브젝트까지 먹은 것으로 보고 손대지 않는다', () => {
    const solid = buildFlatFrame()
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
      const offset = i * 4
      solid.data[offset] = GREY.r
      solid.data[offset + 1] = GREY.g
      solid.data[offset + 2] = GREY.b
    }
    const { image, removedRatio } = removeFlatBackground(solid, { featherPx: 0 })
    expect(removedRatio).toBe(1)
    expect(alphaAt(image, 60, 60)).toBe(255)
  })
})
