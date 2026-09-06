import { describe, expect, it } from 'vitest'
import { NO_REEL_BACKDROP, planReelBackdrop } from './backdrop.js'
import {
  REEL_BACKDROP_ALPHA,
  REEL_BACKDROP_COLOR,
  REEL_BACKDROP_RADIUS_RATIO,
} from './constants.js'
import type { Rect } from './layout.js'

const AREA: Rect = { x: 12, y: 30, width: 300, height: 180 }
const SYMBOL = 60

describe('릴 창 뒤 패널', () => {
  it('테마가 아무 말도 안 하면 기본값으로 깐다', () => {
    const plan = planReelBackdrop(undefined, AREA, SYMBOL)
    expect(plan).toEqual({
      kind: 'panel',
      rect: AREA,
      color: REEL_BACKDROP_COLOR,
      alpha: REEL_BACKDROP_ALPHA,
      radius: SYMBOL * REEL_BACKDROP_RADIUS_RATIO,
    })
  })

  it('릴이 보이는 영역과 정확히 같은 사각형이다', () => {
    // 마스크와 어긋나면 판의 가장자리가 창 밖으로 비어져 나온다.
    const plan = planReelBackdrop({}, AREA, SYMBOL)
    expect(plan.kind === 'panel' && plan.rect).toEqual(AREA)
  })

  it('alpha 0이면 아예 그리지 않는다', () => {
    expect(planReelBackdrop({ alpha: 0 }, AREA, SYMBOL)).toBe(NO_REEL_BACKDROP)
  })

  it('테마 값이 기본값을 덮는다', () => {
    const plan = planReelBackdrop({ color: '#101820', alpha: 0.6, radius: 0.2 }, AREA, SYMBOL)
    expect(plan).toEqual({
      kind: 'panel',
      rect: AREA,
      color: '#101820',
      alpha: 0.6,
      radius: SYMBOL * 0.2,
    })
  })

  it('일부만 준 값은 나머지를 기본값으로 채운다', () => {
    const plan = planReelBackdrop({ alpha: 0.5 }, AREA, SYMBOL)
    expect(plan.kind === 'panel' && plan.color).toBe(REEL_BACKDROP_COLOR)
    expect(plan.kind === 'panel' && plan.radius).toBe(SYMBOL * REEL_BACKDROP_RADIUS_RATIO)
  })

  it('반경은 심볼 크기를 따라간다', () => {
    // 기기마다 창 크기가 달라도 모서리의 인상은 같아야 한다.
    const small = planReelBackdrop({}, AREA, 40)
    const large = planReelBackdrop({}, AREA, 80)
    expect(small.kind === 'panel' && small.radius).toBe(40 * REEL_BACKDROP_RADIUS_RATIO)
    expect(large.kind === 'panel' && large.radius).toBe(80 * REEL_BACKDROP_RADIUS_RATIO)
  })

  it('반경이 변의 절반을 넘지 않는다', () => {
    const narrow: Rect = { x: 0, y: 0, width: 20, height: 400 }
    const plan = planReelBackdrop({ radius: 1 }, narrow, 500)
    expect(plan.kind === 'panel' && plan.radius).toBe(10)
  })

  it('망가진 값은 기본값으로 되돌린다', () => {
    const plan = planReelBackdrop(
      { alpha: Number.NaN, radius: Number.POSITIVE_INFINITY },
      AREA,
      SYMBOL,
    )
    expect(plan.kind === 'panel' && plan.alpha).toBe(REEL_BACKDROP_ALPHA)
    expect(plan.kind === 'panel' && plan.radius).toBe(SYMBOL * REEL_BACKDROP_RADIUS_RATIO)
  })

  it('넓이가 없는 창에는 그리지 않는다', () => {
    expect(planReelBackdrop({}, { x: 0, y: 0, width: 0, height: 100 }, SYMBOL)).toBe(NO_REEL_BACKDROP)
    expect(planReelBackdrop({}, { x: 0, y: 0, width: 100, height: 0 }, SYMBOL)).toBe(NO_REEL_BACKDROP)
  })

  it('레이아웃이 바뀌면 사각형도 따라 바뀐다', () => {
    const resized: Rect = { x: 4, y: 8, width: 600, height: 360 }
    const plan = planReelBackdrop({}, resized, 120)
    expect(plan.kind === 'panel' && plan.rect).toEqual(resized)
  })
})

describe('릴 창 뒤 패널 — 안쪽 여백', () => {
  it('기본은 여백 없이 창과 같다', () => {
    const plan = planReelBackdrop({}, AREA, SYMBOL)
    expect(plan.kind === 'panel' && plan.rect).toEqual(AREA)
  })

  it('여백만큼 사방으로 좁아진다', () => {
    const plan = planReelBackdrop({ inset: 0.1 }, AREA, SYMBOL)
    const pad = SYMBOL * 0.1
    expect(plan.kind === 'panel' && plan.rect).toEqual({
      x: AREA.x + pad,
      y: AREA.y + pad,
      width: AREA.width - pad * 2,
      height: AREA.height - pad * 2,
    })
  })

  it('음수 여백은 반대로 넓힌다', () => {
    // 프레임 아트와 판 사이가 뜨는 게임은 베젤 아래까지 깔아야 한다.
    const plan = planReelBackdrop({ inset: -0.1 }, AREA, SYMBOL)
    const bleed = SYMBOL * 0.1
    expect(plan.kind === 'panel' && plan.rect).toEqual({
      x: AREA.x - bleed,
      y: AREA.y - bleed,
      width: AREA.width + bleed * 2,
      height: AREA.height + bleed * 2,
    })
  })

  it('여백이 창을 다 먹으면 그리지 않는다', () => {
    const tiny: Rect = { x: 0, y: 0, width: 40, height: 40 }
    expect(planReelBackdrop({ inset: 1 }, tiny, SYMBOL)).toBe(NO_REEL_BACKDROP)
  })

  it('반경은 좁아진 판을 기준으로 묶인다', () => {
    const narrow: Rect = { x: 0, y: 0, width: 100, height: 400 }
    // 여백 20을 빼면 폭이 60이므로 반경은 30을 넘지 못한다.
    const plan = planReelBackdrop({ inset: 0.25, radius: 1 }, narrow, 80)
    expect(plan.kind === 'panel' && plan.radius).toBe(30)
  })
})
