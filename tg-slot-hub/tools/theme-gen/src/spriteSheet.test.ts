import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processSheet } from './spriteSheet.js'

const COLS = 3
const ROWS = 3
const CELL = 30
const RED = { r: 255, g: 0, b: 0, alpha: 255 }
const BLUE = { r: 0, g: 0, b: 255, alpha: 255 }

/**
 * 3x3 콘택트시트(90x90, 셀 30x30). 8칸은 로컬(10,10)에 10x10 빨간 사각형,
 * 가운데(r1,c1) 한 칸만 로컬(5,5)에 20x20 파란 사각형 — 파란 칸의 bbox가 나머지를
 * 전부 포함하므로 합집합 bbox는 정확히 파란 칸의 bbox({x:5,y:5,w:20,h:20})가 돼야 한다.
 */
async function buildSyntheticSheetPng(): Promise<Buffer> {
  const composites: { input: Buffer; left: number; top: number }[] = []
  const redSquare = await sharp({ create: { width: 10, height: 10, channels: 4, background: RED } }).png().toBuffer()
  const blueSquare = await sharp({ create: { width: 20, height: 20, channels: 4, background: BLUE } }).png().toBuffer()

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (r === 1 && c === 1) {
        composites.push({ input: blueSquare, left: c * CELL + 5, top: r * CELL + 5 })
      } else {
        composites.push({ input: redSquare, left: c * CELL + 10, top: r * CELL + 10 })
      }
    }
  }

  return sharp({ create: { width: COLS * CELL, height: ROWS * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer()
}

describe('processSheet', () => {
  it('모든 프레임을 합집합 bbox로 잘라 같은 크기로 만든다', async () => {
    const input = await buildSyntheticSheetPng()
    const { json } = await processSheet(input, { cols: COLS, rows: ROWS, fps: 12, symbol: 'seven', outSize: COLS * 20 })

    // 합집합 bbox는 파란 칸의 bbox(20x20)와 같아야 한다 — outSize를 스케일 없는 크기로 줬으니 그대로 나온다.
    expect(json.frameW).toBe(20)
    expect(json.frameH).toBe(20)
    expect(json.frames).toHaveLength(9)
    for (const frame of json.frames) {
      expect(frame.w).toBe(20)
      expect(frame.h).toBe(20)
    }
  })

  it('아틀라스 JSON 모양이 TexturePacker류 미니멀 스키마와 일치한다', async () => {
    const input = await buildSyntheticSheetPng()
    const { json } = await processSheet(input, { cols: COLS, rows: ROWS, fps: 24, symbol: 'bell', outSize: 60 })

    expect(Object.keys(json).sort()).toEqual(['cols', 'count', 'fps', 'frameH', 'frameW', 'frames', 'rows', 'symbol'].sort())
    expect(json).toMatchObject({ cols: COLS, rows: ROWS, count: COLS * ROWS, fps: 24, symbol: 'bell' })
    for (const frame of json.frames) {
      expect(Object.keys(frame).sort()).toEqual(['h', 'w', 'x', 'y'])
    }
  })

  it('프레임을 row-major 순서로 격자에 빈틈없이 배치한다', async () => {
    const input = await buildSyntheticSheetPng()
    const { json } = await processSheet(input, { cols: COLS, rows: ROWS, fps: 12, symbol: 'seven', outSize: 60 })

    expect(json.frames[0]).toEqual({ x: 0, y: 0, w: 20, h: 20 })
    expect(json.frames[1]).toEqual({ x: 20, y: 0, w: 20, h: 20 })
    expect(json.frames[2]).toEqual({ x: 40, y: 0, w: 20, h: 20 })
    expect(json.frames[3]).toEqual({ x: 0, y: 20, w: 20, h: 20 })
    // frames[4] = (r1,c1), 파란 칸.
    expect(json.frames[4]).toEqual({ x: 20, y: 20, w: 20, h: 20 })
    expect(json.frames[8]).toEqual({ x: 40, y: 40, w: 20, h: 20 })
  })

  it('각 프레임에 원래 셀의 콘텐츠가 올바른 위치로 옮겨진다', async () => {
    const input = await buildSyntheticSheetPng()
    const { atlas, json } = await processSheet(input, { cols: COLS, rows: ROWS, fps: 12, symbol: 'seven', outSize: 60 })

    const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3] ?? -1
    const colorAt = (x: number, y: number): { r: number; g: number; b: number } => {
      const o = (y * info.width + x) * 4
      return { r: data[o] ?? -1, g: data[o + 1] ?? -1, b: data[o + 2] ?? -1 }
    }

    // frame 0(빨간 칸): 로컬 (10,10) 정사각형이 union bbox(x5,y5) 기준으로 (5,5)만큼 옮겨져야 한다.
    // 빨간 사각형은 프레임 안에서 (5,5)-(14,14)를 차지하니, 중심부인 (9,9)로 색을 확인한다.
    const frame0 = json.frames[0]
    if (frame0 === undefined) throw new Error('frame 0 없음')
    expect(alphaAt(frame0.x + 9, frame0.y + 9)).toBeGreaterThan(0)
    expect(colorAt(frame0.x + 9, frame0.y + 9).r).toBeGreaterThan(200)
    // 프레임의 왼쪽 위 구석(0,0)은 원래 빈 여백이라 투명해야 한다.
    expect(alphaAt(frame0.x + 0, frame0.y + 0)).toBe(0)

    // frame 4(파란 칸): union bbox와 정확히 일치해서 프레임 전체가 파란색이어야 한다.
    // 모서리 픽셀은 webp 손실 압축/리사이즈 경계 흐림이 섞일 수 있어 중심부로 색을 확인한다.
    const frame4 = json.frames[4]
    if (frame4 === undefined) throw new Error('frame 4 없음')
    expect(alphaAt(frame4.x + 0, frame4.y + 0)).toBeGreaterThan(0)
    expect(colorAt(frame4.x + 10, frame4.y + 10).b).toBeGreaterThan(200)
    expect(alphaAt(frame4.x + 19, frame4.y + 19)).toBeGreaterThan(0)
  })

  it('outSize로 리사이즈하면 frame 크기/좌표도 같은 비율로 스케일된다', async () => {
    const input = await buildSyntheticSheetPng()
    // native atlas 폭 = frameW(20) x cols(3) = 60. outSize 30이면 정확히 절반.
    const { json } = await processSheet(input, { cols: COLS, rows: ROWS, fps: 12, symbol: 'seven', outSize: 30 })

    expect(json.frameW).toBe(10)
    expect(json.frameH).toBe(10)
    expect(json.frames[1]).toEqual({ x: 10, y: 0, w: 10, h: 10 })
  })

  it('콘텐츠가 하나도 없으면(전부 투명) 셀 전체 크기로 대체한다', async () => {
    const blank = await sharp({ create: { width: 60, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    const { json } = await processSheet(blank, { cols: 2, rows: 2, fps: 12, symbol: 'blank', outSize: 60 })

    // 셀 크기 = 60/2 = 30.
    expect(json.frameW).toBe(30)
    expect(json.frameH).toBe(30)
  })
})

/**
 * 모든 셀에 같은 위치·크기의 불투명 사각형을 둔 콘택트시트. 모든 셀 bbox가 동일하므로
 * 합집합도 그대로 그 bbox가 되어, frameW/frameH를 원하는 값으로 정확히 지정할 수 있다.
 */
async function buildUniformContentSheet(
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  contentX: number,
  contentY: number,
  contentW: number,
  contentH: number,
): Promise<Buffer> {
  const content = await sharp({ create: { width: contentW, height: contentH, channels: 4, background: { r: 200, g: 60, b: 30, alpha: 255 } } })
    .png()
    .toBuffer()
  const composites: { input: Buffer; left: number; top: number }[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      composites.push({ input: content, left: c * cellW + contentX, top: r * cellH + contentY })
    }
  }
  return sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer()
}

describe('processSheet — 아틀라스 픽셀 크기가 JSON 크기와 항상 일치한다', () => {
  it('리뷰에서 지적된 반올림 불일치 재현 케이스 (frameW 50, frameH 61, cols 1, rows 2, outSize 248)', async () => {
    const input = await buildUniformContentSheet(1, 2, 60, 70, 5, 5, 50, 61)
    const { atlas, json } = await processSheet(input, { cols: 1, rows: 2, fps: 12, symbol: 'seven', outSize: 248 })

    // 리뷰가 짚은 그대로: 반올림하면 frameH*rows가 606이 되는 조합.
    expect(json.frameH * json.rows).toBe(606)

    const meta = await sharp(atlas).metadata()
    expect(meta.width).toBe(json.frameW * json.cols)
    expect(meta.height).toBe(json.frameH * json.rows)
  })

  it.each([
    { cols: 1, rows: 2, cellW: 60, cellH: 70, contentW: 50, contentH: 61, outSize: 248 },
    { cols: 3, rows: 2, cellW: 40, cellH: 55, contentW: 33, contentH: 47, outSize: 97 },
    { cols: 5, rows: 1, cellW: 20, cellH: 20, contentW: 17, contentH: 19, outSize: 91 },
    { cols: 2, rows: 4, cellW: 25, cellH: 15, contentW: 21, contentH: 13, outSize: 63 },
    { cols: 4, rows: 3, cellW: 18, cellH: 22, contentW: 13, contentH: 17, outSize: 53 },
    { cols: 1, rows: 1, cellW: 10, cellH: 10, contentW: 9, contentH: 9, outSize: 7 },
  ])(
    '$cols x $rows 격자, outSize=$outSize: 이미지 픽셀 크기가 frameW*cols x frameH*rows와 정확히 같다',
    async ({ cols, rows, cellW, cellH, contentW, contentH, outSize }) => {
      const input = await buildUniformContentSheet(cols, rows, cellW, cellH, 1, 1, contentW, contentH)
      const { atlas, json } = await processSheet(input, { cols, rows, fps: 12, symbol: 's', outSize })

      const meta = await sharp(atlas).metadata()
      expect(meta.width).toBe(json.frameW * json.cols)
      expect(meta.height).toBe(json.frameH * json.rows)
      // 프레임 자체도 JSON이 말하는 크기와 같아야 한다(패딩 없는 타이트 팩킹).
      for (const frame of json.frames) {
        expect(frame.w).toBe(json.frameW)
        expect(frame.h).toBe(json.frameH)
      }
    },
  )
})
