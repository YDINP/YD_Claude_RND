import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isAnalytic } from './analytic.js'
import { featureTriggerCount } from './evaluate.js'
import { createSeededRng } from './rng/seeded.js'
import { safeParseGameMath, parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'
import { resolveSpin, spinUnchecked } from './spin.js'
import { litSegments, maxRouletteSteps } from './stageRoulette.js'
import type { Rng, SpinResult, StageRouletteTrigger, SymbolId } from './types.js'

/** 정해 둔 값을 차례로 낸다. 범위를 벗어나거나 모자라면 던진다. */
class ScriptedRng implements Rng {
  calls = 0
  constructor(private readonly values: number[]) {}
  nextInt(maxExclusive: number): number {
    const value = this.values[this.calls]
    this.calls += 1
    if (value === undefined) throw new Error(`스크립트 RNG 값이 모자란다 (${this.calls}번째)`)
    if (value < 0 || value >= maxExclusive) throw new Error(`스크립트 값 ${value}이 [0, ${maxExclusive}) 밖이다`)
    return value
  }
}

class CountingRng implements Rng {
  calls = 0
  constructor(private readonly inner: Rng) {}
  nextInt(maxExclusive: number): number {
    this.calls += 1
    return this.inner.nextInt(maxExclusive)
  }
}

const c = (value: number) => ({ kind: 'coin', value })
const up = { kind: 'stepUp' }
const e = (value: number) => ({ kind: 'encore', value })
const g = (value: number) => ({ kind: 'grand', value })

/** 계획서 §3-2 판 그대로. 튜닝과 무관하게 고정한다. */
const ROULETTE = {
  trigger: 3,
  startInnerAt: 4,
  songs: 3,
  maxEncores: 2,
  cheer: { symbol: 'ls', maxLit: 6, litMultiplier: 2 },
  rings: [
    { id: 'outer', segments: [c(3), c(5), up, c(3), e(3), c(6), c(4), up, c(8), e(3), c(4), c(10)], litOrder: [5, 1, 10, 6, 3, 8] },
    { id: 'middle', segments: [c(5), up, c(8), e(5), c(12), c(6), up, c(15), e(5), c(20)], litOrder: [4, 2, 9, 5, 0, 7] },
    { id: 'inner', segments: [c(15), e(15), c(25), g(120), c(20), c(30), e(15), c(50)], litOrder: [2, 4, 0, 5, 7] },
  ],
}

function rouletteJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const strip = ['a', 'b', 'c', 'd', 'ls', 'a', 'b', 'c', 'd', 'bonus', 'a', 'b', 'c', 'd', 'w', 'a', 'b', 'c', 'd', 'ls']
  return {
    id: 'roulette-test',
    reels: 5,
    rows: 4,
    payModel: 'ways',
    ways: { base: 1024, betDivisor: 50 },
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'bonus', name: { en: 'Pass' }, scatter: true },
      { id: 'a', name: { en: 'A' } },
      { id: 'b', name: { en: 'B' } },
      { id: 'c', name: { en: 'C' } },
      { id: 'd', name: { en: 'D' } },
      { id: 'ls', name: { en: 'Lightstick' } },
    ],
    strips: [strip, strip, strip, strip, strip],
    paytable: {
      a: { 3: 5, 4: 10, 5: 20 },
      b: { 3: 4, 4: 8, 5: 16 },
      c: { 3: 3, 4: 6, 5: 12 },
      d: { 3: 2, 4: 4, 5: 8 },
      ls: { 3: 6, 4: 12, 5: 30 },
    },
    wild: { substitutesFor: 'all' },
    scatter: { symbol: 'bonus' },
    stageRoulette: ROULETTE,
    round: { maxWinCap: 2000 },
    betLevels: [50, 100],
    rtpTarget: 0.945,
    volatility: 'high',
    ...overrides,
  }
}

const MATH = parseGameMath(rouletteJson())
const BET = 100

/**
 * 당첨 경로가 생기지 않는 5x4 판. 초대권은 릴 0..bonus-1의 0행, 응원봉은 `cheerReels` 릴의 1행.
 * 릴마다 채움 심볼이 달라 3연속이 없다(응원봉도 릴 1을 비워 둔다).
 */
function gridWith(bonus: number, cheerReels: number[] = []): SymbolId[][] {
  const fill = ['a', 'b', 'c', 'd', 'a']
  const grid: SymbolId[][] = []
  for (let row = 0; row < 4; row += 1) {
    const line: SymbolId[] = []
    for (let reel = 0; reel < 5; reel += 1) line.push(fill[reel] ?? 'a')
    grid.push(line)
  }
  for (let reel = 0; reel < bonus; reel += 1) (grid[0] as SymbolId[])[reel] = 'bonus'
  for (const reel of cheerReels) (grid[1] as SymbolId[])[reel] = 'ls'
  return grid
}

function settle(grid: SymbolId[][], values: number[], math: GameMath = MATH): { result: SpinResult; rng: ScriptedRng } {
  const rng = new ScriptedRng(values)
  const betUnit = BET / 50
  const result = resolveSpin(math, grid, [0, 0, 0, 0, 0], BET, betUnit, undefined, grid, [], rng)
  return { result, rng }
}

function rouletteOf(result: SpinResult): StageRouletteTrigger {
  const feature = result.features.find((f) => f.type === 'stageRoulette')
  if (feature?.type !== 'stageRoulette') throw new Error('룰렛 피처가 없다')
  return feature
}

describe('무대 룰렛 정산', () => {
  it('코인 칸만 서면 돌리기 3번으로 끝나고 상은 총 베팅 배수다', () => {
    const { result, rng } = settle(gridWith(3), [0, 1, 3])
    const roulette = rouletteOf(result)
    expect(rng.calls).toBe(3)
    expect(roulette.steps.map((s) => [s.ring, s.segment, s.kind, s.win, s.songsLeft])).toEqual([
      [0, 0, 'coin', 300, 2],
      [0, 1, 'coin', 500, 1],
      [0, 3, 'coin', 300, 0],
    ])
    expect(roulette.total).toBe(1100)
    expect(roulette.endedBy).toBe('songs')
    expect(result.rouletteWin).toBe(1100)
    expect(result.totalWin).toBe(result.lineWin + 1100)
    expect(roulette.startRing).toBe(0)
    expect(roulette.bonusCount).toBe(3)
    expect(roulette.positions).toEqual([[0, 0], [1, 0], [2, 0]])
  })

  it('«한 단계 위로»는 돌리기를 쓰지 않고 곧바로 안쪽 고리를 돌린다(한 방향)', () => {
    const { result } = settle(gridWith(3), [2, 1, 0, 2, 4])
    const roulette = rouletteOf(result)
    expect(roulette.steps.map((s) => [s.ring, s.kind, s.songsLeft])).toEqual([
      [0, 'stepUp', 3],
      [1, 'stepUp', 3],
      [2, 'coin', 2],
      [2, 'coin', 1],
      [2, 'coin', 0],
    ])
    expect(roulette.total).toBe((15 + 25 + 20) * BET)
  })

  it('앙코르는 maxEncores번까지 돌리기를 늘리고, 그 뒤엔 코인처럼 하나를 쓴다', () => {
    const { result } = settle(gridWith(3), [4, 9, 4, 0, 0])
    const roulette = rouletteOf(result)
    expect(roulette.steps.map((s) => [s.kind, s.encoreCounted, s.songsLeft, s.win])).toEqual([
      ['encore', true, 3, 300],
      ['encore', true, 3, 300],
      ['encore', false, 2, 300],
      ['coin', false, 1, 300],
      ['coin', false, 0, 300],
    ])
  })

  it('대상은 돌리기 하나를 쓰고 공연을 끝내지 않는다', () => {
    const { result } = settle(gridWith(3), [2, 1, 3, 3, 3])
    const roulette = rouletteOf(result)
    expect(roulette.steps.slice(2).map((s) => [s.kind, s.win, s.songsLeft])).toEqual([
      ['grand', 12000, 2],
      ['grand', 12000, 1],
      ['grand', 12000, 0],
    ])
    expect(roulette.total).toBe(360 * BET)
  })

  it('초대권 4장이면 가운데 고리에서 시작한다 (5장도)', () => {
    for (const bonus of [4, 5]) {
      const { result } = settle(gridWith(bonus), [0, 2, 4])
      const roulette = rouletteOf(result)
      expect(roulette.startRing).toBe(1)
      expect(roulette.steps.map((s) => s.ring)).toEqual([1, 1, 1])
      expect(roulette.total).toBe((5 + 8 + 12) * BET)
    }
  })

  it('응원봉 0·3·6개: litOrder 앞 칸에 불이 켜지고 불 켜진 코인만 2배', () => {
    expect(litSegments(MATH.stageRoulette!, 0)).toEqual([[], [], []])
    expect(litSegments(MATH.stageRoulette!, 3)).toEqual([[5, 1, 10], [4, 2, 9], [2, 4, 0]])
    expect(litSegments(MATH.stageRoulette!, 9)).toEqual([[5, 1, 10, 6, 3, 8], [4, 2, 9, 5, 0, 7], [2, 4, 0, 5, 7]])

    const none = rouletteOf(settle(gridWith(3), [5, 1, 4, 0]).result)
    expect(none.cheer).toBe(0)
    expect(none.steps.map((s) => [s.lit, s.win])).toEqual([[false, 600], [false, 500], [false, 300], [false, 300]])

    const three = rouletteOf(settle(gridWith(3, [0, 3, 4]), [5, 6, 4, 0]).result)
    expect(three.cheer).toBe(3)
    expect(three.cheerPositions).toEqual([[0, 1], [3, 1], [4, 1]])
    expect(three.lit).toEqual([[5, 1, 10], [4, 2, 9], [2, 4, 0]])
    // 5번 칸 ×6 → 불 켜짐 ×12, 6번 칸 ×4는 4번째 불이라 꺼짐, 앙코르는 불 대상 아님.
    expect(three.steps.slice(0, 3).map((s) => [s.lit, s.win])).toEqual([[true, 1200], [false, 400], [false, 300]])
  })

  it('지급 상한에 닿으면 그 회전을 잘라 주고 남은 돌리기는 무효다', () => {
    const capped = parseGameMath(rouletteJson({ round: { maxWinCap: 10 } }))
    const { result, rng } = settle(gridWith(3), [8, 11, 0], capped)
    const roulette = rouletteOf(result)
    expect(rng.calls).toBe(2)
    expect(roulette.steps.map((s) => [s.win, s.songsLeft])).toEqual([[800, 2], [200, 0]])
    expect(roulette.endedBy).toBe('capped')
    expect(result.totalWin).toBe(1000)
    expect(result.features.at(-1)).toEqual({ type: 'winCapped', requested: 1800, granted: 1000, cap: 1000 })
  })

  it('최장 공연은 회전 7번(위로·위로·앙코르·앙코르·대상 셋) = 390배', () => {
    const { result } = settle(gridWith(3), [2, 1, 1, 6, 3, 3, 3])
    const roulette = rouletteOf(result)
    expect(roulette.steps).toHaveLength(7)
    expect(roulette.total).toBe(390 * BET)
    expect(maxRouletteSteps(MATH.stageRoulette!, 0)).toBe(7)
    expect(maxRouletteSteps(MATH.stageRoulette!, 1)).toBe(6)
  })

  it('초대권 2장 이하이거나 프리스핀 상태면 룰렛이 열리지 않는다', () => {
    const { result, rng } = settle(gridWith(2), [])
    expect(result.features.some((f) => f.type === 'stageRoulette')).toBe(false)
    expect(result.rouletteWin).toBeUndefined()
    expect(rng.calls).toBe(0)
  })

  it('rng 없이 트리거 판을 정산하면 던진다', () => {
    const grid = gridWith(3)
    expect(() => resolveSpin(MATH, grid, [0, 0, 0, 0, 0], BET, 2)).toThrow(/rng/)
  })

  it('척도 M이 회전마다 정확히 1씩 줄고 회전 수는 상한 안이다 (무작위 2만 공연)', () => {
    const config = MATH.stageRoulette!
    const rng = createSeededRng('roulette-measure')
    let maxSteps = 0
    for (let i = 0; i < 20_000; i += 1) {
      const bonus = i % 10 === 0 ? 4 : 3
      const grid = gridWith(bonus, i % 3 === 0 ? [0, 3, 4] : [])
      const result = resolveSpin(MATH, grid, [0, 0, 0, 0, 0], BET, 2, undefined, grid, [], rng)
      const roulette = rouletteOf(result)
      let ring = roulette.startRing
      let songs = config.songs
      let encores = 0
      let measure = songs + (2 - ring) + (config.maxEncores - encores)
      for (const step of roulette.steps) {
        expect(step.ring).toBe(ring)
        if (step.kind === 'stepUp') ring += 1
        else if (step.kind === 'encore' && step.encoreCounted) encores += 1
        else songs -= 1
        expect(step.songsLeft).toBe(songs)
        const next = songs + (2 - ring) + (config.maxEncores - encores)
        expect(next).toBe(measure - 1)
        measure = next
      }
      expect(songs).toBe(0)
      expect(roulette.total).toBe(roulette.steps.reduce((sum, s) => sum + s.win, 0))
      maxSteps = Math.max(maxSteps, roulette.steps.length)
    }
    expect(maxSteps).toBeLessThanOrEqual(7)
    // 단독 2초 남짓이지만 다른 테스트와 함께 돌면 기본 5초를 넘는다
  }, 30_000)
})

describe('무대 룰렛 RNG 계약', () => {
  it('비트리거 스핀은 nextInt 5회, 트리거 스핀은 5 + 회전 수', () => {
    let triggers = 0
    for (let i = 0; i < 3_000 && triggers < 20; i += 1) {
      const rng = new CountingRng(createSeededRng(`roulette-rng-${i}`))
      const result = spinUnchecked(MATH, BET, rng)
      const roulette = result.features.find((f) => f.type === 'stageRoulette')
      if (roulette?.type === 'stageRoulette') {
        triggers += 1
        expect(rng.calls).toBe(5 + roulette.steps.length)
      } else {
        expect(rng.calls).toBe(5)
      }
    }
    expect(triggers).toBeGreaterThan(0)
  })

  it('같은 시드는 같은 결과(회전까지)를 낸다', () => {
    for (let i = 0; i < 200; i += 1) {
      const a = spinUnchecked(MATH, BET, createSeededRng(`roulette-replay-${i}`))
      const b = spinUnchecked(MATH, BET, createSeededRng(`roulette-replay-${i}`))
      expect(b).toEqual(a)
    }
  })
})

describe('무대 룰렛 스키마', () => {
  const ringsWith = (patch: (rings: Record<string, unknown>[]) => void): Record<string, unknown> => {
    const rings = JSON.parse(JSON.stringify(ROULETTE.rings)) as Record<string, unknown>[]
    patch(rings)
    return rouletteJson({ stageRoulette: { ...ROULETTE, rings } })
  }
  const rejects = (json: Record<string, unknown>, pattern: RegExp): void => {
    const parsed = safeParseGameMath(json)
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues.map((i) => i.message).join('\n')).toMatch(pattern)
  }

  it('기본 픽스처는 통과한다', () => {
    expect(safeParseGameMath(rouletteJson()).success).toBe(true)
  })

  it('마지막 고리의 «위로», 위로 없는 바깥 고리, 바깥 고리의 대상을 거부한다', () => {
    rejects(ringsWith((r) => ((r[2]!['segments'] as unknown[])[0] = up)), /마지막 고리에는/)
    rejects(ringsWith((r) => ((r[0]!['segments'] as unknown[])[2] = c(3), (r[0]!['segments'] as unknown[])[7] = c(3))), /위로» 칸이 없다/)
    rejects(ringsWith((r) => ((r[0]!['segments'] as unknown[])[0] = g(200))), /대상 칸은 마지막 고리에만/)
  })

  it('대상은 정확히 1개, 불 켜진 코인 최댓값보다 커야 한다', () => {
    rejects(ringsWith((r) => ((r[2]!['segments'] as unknown[])[3] = g(100))), /불 켜진 코인 최댓값/)
    rejects(ringsWith((r) => ((r[2]!['segments'] as unknown[])[0] = g(200))), /정확히 1개/)
  })

  it('litOrder는 중복 없이 코인 칸만 가리킨다', () => {
    rejects(ringsWith((r) => (r[0]!['litOrder'] = [5, 5])), /중복/)
    rejects(ringsWith((r) => (r[0]!['litOrder'] = [2])), /코인 칸이 아니다/)
  })

  it('프리스핀·주문 라운드·연쇄와 함께 둘 수 없고 round.maxWinCap이 필요하다', () => {
    rejects(rouletteJson({ scatter: { symbol: 'bonus', freeSpins: { trigger: 3, count: 5, multiplier: 1, retrigger: false } } }), /freeSpins/)
    rejects(rouletteJson({ round: undefined }), /round\.maxWinCap/)
    rejects(rouletteJson({ scatter: undefined }), /scatter 설정이 필요/)
  })

  it('응원봉은 와일드·스캐터가 아니어야 하고 최장 회전은 12번 이하', () => {
    rejects(rouletteJson({ stageRoulette: { ...ROULETTE, cheer: { ...ROULETTE.cheer, symbol: 'w' } } }), /응원봉 심볼/)
    rejects(rouletteJson({ stageRoulette: { ...ROULETTE, songs: 9, maxEncores: 2 } }), /최장 회전/)
    rejects(rouletteJson({ stageRoulette: { ...ROULETTE, startInnerAt: 3 } }), /startInnerAt/)
  })

  it('룰렛 팩은 해석 경로를 타지 않고 트리거 수를 알린다', () => {
    expect(isAnalytic(MATH)).toBe(false)
    expect(featureTriggerCount(MATH)).toBe(3)
  })
})

describe('idol-stage-live 팩', () => {
  const pack = parseGameMath(JSON.parse(readFileSync(new URL('../../../games/idol-stage-live/math.json', import.meta.url), 'utf8')))

  it('스키마를 통과하고 판 구성은 계획서 칸 수(12·10·8)를 지킨다', () => {
    const rings = pack.stageRoulette?.rings ?? []
    expect(rings.map((ring) => ring.segments.length)).toEqual([12, 10, 8])
    expect(isAnalytic(pack)).toBe(false)
  })

  it('초대권은 한 릴 창에 최대 1장(원형 간격 ≥ rows)', () => {
    for (const strip of pack.strips) {
      const at = strip.flatMap((symbol, index) => (symbol === 'bonus' ? [index] : []))
      at.forEach((index, k) => {
        const next = at[(k + 1) % at.length] ?? index
        const gap = (next - index + strip.length) % strip.length || strip.length
        expect(gap).toBeGreaterThanOrEqual(pack.rows)
      })
    }
  })
})
