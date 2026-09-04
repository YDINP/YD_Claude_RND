import { describe, expect, it } from 'vitest'
import { DEFAULT_OVERFLOW_X, MAX_SYMBOL_SIZE, MIN_SYMBOL_SIZE } from './constants.js'
import {
  cellPitch,
  computeFrameLayout,
  computeLayout,
  computeWindowFitLayout,
  frameWindowRect,
  paylinePoints,
  positionRects,
  reelLeft,
  rowTop,
  symbolCenter,
} from './layout.js'
import { parseTheme } from './theme.js'
import { loadGameMath, loadThemeJson } from './testSupport.js'

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

describe('computeWindowFitLayout', () => {
  // classic-777 실물: 프레임 1080x1620, theme-gen이 실측한 창.
  const FRAME = { width: 1080, height: 1620 }
  const WINDOW = { x: 0.11890625, y: 0.2329166666666667, w: 0.7621875, h: 0.42218750000000005 }

  function fitTo(containerWidth: number, containerHeight: number, overflowX?: number) {
    return computeWindowFitLayout({
      containerWidth,
      containerHeight,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window: WINDOW,
      reels: 3,
      rows: 3,
      ...(overflowX === undefined ? {} : { overflowX }),
    })
  }

  describe('390x760 실기기 기준', () => {
    const fit = fitTo(390, 760)

    it('캔버스는 언제나 컨테이너 전체다', () => {
      expect(fit.canvasWidth).toBe(390)
      expect(fit.canvasHeight).toBe(760)
    })

    it('창 오른쪽 끝이 컨테이너 폭을 넘지 않는다', () => {
      expect(fit.window.x).toBeGreaterThanOrEqual(0)
      expect(fit.window.x + fit.window.width).toBeLessThanOrEqual(390)
    })

    it('프레임이 좌우로 잘리지 않는다', () => {
      // 사용자 피드백: 양옆이 잘려 보였다. 이제 프레임 전체가 컨테이너 폭 안에 들어온다.
      expect(fit.frameRect.x).toBeGreaterThanOrEqual(-1e-6)
      expect(fit.frameRect.x + fit.frameRect.width).toBeLessThanOrEqual(390 + 1e-6)
    })

    it('창은 프레임 안에서 자기 몫만 차지한다', () => {
      // 창이 컨테이너 폭을 다 채우던 예전 값(0.98배)은 프레임을 밖으로 밀어내야만 나왔다.
      expect(fit.window.width).toBeCloseTo(390 * WINDOW.w, 6)
    })

    it('프레임이 세로로 다 들어와 마퀴와 레전드가 잘리지 않는다', () => {
      expect(fit.frameFitsVertically).toBe(true)
      expect(fit.frameRect.y).toBeGreaterThanOrEqual(0)
      expect(fit.frameRect.y + fit.frameRect.height).toBeLessThanOrEqual(760 + 1e-9)
    })

    it('가로 가운데를 맞추는 것은 프레임이 아니라 창이다', () => {
      // 아트의 창이 프레임 정중앙이 아닐 수 있어 창 기준으로 맞춘다.
      expect(fit.window.x + fit.window.width / 2).toBeCloseTo(195, 9)
      // 이 아트는 창이 정중앙이라 프레임도 자연히 왼쪽 끝에 붙는다.
      expect(fit.frameRect.x).toBeCloseTo(0, 6)
    })

    it('창이 정중앙인 아트에서는 폭 맞춤과 같은 배율이 된다', () => {
      // 잘림을 허용하지 않으면 "프레임 전체가 폭에 들어간다"가 두 방식 모두의 상한이 된다.
      // 창이 한쪽으로 치우친 아트에서만 두 방식의 세로 배치가 갈린다.
      const byWidth = computeFrameLayout({
        containerWidth: 390,
        containerHeight: 760,
        frameWidth: FRAME.width,
        frameHeight: FRAME.height,
        window: WINDOW,
        reels: 3,
        rows: 3,
      })
      expect(fit.layout.symbolSize).toBeCloseTo(byWidth.layout.symbolSize, 6)
    })

    it('심볼이 75px을 넘는다', () => {
      // 실측 79.2px. 프레임을 좌우로 자르지 않기로 하면서 예전 102.8px에서 내려왔다 —
      // 창 폭이 390이 아니라 390 x 0.762 = 297.2로 줄고 그만큼 격자도 작아진다.
      // 더 키우려면 좌우를 다시 잘라야 한다(`overflowX`를 0보다 크게).
      expect(fit.layout.symbolSize).toBeGreaterThan(75)
    })

    it('릴이 세로에 묶이고 가로로는 여유가 남는다', () => {
      expect(fit.layout.height).toBeCloseTo(fit.window.height, 6)
      expect(fit.layout.width).toBeLessThan(fit.window.width)
    })

    it('컨테이너 세로에는 여백이 남는다', () => {
      // 잘리지 않는 대신 위아래가 남는다. 의도된 절충이다.
      expect(fit.frameRect.height).toBeLessThan(760)
    })
  })

  describe('overflowX', () => {
    it('기본값은 0이다', () => {
      expect(DEFAULT_OVERFLOW_X).toBe(0)
      expect(fitTo(390, 2000)).toEqual(fitTo(390, 2000, DEFAULT_OVERFLOW_X))
    })

    it('기본값에서는 프레임 폭이 컨테이너 폭과 같아진다', () => {
      // 세로를 넉넉히 줘서 폭 항이 이기게 만든다. 넘치지 않는 최대가 곧 컨테이너 폭이다.
      const fit = fitTo(390, 2000)
      expect(fit.frameRect.width).toBeCloseTo(390, 6)
      expect(fit.window.width).toBeCloseTo(390 * WINDOW.w, 6)
    })

    it('허용치를 주면 그만큼만 넘친다', () => {
      const fit = fitTo(390, 2000, 0.4)
      expect(fit.frameRect.width).toBeGreaterThan(390)
      expect(fit.frameRect.width).toBeLessThanOrEqual(390 * 1.4 + 1e-9)
    })

    it('키우면 창이 커지고 더 많이 잘린다', () => {
      const small = fitTo(390, 2000, 0.1)
      const large = fitTo(390, 2000, 0.5)
      expect(large.window.width).toBeGreaterThan(small.window.width)
      expect(large.layout.symbolSize).toBeGreaterThan(small.layout.symbolSize)
      expect(large.frameRect.x).toBeLessThan(small.frameRect.x)
    })

    it('0이면 프레임이 폭에 딱 맞는다', () => {
      expect(fitTo(390, 2000, 0).frameRect.width).toBeCloseTo(390, 9)
    })

    it('음수는 0으로 본다', () => {
      expect(fitTo(390, 2000, -1)).toEqual(fitTo(390, 2000, 0))
    })
  })

  describe('세로 배치', () => {
    it('높이를 잰 컨테이너에서는 프레임이 세로로 절대 넘치지 않는다', () => {
      // scale이 containerH / frameH로 묶여 있어 구조적으로 보장된다.
      for (const height of [300, 500, 760, 844, 1200]) {
        const fit = fitTo(390, height)
        expect(fit.frameFitsVertically).toBe(true)
        expect(fit.frameRect.height).toBeLessThanOrEqual(height + 1e-9)
      }
    })

    it('높이를 못 잰 동안에는 창을 세로 가운데 기준으로 잡는다', () => {
      // 프레임이 컨테이너보다 커질 수 있는 유일한 경우다. 창이 화면 밖으로 나가지 않게 한다.
      const fit = fitTo(390, 0)
      expect(fit.frameFitsVertically).toBe(false)
      expect(fit.window.y + fit.window.height / 2).toBeCloseTo(0, 9)
    })

    it('프레임이 들어가면 프레임 전체를 세로 가운데에 둔다', () => {
      const fit = fitTo(390, 1200)
      expect(fit.frameFitsVertically).toBe(true)
      expect(fit.frameRect.y + fit.frameRect.height / 2).toBeCloseTo(600, 9)
    })

    it('세로가 짧으면 높이가 배율을 정한다', () => {
      // 390x500은 폭(390/1080)보다 높이(500/1620)가 더 빡빡하다.
      const fit = fitTo(390, 500)
      expect(fit.frameRect.height).toBeCloseTo(500, 6)
      expect(fit.scale).toBeCloseTo(500 / FRAME.height, 9)
    })

    it('세로가 넉넉하면 폭이 배율을 정한다', () => {
      const fit = fitTo(390, 760)
      expect(fit.frameRect.width).toBeCloseTo(390, 6)
      expect(fit.scale).toBeCloseTo(390 / FRAME.width, 9)
    })

    it('높이를 못 재면 폭만으로 정한다', () => {
      const fit = fitTo(390, 0)
      const byWindow = 390 / (WINDOW.w * FRAME.width)
      const byOverflow = (390 * (1 + DEFAULT_OVERFLOW_X)) / FRAME.width
      expect(fit.scale).toBeCloseTo(Math.min(byWindow, byOverflow), 9)
    })
  })

  describe('공통', () => {
    const fit = fitTo(390, 760)

    it('프레임 비율을 지킨다', () => {
      expect(fit.frameRect.height / fit.frameRect.width).toBeCloseTo(FRAME.height / FRAME.width, 9)
    })

    it('창은 프레임 안의 같은 분수 위치를 가리킨다', () => {
      expect(fit.window.x - fit.frameRect.x).toBeCloseTo(WINDOW.x * fit.frameRect.width, 9)
      expect(fit.window.y - fit.frameRect.y).toBeCloseTo(WINDOW.y * fit.frameRect.height, 9)
      expect(fit.window.width).toBeCloseTo(WINDOW.w * fit.frameRect.width, 9)
    })

    it('릴 레이아웃이 창 안에 들어가고 가운데 정렬된다', () => {
      expect(fit.layout.width).toBeLessThanOrEqual(fit.window.width + 1e-9)
      expect(fit.layout.height).toBeLessThanOrEqual(fit.window.height + 1e-9)
      const leftGap = fit.content.x - fit.window.x
      const rightGap = fit.window.x + fit.window.width - (fit.content.x + fit.layout.width)
      expect(leftGap).toBeCloseTo(rightGap, 9)
    })

    it('창 안 레이아웃에는 벡터 베젤이 없다', () => {
      expect(fit.layout.padding).toBe(0)
      expect(fit.layout.border).toBe(0)
    })

    it('기본 창 분수도 쓸 수 있다', () => {
      const fallback = computeWindowFitLayout({
        containerWidth: 390,
        containerHeight: 760,
        frameWidth: FRAME.width,
        frameHeight: FRAME.height,
        reels: 3,
        rows: 3,
      })
      expect(fallback.window.width / fallback.frameRect.width).toBeCloseTo(0.84, 9)
    })

    it('프레임 크기가 0 이하면 던진다', () => {
      expect(() =>
        computeWindowFitLayout({
          containerWidth: 390,
          containerHeight: 760,
          frameWidth: 0,
          frameHeight: 100,
          reels: 3,
          rows: 3,
        }),
      ).toThrow(RangeError)
    })
  })
})

describe('computeWindowFitLayout — 실제 배포 아트', () => {
  // 합성 픽스처가 아니라 games/classic-777이 지금 들고 있는 값으로 잰다.
  // 아트가 다시 생성되면 이 수치가 따라 움직인다.
  const shipped = parseTheme(loadThemeJson('classic-777'), '/games/classic-777')
  const window = shipped.frameLayout?.window

  function fit(containerWidth: number, containerHeight: number) {
    return computeWindowFitLayout({
      containerWidth,
      containerHeight,
      frameWidth: 1080,
      frameHeight: 1620,
      ...(window === undefined ? {} : { window }),
      reels: 3,
      rows: 3,
    })
  }

  it('390x760에서 심볼이 75px을 넘는다', () => {
    // 좌우를 자르지 않기로 하면서 110px대에서 내려왔다. 실측 79.2px.
    expect(fit(390, 760).layout.symbolSize).toBeGreaterThan(75)
  })

  it('작은 기기(360x640)에서도 70px을 넘는다', () => {
    expect(fit(360, 640).layout.symbolSize).toBeGreaterThan(70)
  })

  it('어느 기기에서도 프레임이 좌우로 잘리지 않는다', () => {
    for (const [w, h] of [
      [390, 760],
      [390, 844],
      [360, 640],
      [430, 932],
      [320, 568],
    ]) {
      const result = fit(w ?? 0, h ?? 0)
      expect(result.frameRect.x).toBeGreaterThanOrEqual(-1e-6)
      expect(result.frameRect.x + result.frameRect.width).toBeLessThanOrEqual((w ?? 0) + 1e-6)
    }
  })

  it('큰 기기(430x932)에서 더 커진다', () => {
    expect(fit(430, 932).layout.symbolSize).toBeGreaterThan(fit(390, 760).layout.symbolSize)
  })

  it('창이 컨테이너 폭 안에 들어온다', () => {
    for (const [w, h] of [
      [390, 760],
      [390, 844],
      [360, 640],
      [430, 932],
    ]) {
      const result = fit(w ?? 0, h ?? 0)
      expect(result.window.x).toBeGreaterThanOrEqual(0)
      expect(result.window.x + result.window.width).toBeLessThanOrEqual((w ?? 0) + 1e-9)
    }
  })

  it('프레임이 세로로 잘리지 않는다', () => {
    for (const [w, h] of [
      [390, 760],
      [390, 844],
      [430, 932],
    ]) {
      const result = fit(w ?? 0, h ?? 0)
      expect(result.frameFitsVertically).toBe(true)
      expect(result.frameRect.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('격자가 창의 짧은 쪽에 묶인다', () => {
    const result = fit(390, 760)
    const fitsWidth = Math.abs(result.layout.width - result.window.width) < 1e-6
    const fitsHeight = Math.abs(result.layout.height - result.window.height) < 1e-6
    expect(fitsWidth || fitsHeight).toBe(true)
  })
})

describe('5x3 + 가로로 넓은 창 (fruit-fiesta 대비)', () => {
  // 아직 게임 팩이 없어 합성 픽스처로 잰다. 창은 기획대로 x 6~94%, y 22~70%.
  const FRAME = { width: 1080, height: 1620 }
  const WIDE = { x: 0.06, y: 0.22, w: 0.88, h: 0.48 }

  function fit(containerWidth: number, containerHeight: number) {
    return computeWindowFitLayout({
      containerWidth,
      containerHeight,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window: WIDE,
      reels: 5,
      rows: 3,
    })
  }

  const layout = fit(390, 760).layout

  it('심볼이 정사각형이다', () => {
    // 한 변 하나로 가로세로를 모두 잡으므로 비율이 틀어질 수 없다.
    const cell = layout.reelArea.width - (layout.reels - 1) * layout.gap
    expect(cell / layout.reels).toBeCloseTo(layout.symbolSize, 9)
    expect(layout.reelArea.height).toBeCloseTo(3 * layout.symbolSize + 2 * layout.gap, 9)
  })

  it('격자가 폭에 묶이고 세로로 여유가 남는다', () => {
    // 5x3 격자는 가로로 길어 넓은 창에서도 폭이 먼저 찬다.
    const result = fit(390, 760)
    expect(result.layout.width).toBeCloseTo(result.window.width, 6)
    expect(result.layout.height).toBeLessThan(result.window.height)
  })

  it('릴 5개와 행 3개가 모두 창 안에 들어간다', () => {
    const result = fit(390, 760)
    expect(result.layout.reels).toBe(5)
    expect(result.layout.rows).toBe(3)
    expect(result.layout.width).toBeLessThanOrEqual(result.window.width + 1e-9)
    expect(result.layout.height).toBeLessThanOrEqual(result.window.height + 1e-9)
  })

  it('모든 셀 중심이 창 안에 있다', () => {
    const result = fit(390, 760)
    for (let reel = 0; reel < 5; reel += 1) {
      for (let row = 0; row < 3; row += 1) {
        const center = symbolCenter(result.layout, reel, row)
        expect(center.x).toBeGreaterThan(0)
        expect(center.x).toBeLessThan(result.layout.width)
        expect(center.y).toBeGreaterThan(0)
        expect(center.y).toBeLessThan(result.layout.height)
      }
    }
  })

  it('20라인짜리 대각선도 꼭짓점이 5개다', () => {
    expect(paylinePoints(layout, [0, 1, 2, 1, 0])).toHaveLength(5)
  })

  it('창이 격자보다 더 납작하면 그때는 세로가 묶는다', () => {
    // 5x3 격자 자체의 비율은 약 1.68이다. 창이 그보다 더 넓어야 높이가 먼저 찬다.
    // 아래 창은 비율 2.0이라 세로가 기준이 된다.
    const flat = computeWindowFitLayout({
      containerWidth: 390,
      containerHeight: 760,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window: { x: 0.05, y: 0.3, w: 0.9, h: 0.3 },
      reels: 5,
      rows: 3,
    })
    expect(flat.layout.height).toBeCloseTo(flat.window.height, 6)
    expect(flat.layout.width).toBeLessThan(flat.window.width)
  })

  it('기획된 넓은 창(0.88 x 0.48)에서는 폭이 묶는다', () => {
    // 창 비율 1.22 < 격자 비율 1.68이라 가로가 먼저 찬다.
    const windowAspect = (WIDE.w * FRAME.width) / (WIDE.h * FRAME.height)
    const gridAspect = (5 + 4 * 0.06) / (3 + 2 * 0.06)
    expect(windowAspect).toBeLessThan(gridAspect)
  })

  it('넓은 창이 좁은 창보다 심볼을 크게 만든다', () => {
    const narrow = computeWindowFitLayout({
      containerWidth: 390,
      containerHeight: 760,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window: { x: 0.3, y: 0.22, w: 0.4, h: 0.48 },
      reels: 5,
      rows: 3,
    })
    expect(layout.symbolSize).toBeGreaterThan(narrow.layout.symbolSize)
  })

  it('5x3이 3x3보다 심볼이 작다', () => {
    const threeByThree = computeWindowFitLayout({
      containerWidth: 390,
      containerHeight: 760,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window: WIDE,
      reels: 3,
      rows: 3,
    })
    expect(layout.symbolSize).toBeLessThan(threeByThree.layout.symbolSize)
  })

  it('프레임은 여전히 세로로 잘리지 않는다', () => {
    for (const [w, h] of [
      [390, 760],
      [390, 844],
      [430, 932],
    ]) {
      const result = fit(w ?? 0, h ?? 0)
      expect(result.frameFitsVertically).toBe(true)
    }
  })
})

describe('프레임은 좌우로 잘리지 않는다', () => {
  const FRAME = { width: 1080, height: 1620 }

  function fitWith(window: { x: number; y: number; w: number; h: number }, ch = 760) {
    return computeWindowFitLayout({
      containerWidth: 390,
      containerHeight: ch,
      frameWidth: FRAME.width,
      frameHeight: FRAME.height,
      window,
      reels: 3,
      rows: 3,
    })
  }

  it('기본 넘침 허용치가 0이다', () => {
    expect(DEFAULT_OVERFLOW_X).toBe(0)
  })

  it('세로가 넉넉하면 프레임 폭이 컨테이너 폭과 같아진다', () => {
    // 세로 제약을 풀면 "잘리지 않는 최대"가 그대로 이긴다.
    const fit = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.63 }, 4000)
    expect(fit.frameRect.width).toBeCloseTo(390, 6)
    expect(fit.frameRect.x).toBeCloseTo(0, 6)
    expect(fit.window.width).toBeCloseTo(390 * 0.72, 6)
  })

  it('어떤 창 비율에서도 프레임이 컨테이너 폭 안에 있다', () => {
    for (const w of [0.5, 0.72, 0.88, 0.95]) {
      for (const ch of [400, 760, 4000]) {
        const fit = fitWith({ x: (1 - w) / 2, y: 0.18, w, h: 0.63 }, ch)
        expect(fit.frameRect.x).toBeGreaterThanOrEqual(-1e-6)
        expect(fit.frameRect.x + fit.frameRect.width).toBeLessThanOrEqual(390 + 1e-6)
      }
    }
  })

  it('창이 한쪽으로 치우친 아트도 잘리지 않는다', () => {
    // 창을 가운데 두면 프레임이 반대쪽으로 밀린다. 그만큼 배율을 더 줄여야 한다.
    for (const window of [
      { x: 0.02, y: 0.18, w: 0.6, h: 0.63 },
      { x: 0.3, y: 0.18, w: 0.6, h: 0.63 },
      { x: 0.0, y: 0.18, w: 0.5, h: 0.63 },
    ]) {
      for (const ch of [400, 760, 4000]) {
        const fit = fitWith(window, ch)
        expect(fit.frameRect.x).toBeGreaterThanOrEqual(-1e-6)
        expect(fit.frameRect.x + fit.frameRect.width).toBeLessThanOrEqual(390 + 1e-6)
        // 창은 여전히 가로 가운데다.
        expect(fit.window.x + fit.window.width / 2).toBeCloseTo(195, 6)
      }
    }
  })

  it('창이 컨테이너 폭을 절대 넘지 않는다', () => {
    for (const w of [0.5, 0.72, 0.88, 0.95]) {
      const fit = fitWith({ x: (1 - w) / 2, y: 0.18, w, h: 0.63 }, 4000)
      expect(fit.window.width).toBeLessThanOrEqual(390 + 1e-6)
    }
  })

  it('창이 좁아도 프레임은 더 커지지 않는다', () => {
    // 예전에는 창을 채우려고 좁은 창일수록 프레임을 키워 더 많이 잘라냈다.
    const narrow = fitWith({ x: 0.25, y: 0.18, w: 0.5, h: 0.63 }, 4000)
    const wide = fitWith({ x: 0.06, y: 0.18, w: 0.88, h: 0.63 }, 4000)
    expect(narrow.frameRect.width).toBeCloseTo(wide.frameRect.width, 6)
    expect(narrow.window.width).toBeLessThan(wide.window.width)
  })

  it('세로 규칙은 그대로라 프레임이 잘리지 않는다', () => {
    const fit = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.63 })
    expect(fit.frameFitsVertically).toBe(true)
    expect(fit.frameRect.y).toBeGreaterThanOrEqual(0)
  })

  it('세로가 빡빡하면 세로가 이겨 프레임이 더 작아진다', () => {
    // 390x400이면 높이(400/1620)가 폭(390/1080)보다 빡빡하다.
    const fit = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.63 }, 400)
    expect(fit.scale).toBeCloseTo(400 / FRAME.height, 9)
    expect(fit.frameRect.width).toBeLessThan(390)
  })

  it('창은 언제나 컨테이너 폭보다 좁다', () => {
    // 잘림을 허용하지 않으면 창은 프레임 안의 자기 몫만 가져간다.
    const fit = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.63 }, 4000)
    expect(fit.window.width).toBeLessThan(390)
  })

  it('창이 세로로 커진 아트에서 심볼이 더 커진다', () => {
    const short = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.42 })
    const tall = fitWith({ x: 0.14, y: 0.18, w: 0.72, h: 0.72 })
    expect(tall.layout.symbolSize).toBeGreaterThan(short.layout.symbolSize)
  })
})
