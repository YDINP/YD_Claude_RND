import { describe, expect, it } from 'vitest'
import {
  applyCascadeStep,
  createSeededRng,
  spinUnchecked,
  featureTriggerCount as engineFeatureTriggerCount,
  foldCascades,
  type CascadeStep,
  type GridPosition,
  type SymbolId,
  type WinLine,
} from '@tgslot/slot-engine'
import {
  applyCascadeStepToGrid,
  buildCascadePlan,
  cascadeMoves,
  cascadeSkipStepMs,
  cascadeSpeedRow,
  cascadeStepDurations,
  clusterOutlineSegments,
  compressCascadeStep,
  compressedCascadeSchedule,
  type CascadeSpeedRow,
} from './cascade.js'
import { anticipatedReels, featureTriggerCount } from './anticipation.js'
import { betUnitCount } from './ways.js'
import { winBetMultiple } from './wins.js'
import { buildPresentation, cascadeStepCountOf, shouldLoopPresentation } from './presentation.js'
import { computeLayout } from './layout.js'
import { PHASE_ALL_MS, PHASE_ALL_MULTI_DWELL_MS, SYMBOL_GAP_RATIO } from './constants.js'
import { loadGameMath } from './testSupport.js'

const REELS = 6
const ROWS = 5

/** 6x5 판. `grid[row][reel]`. 글자 하나가 심볼 하나다. */
function gridOf(rows: string[]): SymbolId[][] {
  return rows.map((line) => line.split(''))
}

function clusterWin(symbol: SymbolId, positions: GridPosition[], cascade: number, ladder: number, win: number): WinLine {
  return { line: -1, symbol, count: positions.length, multiplier: win / 100, win, positions, payKind: 'cluster', cascade, ladder }
}

/** 지운 칸을 모아 단계 하나를 만든다. 리필은 릴마다 지운 수만큼 `fill` 글자로 채운다. */
function stepOf(index: number, grid: SymbolId[][], wins: WinLine[], fill: string, multiplier: number): CascadeStep {
  const seen = new Set<string>()
  const removed: GridPosition[] = []
  for (const win of wins) {
    for (const [reel, row] of win.positions) {
      const key = `${reel}:${row}`
      if (seen.has(key)) continue
      seen.add(key)
      removed.push([reel, row])
    }
  }
  removed.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const refill: SymbolId[][] = Array.from({ length: grid[0]?.length ?? 0 }, (_, reel) =>
    removed.filter(([r]) => r === reel).map((_, j) => fill[(reel + j) % fill.length] as SymbolId),
  )
  return { index, wins, removed, refill, multiplier, stepWin: wins.reduce((sum, w) => sum + w.win, 0) }
}

const START = gridOf(['abcdef', 'aacdef', 'aabdef', 'bcadef', 'bcddef'])

/** 손으로 짠 3연쇄. 단계마다 엔진 함수로 다음 판을 만들어 다음 단계의 근거로 쓴다. */
function threeCascades(): { steps: CascadeStep[]; finalGrid: SymbolId[][] } {
  const steps: CascadeStep[] = []
  let grid = START
  const s0 = stepOf(0, grid, [clusterWin('a', [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2]], 0, 1, 200)], 'xyz', 1)
  steps.push(s0)
  grid = applyCascadeStep(grid, s0)
  const s1 = stepOf(1, grid, [clusterWin('d', [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]], 1, 2, 300)], 'pq', 2)
  steps.push(s1)
  grid = applyCascadeStep(grid, s1)
  const s2 = stepOf(
    2,
    grid,
    [
      clusterWin('e', [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]], 2, 3, 150),
      clusterWin('f', [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4]], 2, 3, 150),
    ],
    'mn',
    3,
  )
  steps.push(s2)
  return { steps, finalGrid: foldCascades(START, steps) }
}

/** 12연쇄. 판 내용과 무관하게 매 단계 아래 한 줄을 지운다(시간표 검사용). */
function twelveCascades(): { steps: CascadeStep[]; finalGrid: SymbolId[][] } {
  const steps: CascadeStep[] = []
  let grid = START
  for (let i = 0; i < 12; i += 1) {
    const row: GridPosition[] = Array.from({ length: REELS }, (_, reel) => [reel, ROWS - 1])
    const step = stepOf(i, grid, [clusterWin('a', row, i, 1, 10)], 'uvw', 1)
    steps.push(step)
    grid = applyCascadeStep(grid, step)
  }
  return { steps, finalGrid: grid }
}

describe('연쇄 판 접기', () => {
  it('렌더러 접기는 엔진 applyCascadeStep과 같다', () => {
    const { steps } = threeCascades()
    let engine = START
    let renderer = START
    for (const step of steps) {
      engine = applyCascadeStep(engine, step)
      renderer = applyCascadeStepToGrid(renderer, step)
      expect(renderer).toEqual(engine)
    }
  })

  it('마지막 gridAfter는 finalGrid와 같다', () => {
    const { steps, finalGrid } = threeCascades()
    const plan = buildCascadePlan(START, steps, { finalGrid })
    expect(plan.steps.at(-1)?.gridAfter).toEqual(finalGrid)
    expect(plan.finalGrid).toEqual(finalGrid)
    expect(plan.mismatch).toBe(false)
    expect(foldCascades(START, steps)).toEqual(plan.finalGrid)
  })

  it('단계마다 gridBefore는 앞 단계의 gridAfter다', () => {
    const { steps } = threeCascades()
    const plan = buildCascadePlan(START, steps)
    plan.steps.slice(1).forEach((step, i) => expect(step.gridBefore).toEqual(plan.steps[i]?.gridAfter))
    expect(plan.steps[0]?.gridBefore).toEqual(START)
  })

  it('finalGrid가 접은 판과 다르면 표시하고 finalGrid를 따른다', () => {
    const { steps } = threeCascades()
    const other = START.map((line) => line.map(() => 'z'))
    const plan = buildCascadePlan(START, steps, { finalGrid: other })
    expect(plan.mismatch).toBe(true)
    expect(plan.finalGrid).toEqual(other)
  })

  it('어긋난 단계는 던진다', () => {
    const bad: CascadeStep = { index: 0, wins: [], removed: [[0, 0]], refill: [[], [], [], [], [], []], multiplier: 1, stepWin: 0 }
    expect(() => buildCascadePlan(START, [bad])).toThrow(RangeError)
  })

  it('누적 지급·사다리·지운 심볼을 단계마다 싣는다', () => {
    const { steps } = threeCascades()
    const plan = buildCascadePlan(START, steps)
    expect(plan.steps.map((s) => s.cumulativeWin)).toEqual([200, 500, 800])
    expect(plan.steps.map((s) => s.multiplier)).toEqual([1, 2, 3])
    expect(plan.steps[0]?.removedSymbols).toEqual(['a', 'a', 'a', 'a', 'a'])
    expect(plan.steps[2]?.removedSymbols).toEqual([...'eeeee', ...'fffff'])
    expect(plan.steps[2]?.groups).toHaveLength(2)
  })
})

describe('낙하 이동', () => {
  it('남은 칸은 지운 수만큼 내려가고 리필은 창 위에서 들어온다', () => {
    const { steps } = threeCascades()
    const moves = cascadeMoves(START, steps[0] as CascadeStep)
    // 릴 0: 행 0·1·2 지움 → 행 3·4는 그대로, 리필 3개가 -3..-1에서 0..2로.
    const reel0 = moves.filter((m) => m.reel === 0)
    expect(reel0).toEqual([
      { reel: 0, fromRow: -3, toRow: 0, symbol: 'x', refill: true },
      { reel: 0, fromRow: -2, toRow: 1, symbol: 'y', refill: true },
      { reel: 0, fromRow: -1, toRow: 2, symbol: 'z', refill: true },
    ])
    // 릴 1: 행 1·2 지움 → 행 0의 b가 2로 내려간다.
    const reel1 = moves.filter((m) => m.reel === 1 && !m.refill)
    expect(reel1).toEqual([{ reel: 1, fromRow: 0, toRow: 2, symbol: 'b', refill: false }])
    // 지운 칸이 없는 릴은 움직이지 않는다.
    expect(moves.some((m) => m.reel >= 2)).toBe(false)
  })

  it('이동을 끝까지 적용한 판이 gridAfter다 (제자리 교체 없음)', () => {
    const { steps } = threeCascades()
    const plan = buildCascadePlan(START, steps)
    for (const step of plan.steps) {
      const gone = new Set(step.removed.map(([r, w]) => `${r}:${w}`))
      const screen = step.gridBefore.map((line) => [...line])
      const movedFrom = new Set(step.moves.filter((m) => !m.refill).map((m) => `${m.reel}:${m.fromRow}`))
      const landed = new Map(step.moves.map((m) => [`${m.reel}:${m.toRow}`, m.symbol]))
      for (let row = 0; row < ROWS; row += 1) {
        for (let reel = 0; reel < REELS; reel += 1) {
          const key = `${reel}:${row}`
          const arriving = landed.get(key)
          if (arriving !== undefined) (screen[row] as SymbolId[])[reel] = arriving
          else {
            // 아무것도 도착하지 않은 칸은 지워지지도 떠나지도 않은 원래 심볼이어야 한다.
            expect(gone.has(key) || movedFrom.has(key)).toBe(false)
          }
        }
      }
      expect(screen).toEqual(step.gridAfter)
    }
  })
})

describe('시간 예산', () => {
  const rows: [CascadeSpeedRow, number][] = [
    ['normal', 13000],
    ['quick', 9000],
    ['turbo', 5000],
    ['reduced', 2400],
  ]

  it.each(rows)('%s 12연쇄 합이 %dms 이하다', (row, gate) => {
    const total = Array.from({ length: 12 }, (_, i) => cascadeStepDurations(i, row, REELS).totalMs).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(gate)
  })

  it('계획 총 길이도 예산 안이다', () => {
    const { steps, finalGrid } = twelveCascades()
    expect(buildCascadePlan(START, steps, { finalGrid }).totalMs).toBeLessThanOrEqual(13000)
    expect(buildCascadePlan(START, steps, { finalGrid, speed: 'quick' }).totalMs).toBeLessThanOrEqual(9000)
    expect(buildCascadePlan(START, steps, { finalGrid, speed: 'turbo' }).totalMs).toBeLessThanOrEqual(5000)
    expect(buildCascadePlan(START, steps, { finalGrid, reducedMotion: true }).totalMs).toBeLessThanOrEqual(2400)
  })

  it('1~3단계는 기본 길이, 4단계부터 줄고 하한 0.4배에서 멈춘다', () => {
    expect(cascadeStepDurations(0, 'normal', REELS).totalMs).toBe(1620)
    expect(cascadeStepDurations(2, 'normal', REELS).totalMs).toBe(1620)
    expect(cascadeStepDurations(3, 'normal', REELS).totalMs).toBeLessThan(1620)
    const floor = cascadeStepDurations(11, 'normal', REELS).totalMs
    expect(floor).toBe(cascadeStepDurations(20, 'normal', REELS).totalMs)
    expect(floor).toBeGreaterThanOrEqual(Math.floor(1620 * 0.4) - 2)
  })

  it('모션 축소가 속도보다 우선한다', () => {
    expect(cascadeSpeedRow('turbo', true)).toBe('reduced')
    expect(cascadeSpeedRow(undefined, false)).toBe('normal')
    expect(cascadeStepDurations(0, 'reduced', REELS).popMs).toBe(0)
  })

  it('스태거를 다 더해도 낙하 안에 들어간다', () => {
    for (const row of ['normal', 'quick', 'turbo', 'reduced'] as const) {
      for (let i = 0; i < 12; i += 1) {
        const d = cascadeStepDurations(i, row, REELS)
        expect(d.staggerMs * (REELS - 1)).toBeLessThan(d.dropMs)
        expect(d.highlightMs + d.popMs + d.dropMs).toBe(d.totalMs)
      }
    }
  })
})

describe('STOP 압축', () => {
  it('단계 길이 = clamp(1200 / 남은 수, 90, 220)', () => {
    expect(cascadeSkipStepMs(1)).toBe(220)
    expect(cascadeSkipStepMs(6)).toBe(200)
    expect(cascadeSkipStepMs(12)).toBe(100)
    expect(cascadeSkipStepMs(20)).toBe(90)
  })

  it.each([0, 1, 5, 11])('%d단계에서 STOP: 낙하 ≥ 45ms, 순서 그대로, 합 ≤ 1.29s', (at) => {
    const { steps, finalGrid } = twelveCascades()
    for (const speed of ['normal', 'quick', 'turbo'] as const) {
      const plan = buildCascadePlan(START, steps, { finalGrid, speed })
      const schedule = compressedCascadeSchedule(plan, at)
      expect(schedule).toHaveLength(plan.steps.length - at)
      for (const d of schedule) {
        expect(d.dropMs).toBeGreaterThanOrEqual(45)
        expect(d.highlightMs + d.popMs + d.dropMs).toBe(d.totalMs)
        expect(d.staggerMs * (REELS - 1)).toBeLessThan(d.dropMs)
      }
      expect(schedule.reduce((sum, d) => sum + d.totalMs, 0)).toBeLessThanOrEqual(1290)
      // 단계를 버리지 않는다. 남은 단계가 원래 순서 그대로 다 남는다.
      expect(plan.steps.slice(at).map((s) => s.index)).toEqual(Array.from({ length: 12 - at }, (_, i) => at + i))
    }
  })

  it('어떤 남은 수에서도 합이 1.29s를 넘지 않는다', () => {
    for (let remaining = 1; remaining <= 12; remaining += 1) {
      const step = compressCascadeStep(cascadeSkipStepMs(remaining), REELS)
      expect(step.totalMs * remaining).toBeLessThanOrEqual(1290)
      expect(step.dropMs).toBeGreaterThanOrEqual(45)
    }
  })

  it('압축 단계에도 낙하 구간이 있다 (제자리 교체 경로 없음)', () => {
    const d = compressCascadeStep(90, REELS)
    expect(d).toMatchObject({ dropMs: 45, totalMs: 90 })
    expect(d.popMs).toBeGreaterThan(0)
  })
})

describe('클러스터 외곽선', () => {
  it('정사각 2x2는 네 변만 남는다', () => {
    const segments = clusterOutlineSegments([[0, 0], [1, 0], [0, 1], [1, 1]])
    expect(segments).toHaveLength(4)
    expect(segments).toEqual(
      expect.arrayContaining([
        { x1: 0, y1: 0, x2: 2, y2: 0 },
        { x1: 0, y1: 2, x2: 2, y2: 2 },
        { x1: 0, y1: 0, x2: 0, y2: 2 },
        { x1: 2, y1: 0, x2: 2, y2: 2 },
      ]),
    )
  })

  it('L자 그룹의 둘레 길이는 칸 변 수와 같고 안쪽 변은 없다', () => {
    const cells: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]
    const segments = clusterOutlineSegments(cells)
    const perimeter = segments.reduce((sum, s) => sum + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1), 0)
    expect(perimeter).toBe(12)
    // 칸 (0,1)과 (0,2) 사이 변(y=2, x 0..1)은 안쪽이라 없다 — 위 변 목록에 x=0..1,y=2가 아래 칸 (0,2)의 위로 나오면 안 된다.
    expect(segments.some((s) => s.y1 === 2 && s.y2 === 2 && s.x1 === 0 && s.x2 === 1)).toBe(false)
  })
})

describe('클러스터 게임 배선', () => {
  const candy = loadGameMath('candy-cluster-pop')

  it('betUnitCount는 클러스터에서 1이다', () => {
    expect(candy.payModel).toBe('cluster')
    expect(betUnitCount(candy)).toBe(1)
  })

  it('totalBet이 없어도 0으로 나누지 않는다', () => {
    const wins = [clusterWin('a', [[0, 0]], 0, 2, 400)]
    expect(Number.isFinite(winBetMultiple(wins, candy))).toBe(true)
  })

  it('보너스 트리거 수는 엔진 featureTriggerCount와 같다', () => {
    expect(featureTriggerCount(candy)).toBe(engineFeatureTriggerCount(candy))
    expect(featureTriggerCount(candy)).toBe(candy.orderRound?.trigger)
  })

  it('주문 카드 라운드 게임도 기대감 릴을 고른다', () => {
    const scatter = candy.scatter?.symbol as SymbolId
    const trigger = featureTriggerCount(candy) as number
    // 스캐터만 깔린 가짜 스트립으로 앞 릴에서 trigger-1개를 채운다.
    const plain = candy.strips[0]?.find((s) => s !== scatter) as SymbolId
    const strips = candy.strips.map((_, reel) => {
      const strip: SymbolId[] = new Array<SymbolId>(10).fill(plain)
      if (reel < trigger - 1) strip[0] = scatter
      return strip
    })
    const math = { ...candy, strips }
    expect(anticipatedReels(math, new Array(candy.reels).fill(0))).toContain(trigger - 1)
  })
})

describe('연쇄 모드 showWins 계획', () => {
  const candy = loadGameMath('candy-cluster-pop')
  const wins = [clusterWin('a', [[0, 0]], 0, 1, 200), clusterWin('b', [[1, 0]], 1, 2, 300)]

  it('A단계와 피처만 있고 라인 스텝은 없다', () => {
    const steps = buildPresentation(wins, candy, { mode: 'cascade', totalBet: 100 })
    expect(steps.map((s) => s.phase)).toEqual(['all'])
    expect(shouldLoopPresentation({ mode: 'cascade' })).toBe(false)
    expect(shouldLoopPresentation({ mode: 'standard' })).toBe(true)
  })

  it('롤업은 연쇄 합에서 스캐터·주문 상품까지 간다', () => {
    const steps = buildPresentation(wins, candy, {
      mode: 'cascade',
      totalBet: 100,
      features: [
        { type: 'scatterWin', symbol: 's', count: 3, win: 50, positions: [[2, 2]] },
        { type: 'orderComplete', id: 'o1', prize: 1000 },
      ],
    })
    const all = steps[0]
    expect(all?.phase).toBe('all')
    if (all?.phase !== 'all') return
    expect(all.fromAmount).toBe(500)
    expect(all.totalWin).toBe(1550)
    expect(all.cascade).toBe(true)
    // 등급은 총합 기준: 1550 / 100 = 15.5배 → big.
    expect(all.tier).toBe('big')
    expect(all.scatters).toEqual([[2, 2]])
  })

  it('다중 당첨 머무름은 연쇄 2단계 이상일 때만', () => {
    const two = buildPresentation(wins, candy, { mode: 'cascade', totalBet: 1000 })[0]
    const oneStepTwoWins = buildPresentation(
      [clusterWin('a', [[0, 0]], 0, 1, 200), clusterWin('b', [[1, 0]], 0, 1, 300)],
      candy,
      { mode: 'cascade', totalBet: 1000 },
    )[0]
    expect(cascadeStepCountOf(wins)).toBe(2)
    expect(two?.durationMs).toBe(PHASE_ALL_MS + PHASE_ALL_MULTI_DWELL_MS)
    expect(oneStepTwoWins?.durationMs).toBe(PHASE_ALL_MS)
  })

  it('지급이 전혀 없으면 빈 목록이다', () => {
    expect(buildPresentation([], candy, { mode: 'cascade', totalBet: 100 })).toEqual([])
  })
})

describe('frameLayout.gapRatio', () => {
  it('없으면 live 고정값 그대로다', () => {
    const base = computeLayout({ containerWidth: 430, reels: 6, rows: 5 })
    expect(base.gap).toBeCloseTo(base.symbolSize * SYMBOL_GAP_RATIO)
  })

  it('주면 간격이 그 비율이고 심볼이 커진다', () => {
    const base = computeLayout({ containerWidth: 430, reels: 6, rows: 5 })
    const tight = computeLayout({ containerWidth: 430, reels: 6, rows: 5, gapRatio: 0.04 })
    expect(tight.gap).toBeCloseTo(tight.symbolSize * 0.04)
    expect(tight.symbolSize).toBeGreaterThan(base.symbolSize)
  })
})

describe('실제 엔진 연쇄', () => {
  const candy = loadGameMath('candy-cluster-pop')

  it('엔진 스핀의 cascades를 접으면 finalGrid와 같고, 화면 시간과 STOP 예산을 지킨다', () => {
    let seen = 0
    for (let i = 0; i < 3000 && seen < 60; i += 1) {
      const result = spinUnchecked(candy, 100, createSeededRng(`cascade:${i}`))
      const cascades = result.cascades ?? []
      if (cascades.length === 0) continue
      seen += 1
      const plan = buildCascadePlan(result.grid, cascades, { finalGrid: result.finalGrid })
      expect(plan.mismatch).toBe(false)
      expect(plan.steps.at(-1)?.gridAfter).toEqual(result.finalGrid)
      expect(plan.steps.at(-1)?.cumulativeWin).toBe(cascades.reduce((sum, c) => sum + c.stepWin, 0))
      expect(plan.totalMs).toBeLessThanOrEqual(13000)
      const schedule = compressedCascadeSchedule(plan, 0)
      expect(schedule.reduce((sum, d) => sum + d.totalMs, 0)).toBeLessThanOrEqual(1290)
    }
    expect(seen).toBeGreaterThan(0)
  })
})
