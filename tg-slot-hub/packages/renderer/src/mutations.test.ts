import { describe, expect, it } from 'vitest'
import { createSeededRng, parseGameMath, spin, type GameMath, type MutationEvent } from '@tgslot/slot-engine'
import {
  applyMutationEventsToGrid,
  buildMutationPlan,
  mutationCellDelayMs,
  mutationCommitMs,
  mutationDurationMs,
  mutationReels,
} from './mutations.js'
import {
  MUTATION_DROP_STAGGER_MS,
  MUTATION_MAX_STAGGER_PORTION,
  MUTATION_MS_BY_TYPE,
  REDUCED_MUTATION_MS,
} from './constants.js'

/**
 * 변형이 붙은 최소 게임. 실제 팩(`royal-diamond-777` 등)은 아직 math.json이 없으므로
 * 엔진 스키마를 그대로 통과하는 3x3을 여기서 만든다.
 * 검증 대상은 아트가 아니라 "엔진이 준 이벤트를 그리드에 어떻게 얹는가"다.
 */
function mysteryMath(): GameMath {
  return parseGameMath({
    id: 'test-mystery',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'wild', name: { en: 'Wild' }, wild: true },
      { id: 'mystery', name: { en: 'Mystery' } },
      { id: 'seven', name: { en: 'Seven' } },
      { id: 'bell', name: { en: 'Bell' } },
      { id: 'cherry', name: { en: 'Cherry' } },
    ],
    strips: [
      ['seven', 'mystery', 'bell', 'cherry', 'wild', 'bell', 'cherry', 'mystery'],
      ['bell', 'cherry', 'mystery', 'seven', 'bell', 'wild', 'cherry', 'mystery'],
      ['cherry', 'bell', 'seven', 'mystery', 'cherry', 'bell', 'wild', 'mystery'],
    ],
    paylines: [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ],
    paytable: {
      seven: { 3: 30 },
      bell: { 3: 12 },
      cherry: { 2: 2, 3: 6 },
    },
    wild: { substitutesFor: 'all' },
    mutations: [
      { type: 'mystery', symbol: 'mystery', weights: { seven: 3, bell: 8, cherry: 14 } },
      { type: 'randomWild', symbol: 'wild', chance: 0.5, countWeights: { 1: 60, 2: 40 }, reels: [1] },
    ],
    betLevels: [30, 60],
    rtpTarget: 0.945,
    volatility: 'medium',
  })
}

/** 243 ways 대신 27 ways(3x3). ways 게임에도 변형이 같은 규칙으로 얹히는지 본다. */
function waysMath(): GameMath {
  return parseGameMath({
    id: 'test-ways',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'wild', name: { en: 'Wild' }, wild: true },
      { id: 'shiba', name: { en: 'Shiba' } },
      { id: 'koi', name: { en: 'Koi' } },
      { id: 'dango', name: { en: 'Dango' } },
    ],
    strips: [
      ['shiba', 'koi', 'dango', 'wild', 'koi', 'dango'],
      ['koi', 'dango', 'shiba', 'koi', 'wild', 'dango'],
      ['dango', 'shiba', 'koi', 'dango', 'koi', 'wild'],
    ],
    payModel: 'ways',
    ways: { base: 27, bothWays: false, betDivisor: 25 },
    paylines: [],
    paytable: {
      shiba: { 3: 20 },
      koi: { 2: 1, 3: 8 },
      dango: { 2: 1, 3: 4 },
    },
    wild: { substitutesFor: 'all' },
    mutations: [
      { type: 'randomWild', symbol: 'wild', chance: 0.6, countWeights: { 1: 70, 2: 30 }, reels: [0, 1, 2] },
    ],
    betLevels: [25, 50],
    rtpTarget: 0.945,
    volatility: 'medium',
  })
}

const cell = (reel: number, row: number, from: string, to: string): MutationEvent['cells'][number] => ({
  position: [reel, row],
  from,
  to,
})

describe('applyMutationEventsToGrid', () => {
  const gridBefore = [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
    ['g', 'h', 'i'],
  ]

  it('변형이 없으면 같은 내용의 새 격자를 준다', () => {
    const result = applyMutationEventsToGrid(gridBefore, [])
    expect(result).toEqual(gridBefore)
    expect(result).not.toBe(gridBefore)
    expect(result[0]).not.toBe(gridBefore[0])
  })

  it('입력 격자를 건드리지 않는다', () => {
    applyMutationEventsToGrid(gridBefore, [
      { type: 'mystery', symbol: 'x', cells: [cell(0, 0, 'a', 'x')] },
    ])
    expect(gridBefore[0]?.[0]).toBe('a')
  })

  it('[reel, row] 좌표를 grid[row][reel]에 앉힌다', () => {
    // 뒤집혀 있으면 (2,0) 대신 (0,2)가 바뀌어 조용히 엉뚱한 칸이 변한다.
    const result = applyMutationEventsToGrid(gridBefore, [
      { type: 'mystery', symbol: 'x', cells: [cell(2, 0, 'c', 'x')] },
    ])
    expect(result[0]?.[2]).toBe('x')
    expect(result[2]?.[0]).toBe('g')
  })

  it('여러 단계를 선언 순서대로 겹쳐 적용한다', () => {
    const result = applyMutationEventsToGrid(gridBefore, [
      { type: 'mystery', symbol: 'x', cells: [cell(0, 0, 'a', 'x')] },
      { type: 'randomWild', symbol: 'wild', cells: [cell(0, 0, 'x', 'wild')] },
    ])
    expect(result[0]?.[0]).toBe('wild')
  })

  it('격자 밖 좌표는 버리고 나머지를 적용한다', () => {
    const result = applyMutationEventsToGrid(gridBefore, [
      { type: 'mystery', symbol: 'x', cells: [cell(9, 9, '?', 'x'), cell(1, 1, 'e', 'x')] },
    ])
    expect(result[1]?.[1]).toBe('x')
  })
})

describe('엔진 결과와의 일치', () => {
  const assertMatchesEngine = (math: GameMath, totalBet: number, seedPrefix: string): number => {
    let withMutations = 0
    for (let i = 0; i < 300; i += 1) {
      const result = spin(math, { totalBet }, createSeededRng(`${seedPrefix}:${i}`))
      // 이 한 줄이 이 파일 전체의 이유다. 화면이 배당과 다른 것을 말하면 안 된다.
      expect(applyMutationEventsToGrid(result.gridBefore, result.mutations)).toEqual(result.grid)
      if (result.mutations.length > 0) withMutations += 1
    }
    return withMutations
  }

  it('라인 게임: 리빌·낙하를 얹은 결과가 SpinResult.grid와 같다', () => {
    const hits = assertMatchesEngine(mysteryMath(), 30, 'mystery')
    // 변형이 한 번도 안 걸렸다면 이 테스트는 아무것도 증명하지 못한다.
    expect(hits).toBeGreaterThan(0)
  })

  it('ways 게임: 와일드 낙하를 얹은 결과가 SpinResult.grid와 같다', () => {
    const hits = assertMatchesEngine(waysMath(), 25, 'ways')
    expect(hits).toBeGreaterThan(0)
  })

  it('변형이 없는 스핀은 gridBefore와 grid가 같다', () => {
    const math = mysteryMath()
    for (let i = 0; i < 200; i += 1) {
      const result = spin(math, { totalBet: 30 }, createSeededRng(`none:${i}`))
      if (result.mutations.length > 0) continue
      expect(result.grid).toEqual(result.gridBefore)
    }
  })
})

describe('단계 길이와 시점', () => {
  it('종류마다 정해진 길이를 쓴다', () => {
    expect(mutationDurationMs('mystery')).toBe(MUTATION_MS_BY_TYPE.mystery)
    expect(mutationDurationMs('expandWild')).toBe(MUTATION_MS_BY_TYPE.expandWild)
    expect(mutationDurationMs('upgrade')).toBe(MUTATION_MS_BY_TYPE.upgrade)
    expect(mutationDurationMs('randomWild')).toBe(MUTATION_MS_BY_TYPE.randomWild)
  })

  it('모션 축소는 길이를 상한으로 누른다', () => {
    for (const kind of ['mystery', 'expandWild', 'upgrade', 'randomWild'] as const) {
      expect(mutationDurationMs(kind, true)).toBe(REDUCED_MUTATION_MS)
    }
  })

  it('뒤집기와 크로스페이드는 한가운데에서 얼굴을 바꾼다', () => {
    expect(mutationCommitMs('mystery', 600)).toBe(300)
    expect(mutationCommitMs('upgrade', 550)).toBe(275)
  })

  it('낙하는 시작하자마자 바꾼다. 떨어지는 것이 이미 와일드다', () => {
    expect(mutationCommitMs('randomWild', 650)).toBe(0)
  })

  it('모션 축소에서는 연출 없이 곧장 바꾼다', () => {
    expect(mutationCommitMs('mystery', 200, true)).toBe(0)
  })

  it('낙하만 칸마다 차례로 떨어진다', () => {
    expect(mutationCellDelayMs('randomWild', 0, 650)).toBe(0)
    expect(mutationCellDelayMs('randomWild', 1, 650)).toBe(MUTATION_DROP_STAGGER_MS)
    expect(mutationCellDelayMs('mystery', 3, 600)).toBe(0)
    expect(mutationCellDelayMs('expandWild', 3, 700)).toBe(0)
    expect(mutationCellDelayMs('upgrade', 3, 550)).toBe(0)
  })

  it('칸이 많아도 지연이 단계 길이를 잡아먹지 않는다', () => {
    const durationMs = 650
    const cap = durationMs * MUTATION_MAX_STAGGER_PORTION
    expect(mutationCellDelayMs('randomWild', 50, durationMs)).toBe(cap)
  })
})

describe('buildMutationPlan', () => {
  const gridBefore = [
    ['mystery', 'bell', 'cherry'],
    ['seven', 'mystery', 'bell'],
    ['cherry', 'bell', 'mystery'],
  ]
  const mystery: MutationEvent = {
    type: 'mystery',
    symbol: 'cherry',
    cells: [cell(0, 0, 'mystery', 'cherry'), cell(1, 1, 'mystery', 'cherry'), cell(2, 2, 'mystery', 'cherry')],
  }
  const drop: MutationEvent = {
    type: 'randomWild',
    symbol: 'wild',
    cells: [cell(1, 0, 'bell', 'wild')],
  }

  it('변형이 없으면 빈 계획과 gridBefore 사본을 준다', () => {
    const plan = buildMutationPlan(gridBefore, [])
    expect(plan.steps).toEqual([])
    expect(plan.totalMs).toBe(0)
    expect(plan.finalGrid).toEqual(gridBefore)
    expect(plan.finalGrid).not.toBe(gridBefore)
  })

  it('이벤트 순서대로 단계를 만든다', () => {
    const plan = buildMutationPlan(gridBefore, [mystery, drop])
    expect(plan.steps.map((step) => step.type)).toEqual(['mystery', 'randomWild'])
    expect(plan.steps.map((step) => step.index)).toEqual([0, 1])
  })

  it('단계 시작 시각이 앞 단계 길이만큼 밀린다', () => {
    const plan = buildMutationPlan(gridBefore, [mystery, drop])
    expect(plan.steps[0]?.atMs).toBe(0)
    expect(plan.steps[1]?.atMs).toBe(MUTATION_MS_BY_TYPE.mystery)
    expect(plan.totalMs).toBe(MUTATION_MS_BY_TYPE.mystery + MUTATION_MS_BY_TYPE.randomWild)
  })

  it('각 단계의 그리드가 그 단계까지만 반영한다', () => {
    const plan = buildMutationPlan(gridBefore, [mystery, drop])
    // 리빌 단계에서는 아직 와일드가 떨어지지 않았다.
    expect(plan.steps[0]?.grid[0]?.[1]).toBe('bell')
    expect(plan.steps[0]?.grid[0]?.[0]).toBe('cherry')
    expect(plan.steps[1]?.grid[0]?.[1]).toBe('wild')
  })

  it('마지막 그리드가 전부 적용한 결과와 같다', () => {
    const plan = buildMutationPlan(gridBefore, [mystery, drop])
    expect(plan.finalGrid).toEqual(applyMutationEventsToGrid(gridBefore, [mystery, drop]))
  })

  it('아무 칸도 바꾸지 않는 이벤트는 재생하지 않는다', () => {
    const empty: MutationEvent = { type: 'upgrade', symbol: 'seven', cells: [] }
    const plan = buildMutationPlan(gridBefore, [empty, mystery])
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.type).toBe('mystery')
  })

  it('모션 축소는 모든 단계를 짧게 누른다', () => {
    const plan = buildMutationPlan(gridBefore, [mystery, drop], { reducedMotion: true })
    expect(plan.steps.map((step) => step.durationMs)).toEqual([REDUCED_MUTATION_MS, REDUCED_MUTATION_MS])
    expect(plan.steps.every((step) => step.commitMs === 0)).toBe(true)
  })

  it('건너뛴 뒤에도 최종 그리드는 계획이 이미 알고 있다', () => {
    // 스킵은 남은 단계를 열지 않고 곧장 finalGrid로 간다. 그 값이 여기서 정해진다.
    const plan = buildMutationPlan(gridBefore, [mystery, drop])
    expect(plan.finalGrid[0]?.[1]).toBe('wild')
    expect(plan.finalGrid[2]?.[2]).toBe('cherry')
  })
})

describe('mutationReels', () => {
  it('이벤트가 알려 준 릴을 그대로 쓴다', () => {
    const event: MutationEvent = {
      type: 'expandWild',
      symbol: 'wild',
      reels: [2, 1],
      cells: [cell(1, 0, 'bell', 'wild')],
    }
    expect(mutationReels(event)).toEqual([2, 1])
  })

  it('알려 주지 않으면 바뀐 칸에서 되짚는다', () => {
    const event: MutationEvent = {
      type: 'randomWild',
      symbol: 'wild',
      cells: [cell(2, 0, 'bell', 'wild'), cell(0, 1, 'seven', 'wild'), cell(2, 2, 'cherry', 'wild')],
    }
    expect(mutationReels(event)).toEqual([0, 2])
  })
})
