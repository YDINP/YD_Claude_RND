import { describe, expect, it } from 'vitest'
import { parseGameMath, type GameMath, type GridPosition, type WinLine } from '@tgslot/slot-engine'
import {
  betUnitCount,
  defaultWaysLabel,
  isBothWays,
  isWaysGame,
  isWaysWin,
  sortWaysWins,
  waysCountOf,
  waysDirectionOf,
} from './ways.js'
import { buildPresentation, defaultLineLabel } from './presentation.js'
import { winBetMultiple, winTier } from './wins.js'

function makeMath(overrides: Record<string, unknown>): GameMath {
  return parseGameMath({
    id: 'test',
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
    paytable: {
      shiba: { 3: 20 },
      koi: { 2: 1, 3: 8 },
      dango: { 2: 1, 3: 4 },
    },
    wild: { substitutesFor: 'all' },
    rtpTarget: 0.945,
    volatility: 'medium',
    ...overrides,
  })
}

const waysGame = makeMath({
  payModel: 'ways',
  ways: { base: 27, bothWays: true, betDivisor: 25 },
  paylines: [],
  betLevels: [25, 50],
})

const lineGame = makeMath({
  paylines: [
    [0, 0, 0],
    [1, 1, 1],
  ],
  betLevels: [20, 40],
})

function waysWin(partial: Partial<WinLine> & { symbol: string; win: number }): WinLine {
  return {
    line: -1,
    count: 3,
    multiplier: 8,
    positions: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
    ways: 1,
    direction: 'ltr',
    ...partial,
  }
}

describe('게임 종류 판정', () => {
  it('payModel로 ways 게임을 가른다', () => {
    expect(isWaysGame(waysGame)).toBe(true)
    expect(isWaysGame(lineGame)).toBe(false)
  })

  it('bothWays 설정을 읽는다', () => {
    expect(isBothWays(waysGame)).toBe(true)
    expect(isBothWays(lineGame)).toBe(false)
  })

  it('배당 단위는 ways면 betDivisor, 라인이면 라인 수다', () => {
    expect(betUnitCount(waysGame)).toBe(25)
    expect(betUnitCount(lineGame)).toBe(2)
  })
})

describe('ways 승리 판별', () => {
  it('ways가 채워졌으면 ways 승리다', () => {
    expect(isWaysWin(waysWin({ symbol: 'koi', win: 100 }))).toBe(true)
  })

  it('라인 인덱스가 음수면 ways 승리로 본다', () => {
    // 엔진은 ways 승리에 line: -1을 넣는다. 이것을 라인으로 오해하면 페이라인을 음수로 읽는다.
    const win = waysWin({ symbol: 'koi', win: 100 })
    delete win.ways
    expect(isWaysWin(win)).toBe(true)
  })

  it('보통 라인 승리는 ways 승리가 아니다', () => {
    expect(isWaysWin({ ...waysWin({ symbol: 'koi', win: 100 }), line: 0, ways: undefined })).toBe(false)
  })
})

describe('경로 수', () => {
  it('엔진이 알려 준 값을 그대로 쓴다', () => {
    expect(waysCountOf(waysWin({ symbol: 'koi', win: 100, ways: 12 }))).toBe(12)
  })

  it('없으면 릴별 매칭 칸 수의 곱으로 되짚는다', () => {
    const win = waysWin({
      symbol: 'koi',
      win: 100,
      positions: [
        [0, 0],
        [0, 2],
        [1, 1],
        [2, 0],
        [2, 1],
        [2, 2],
      ],
    })
    delete win.ways
    // 릴0에 2칸, 릴1에 1칸, 릴2에 3칸 -> 2 x 1 x 3
    expect(waysCountOf(win)).toBe(6)
  })

  it('좌표가 없으면 0이다', () => {
    const win = waysWin({ symbol: 'koi', win: 0, positions: [] })
    delete win.ways
    expect(waysCountOf(win)).toBe(0)
  })
})

describe('지급 방향', () => {
  it('엔진이 준 방향을 그대로 읽는다', () => {
    expect(waysDirectionOf(waysWin({ symbol: 'koi', win: 1, direction: 'rtl' }))).toBe('rtl')
  })

  it('알려 주지 않으면 왼쪽부터로 본다', () => {
    const win = waysWin({ symbol: 'koi', win: 1 })
    delete win.direction
    expect(waysDirectionOf(win)).toBe('ltr')
  })
})

describe('명판 문구', () => {
  it('심볼과 경로 수와 배당을 찍는다', () => {
    expect(defaultWaysLabel(waysWin({ symbol: 'koi', win: 100, ways: 12 }))).toBe('koi × 12 ways · 100')
  })

  it('금액이 빠지지 않는다. 라인 명판과 정보량이 같아야 한다', () => {
    expect(defaultWaysLabel(waysWin({ symbol: 'koi', win: 12345, ways: 3 }))).toContain('12,345')
  })

  it('그룹 배당이면 그룹 id를 쓴다', () => {
    expect(defaultWaysLabel(waysWin({ symbol: 'anybar', group: 'anybar', win: 1, ways: 3 }))).toBe(
      'anybar × 3 ways · 1',
    )
  })

  it('큰 경로 수에는 자릿점을 넣는다', () => {
    expect(defaultWaysLabel(waysWin({ symbol: 'koi', win: 1, ways: 1024 }))).toBe('koi × 1,024 ways · 1')
  })

  it('기본 라벨이 ways 승리를 알아보고 갈아탄다', () => {
    expect(defaultLineLabel(waysWin({ symbol: 'koi', win: 100, ways: 9 }))).toBe('koi × 9 ways · 100')
  })

  it('라인 승리 문구는 그대로다', () => {
    const win: WinLine = { ...waysWin({ symbol: 'koi', win: 100 }), line: 0, ways: undefined }
    expect(defaultLineLabel(win)).toBe('Line 1 · koi · 100')
  })
})

describe('재생 순서', () => {
  const small = waysWin({ symbol: 'dango', win: 40, ways: 3 })
  const big = waysWin({ symbol: 'koi', win: 400, ways: 9 })
  const sameLtr = waysWin({ symbol: 'shiba', win: 100, direction: 'ltr' })
  const sameRtl = waysWin({ symbol: 'shiba', win: 100, direction: 'rtl' })

  it('배당이 큰 심볼부터 보여준다', () => {
    expect(sortWaysWins([small, big]).map((win) => win.symbol)).toEqual(['koi', 'dango'])
  })

  it('같은 배당은 심볼 id로 갈라 결정론을 지킨다', () => {
    const sorted = sortWaysWins([waysWin({ symbol: 'koi', win: 100 }), waysWin({ symbol: 'dango', win: 100 })])
    expect(sorted.map((win) => win.symbol)).toEqual(['dango', 'koi'])
  })

  it('같은 심볼이 양방향으로 이기면 왼쪽부터가 먼저다', () => {
    expect(sortWaysWins([sameRtl, sameLtr]).map(waysDirectionOf)).toEqual(['ltr', 'rtl'])
  })

  it('입력 배열을 건드리지 않는다', () => {
    const input = [small, big]
    sortWaysWins(input)
    expect(input[0]).toBe(small)
  })
})

describe('ways 연출 계획', () => {
  const wins = [
    waysWin({ symbol: 'dango', win: 40, ways: 3 }),
    waysWin({ symbol: 'koi', win: 400, ways: 9 }),
  ]

  it('B단계가 라인이 아니라 심볼 하나씩이다', () => {
    const steps = buildPresentation(wins, waysGame, { totalBet: 25 })
    const lines = steps.filter((step) => step.phase === 'line')
    expect(lines).toHaveLength(2)
    expect(lines.map((step) => (step.phase === 'line' ? step.win.symbol : ''))).toEqual(['koi', 'dango'])
  })

  it('A단계는 라인 게임과 똑같이 맨 앞에 온다', () => {
    const steps = buildPresentation(wins, waysGame, { totalBet: 25 })
    expect(steps[0]?.phase).toBe('all')
  })

  it('라인 게임은 여전히 라인 인덱스 순서다', () => {
    const lineWins: WinLine[] = [
      { ...waysWin({ symbol: 'koi', win: 400 }), line: 1, ways: undefined },
      { ...waysWin({ symbol: 'dango', win: 40 }), line: 0, ways: undefined },
    ]
    const steps = buildPresentation(lineWins, lineGame, { totalBet: 20 })
    const lines = steps.filter((step) => step.phase === 'line')
    expect(lines.map((step) => (step.phase === 'line' ? step.win.line : -1))).toEqual([0, 1])
  })
})

describe('ways 배수 추정', () => {
  it('totalBet을 주면 그대로 나눈다', () => {
    const wins = [waysWin({ symbol: 'koi', win: 500, ways: 9 })]
    expect(winBetMultiple(wins, waysGame, 25)).toBe(20)
  })

  it('totalBet이 없으면 경로 수 x 배수를 betDivisor로 나눈다', () => {
    // 라인 수(0)로 나누면 0으로 나누게 된다. ways에는 페이라인이 아예 없다.
    const wins = [waysWin({ symbol: 'koi', win: 500, ways: 10, multiplier: 8 })]
    expect(winBetMultiple(wins, waysGame)).toBeCloseTo(3.2, 6)
  })

  it('등급 판정이 ways에서도 동작한다', () => {
    const wins = [waysWin({ symbol: 'koi', win: 2500, ways: 9 })]
    expect(winTier(wins, waysGame, 25)).toBe('max')
  })
})
