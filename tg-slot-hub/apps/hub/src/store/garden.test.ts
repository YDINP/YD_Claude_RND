import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RendererEvent } from '@tgslot/renderer'
import type { FreeSpinsState } from '@tgslot/shared'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'
import {
  INITIAL_GARDEN_VIEW,
  gardenBaseView,
  gardenBoundsOfStage,
  gardenMeterOf,
  gardenThresholds,
  gardenViewFromCarry,
  isGardenEvent,
  reduceGardenView,
  type GardenView,
} from './garden'

function loadMath(): GameMath {
  const path = resolve(process.cwd(), '..', '..', 'games', 'greenhouse-garden', 'math.json')
  return parseGameMath(JSON.parse(readFileSync(path, 'utf8')) as unknown)
}

const math = loadMath()
const view = (over: Partial<GardenView> = {}): GardenView => ({ ...gardenBaseView(math), ...over })

describe('성장 막대 표시값', () => {
  it('4×4 시작: 문턱 10칸 중 0칸, 다음 크기는 5×5', () => {
    const meter = gardenMeterOf(view())
    expect(meter).toMatchObject({ size: 4, nextSize: 5, toNext: 10, fill: 0, near: false, full: false, sun: false })
  })

  it('문턱은 math.json 값을 그대로 쓴다(기본 / 프리스핀 전용)', () => {
    expect(gardenThresholds(math, false)).toEqual(math.growBoard?.thresholds)
    expect(gardenThresholds(math, true)).toEqual(math.growBoard?.bonus.thresholds)
  })

  it('막대는 직전 문턱에서 다음 문턱까지의 비율이다', () => {
    const [t1 = 0, t2 = 0] = math.growBoard?.thresholds ?? []
    const popped = t1 + Math.floor((t2 - t1) / 2)
    const meter = gardenMeterOf(view({ size: 5, popped }))
    expect(meter.nextSize).toBe(6)
    expect(meter.fill).toBeGreaterThan(0.4)
    expect(meter.fill).toBeLessThan(0.6)
    expect(meter.toNext).toBe(t2 - popped)
  })

  it('문턱 2칸 안이면 봉오리가 부푼다(실제 진행도일 때만)', () => {
    const [t1] = math.growBoard?.thresholds as number[]
    expect(gardenMeterOf(view({ popped: (t1 as number) - 2 })).near).toBe(true)
    expect(gardenMeterOf(view({ popped: (t1 as number) - 3 })).near).toBe(false)
    expect(gardenMeterOf(view({ popped: 0 })).near).toBe(false)
  })

  it('8×8 기본 게임은 «완성», 프리스핀은 «햇살까지 n칸»', () => {
    const full = gardenMeterOf(view({ size: 8, popped: 60 }))
    expect(full).toMatchObject({ full: true, sun: false, fill: 1 })
    const thresholds = gardenThresholds(math, true)
    const base = thresholds[3] as number
    const every = math.growBoard?.bonus.sunEvery as number
    const round = view({ size: 8, round: true, sunEvery: every, thresholds, popped: base + 3, suns: 0 })
    const meter = gardenMeterOf(round)
    expect(meter).toMatchObject({ sun: true, full: true, toNext: every - 3 })
    // 햇살을 한 번 받으면 다음 목표가 sunEvery칸 뒤로 간다.
    const after = gardenMeterOf({ ...round, suns: 1, popped: base + every + 5 })
    expect(after.toNext).toBe(every - 5)
  })
})

describe('이벤트 접기', () => {
  const stepStart = (popped: number, bloomed = 0): RendererEvent => ({
    type: 'gardenStep',
    index: 0,
    total: 1,
    phase: 'start',
    stepWin: 10,
    cumulativeWin: 10,
    popped,
    size: 4,
    bloomed,
    seedMultiplier: 1,
    wins: [],
  })

  it('팝 단계 시작에 막대가 오른다(내려가지 않는다)', () => {
    let current = view()
    current = reduceGardenView(current, stepStart(7))
    expect(current.popped).toBe(7)
    current = reduceGardenView(current, stepStart(4))
    expect(current.popped).toBe(7)
  })

  it('성장 시작에 크기가 오르고 신호가 한 번 간다. 개화도 신호가 간다', () => {
    const grown = reduceGardenView(view(), {
      type: 'gardenGrow',
      phase: 'start',
      from: { x: 2, y: 2, size: 4 },
      to: { x: 2, y: 1, size: 5 },
      size: 5,
      newCells: 9,
      newSeeds: 1,
      grown: 0,
      popped: 10,
    })
    expect(grown.size).toBe(5)
    expect(grown.grewTick).toBe(1)
    const bloom = reduceGardenView(grown, stepStart(12, 2))
    expect(bloom.bloomTick).toBe(1)
  })

  it('끝 이벤트와 정원이 아닌 이벤트는 값을 바꾸지 않는다', () => {
    const base = view({ size: 6, popped: 20 })
    expect(reduceGardenView(base, { ...(stepStart(30) as Extract<RendererEvent, { type: 'gardenStep' }>), phase: 'end' })).toBe(base)
    expect(reduceGardenView(base, { type: 'spinEnd' })).toBe(base)
    expect(isGardenEvent({ type: 'spinEnd' })).toBe(false)
    expect(isGardenEvent(stepStart(1))).toBe(true)
  })

  it('햇살 시작에 받은 횟수가 는다', () => {
    const next = reduceGardenView(view({ round: true, suns: 1 }), { type: 'gardenSun', phase: 'start', grown: 2, planted: 2 })
    expect(next.suns).toBe(2)
  })
})

describe('서버 이월 상태에서 복원', () => {
  const free = (carry: unknown): FreeSpinsState =>
    ({ gameId: 'greenhouse-garden', left: 5, total: 10, multiplier: 1, totalBet: 20, accumulatedWin: 0, carry }) as unknown as FreeSpinsState

  it('크기·막대·햇살 횟수를 carry.garden에서 읽는다', () => {
    const restored = gardenViewFromCarry(
      math,
      free({ garden: { stage: 3, popped: 50, seeds: [], retriggers: 0, suns: 1, roundWin: 0, freeWin: 0, maxStage: 3, bestTier: -1, bestSpinWin: 0 } }),
    )
    expect(restored).toMatchObject({ size: 7, popped: 50, suns: 1, round: true })
    expect(restored?.thresholds).toEqual(gardenThresholds(math, true))
  })

  it('이월 상태가 없으면 null(유료 스핀은 4×4로 시작)', () => {
    expect(gardenViewFromCarry(math, null)).toBeNull()
    expect(gardenViewFromCarry(math, free(undefined))).toBeNull()
    expect(gardenBaseView(math).size).toBe(4)
    expect(INITIAL_GARDEN_VIEW.popped).toBe(0)
  })

  it('단계 → 활성 범위가 엔진 표와 같다', () => {
    expect(gardenBoundsOfStage(0)).toEqual({ x: 2, y: 2, size: 4 })
    expect(gardenBoundsOfStage(4)).toEqual({ x: 0, y: 0, size: 8 })
    expect(gardenBoundsOfStage(99).size).toBe(8)
  })
})
