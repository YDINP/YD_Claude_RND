import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PULSE_MS,
  FX_DEFAULT_BOUNCE_PX,
  FX_DEFAULT_BURST_PARTICLES,
  FX_DEFAULT_DURATION_MS,
  FX_DEFAULT_GLOW_COLOR,
  FX_DEFAULT_PULSE_SCALE,
  FX_DEFAULT_SHINE_ANGLE,
  FX_DEFAULT_SEGMENTS,
  FX_DEFAULT_WOBBLE_DEGREES,
  FX_MAX_BURST_PARTICLES,
  FX_MAX_SEGMENTS,
  FX_SEGMENT_DELAY_MS,
  FX_STAGGER_STEP_MS,
} from './constants.js'
import type { GridPosition } from '@tgslot/slot-engine'
import {
  fxAmplitude,
  fxPulseScale,
  fxSegmentDelayMs,
  fxStaggerDelayMs,
  resolveFxEffect,
  resolveFxForPositions,
  resolveSymbolFx,
} from './fx.js'
import type { FxMap } from './theme.js'

describe('resolveFxEffect 기본값', () => {
  const bare = resolveFxEffect({ type: 'pulse' })

  it('빠진 공통 필드를 채운다', () => {
    expect(bare.durationMs).toBe(FX_DEFAULT_DURATION_MS)
    expect(bare.loop).toBe(true)
    expect(bare.intensity).toBe(1)
  })

  it('타입별 기본값을 채운다', () => {
    expect(bare.scale).toBe(FX_DEFAULT_PULSE_SCALE)
    expect(bare.angle).toBe(FX_DEFAULT_SHINE_ANGLE)
    expect(bare.degrees).toBe(FX_DEFAULT_WOBBLE_DEGREES)
    expect(bare.px).toBe(FX_DEFAULT_BOUNCE_PX)
    expect(bare.particles).toBe(FX_DEFAULT_BURST_PARTICLES)
    expect(bare.color).toBe(FX_DEFAULT_GLOW_COLOR)
    expect(bare.stagger).toBe(false)
  })

  it('준 값은 그대로 쓴다', () => {
    const effect = resolveFxEffect({ type: 'shine', durationMs: 900, angle: 25, loop: false, intensity: 0.5 })
    expect(effect.durationMs).toBe(900)
    expect(effect.angle).toBe(25)
    expect(effect.loop).toBe(false)
    expect(effect.intensity).toBe(0.5)
  })

  it('파티클 수를 상한으로 묶는다', () => {
    expect(resolveFxEffect({ type: 'burst', particles: 5000 }).particles).toBe(FX_MAX_BURST_PARTICLES)
  })

  it('0 이하 값은 기본값으로 되돌린다', () => {
    expect(resolveFxEffect({ type: 'pulse', durationMs: 0 }).durationMs).toBe(FX_DEFAULT_DURATION_MS)
  })

  it('intensity를 0~1로 묶는다', () => {
    expect(resolveFxEffect({ type: 'pulse', intensity: 0 }).intensity).toBe(0)
  })
})

describe('resolveSymbolFx 조회 순서', () => {
  const fx: FxMap = {
    default: { win: [{ type: 'pulse', scale: 1.12, durationMs: 600 }] },
    seven: { win: [{ type: 'pulse', scale: 1.15 }, { type: 'shine', angle: 25 }] },
    blank: { win: [] },
  }

  it('심볼 항목이 있으면 그것을 쓴다', () => {
    const effects = resolveSymbolFx(fx, 'seven')
    expect(effects.map((e) => e.type)).toEqual(['pulse', 'shine'])
    expect(effects[0]?.scale).toBe(1.15)
  })

  it('항목이 없으면 default로 되돌린다', () => {
    const effects = resolveSymbolFx(fx, 'bell')
    expect(effects).toHaveLength(1)
    expect(effects[0]?.scale).toBe(1.12)
  })

  it('빈 배열은 "연출 없음"이라 기본값으로 되돌리지 않는다', () => {
    expect(resolveSymbolFx(fx, 'blank')).toEqual([])
  })

  it('fx 자체가 없으면 내장 pulse를 쓴다', () => {
    const effects = resolveSymbolFx(undefined, 'seven')
    expect(effects).toHaveLength(1)
    expect(effects[0]?.type).toBe('pulse')
  })

  it('default도 없고 항목도 없으면 내장 pulse다', () => {
    const effects = resolveSymbolFx({ seven: { win: [{ type: 'burst' }] } }, 'bell')
    expect(effects[0]?.type).toBe('pulse')
  })
})

describe('resolveSymbolFx 모션 축소', () => {
  const fx: FxMap = {
    wild: { win: [{ type: 'burst', particles: 24 }, { type: 'glow' }] },
    seven: { win: [{ type: 'pulse', scale: 1.15 }, { type: 'shine' }] },
    blank: { win: [] },
  }

  it('pulse만 남긴다', () => {
    const effects = resolveSymbolFx(fx, 'seven', true)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.type).toBe('pulse')
    expect(effects[0]?.scale).toBe(1.15)
  })

  it('파티클만 있던 심볼도 pulse 하나로 바꾼다', () => {
    const effects = resolveSymbolFx(fx, 'wild', true)
    expect(effects).toHaveLength(1)
    expect(effects[0]?.type).toBe('pulse')
  })

  it('어떤 심볼에도 파티클이 남지 않는다', () => {
    for (const id of ['wild', 'seven', 'bell']) {
      for (const effect of resolveSymbolFx(fx, id, true)) {
        expect(effect.type).toBe('pulse')
      }
    }
  })

  it('연출 없음은 축소해도 없음이다', () => {
    expect(resolveSymbolFx(fx, 'blank', true)).toEqual([])
  })
})

describe('fx 보조 계산', () => {
  it('stagger가 꺼져 있으면 지연이 없다', () => {
    const effect = resolveFxEffect({ type: 'flash' })
    expect(fxStaggerDelayMs(effect, 2)).toBe(0)
  })

  it('stagger가 켜지면 순서대로 밀린다', () => {
    const effect = resolveFxEffect({ type: 'flash', stagger: true })
    expect(fxStaggerDelayMs(effect, 0)).toBe(0)
    expect(fxStaggerDelayMs(effect, 2)).toBe(FX_STAGGER_STEP_MS * 2)
  })

  it('음수 인덱스는 0으로 본다', () => {
    expect(fxStaggerDelayMs(resolveFxEffect({ type: 'flash', stagger: true }), -3)).toBe(0)
  })

  it('강도가 진폭을 줄인다', () => {
    expect(fxAmplitude(12, 1)).toBe(12)
    expect(fxAmplitude(12, 0.5)).toBe(6)
  })

  it('강도가 낮으면 pulse 배율이 1에 가까워진다', () => {
    expect(fxPulseScale(resolveFxEffect({ type: 'pulse', scale: 1.2 }))).toBeCloseTo(1.2, 9)
    expect(fxPulseScale(resolveFxEffect({ type: 'pulse', scale: 1.2, intensity: 0.5 }))).toBeCloseTo(1.1, 9)
    expect(fxPulseScale(resolveFxEffect({ type: 'pulse', scale: 1.2, intensity: 0 }))).toBe(1)
  })
})

describe('segments와 repeat', () => {
  it('segments 기본값은 1이다', () => {
    expect(resolveFxEffect({ type: 'flash' }).segments).toBe(FX_DEFAULT_SEGMENTS)
  })

  it('준 구획 수를 그대로 쓴다', () => {
    expect(resolveFxEffect({ type: 'flash', segments: 3 }).segments).toBe(3)
  })

  it('구획 수를 상한으로 묶는다', () => {
    expect(resolveFxEffect({ type: 'flash', segments: 999 }).segments).toBe(FX_MAX_SEGMENTS)
  })

  it('repeat을 안 주면 null이라 loop가 결정한다', () => {
    expect(resolveFxEffect({ type: 'spin' }).repeat).toBeNull()
  })

  it('repeat을 주면 유한 반복이다', () => {
    expect(resolveFxEffect({ type: 'spin', repeat: 1 }).repeat).toBe(1)
    expect(resolveFxEffect({ type: 'spin', repeat: 0 }).repeat).toBe(0)
  })

  it('stagger가 꺼져 있으면 구획 지연이 없다', () => {
    expect(fxSegmentDelayMs(resolveFxEffect({ type: 'flash', segments: 3 }), 2)).toBe(0)
  })

  it('구획이 하나뿐이면 지연이 없다', () => {
    expect(fxSegmentDelayMs(resolveFxEffect({ type: 'flash', stagger: true }), 1)).toBe(0)
  })

  it('stagger가 켜지면 위에서 아래로 밀린다', () => {
    const effect = resolveFxEffect({ type: 'flash', stagger: true, segments: 3 })
    expect(fxSegmentDelayMs(effect, 0)).toBe(0)
    expect(fxSegmentDelayMs(effect, 1)).toBe(FX_SEGMENT_DELAY_MS)
    expect(fxSegmentDelayMs(effect, 2)).toBe(FX_SEGMENT_DELAY_MS * 2)
  })

  it('내장 폴백 pulse는 500ms 주기다', () => {
    expect(resolveSymbolFx(undefined, 'x')[0]?.durationMs).toBe(BUILTIN_PULSE_MS)
  })
})

describe('그룹 배당의 좌표별 연출', () => {
  // Any BAR 라인: 한 라인에 bar1, bar2, bar3이 섞여 있다.
  // WinLine.symbol은 'anybar'(그룹 id)라 테마의 어떤 심볼과도 맞지 않는다.
  const grid = [
    ['seven', 'seven', 'seven'],
    ['bar1', 'bar2', 'bar3'],
    ['bell', 'bell', 'bell'],
  ]
  const positions: GridPosition[] = [
    [0, 1],
    [1, 1],
    [2, 1],
  ]
  const fx: FxMap = {
    default: { win: [{ type: 'pulse', scale: 1.12 }] },
    bar1: { win: [{ type: 'flash', durationMs: 500 }] },
    bar2: { win: [{ type: 'flash', durationMs: 500, segments: 2, stagger: true }] },
    bar3: { win: [{ type: 'flash', durationMs: 500, segments: 3, stagger: true }] },
    seven: { win: [{ type: 'shine' }] },
  }

  it('그룹 id가 아니라 자리에 놓인 심볼로 찾는다', () => {
    const resolved = resolveFxForPositions(fx, grid, positions)
    expect(resolved.map((entry) => entry.symbol)).toEqual(['bar1', 'bar2', 'bar3'])
  })

  it('같은 라인 안에서 심볼마다 다른 연출이 나온다', () => {
    const resolved = resolveFxForPositions(fx, grid, positions)
    expect(resolved.map((entry) => entry.effects[0]?.segments)).toEqual([1, 2, 3])
  })

  it('그룹 id로 찾으면 default로 떨어져 셋 다 같아진다', () => {
    // 이것이 하면 안 되는 방식이다. 위 결과와 달라야 규칙이 지켜진 것이다.
    const wrong = ['anybar', 'anybar', 'anybar'].map((id) => resolveSymbolFx(fx, id))
    expect(wrong.map((effects) => effects[0]?.type)).toEqual(['pulse', 'pulse', 'pulse'])
    const right = resolveFxForPositions(fx, grid, positions)
    expect(right.map((entry) => entry.effects[0]?.type)).toEqual(['flash', 'flash', 'flash'])
  })

  it('좌표를 그대로 돌려준다', () => {
    expect(resolveFxForPositions(fx, grid, positions).map((entry) => entry.position)).toEqual(positions)
  })

  it('행이 다른 대각선 라인도 각 자리의 심볼을 읽는다', () => {
    const diagonal: GridPosition[] = [
      [0, 0],
      [1, 1],
      [2, 2],
    ]
    expect(resolveFxForPositions(fx, grid, diagonal).map((entry) => entry.symbol)).toEqual([
      'seven',
      'bar2',
      'bell',
    ])
  })

  it('모션 축소는 좌표별로도 pulse만 남긴다', () => {
    const resolved = resolveFxForPositions(fx, grid, positions, true)
    for (const entry of resolved) {
      expect(entry.effects.every((effect) => effect.type === 'pulse')).toBe(true)
    }
  })

  it('격자 밖 좌표는 던진다', () => {
    expect(() => resolveFxForPositions(fx, grid, [[0, 9]])).toThrow(RangeError)
  })
})
