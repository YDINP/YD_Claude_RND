import { describe, expect, it } from 'vitest'
import { detectFrameWindow, punchWindowAlpha, type FrameWindowFraction } from './frameWindow.js'
import type { RawImage } from './chromaKey.js'

const WIDTH = 200
const HEIGHT = 300

/** 브라스 테두리(불투명) 위에 초록 사각형, 그 안에 흰 사각형을 그린 합성 프레임. */
function buildSyntheticFrame(): RawImage {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4)
  const brass = { r: 216, g: 169, b: 74 }
  const green = { r: 0, g: 255, b: 0 }
  const white = { r: 255, g: 255, b: 255 }

  // 초록 사각형: x 20..180 (분수 0.1..0.9), y 60..240 (분수 0.2..0.8) — 전부 downscale(4)의 배수라 양자화 오차가 없다.
  const greenX0 = 20
  const greenX1 = 180
  const greenY0 = 60
  const greenY1 = 240
  // 흰 사각형: 초록 사각형 안쪽에 완전히 포함.
  const whiteX0 = 60
  const whiteX1 = 140
  const whiteY0 = 120
  const whiteY1 = 180

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4
      let color = brass
      if (x >= greenX0 && x < greenX1 && y >= greenY0 && y < greenY1) color = green
      if (x >= whiteX0 && x < whiteX1 && y >= whiteY0 && y < whiteY1) color = white
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
      data[offset + 3] = 255
    }
  }

  return { data, width: WIDTH, height: HEIGHT, channels: 4 }
}

function buildFrameWithoutWindow(): RawImage {
  const data = Buffer.alloc(WIDTH * HEIGHT * 4)
  for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
    const offset = i * 4
    data[offset] = 216
    data[offset + 1] = 169
    data[offset + 2] = 74
    data[offset + 3] = 255
  }
  return { data, width: WIDTH, height: HEIGHT, channels: 4 }
}

describe('detectFrameWindow', () => {
  it('초록+흰색 덩어리의 바운딩 박스를 1% 확장해 분수로 돌려준다', () => {
    const window = detectFrameWindow(buildSyntheticFrame())
    expect(window).not.toBeNull()
    const w = window as FrameWindowFraction

    // 원본 박스: x 0.1..0.9, y 0.2..0.8 → 폭(200px) 기준 1%(2px)씩 사방으로 확장.
    expect(w.x).toBeCloseTo(0.09, 5)
    expect(w.y).toBeCloseTo(58 / 300, 5)
    expect(w.w).toBeCloseTo(0.82, 5)
    expect(w.h).toBeCloseTo(184 / 300, 5)

    // 픽셀로 환산해 ±2px 이내인지도 확인 (팀리드 요구사항 그대로).
    expect(w.x * WIDTH).toBeCloseTo(18, 0)
    expect(w.y * HEIGHT).toBeCloseTo(58, 0)
    expect((w.x + w.w) * WIDTH).toBeCloseTo(182, 0)
    expect((w.y + w.h) * HEIGHT).toBeCloseTo(242, 0)
  })

  it('초록/흰색 덩어리가 없으면 null이다', () => {
    expect(detectFrameWindow(buildFrameWithoutWindow())).toBeNull()
  })

  it('중앙 영역 밖(위쪽 5% 여백)에 있는 초록 덩어리는 무시한다', () => {
    const image = buildFrameWithoutWindow()
    // y 0..10px(=3.3%, region.yMin=0.1=30px 밖) 안에만 초록을 채운다.
    for (let y = 0; y < 10; y += 1) {
      for (let x = 40; x < 160; x += 1) {
        const offset = (y * WIDTH + x) * 4
        image.data[offset] = 0
        image.data[offset + 1] = 255
        image.data[offset + 2] = 0
      }
    }
    expect(detectFrameWindow(image)).toBeNull()
  })
})

describe('punchWindowAlpha', () => {
  const window: FrameWindowFraction = { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }

  it('창 안쪽은 alpha 0, 바깥은 그대로 불투명하다', () => {
    const result = punchWindowAlpha(buildSyntheticFrame(), window, { cornerRadiusRatio: 0, featherPx: 0 })
    const alphaAt = (x: number, y: number): number => result.data[(y * WIDTH + x) * 4 + 3] ?? -1

    // 창 중심부
    expect(alphaAt(100, 150)).toBe(0)
    // 창 바깥 (프레임 테두리)
    expect(alphaAt(5, 5)).toBe(255)
    expect(alphaAt(WIDTH - 5, HEIGHT - 5)).toBe(255)
  })

  it('cornerRadiusRatio를 주면 창의 뾰족한 모서리는 안 뚫린다(둥글린 모서리 바깥)', () => {
    const bigRadius = punchWindowAlpha(buildSyntheticFrame(), window, { cornerRadiusRatio: 0.1, featherPx: 0 })
    const alphaAt = (x: number, y: number): number => bigRadius.data[(y * WIDTH + x) * 4 + 3] ?? -1

    // window px 범위: x 20..180, y 60..240. 반경 = 0.1*200 = 20px.
    // 정확한 모서리 픽셀(20,60)은 모서리 원 중심(40,80)에서 거리 > 반경이라 안 뚫린다.
    expect(alphaAt(20, 60)).toBe(255)
    // 창 중심은 여전히 뚫린다.
    expect(alphaAt(100, 150)).toBe(0)
  })

  it('featherPx > 0이면 경계에 중간값이 생긴다', () => {
    const feathered = punchWindowAlpha(buildSyntheticFrame(), window, { cornerRadiusRatio: 0, featherPx: 3 })
    const alphaAt = (x: number, y: number): number => feathered.data[(y * WIDTH + x) * 4 + 3] ?? -1

    // 창의 왼쪽 경계(x=20) 바로 위 픽셀은 안(0)과 밖(255) 사이 어딘가여야 한다.
    const edge = alphaAt(20, 150)
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(255)
  })

  it('바깥 픽셀의 알파를 억지로 255로 만들지 않는다 (원래 값 보존)', () => {
    const translucentOutside: RawImage = buildSyntheticFrame()
    // 창 바깥 한 픽셀을 미리 반투명으로 만들어 둔다.
    const offset = (5 * WIDTH + 5) * 4
    translucentOutside.data[offset + 3] = 128

    const result = punchWindowAlpha(translucentOutside, window, { cornerRadiusRatio: 0, featherPx: 0 })
    expect(result.data[offset + 3]).toBe(128)
  })
})
