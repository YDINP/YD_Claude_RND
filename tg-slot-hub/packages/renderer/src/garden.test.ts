import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyGardenStep,
  createSeededRng,
  foldGarden,
  gardenBoundsFor,
  gardenNewCells,
  spinUnchecked,
  type GardenBounds,
  type GardenStep,
  type GardenTrigger,
  type SymbolId,
} from '@tgslot/slot-engine'
import {
  GARDEN_ANTICIPATION_MS,
  GARDEN_STAGES,
  GARDEN_SUN_MS,
  applyGardenStepToGrid,
  buildGardenPlan,
  buildGardenSunPlan,
  compressGardenStep,
  compressedGardenSchedule,
  foldGardenGrid,
  gardenActiveReels,
  gardenAnticipatedReels,
  gardenBounds,
  gardenCameraFor,
  gardenCellRect,
  gardenGrowDuration,
  gardenMoves,
  gardenNewCellsOf,
  gardenPlanIndexOf,
  gardenPopScale,
  gardenScatterCount,
  gardenSkipStepMs,
  gardenStepDurations,
  gardenWindowFromStops,
  gardenWorstCaseMs,
  type GardenSpeedRow,
} from './garden.js'
import { computeLayout, reelLeft, rowTop } from './layout.js'
import { loadGameMath } from './testSupport.js'

const garden = loadGameMath('greenhouse-garden')
const BET = 100
const MAX_TIER = (garden.growBoard?.seedTiers.length ?? 1) - 1

function gardenOf(result: ReturnType<typeof spinUnchecked>): GardenTrigger | undefined {
  const feature = result.features.find((f) => f.type === 'garden')
  return feature?.type === 'garden' ? feature : undefined
}

describe('정원 판 접기 — 엔진과 같은 규칙', () => {
  it('범위 표·새 칸이 엔진과 같다', () => {
    GARDEN_STAGES.forEach((bounds, stage) => {
      expect(bounds).toEqual(gardenBoundsFor(stage))
      expect(gardenBounds(stage)).toEqual(bounds)
    })
    for (let stage = 0; stage < GARDEN_STAGES.length - 1; stage += 1) {
      expect(gardenNewCellsOf(gardenBounds(stage), gardenBounds(stage + 1))).toEqual(
        gardenNewCells(gardenBoundsFor(stage), gardenBoundsFor(stage + 1)),
      )
    }
  })

  it('실스핀 단계를 렌더러 사본으로 접어도 엔진 finalGrid·범위·씨앗과 같다', () => {
    let spins = 0
    let withGrow = 0
    let withSeed = 0
    for (let i = 0; i < 4000 && withGrow < 25; i += 1) {
      const result = spinUnchecked(garden, BET, createSeededRng(`garden-render:${i}`))
      const feature = gardenOf(result)
      expect(feature).toBeDefined()
      if (feature === undefined) continue
      spins += 1
      const engineFold = foldGarden(result.grid, feature.start, feature.steps, feature.startSeeds, MAX_TIER)
      const folded = foldGardenGrid(result.grid, feature.start, feature.steps, feature.startSeeds, MAX_TIER)
      expect(folded.grid).toEqual(engineFold.grid)
      expect(folded.grid).toEqual(feature.finalGrid)
      expect(folded.bounds).toEqual(engineFold.bounds)
      expect(folded.seeds).toEqual(engineFold.seeds)
      const plan = buildGardenPlan(
        result.grid,
        { start: feature.start, startSeeds: feature.startSeeds, steps: feature.steps, finalGrid: feature.finalGrid },
        { maxTier: MAX_TIER },
      )
      expect(plan.mismatch).toBe(false)
      expect(plan.finalBounds).toEqual(feature.final)
      expect(plan.steps.at(-1)?.gridAfter ?? result.grid).toEqual(feature.finalGrid)
      let bounds: GardenBounds = feature.start
      let grid: SymbolId[][] = result.grid
      for (const planned of plan.steps) {
        expect(planned.boundsBefore).toEqual(bounds)
        expect(planned.gridAfter).toEqual(applyGardenStep(grid, bounds, planned.step))
        bounds = planned.boundsAfter
        grid = planned.gridAfter
      }
      if (plan.steps.some((s) => s.grow !== undefined)) withGrow += 1
      if (plan.steps.some((s) => s.groups.some((g) => g.seed !== undefined))) withSeed += 1
      expect(plan.steps.at(-1)?.cumulativeWin ?? 0).toBe(feature.steps.reduce((sum, s) => sum + s.stepWin, 0))
    }
    expect(spins).toBeGreaterThan(0)
    expect(withGrow).toBeGreaterThan(0)
    expect(withSeed).toBeGreaterThanOrEqual(0)
  })

  it('활성 범위 밖 칸(덮인 화분)은 단계가 건드리지 않는다', () => {
    const bounds = gardenBounds(0)
    const grid: SymbolId[][] = Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, reel) => `s${row}${reel}`))
    const step = {
      index: 0,
      removed: [
        [2, 3],
        [2, 4],
      ] as [number, number][],
      refill: [['n0', 'n1'], [], [], []],
    }
    const next = applyGardenStepToGrid(grid, bounds, step)
    for (let row = 0; row < 8; row += 1) {
      for (let reel = 0; reel < 8; reel += 1) {
        const inside = reel >= 2 && reel < 6 && row >= 2 && row < 6
        if (!inside) expect(next[row]?.[reel]).toBe(grid[row]?.[reel])
      }
    }
    // 위에서 새 꽃 2송이가 떨어지고 남은 꽃은 아래로 쌓인다.
    expect([2, 3, 4, 5].map((row) => next[row]?.[2])).toEqual(['n0', 'n1', 's22', 's52'])
  })

  it('어긋난 단계는 던진다(리필 길이·범위 밖 칸)', () => {
    const bounds = gardenBounds(0)
    const grid: SymbolId[][] = Array.from({ length: 8 }, () => new Array<SymbolId>(8).fill('x'))
    expect(() => applyGardenStepToGrid(grid, bounds, { index: 0, removed: [[0, 0]], refill: [[], [], [], []] })).toThrow(RangeError)
    expect(() => applyGardenStepToGrid(grid, bounds, { index: 0, removed: [[2, 2]], refill: [[], [], [], []] })).toThrow(RangeError)
    expect(() => applyGardenStepToGrid(grid, bounds, { index: 0, removed: [], refill: [['x'], [], [], []] })).toThrow(RangeError)
  })

  it('이동 목록: 남은 칸은 아래로, 리필은 활성 범위 위에서 들어온다', () => {
    const bounds = gardenBounds(0)
    const grid: SymbolId[][] = Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, reel) => `s${row}${reel}`))
    const step: Pick<GardenStep, 'removed' | 'refill'> = {
      removed: [[3, 4]],
      refill: [[], ['n'], [], []],
    }
    const moves = gardenMoves(grid, bounds, step)
    // 열 3: 행 2,3이 한 칸씩 내려오고 새 꽃이 맨 위(행 2)에 선다. 새 꽃은 활성 범위 위(행 1)에서 출발한다.
    expect(moves).toContainEqual({ reel: 3, fromRow: 1, toRow: 2, symbol: 'n', refill: true })
    expect(moves).toContainEqual({ reel: 3, fromRow: 2, toRow: 3, symbol: 's23', refill: false })
    expect(moves).toContainEqual({ reel: 3, fromRow: 3, toRow: 4, symbol: 's33', refill: false })
    expect(moves.every((move) => move.reel === 3)).toBe(true)
  })
})

describe('정원 카메라', () => {
  const layout = computeLayout({ containerWidth: 430, containerHeight: 430, reels: 8, rows: 8, gapRatio: 0.04, chrome: false })

  it('8×8은 항등이다', () => {
    const camera = gardenCameraFor(layout, gardenBounds(4))
    expect(camera.scale).toBeCloseTo(1, 10)
    expect(camera.x).toBeCloseTo(0, 6)
    expect(camera.y).toBeCloseTo(0, 6)
  })

  it('활성 범위가 창을 꽉 채운다(왼쪽·오른쪽·위·아래 칸 경계가 창 경계와 같다)', () => {
    for (let stage = 0; stage < GARDEN_STAGES.length; stage += 1) {
      const bounds = gardenBounds(stage)
      const camera = gardenCameraFor(layout, bounds)
      const left = gardenCellRect(layout, camera, bounds.x, bounds.y)
      const right = gardenCellRect(layout, camera, bounds.x + bounds.size - 1, bounds.y + bounds.size - 1)
      expect(left.x).toBeCloseTo(layout.reelArea.x, 4)
      expect(left.y).toBeCloseTo(layout.reelArea.y, 4)
      expect(right.x + right.w).toBeCloseTo(layout.reelArea.x + layout.reelArea.width, 4)
      expect(right.y + right.h).toBeCloseTo(layout.reelArea.y + layout.reelArea.height, 4)
    }
  })

  it('4×4 셀은 430px 창에서 100px대, 8×8은 50px대로 읽힌다', () => {
    const small = gardenCellRect(layout, gardenCameraFor(layout, gardenBounds(0)), 2, 2)
    const large = gardenCellRect(layout, gardenCameraFor(layout, gardenBounds(4)), 0, 0)
    expect(small.w).toBeGreaterThan(90)
    expect(large.w).toBeGreaterThan(45)
    expect(large.w).toBeLessThan(55)
    expect(reelLeft(layout, 0)).toBeLessThan(reelLeft(layout, 1))
    expect(rowTop(layout, 0)).toBeLessThan(rowTop(layout, 1))
  })
})

describe('정원 시간표', () => {
  const rows: GardenSpeedRow[] = ['normal', 'quick', 'turbo', 'reduced']

  it('단계 길이: 기본 760/530/400/180ms, 3번째부터 ×0.78·하한 0.27', () => {
    const total = (row: GardenSpeedRow, index = 0): number =>
      gardenStepDurations({ index, row, columns: 4, hasPop: true }).totalMs
    expect(total('normal')).toBe(760)
    expect(total('quick')).toBe(530)
    expect(total('turbo')).toBe(400)
    expect(total('reduced')).toBe(180)
    expect(gardenPopScale(1)).toBe(1)
    expect(gardenPopScale(2)).toBeCloseTo(0.78, 5)
    expect(gardenPopScale(15)).toBe(0.27)
    expect(total('normal', 15)).toBeLessThan(total('normal', 3))
  })

  it('성장 길이 650 → 520 → 420 → 340(normal)', () => {
    expect([0, 1, 2, 3].map((g) => gardenGrowDuration(g, 'normal'))).toEqual([650, 520, 423, 338])
    expect(gardenGrowDuration(0, 'reduced')).toBe(200)
  })

  it('최악 스핀 게이트: 연쇄 16 + 성장 4 + 개화 2 + 기대감 1', () => {
    const gate: Record<GardenSpeedRow, number> = { normal: 8200, quick: 5800, turbo: 4000, reduced: 2600 }
    for (const row of rows) {
      const base = gardenWorstCaseMs(row, { popSteps: 16, grows: 4, blooms: 2, anticipations: 1, suns: 0 })
      expect(base).toBeLessThanOrEqual(gate[row])
      const withSun = gardenWorstCaseMs(row, { popSteps: 16, grows: 4, blooms: 2, anticipations: 1, suns: 1 })
      expect(withSun - base).toBe(GARDEN_SUN_MS[row])
      expect(withSun).toBeLessThanOrEqual(gate[row] + GARDEN_SUN_MS[row])
    }
  })

  it('개화 +240ms는 처음 두 번만, 성장 전용 단계는 팝 구간이 없다', () => {
    const at = (bloomOrdinal: number): number =>
      gardenStepDurations({ index: 0, row: 'normal', columns: 4, hasPop: true, bloomOrdinal }).bloomMs
    expect([at(0), at(1), at(2)]).toEqual([240, 240, 0])
    const growOnly = gardenStepDurations({ index: 3, row: 'normal', columns: 5, hasPop: false, growIndex: 1 })
    expect(growOnly.highlightMs + growOnly.popMs + growOnly.dropMs).toBe(0)
    expect(growOnly.growMs).toBe(520)
    expect(growOnly.totalMs).toBe(520)
  })

  it('기대감 지연은 turbo·모션 축소에서 0', () => {
    expect(GARDEN_ANTICIPATION_MS.turbo).toBe(0)
    expect(GARDEN_ANTICIPATION_MS.reduced).toBe(0)
    expect(GARDEN_ANTICIPATION_MS.normal).toBe(300)
    const d = gardenStepDurations({ index: 0, row: 'normal', columns: 4, hasPop: true, growIndex: 0, anticipate: true })
    expect(d.anticipationMs).toBe(300)
    expect(d.totalMs).toBe(760 + 300 + 650)
  })

  it('STOP: 단계 길이 [90, 220]ms, 압축 합 ≤ 예산 근처, 성장은 150ms', () => {
    expect(gardenSkipStepMs(1)).toBe(220)
    expect(gardenSkipStepMs(100)).toBe(90)
    const step = compressGardenStep(120, 5, true, true)
    expect(step.growMs).toBe(150)
    expect(step.highlightMs + step.popMs + step.dropMs).toBe(120)
    expect(step.dropMs).toBeGreaterThanOrEqual(45)
    const none = compressGardenStep(120, 5, false, true)
    expect(none.totalMs).toBe(150)
  })

  it('실스핀 계획: 총 길이가 최악 게이트 안, STOP 압축은 1.2s 안팎(성장 합 제외)', () => {
    let checked = 0
    for (let i = 0; i < 6000 && checked < 40; i += 1) {
      const result = spinUnchecked(garden, BET, createSeededRng(`garden-time:${i}`))
      const feature = gardenOf(result)
      if (feature === undefined || feature.steps.length < 2) continue
      checked += 1
      const plan = buildGardenPlan(
        result.grid,
        { start: feature.start, startSeeds: feature.startSeeds, steps: feature.steps, finalGrid: feature.finalGrid },
        { maxTier: MAX_TIER, scatter: { symbol: 'scatter', trigger: 3 } },
      )
      expect(plan.totalMs).toBeLessThanOrEqual(8200)
      const grows = plan.steps.filter((s) => s.grow !== undefined).length
      const schedule = compressedGardenSchedule(plan, 0)
      const popPart = schedule.reduce((sum, d) => sum + d.highlightMs + d.popMs + d.dropMs, 0)
      expect(popPart).toBeLessThanOrEqual(1200 + plan.steps.length * 2)
      expect(schedule.reduce((sum, d) => sum + d.growMs, 0)).toBe(grows * 150)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('햇살 계획: 씨앗이 한 등급 오르고 새 씨앗이 심긴다', () => {
    const before = [{ reel: 1, row: 1, tier: 0 }, { reel: 2, row: 2, tier: MAX_TIER }]
    const plan = buildGardenSunPlan(
      before,
      { grown: 1, planted: [{ reel: 3, row: 3, tier: 0 }], seeds: [{ reel: 1, row: 1, tier: 1 }, { reel: 2, row: 2, tier: MAX_TIER }, { reel: 3, row: 3, tier: 0 }] },
      { maxTier: MAX_TIER },
    )
    expect(plan.grownSeeds.find((s) => s.reel === 1)?.tier).toBe(1)
    expect(plan.grownSeeds.find((s) => s.reel === 2)?.tier).toBe(MAX_TIER)
    expect(plan.after).toHaveLength(3)
    expect(plan.durationMs).toBe(GARDEN_SUN_MS.normal)
  })
})

describe('정원 착지·기대감', () => {
  const bounds = gardenBounds(0)

  it('활성 열만 엇갈려 선다(카메라 밖 열은 가장 가까운 활성 열을 따른다)', () => {
    const active = gardenActiveReels(bounds)
    expect(active).toEqual({ from: 2, count: 4 })
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((reel) => gardenPlanIndexOf(reel, active))).toEqual([0, 0, 0, 1, 2, 3, 3, 3])
  })

  function windowWith(cells: [number, number][]): SymbolId[][] {
    const grid: SymbolId[][] = Array.from({ length: 8 }, () => new Array<SymbolId>(8).fill('clover'))
    for (const [reel, row] of cells) (grid[row] as SymbolId[])[reel] = 'scatter'
    return grid
  }

  it('덮인 화분 속 물뿌리개로는 감속하지 않는다', () => {
    // 활성 4×4(열 2~5, 행 2~5)에 2개 → 다음 열 감속. 판 밖(0,0)(7,7) 물뿌리개는 세지 않는다.
    const inside = windowWith([[2, 2], [3, 3], [0, 0], [7, 7], [1, 4], [6, 4]])
    expect(gardenAnticipatedReels(garden, inside, bounds)).toEqual([4, 5])
    // 판 밖에만 있으면 감속이 없다.
    const outside = windowWith([[0, 0], [1, 1], [7, 7], [6, 6]])
    expect(gardenAnticipatedReels(garden, outside, bounds)).toEqual([])
    expect(gardenScatterCount(outside, bounds, 'scatter')).toBe(0)
  })

  it('이미 3개가 되면 더는 감속하지 않는다', () => {
    const grid = windowWith([[2, 2], [3, 3], [3, 4]])
    expect(gardenAnticipatedReels(garden, grid, bounds)).toEqual([])
  })

  it('스트립·정지 위치에서 8×8 창을 되짚는다', () => {
    const stops = [0, 1, 2, 3, 4, 5, 6, 7]
    const window = gardenWindowFromStops(garden.strips, stops, 8)
    expect(window).toHaveLength(8)
    expect(window[0]?.[3]).toBe(garden.strips[3]?.[3])
    expect(window[7]?.[0]).toBe(garden.strips[0]?.[7])
  })

  it('성장 직전 활성 판에 스캐터가 trigger-1개일 때만 기대감 지연이 붙는다(결과가 아니라 판 상태가 조건)', () => {
    let withAnticipation = 0
    let without = 0
    for (let i = 0; i < 8000 && (withAnticipation === 0 || without === 0); i += 1) {
      const result = spinUnchecked(garden, BET, createSeededRng(`garden-anticipation:${i}`))
      const feature = gardenOf(result)
      if (feature === undefined) continue
      const plan = buildGardenPlan(
        result.grid,
        { start: feature.start, startSeeds: feature.startSeeds, steps: feature.steps, finalGrid: feature.finalGrid },
        { maxTier: MAX_TIER, scatter: { symbol: 'scatter', trigger: 3 } },
      )
      for (const planned of plan.steps) {
        if (planned.grow === undefined) continue
        const count = gardenScatterCount(planned.gridAfter, planned.boundsBefore, 'scatter')
        expect(planned.durations.anticipationMs > 0).toBe(count === 2)
        if (count === 2) withAnticipation += 1
        else without += 1
      }
    }
    expect(without).toBeGreaterThan(0)
  })
})

describe('정원 배선 — 렌더러 소스 계약', () => {
  const read = (...parts: string[]): string =>
    readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8').replace(/\r\n/g, '\n')
  const renderer = (): string => read('pixi', 'pixiRenderer.ts')

  it('정원 팩만 카메라 층을 쓰고 나머지 팩의 층 순서는 그대로다', () => {
    const source = renderer()
    const standard = source.indexOf('options.math.growBoard === undefined) {')
    expect(standard).toBeGreaterThan(0)
    const body = source.slice(standard, source.indexOf('} else {', standard))
    // 기존 팩: 패널 → 릴 → 마스크 → 윤곽 → 변형 → 피처 → 모드 → 승리 → fx (카메라 층 없음).
    expect(body).not.toContain('cameraLayer')
    expect(body.indexOf('this.backdropGraphics')).toBeLessThan(body.indexOf('this.reelsLayer'))
    // 마스크는 카메라 층 밖이라 창 크기가 배율과 무관하다.
    const garden = source.slice(source.indexOf('} else {', standard), source.indexOf('this.root.addChild(this.backgroundLayer)'))
    expect(garden).toContain('this.cameraLayer.addChild(')
    expect(garden.indexOf('this.maskGraphics')).toBeGreaterThan(garden.indexOf('this.cameraLayer, this.maskGraphics') - 1)
  })

  it('끼어들기·STOP·해제가 정원 연출을 같은 자리에서 정리한다', () => {
    const source = renderer()
    const killAt = source.indexOf('private killSpinTimelines(')
    expect(source.slice(killAt, killAt + 800)).toContain('this.activeGarden?.finish()')
    const skipAt = source.indexOf('private skipSpin(')
    expect(source.slice(skipAt, skipAt + 1400)).toContain('this.activeGarden?.compress()')
    const destroyAt = source.indexOf('  destroy(): void {')
    const destroyBody = source.slice(destroyAt, source.indexOf('\n  }', destroyAt))
    expect(destroyBody).toContain('this.gardenScene?.destroy()')
    expect(destroyBody).toContain('this.gardenSymbols.clear()')
    expect(destroyBody).toContain('this.gardenDebris.clear()')
    expect(destroyBody).toContain('this.releaseFreeSpinsBackground()')
  })

  it('단계는 끝날 때 서버 판·범위로 확정하고 start에는 end가 짝으로 간다', () => {
    const source = renderer()
    expect(source).toContain('this.applyGridOverride(planned.gridAfter)')
    expect(source).toContain('this.setGardenCamera(planned.boundsAfter, 0)')
    expect(source).toContain('this.applyGridOverride(plan.finalGrid)')
    expect(source).toContain("phase: 'start',")
    expect(source).toContain("phase: 'end',")
    // 성장 신호가 시작만 나가고 끊기면 끝 신호를 보충한다.
    expect(source).toContain("if (growStarted && !growEnded) emitGrow('end')")
  })

  it('정원 프리스핀은 전용 스트립에서 착지하고, 카메라 밖 열은 소리를 내지 않는다', () => {
    const source = renderer()
    expect(source).toContain('this.strips = this.stripsFor(opts)')
    expect(source).toContain('growBoard?.bonus.strips')
    expect(source).toContain('plan.reel - active.from')
  })

  it('프리스핀 배경은 정원 팩에서 프리스핀 동안만 쥔다', () => {
    const source = renderer()
    expect(source).toContain('options.math.growBoard === undefined ? loadImageTexture(options.theme.backgroundFreeSpins)')
    expect(source).toContain("if (to === 'base') this.releaseFreeSpinsBackground()")
  })

  it('장면은 풀·텍스처를 한 번만 만들고 타임라인을 장부로 센다', () => {
    const source = read('pixi', 'gardenFx.ts')
    expect(source).toContain('liveTimelines')
    expect(source).toContain('this.liveTimelines.delete(timeline)')
    // 번호판·씨앗 얼굴·덮개 텍스처는 생성자에서만 만든다(스텝마다 만들지 않는다).
    const stepAt = source.indexOf('  playStep(')
    expect(source.slice(stepAt)).not.toContain('createCanvasTexture(')
  })
})
