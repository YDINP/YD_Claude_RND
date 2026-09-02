import { describe, expect, it } from 'vitest'
import { FeatureTriggerSchema } from '@tgslot/shared'
import type { FeatureTrigger as EngineFeatureTrigger } from '@tgslot/slot-engine'
import { applyMutationsToGrid, toRoundState, toSharedFeature, toSharedFeatures } from './engineSpin.js'

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
