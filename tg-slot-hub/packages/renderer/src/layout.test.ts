import { describe, expect, it } from 'vitest'
import { MAX_SYMBOL_SIZE, MIN_SYMBOL_SIZE } from './constants.js'
import {
  cellPitch,
  computeFrameLayout,
  computeLayout,
  frameWindowRect,
  paylinePoints,
  positionRects,
  reelLeft,
  rowTop,
  symbolCenter,
} from './layout.js'
import { loadGameMath } from './testSupport.js'

const math = loadGameMath('classic-777')
const layout = computeLayout({ containerWidth: 360, reels: math.reels, rows: math.rows })

describe('computeLayout', () => {
  it('세로 폰 폭에 프레임을 정확히 맞춘다', () => {
    expect(layout.width).toBeLessThanOrEqual(360)
    expect(layout.width).toBeGreaterThan(340)
    expect(layout.frame.width).toBe(layout.width)
    expect(layout.frame.height).toBe(layout.height)
  })

  it('릴 영역이 프레임 안쪽에 들어간다', () => {
    expect(layout.reelArea.x).toBeGreaterThan(0)
    expect(layout.reelArea.x + layout.reelArea.width).toBeLessThanOrEqual(layout.width + 1e-9)
    expect(layout.reelArea.y + layout.reelArea.height).toBeLessThanOrEqual(layout.height + 1e-9)
  })

  it('릴 영역 폭은 셀과 간격의 합이다', () => {
    const expected = math.reels * layout.symbolSize + (math.reels - 1) * layout.gap
    expect(layout.reelArea.width).toBeCloseTo(expected, 9)
  })

  it('높이가 좁으면 높이 기준으로 심볼을 줄인다', () => {
    const wide = computeLayout({ containerWidth: 400, containerHeight: 200, reels: 3, rows: 3 })
    expect(wide.height).toBeLessThanOrEqual(200)
    expect(wide.symbolSize).toBeLessThan(layout.symbolSize)
  })

  it('아주 작은 컨테이너에서도 최소 심볼 크기를 지킨다', () => {
    const tiny = computeLayout({ containerWidth: 10, reels: 5, rows: 3 })
    expect(tiny.symbolSize).toBe(MIN_SYMBOL_SIZE)
  })

  it('아주 큰 컨테이너에서 심볼 크기를 상한으로 묶는다', () => {
    const huge = computeLayout({ containerWidth: 4000, reels: 3, rows: 3 })
    expect(huge.symbolSize).toBe(MAX_SYMBOL_SIZE)
  })

  it('릴이나 행이 0이면 던진다', () => {
    expect(() => computeLayout({ containerWidth: 360, reels: 0, rows: 3 })).toThrow(RangeError)
  })
})

describe('symbolCenter', () => {
  it('릴이 오른쪽으로 갈수록 x가 피치만큼 커진다', () => {
    const pitch = cellPitch(layout)
    for (let reel = 1; reel < math.reels; reel += 1) {
      expect(symbolCenter(layout, reel, 0).x - symbolCenter(layout, reel - 1, 0).x).toBeCloseTo(pitch, 9)
    }
  })

  it('행이 내려갈수록 y가 피치만큼 커진다', () => {
    const pitch = cellPitch(layout)
    for (let row = 1; row < math.rows; row += 1) {
      expect(symbolCenter(layout, 0, row).y - symbolCenter(layout, 0, row - 1).y).toBeCloseTo(pitch, 9)
    }
  })

  it('중심은 릴 왼쪽 + 심볼 절반이다', () => {
    const center = symbolCenter(layout, 2, 1)
    expect(center.x).toBeCloseTo(reelLeft(layout, 2) + layout.symbolSize / 2, 9)
    expect(center.y).toBeCloseTo(rowTop(layout, 1) + layout.symbolSize / 2, 9)
  })

  it('모든 셀 중심이 릴 영역 안에 있다', () => {
    for (let reel = 0; reel < math.reels; reel += 1) {
      for (let row = 0; row < math.rows; row += 1) {
        const { x, y } = symbolCenter(layout, reel, row)
        expect(x).toBeGreaterThan(layout.reelArea.x)
        expect(x).toBeLessThan(layout.reelArea.x + layout.reelArea.width)
        expect(y).toBeGreaterThan(layout.reelArea.y)
        expect(y).toBeLessThan(layout.reelArea.y + layout.reelArea.height)
      }
    }
  })
})

describe('paylinePoints', () => {
  it('꼭짓점 수가 페이라인 길이와 같다', () => {
    for (const payline of math.paylines) {
      expect(paylinePoints(layout, payline)).toHaveLength(payline.length)
    }
  })

  it('가운데 가로줄은 y가 모두 같다', () => {
    const middle = math.paylines[0]
    if (middle === undefined) throw new Error('페이라인 없음')
    const points = paylinePoints(layout, middle)
    const first = points[0]
    if (first === undefined) throw new Error('꼭짓점 없음')
    for (const point of points) expect(point.y).toBeCloseTo(first.y, 9)
  })

  it('대각선은 y가 단조증가한다', () => {
    const points = paylinePoints(layout, [0, 1, 2])
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]?.y ?? 0).toBeGreaterThan(points[i - 1]?.y ?? 0)
    }
  })

  it('행 인덱스가 범위를 벗어나면 던진다', () => {
    expect(() => paylinePoints(layout, [0, 1, 3])).toThrow(RangeError)
  })
})

describe('positionRects', () => {
  it('승리 좌표를 셀 사각형으로 바꾼다', () => {
    const rects = positionRects(layout, [
      [0, 1],
      [1, 1],
      [2, 1],
    ])
    expect(rects).toHaveLength(3)
    for (const rect of rects) {
      expect(rect.width).toBe(layout.symbolSize)
      expect(rect.height).toBe(layout.symbolSize)
    }
    expect(rects[1]?.x).toBeCloseTo(reelLeft(layout, 1), 9)
  })
})

describe('computeLayout chrome:false', () => {
  const bare = computeLayout({ containerWidth: 300, reels: 3, rows: 3, chrome: false })

  it('여백과 테두리를 없앤다', () => {
    expect(bare.padding).toBe(0)
    expect(bare.border).toBe(0)
  })

  it('레이아웃 크기가 곧 릴 영역 크기다', () => {
    expect(bare.width).toBeCloseTo(bare.reelArea.width, 9)
    expect(bare.height).toBeCloseTo(bare.reelArea.height, 9)
    expect(bare.reelArea.x).toBe(0)
    expect(bare.reelArea.y).toBe(0)
  })

  it('주어진 폭을 정확히 채운다', () => {
    expect(bare.width).toBeCloseTo(300, 6)
  })

  it('심볼 크기 하한을 낮출 수 있다', () => {
    const squeezed = computeLayout({ containerWidth: 30, reels: 3, rows: 3, chrome: false, minSymbolSize: 1 })
    expect(squeezed.width).toBeCloseTo(30, 6)
    expect(squeezed.symbolSize).toBeLessThan(MIN_SYMBOL_SIZE)
  })
})

describe('frameWindowRect', () => {
  it('기본 창 분수(ART_DIRECTION §5)를 픽셀로 바꾼다', () => {
    const rect = frameWindowRect(1000, 2000)
    expect(rect.x).toBeCloseTo(80, 9)
    expect(rect.y).toBeCloseTo(440, 9)
    expect(rect.width).toBeCloseTo(840, 9)
    expect(rect.height).toBeCloseTo(920, 9)
  })

  it('배율이 달라져도 같은 분수를 가리킨다', () => {
    const small = frameWindowRect(540, 675)
    const large = frameWindowRect(1080, 1350)
    expect(large.x / small.x).toBeCloseTo(2, 9)
    expect(large.height / small.height).toBeCloseTo(2, 9)
  })

  it('창을 직접 줄 수 있다', () => {
    const rect = frameWindowRect(200, 100, { x: 0.1, y: 0.2, w: 0.5, h: 0.25 })
    expect(rect).toEqual({ x: 20, y: 20, width: 100, height: 25 })
  })

  it('프레임 크기가 0 이하면 던진다', () => {
    expect(() => frameWindowRect(0, 100)).toThrow(RangeError)
    expect(() => frameWindowRect(100, -1)).toThrow(RangeError)
  })
})

describe('computeFrameLayout', () => {
  const framed = computeFrameLayout({
    containerWidth: 360,
    frameWidth: 1080,
    frameHeight: 1350,
    reels: 3,
    rows: 3,
  })

  it('프레임을 컨테이너 폭에 맞추고 비율을 지킨다', () => {
    expect(framed.canvasWidth).toBeCloseTo(360, 9)
    expect(framed.scale).toBeCloseTo(1 / 3, 9)
    expect(framed.canvasHeight / framed.canvasWidth).toBeCloseTo(1350 / 1080, 9)
  })

  it('창은 캔버스 좌표계의 기본 분수 위치다', () => {
    expect(framed.window.x).toBeCloseTo(0.08 * framed.canvasWidth, 9)
    expect(framed.window.height).toBeCloseTo(0.46 * framed.canvasHeight, 9)
  })

  it('릴 레이아웃이 창 밖으로 나가지 않는다', () => {
    expect(framed.layout.width).toBeLessThanOrEqual(framed.window.width + 1e-9)
    expect(framed.layout.height).toBeLessThanOrEqual(framed.window.height + 1e-9)
    expect(framed.content.x).toBeGreaterThanOrEqual(framed.window.x - 1e-9)
    expect(framed.content.y).toBeGreaterThanOrEqual(framed.window.y - 1e-9)
    expect(framed.content.x + framed.layout.width).toBeLessThanOrEqual(framed.window.x + framed.window.width + 1e-9)
    expect(framed.content.y + framed.layout.height).toBeLessThanOrEqual(framed.window.y + framed.window.height + 1e-9)
  })

  it('남는 방향으로 가운데 정렬한다', () => {
    const leftGap = framed.content.x - framed.window.x
    const rightGap = framed.window.x + framed.window.width - (framed.content.x + framed.layout.width)
    expect(leftGap).toBeCloseTo(rightGap, 9)
  })

  it('창 안 레이아웃에는 벡터 베젤이 없다', () => {
    expect(framed.layout.padding).toBe(0)
    expect(framed.layout.border).toBe(0)
  })

  it('컨테이너 높이가 모자라면 높이에 맞춰 줄인다', () => {
    const short = computeFrameLayout({
      containerWidth: 360,
      containerHeight: 300,
      frameWidth: 1080,
      frameHeight: 1350,
      reels: 3,
      rows: 3,
    })
    expect(short.canvasHeight).toBeCloseTo(300, 9)
    expect(short.canvasWidth).toBeLessThan(360)
    expect(short.scale).toBeLessThan(framed.scale)
  })

  it('창을 직접 주면 그 자리를 쓴다', () => {
    const custom = computeFrameLayout({
      containerWidth: 400,
      frameWidth: 400,
      frameHeight: 400,
      window: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      reels: 3,
      rows: 3,
    })
    expect(custom.window).toEqual({ x: 100, y: 100, width: 200, height: 200 })
  })

  it('프레임 크기가 0 이하면 던진다', () => {
    expect(() =>
      computeFrameLayout({ containerWidth: 360, frameWidth: 0, frameHeight: 100, reels: 3, rows: 3 }),
    ).toThrow(RangeError)
  })
})
