import { parseGameMath } from './schema.js'
import type { GameMath } from './schema.js'

/** 테스트에서 쓰는 최소 3x3 모델. 스트립은 그리드를 직접 만들 때는 쓰이지 않는다. */
export function makeTestMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'test',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
      { id: 's', name: { en: 'Scatter' }, scatter: true },
      { id: '_', name: { en: 'Blank' } },
    ],
    strips: [
      ['w', 'a', 'b', 's', '_', 'a'],
      ['a', 'w', 'b', '_', 's', 'b'],
      ['b', 'a', 'w', '_', 'a', 's'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
    ],
    // 스캐터 s는 페이라인 페이테이블을 가질 수 없다 (스키마가 막는다).
    paytable: {
      w: { 3: 100 },
      a: { 3: 10, 2: 2 },
      b: { 3: 5 },
    },
    wild: { substitutesFor: 'all' },
    betLevels: [3, 6, 30],
    rtpTarget: 0.96,
    volatility: 'medium',
    ...overrides,
  })
}

/** grid[row][reel]로 채운다. 지정하지 않은 칸은 블랭크. */
export function makeGrid(rows: string[][]): string[][] {
  return rows.map((row) => [...row])
}

export const BLANK_ROW = ['_', '_', '_']

/**
 * 그룹(믹스 배당) 검증용 3x3 모델. 심볼은 와일드와 BAR 3종, 채움용 블랭크.
 * `anybar` 그룹은 종류가 섞인 BAR 3개에 지급한다.
 */
export function makeBarMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'bars',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'bar3', name: { en: 'Triple BAR' } },
      { id: 'bar2', name: { en: 'Double BAR' } },
      { id: 'bar1', name: { en: 'Single BAR' } },
      { id: '_', name: { en: 'Blank' } },
    ],
    groups: {
      anybar: { name: { en: 'Any BAR', ko: '아무 BAR' }, members: ['bar1', 'bar2', 'bar3'] },
    },
    strips: [
      ['w', 'bar3', 'bar2', 'bar1', '_', 'bar1'],
      ['bar1', 'w', 'bar2', '_', 'bar3', 'bar2'],
      ['bar2', 'bar1', 'w', '_', 'bar3', 'bar1'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
    ],
    paytable: {
      w: { 3: 100 },
      bar3: { 3: 50 },
      bar2: { 3: 25 },
      bar1: { 3: 15 },
      anybar: { 3: 5 },
    },
    wild: { substitutesFor: 'all' },
    betLevels: [3, 30],
    rtpTarget: 0.96,
    volatility: 'medium',
    ...overrides,
  })
}

/**
 * 스캐터 + 프리스핀 검증용 3x3 모델. 조합이 6^3 = 216개라 전수 조사가 가능하고,
 * 그래서 해석적 계산과 정확히 맞는지 대조할 수 있다.
 */
export function makeScatterMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'scatter',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
      { id: 's', name: { en: 'Star' }, scatter: true },
    ],
    strips: [
      ['w', 'a', 'b', 's', 'a', 'b'],
      ['a', 'w', 'b', 'a', 's', 'b'],
      ['b', 'a', 'w', 'a', 'b', 's'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
    ],
    paytable: {
      w: { 3: 50 },
      a: { 3: 10, 2: 2 },
      b: { 3: 5 },
    },
    wild: { substitutesFor: 'all' },
    scatter: {
      symbol: 's',
      pays: { 2: 1, 3: 5, 4: 20 },
      freeSpins: { trigger: 3, count: 5, multiplier: 2, retrigger: true },
    },
    betLevels: [3, 30],
    rtpTarget: 0.9,
    volatility: 'high',
    ...overrides,
  })
}

/** ways 평가 검증용 3릴 2행 모델. 경로 수 base = 2^3 = 8. */
export function makeWaysMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'ways',
    reels: 3,
    rows: 2,
    payModel: 'ways',
    ways: { base: 8, betDivisor: 5 },
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
    ],
    strips: [
      ['w', 'a', 'b', 'a'],
      ['a', 'w', 'b', 'a'],
      ['b', 'a', 'w', 'a'],
    ],
    paytable: { a: { 2: 10, 3: 100 }, b: { 3: 20 }, w: { 3: 200 } },
    wild: { substitutesFor: 'all' },
    betLevels: [5, 50],
    rtpTarget: 0.9,
    volatility: 'high',
    ...overrides,
  })
}

/** 뮤테이션 검증용 3x3 라인 모델. 미스터리와 확장 와일드를 모두 붙일 수 있다. */
export function makeMutationMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'mutation',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'q', name: { en: 'Mystery' } },
      { id: 's', name: { en: 'Star' }, scatter: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
    ],
    strips: [
      ['w', 'q', 'a', 'b', 's', 'a'],
      ['a', 'w', 'q', 'b', 'a', 's'],
      ['b', 'a', 'w', 'q', 's', 'a'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
    ],
    paytable: { w: { 3: 100 }, a: { 3: 10, 2: 2 }, b: { 3: 5 } },
    wild: { substitutesFor: 'all' },
    scatter: { symbol: 's', pays: { 3: 5 } },
    mutations: [{ type: 'mystery', symbol: 'q', weights: { a: 3, b: 1 } }],
    betLevels: [3, 30],
    rtpTarget: 0.9,
    volatility: 'medium',
    ...overrides,
  })
}
