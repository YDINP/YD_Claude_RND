import { describe, expect, it } from 'vitest'
import { FeatureTriggerSchema, SpinResponseSchema } from '@tgslot/shared'
import type { SpinResponse } from '@tgslot/shared'
import { foldCascades } from '@tgslot/slot-engine'
import type { CascadeStep, FeatureTrigger as EngineFeatureTrigger, WinLine as EngineWinLine } from '@tgslot/slot-engine'
import {
  applyMutationsToGrid,
  rebuildFinalGrid,
  toRoundState,
  toSharedCascadeStep,
  toSharedFeature,
  toSharedFeatures,
  toSharedWinLine,
} from './engineSpin.js'
import { ORDER_CARDS, orderCarry } from '../testing/cascadeScript.js'

describe('toSharedFeature', () => {
  it('프리스핀 진입/리트리거를 그대로 옮긴다', () => {
    const feature: EngineFeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 3, retrigger: false }

    const shared = toSharedFeature(feature)

    expect(shared).toEqual(feature)
    expect(FeatureTriggerSchema.safeParse(shared).success).toBe(true)
  })

  it('스캐터 배당의 좌표를 복사해 옮긴다', () => {
    const feature: EngineFeatureTrigger = {
      type: 'scatterWin',
      symbol: 'scatter',
      count: 3,
      win: 250,
      positions: [
        [0, 0],
        [1, 2],
        [2, 1],
      ],
    }

    const shared = toSharedFeature(feature)

    expect(shared).toEqual(feature)
    // 좌표는 새 배열이어야 한다. 엔진 결과를 나중에 손대도 응답이 흔들리지 않게.
    if (shared.type === 'scatterWin') {
      expect(shared.positions).not.toBe(feature.positions)
    }
    expect(FeatureTriggerSchema.safeParse(shared).success).toBe(true)
  })

  it('상한에 걸려 잘린 리트리거(freeSpinsCapped)를 옮기고 스키마를 통과한다', () => {
    const feature: EngineFeatureTrigger = { type: 'freeSpinsCapped', requested: 15, granted: 4, cap: 100 }

    const shared = toSharedFeature(feature)

    expect(shared).toEqual({ type: 'freeSpinsCapped', requested: 15, granted: 4, cap: 100 })
    // 이 값이 그대로 SpinResponse.features와 rounds.features에 실리므로 zod를 통과해야 한다.
    expect(FeatureTriggerSchema.safeParse(shared).success).toBe(true)
  })

  it('부여가 0회로 잘린 경우도 그대로 남긴다', () => {
    // granted 0은 "아무것도 못 받았다"는 기록이다. 빠뜨리면 왜 안 늘었는지 알 수 없다.
    const shared = toSharedFeature({ type: 'freeSpinsCapped', requested: 5, granted: 0, cap: 100 })

    expect(shared).toMatchObject({ granted: 0 })
    expect(FeatureTriggerSchema.safeParse(shared).success).toBe(true)
  })

  it('여러 피처를 순서대로 옮긴다', () => {
    const features: EngineFeatureTrigger[] = [
      { type: 'freeSpins', spins: 5, multiplier: 2, retrigger: true },
      { type: 'freeSpinsCapped', requested: 5, granted: 1, cap: 100 },
    ]

    expect(toSharedFeatures(features).map((feature) => feature.type)).toEqual(['freeSpins', 'freeSpinsCapped'])
  })
})

describe('toRoundState', () => {
  it('세션이 없으면 undefined다 (엔진이 기본 게임으로 돈다)', () => {
    expect(toRoundState(null)).toBeUndefined()
  })

  it('저장된 세션을 엔진 라운드 상태로 옮긴다', () => {
    const state = toRoundState({
      gameId: 'classic-777',
      left: 4,
      total: 10,
      multiplier: 3,
      totalBet: 100,
      accumulatedWin: 900,
    })

    expect(state).toEqual({ freeSpinsLeft: 4, freeSpinsTotal: 10, multiplier: 3 })
  })
})

describe('applyMutationsToGrid', () => {
  it('뮤테이션이 없으면 시작 격자를 복사해 돌려준다', () => {
    const gridBefore = [
      ['a', 'b'],
      ['c', 'd'],
    ]

    const grid = applyMutationsToGrid(gridBefore, [])

    expect(grid).toEqual(gridBefore)
    expect(grid).not.toBe(gridBefore)
  })

  it('바뀐 칸만 덮어쓴다', () => {
    const gridBefore = [
      ['mystery', 'b'],
      ['c', 'd'],
    ]

    const grid = applyMutationsToGrid(gridBefore, [
      { type: 'mystery', symbol: 'seven', cells: [{ position: [0, 0], from: 'mystery', to: 'seven' }] },
    ])

    expect(grid).toEqual([
      ['seven', 'b'],
      ['c', 'd'],
    ])
  })

  it('격자 밖 좌표는 조용히 넘기지 않고 던진다', () => {
    expect(() =>
      applyMutationsToGrid(
        [['a']],
        [{ type: 'randomWild', cells: [{ position: [5, 5], from: 'a', to: 'wild' }] }]
      )
    ).toThrow(/격자 밖/)
  })
})

describe('toRoundState carry', () => {
  it('저장된 carry를 엔진 입력으로 옮기고 카드는 값 복사본이다', () => {
    const carry = orderCarry(ORDER_CARDS, 4, 1, 200)

    const state = toRoundState({
      gameId: 'candy-cluster-pop',
      left: 6,
      total: 8,
      multiplier: 1,
      totalBet: 100,
      accumulatedWin: 200,
      carry,
    })

    expect(state?.carry).toEqual(carry)
    expect(state?.carry?.orders?.cards[0]).not.toBe(carry.orders?.cards[0])
  })

  it('carry가 없으면 키 자체가 없다 (live 6팩 비트 동일)', () => {
    const state = toRoundState({ gameId: 'a', left: 1, total: 1, multiplier: 1, totalBet: 10, accumulatedWin: 0 })
    expect('carry' in (state ?? {})).toBe(false)
  })
})

describe('toSharedWinLine', () => {
  const base: EngineWinLine = {
    line: 0,
    symbol: 'seven',
    count: 3,
    multiplier: 10,
    win: 1000,
    positions: [[0, 0]],
  }

  it('기존 라인 당첨에는 payKind·cascade·ladder 키가 생기지 않는다', () => {
    const shared = toSharedWinLine(base)
    expect('payKind' in shared || 'cascade' in shared || 'ladder' in shared).toBe(false)
  })

  it('클러스터 당첨은 payKind·cascade·ladder를 옮긴다', () => {
    const shared = toSharedWinLine({ ...base, line: -1, payKind: 'cluster', cascade: 2, ladder: 3 })
    expect(shared).toMatchObject({ payKind: 'cluster', cascade: 2, ladder: 3 })
  })
})

describe('연쇄 응답 크기', () => {
  const SYMBOLS = ['heart', 'star', 'bean', 'drop_red', 'drop_blue', 'drop_green', 'drop_purple', 'drop_yellow', 'wild']
  const REELS = 6
  const ROWS = 5

  function pick(seed: number): string {
    return SYMBOLS[(seed * 7 + 3) % SYMBOLS.length] as string
  }

  /** `cellsPerStep`칸을 단계마다 지우는 12단계 스핀. 승리는 두 묶음으로 나눈다. */
  function worstCase(cellsPerStep: number): SpinResponse {
    const grid = Array.from({ length: ROWS }, (_, row) => Array.from({ length: REELS }, (_, reel) => pick(row * REELS + reel)))
    const steps: CascadeStep[] = []
    let current = grid
    for (let index = 0; index < 12; index += 1) {
      const removed: [number, number][] = []
      for (let cell = 0; cell < cellsPerStep; cell += 1) removed.push([cell % REELS, Math.floor(cell / REELS)])
      removed.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const refill: string[][] = Array.from({ length: REELS }, () => [])
      for (const [reel] of removed) refill[reel]?.push(pick(index * 31 + refill.flat().length))
      const half = Math.ceil(removed.length / 2)
      const wins: EngineWinLine[] = [removed.slice(0, half), removed.slice(half)]
        .filter((group) => group.length > 0)
        .map((positions, group) => ({
          line: -1,
          symbol: pick(index + group),
          count: positions.length,
          multiplier: 25,
          win: 4000,
          positions,
          payKind: 'cluster' as const,
          cascade: index,
          ladder: 20,
        }))
      const step: CascadeStep = { index, wins, removed, refill, multiplier: 20, stepWin: 8000 }
      steps.push(step)
      current = foldCascades(current, [step])
    }
    const cards = ORDER_CARDS.map((card) => ({ ...card }))
    const carry = orderCarry(cards, 6, 3, 9000)
    return SpinResponseSchema.parse({
      roundId: '0b9b0b1e-5b1a-4d6f-8f6e-3a1d1d2f5a77',
      stops: [101, 102, 103, 104, 105, 106],
      grid,
      gridBefore: grid,
      mutations: [],
      cascades: steps.map(toSharedCascadeStep),
      finalGrid: current,
      orderWin: 9000,
      wins: [],
      totalBet: 1000,
      totalWin: 99000,
      wallet: { coins: 12345678, gems: 20 },
      seedHash: 'a'.repeat(64),
      nonce: 123456,
      jackpot: 25000,
      isFreeSpin: true,
      features: [
        { type: 'orderComplete', id: 'pop-heart-12', prize: 3000 },
        { type: 'orderComplete', id: 'size-9', prize: 3000 },
        { type: 'orderComplete', id: 'chain-4', prize: 3000 },
        { type: 'winCapped', requested: 999999, granted: 99000, cap: 99000 },
      ],
      freeSpins: {
        gameId: 'candy-cluster-pop',
        left: 5,
        total: 14,
        multiplier: 1,
        totalBet: 1000,
        accumulatedWin: 88000,
        expiresAt: '2026-11-18T09:00:00.000Z',
        carry,
      },
      freeSpinsSummary: { total: 99000, spins: 14, ordersCompleted: 6, orderPrizeTotal: 18000 },
    })
  }

  const bytes = (body: SpinResponse): number => Buffer.byteLength(JSON.stringify(body), 'utf8')

  it('12단계 최악 스핀(단계마다 30칸 중 20칸 제거)이 12KB 이하다', () => {
    // 실측: 5칸 7.5KB, 10칸 8.9KB, 15칸 10.2KB, 20칸 11.6KB, 30칸 14.2KB. 매 단계 판의 3분의 2를
    // 지우는 것도 확률상 사실상 나오지 않는 극단이라 20칸을 상한 기준으로 잡는다.
    expect(bytes(worstCase(20))).toBeLessThanOrEqual(12 * 1024)
  })

  it('refill을 릴별 배열로 두면 칸 객체 목록보다 작다 (O13)', () => {
    const body = worstCase(15)
    const compact = JSON.stringify(body.cascades)
    const cellObjects = JSON.stringify(
      body.cascades?.map((step) => ({
        ...step,
        refill: step.refill.flatMap((column, reel) => column.map((symbol, index) => ({ reel, index, symbol }))),
      }))
    )
    expect(compact.length).toBeLessThan(cellObjects.length * 0.85)
  })

  it('저장된 단계로 최종 판을 되살린다 (재실행 없음)', () => {
    const body = worstCase(10)
    const steps = (body.cascades ?? []) as unknown as CascadeStep[]
    expect(rebuildFinalGrid(body.grid, steps)).toEqual(body.finalGrid)
  })
})
