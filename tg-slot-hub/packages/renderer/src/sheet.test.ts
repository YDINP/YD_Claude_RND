import { describe, expect, it } from 'vitest'
import { resolveFxEffect, type ResolvedFxEffect } from './fx.js'
import {
  atlasUrlFor,
  isSheetOnly,
  parseSpriteSheet,
  planSheetFx,
  sheetAnimationSpeed,
  sheetDurationMs,
  sheetFrameIndexAt,
  sheetFrameMs,
  sheetScaleFor,
  SheetError,
} from './sheet.js'

function makeSheet(overrides: Record<string, unknown> = {}): unknown {
  return {
    frameW: 256,
    frameH: 256,
    cols: 4,
    rows: 2,
    count: 8,
    fps: 24,
    symbol: 'seven',
    frames: Array.from({ length: 8 }, (_, i) => ({
      x: (i % 4) * 256,
      y: Math.floor(i / 4) * 256,
      w: 256,
      h: 256,
    })),
    ...overrides,
  }
}

describe('parseSpriteSheet', () => {
  it('올바른 시트를 통과시킨다', () => {
    const sheet = parseSpriteSheet(makeSheet())
    expect(sheet.count).toBe(8)
    expect(sheet.frames).toHaveLength(8)
    expect(sheet.symbol).toBe('seven')
  })

  it('count와 frames 개수가 다르면 던진다', () => {
    expect(() => parseSpriteSheet(makeSheet({ count: 7 }))).toThrow(SheetError)
  })

  it('count가 격자 용량을 넘으면 던진다', () => {
    expect(() => parseSpriteSheet(makeSheet({ cols: 2, rows: 2 }))).toThrow(/용량/)
  })

  it('프레임이 아틀라스 오른쪽을 넘으면 던진다', () => {
    const frames = makeSheet() as { frames: { x: number }[] }
    frames.frames[0] = { ...frames.frames[0], x: 900 } as { x: number }
    expect(() => parseSpriteSheet(frames)).toThrow(SheetError)
  })

  it('프레임이 아틀라스 아래를 넘으면 던진다', () => {
    const sheet = makeSheet() as { frames: { y: number }[] }
    sheet.frames[0] = { ...sheet.frames[0], y: 600 } as { y: number }
    expect(() => parseSpriteSheet(sheet)).toThrow(SheetError)
  })

  it('크기가 0 이하면 던진다', () => {
    expect(() => parseSpriteSheet(makeSheet({ frameW: 0 }))).toThrow(SheetError)
    expect(() => parseSpriteSheet(makeSheet({ fps: 0 }))).toThrow(SheetError)
  })

  it('프레임이 하나도 없으면 던진다', () => {
    expect(() => parseSpriteSheet(makeSheet({ frames: [], count: 0 }))).toThrow(SheetError)
  })

  it('심볼 id가 비면 던진다', () => {
    expect(() => parseSpriteSheet(makeSheet({ symbol: '' }))).toThrow(SheetError)
  })

  it('프레임이 격자보다 작아도 된다', () => {
    // 트림된 아틀라스. 칸 안에만 들어가면 된다.
    const trimmed = makeSheet({
      frames: Array.from({ length: 8 }, (_, i) => ({
        x: (i % 4) * 256,
        y: Math.floor(i / 4) * 256,
        w: 200,
        h: 180,
      })),
    })
    expect(() => parseSpriteSheet(trimmed)).not.toThrow()
  })
})

describe('atlasUrlFor', () => {
  it('사이드카 경로의 확장자만 바꾼다', () => {
    expect(atlasUrlFor('/games/x/theme/sheets/seven.json')).toBe('/games/x/theme/sheets/seven.webp')
  })

  it('대문자 확장자도 처리한다', () => {
    expect(atlasUrlFor('/a/b.JSON')).toBe('/a/b.webp')
  })

  it('경로 안의 다른 json은 건드리지 않는다', () => {
    expect(atlasUrlFor('/json/data/seven.json')).toBe('/json/data/seven.webp')
  })
})

describe('시트 타이밍', () => {
  const sheet = { fps: 24, count: 8, frameW: 256 }

  it('프레임 하나의 길이가 fps의 역수다', () => {
    expect(sheetFrameMs(sheet)).toBeCloseTo(1000 / 24, 9)
  })

  it('한 바퀴 길이는 프레임 수 나누기 fps다', () => {
    expect(sheetDurationMs(sheet)).toBeCloseTo((8 / 24) * 1000, 9)
  })

  it('시작하면 0번 프레임이다', () => {
    expect(sheetFrameIndexAt(sheet, 0)).toBe(0)
    expect(sheetFrameIndexAt(sheet, -100)).toBe(0)
  })

  it('프레임 길이만큼 지나면 다음 프레임이다', () => {
    expect(sheetFrameIndexAt(sheet, sheetFrameMs(sheet))).toBe(1)
    expect(sheetFrameIndexAt(sheet, sheetFrameMs(sheet) * 3.9)).toBe(3)
  })

  it('반복이면 끝에서 처음으로 돌아온다', () => {
    expect(sheetFrameIndexAt(sheet, sheetDurationMs(sheet))).toBe(0)
    expect(sheetFrameIndexAt(sheet, sheetDurationMs(sheet) * 2 + sheetFrameMs(sheet))).toBe(1)
  })

  it('반복이 아니면 마지막 프레임에 머문다', () => {
    expect(sheetFrameIndexAt(sheet, sheetDurationMs(sheet) * 5, false)).toBe(7)
  })

  it('언제나 유효한 프레임 번호를 낸다', () => {
    for (let t = 0; t < 2000; t += 7) {
      const index = sheetFrameIndexAt(sheet, t)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(sheet.count)
    }
  })

  it('60fps 기준 재생 속도로 환산한다', () => {
    expect(sheetAnimationSpeed({ fps: 60 })).toBe(1)
    expect(sheetAnimationSpeed({ fps: 24 })).toBeCloseTo(0.4, 9)
  })
})

describe('sheetScaleFor', () => {
  it('심볼 폭을 frameW에 맞춘다', () => {
    expect(sheetScaleFor({ frameW: 256 }, 128)).toBe(0.5)
    expect(sheetScaleFor({ frameW: 256 }, 256)).toBe(1)
  })

  it('심볼이 크면 확대한다', () => {
    expect(sheetScaleFor({ frameW: 100 }, 250)).toBe(2.5)
  })

  it('frameW가 0 이하면 던진다', () => {
    expect(() => sheetScaleFor({ frameW: 0 }, 128)).toThrow(RangeError)
  })
})

describe('planSheetFx', () => {
  const pulse = resolveFxEffect({ type: 'pulse' })
  const glow = resolveFxEffect({ type: 'glow' })
  const sheet = resolveFxEffect({ type: 'sheet' })
  const fallback: ResolvedFxEffect[] = [pulse]

  it('시트가 있으면 재생하고 나머지를 위에 겹친다', () => {
    const plan = planSheetFx([pulse, glow], true, fallback)
    expect(plan.useSheet).toBe(true)
    expect(plan.procedural.map((e) => e.type)).toEqual(['pulse', 'glow'])
  })

  it('시트 전용 선언이면 절차적 효과가 남지 않는다', () => {
    const plan = planSheetFx([sheet], true, fallback)
    expect(plan.useSheet).toBe(true)
    expect(plan.procedural).toEqual([])
  })

  it('sheet 항목은 절차적 목록에서 빠진다', () => {
    const plan = planSheetFx([sheet, glow], true, fallback)
    expect(plan.procedural.map((e) => e.type)).toEqual(['glow'])
  })

  it('시트를 못 쓰면 적어 둔 절차적 효과로 돌아간다', () => {
    const plan = planSheetFx([pulse, glow], false, fallback)
    expect(plan.useSheet).toBe(false)
    expect(plan.procedural.map((e) => e.type)).toEqual(['pulse', 'glow'])
  })

  it('시트 전용인데 시트를 못 쓰면 폴백을 쓴다', () => {
    // 아무 연출도 못 받는 심볼이 생기면 안 된다.
    const plan = planSheetFx([sheet], false, fallback)
    expect(plan.useSheet).toBe(false)
    expect(plan.procedural.map((e) => e.type)).toEqual(['pulse'])
  })

  it('연출 없음은 시트가 없어도 없음 그대로다', () => {
    const plan = planSheetFx([], false, fallback)
    expect(plan.useSheet).toBe(false)
    expect(plan.procedural).toEqual([])
  })

  it('폴백을 복사해 돌려준다', () => {
    const plan = planSheetFx([sheet], false, fallback)
    expect(plan.procedural).not.toBe(fallback)
  })
})

describe('isSheetOnly', () => {
  const pulse = resolveFxEffect({ type: 'pulse' })
  const sheet = resolveFxEffect({ type: 'sheet' })

  it('sheet만 있으면 참이다', () => {
    expect(isSheetOnly([sheet])).toBe(true)
  })

  it('다른 효과가 섞여 있으면 거짓이다', () => {
    expect(isSheetOnly([sheet, pulse])).toBe(false)
  })

  it('비어 있으면 거짓이다', () => {
    expect(isSheetOnly([])).toBe(false)
  })
})
