import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  advanceBoard,
  applyBoardBonus,
  boardPayout,
  initialBoardState,
  playBoard,
  previewBoardLanding,
  replayBoard,
  stepBoard,
} from './board.js'
import type { BoardState } from './board.js'
import { BoardBonusConfigSchema } from './boardSchema.js'
import type { BoardBonusConfig } from './boardSchema.js'
import { parseGameMath } from './schema.js'
import { buildGrid, resolveSpin, spinUnchecked } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import type { BoardBonusTrigger, Rng } from './types.js'

const HANBOK = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/hanbok-night-market/math.json', import.meta.url), 'utf8')),
)
const BOARD = HANBOK.boardBonus as BoardBonusConfig

class CountingRng implements Rng {
  calls = 0
  readonly log: number[] = []
  constructor(private readonly inner: Rng) {}
  nextInt(maxExclusive: number): number {
    this.calls += 1
    const value = this.inner.nextInt(maxExclusive)
    this.log.push(value)
    return value
  }
}

/** 미리 정한 값을 차례로 돌려주는 RNG. */
class ScriptedRng implements Rng {
  private index = 0
  constructor(private readonly values: number[]) {}
  nextInt(maxExclusive: number): number {
    const value = this.values[this.index] ?? 0
    this.index += 1
    if (value >= maxExclusive) throw new RangeError(`스크립트 값 ${value} >= ${maxExclusive}`)
    return value
  }
}

function at(state: Partial<BoardState>): BoardState {
  return { ...initialBoardState(BOARD), ...state }
}

/** 한 던지기씩 이어 간다. */
function walk(steps: number[], from: BoardState = initialBoardState(BOARD)): BoardState {
  let state = from
  for (const value of steps) state = stepBoard(BOARD, state, value).state
  return state
}

describe('advanceBoard', () => {
  it('바깥 길을 따라 가고 지나간 칸을 순서대로 준다', () => {
    expect(advanceBoard(BOARD, 'start', 'outer', 3)).toEqual({ path: ['o1', 'o2', 'o3'], at: 'o3' })
  })
  it('결승을 넘치면 결승에 선다', () => {
    expect(advanceBoard(BOARD, 'o18', 'outer', 5)).toEqual({ path: ['o19', 'goal'], at: 'goal' })
  })
  it('길 위에 없는 칸이면 던진다', () => {
    expect(() => advanceBoard(BOARD, 'a1', 'outer', 1)).toThrow(RangeError)
  })
})

describe('stepBoard: 이동 손 사례', () => {
  it('출발에서 도(1) → o1 코인 1', () => {
    const { state, record } = stepBoard(BOARD, initialBoardState(BOARD), 1)
    expect(record).toMatchObject({ steps: 1, path: ['o1'], at: 'o1', tile: 'coin', value: 1, pot: 1, route: 'outer' })
    expect(state.throwsLeft).toBe(4)
    expect(state.end).toBeUndefined()
  })

  it('o5(첫째 모퉁이)에 딱 멈추면 다음부터 지름길 a', () => {
    const state = walk([2, 3])
    expect(state.at).toBe('o5')
    expect(state.route).toBe('a')
    const next = stepBoard(BOARD, state, 1)
    expect(next.record.at).toBe('a1')
  })

  it('o5를 지나가기만 하면 꺾지 않는다', () => {
    const state = walk([4, 2])
    expect(state.at).toBe('o6')
    expect(state.route).toBe('outer')
  })

  it('o10(둘째 모퉁이)에 멈추면 지름길 b', () => {
    const state = stepBoard(BOARD, at({ at: 'o8' }), 2).state
    expect(state.at).toBe('o10')
    expect(state.route).toBe('b')
    expect(stepBoard(BOARD, state, 3).record.at).toBe('c')
  })

  it('지름길 a에서 방(c)에 멈추면 center로 갈아탄다', () => {
    const state = stepBoard(BOARD, at({ at: 'o5', route: 'a' }), 3).state
    expect(state.at).toBe('c')
    expect(state.route).toBe('center')
    expect(state.multiplier).toBe(3)
  })

  it('앞으로 칸(o13, 2칸)은 같은 길로 더 가고 도착 칸 효과를 받는다', () => {
    const { record, state } = stepBoard(BOARD, at({ at: 'o12' }), 1)
    expect(record.path).toEqual(['o13'])
    expect(record.forward).toEqual(['o14', 'o15'])
    expect(record.at).toBe('o15')
    expect(record.tile).toBe('mult')
    expect(state.multiplier).toBe(2)
  })

  it('앞으로 칸이 갈림길에 내려 주면 멈춤으로 친다', () => {
    const config = BoardBonusConfigSchema.parse({
      ...BOARD,
      nodes: { ...BOARD.nodes, o3: { kind: 'forward', value: 2 } },
    })
    const { record, state } = stepBoard(config, initialBoardState(config), 3)
    expect(record.forward).toEqual(['o4', 'o5'])
    expect(state.at).toBe('o5')
    expect(state.route).toBe('a')
  })

  it('결승을 넘치면 결승 도착이고 큰 상을 담고 끝난다', () => {
    const { state, record } = stepBoard(BOARD, at({ at: 'o19', pot: 10 }), 4)
    expect(record.path).toEqual(['goal'])
    expect(record.tile).toBe('goal')
    expect(state.pot).toBe(40)
    expect(state.end).toBe('goal')
  })

  it('함정 3번째에서 즉시 끝나고 바구니는 그대로', () => {
    const { state } = stepBoard(BOARD, at({ at: 'o2', traps: 2, pot: 7 }), 1)
    expect(state.traps).toBe(3)
    expect(state.end).toBe('traps')
    expect(state.pot).toBe(7)
  })

  it('기회가 0이 되면 끝난다', () => {
    const { state } = stepBoard(BOARD, at({ throwsLeft: 1 }), 1)
    expect(state.throwsLeft).toBe(0)
    expect(state.end).toBe('throws')
  })

  it('윷·모는 한 번 더(기회 +1)', () => {
    const { record, state } = stepBoard(BOARD, initialBoardState(BOARD), 4)
    expect(record.extraThrow).toBe(true)
    expect(state.throwsLeft).toBe(5)
  })

  it('한 번 더 칸(o7)은 기회 +1', () => {
    const { state } = stepBoard(BOARD, at({ at: 'o6', throwsLeft: 2, thrown: 3 }), 1)
    expect(state.at).toBe('o7')
    expect(state.throwsLeft).toBe(2)
  })

  it('던진 수 + 기회가 상한이면 윷·모·한 번 더 칸이 기회를 늘리지 않는다', () => {
    const yut = stepBoard(BOARD, at({ thrown: 6, throwsLeft: 6 }), 4)
    expect(yut.record.extraThrow).toBe(false)
    expect(yut.state.throwsLeft).toBe(5)
    const again = stepBoard(BOARD, at({ at: 'o6', thrown: 6, throwsLeft: 6 }), 1)
    expect(again.state.throwsLeft).toBe(5)
  })

  it('배수는 maxMultiplier에서 멈춘다', () => {
    const { state } = stepBoard(BOARD, at({ at: 'o14', multiplier: 4 }), 1)
    expect(state.multiplier).toBe(4)
  })

  it('끝난 말판에 다시 던지면 던진다', () => {
    const done = { ...initialBoardState(BOARD), end: 'goal' as const }
    expect(() => stepBoard(BOARD, done, 1)).toThrow(RangeError)
  })
})

describe('previewBoardLanding', () => {
  it('앞으로 칸까지 따라간 칸과 갈림길 여부를 준다', () => {
    expect(previewBoardLanding(BOARD, 'o12', 'outer', 1)).toEqual({ at: 'o15', fork: false })
    expect(previewBoardLanding(BOARD, 'start', 'outer', 5)).toEqual({ at: 'o5', fork: true })
  })
})

describe('지급', () => {
  it('max(minPayout, 바구니 x 배수)', () => {
    expect(boardPayout(BOARD, 0, 1)).toBe(BOARD.minPayout)
    expect(boardPayout(BOARD, 12, 3)).toBe(36)
  })

  it('캡에 걸리면 말판 몫만 자르고 winCapped를 남긴다', () => {
    const rng = createSeededRng('cap')
    let found: { features: unknown[]; win: number } | undefined
    for (let i = 0; i < 200 && found === undefined; i += 1) {
      const applied = applyBoardBonus(BOARD, 100, rng, 3_000, 2_500)
      const board = applied.features[0] as BoardBonusTrigger
      if (board.payout * 100 > 500) found = applied
    }
    expect(found).toBeDefined()
    if (found === undefined) return
    expect(found.win).toBe(500)
    expect(found.features[1]).toMatchObject({ type: 'winCapped', granted: 3_000, cap: 3_000 })
  })
})

describe('playBoard / replayBoard', () => {
  it('같은 윷 기록이면 결과가 같다 (20만 판)', () => {
    const rng = createSeededRng('replay')
    for (let i = 0; i < 200_000; i += 1) {
      const board = playBoard(BOARD, 100, rng, Infinity)
      const replayed = replayBoard(
        BOARD,
        board.throws.map((row) => row.steps),
        100,
        Infinity,
      )
      if (i < 2_000) expect(replayed).toEqual(board)
      else if (replayed.payout !== board.payout || replayed.end !== board.end) expect(replayed).toEqual(board)
    }
  }, 60_000)

  it('불변식: 모든 던지기 뒤 던진 수 + 기회 <= maxThrows (20만 판)', () => {
    const rng = createSeededRng('invariant')
    let longest = 0
    for (let i = 0; i < 200_000; i += 1) {
      const board = playBoard(BOARD, 100, rng, Infinity)
      board.throws.forEach((row, index) => {
        if (index + 1 + row.throwsLeft > BOARD.maxThrows) throw new Error(`불변식 위반: 판 ${i}`)
      })
      longest = Math.max(longest, board.throws.length)
    }
    expect(longest).toBeLessThanOrEqual(BOARD.maxThrows)
  }, 60_000)

  it('하드캡: 함정 없는 긴 길에서 윷만 나오면 정확히 maxThrows번째에 끝난다', () => {
    const route = ['s', ...Array.from({ length: 60 }, (_, i) => `n${i}`), 'g']
    const config = BoardBonusConfigSchema.parse({
      trigger: 3,
      throws: 5,
      maxThrows: 12,
      trapLimit: 3,
      maxMultiplier: 4,
      minPayout: 0,
      maxWin: 1000,
      throwTable: [{ steps: 4, weight: 1, extraThrow: true }],
      layout: 'test',
      nodes: { s: { kind: 'start' }, g: { kind: 'goal', value: 1 }, ...Object.fromEntries(route.slice(1, -1).map((id) => [id, { kind: 'coin', value: 1 }])) },
      routes: { main: route },
      forks: {},
    })
    const board = playBoard(config, 1, createSeededRng('cap'), Infinity)
    expect(board.throws).toHaveLength(12)
    expect(board.end).toBe('throws')
    expect(board.throws.slice(0, 7).every((row) => row.extraThrow)).toBe(true)
    expect(board.throws[7]?.extraThrow).toBe(false)
  })

  it('던지기마다 nextInt 1회', () => {
    const rng = new CountingRng(createSeededRng('count'))
    const board = playBoard(BOARD, 100, rng, Infinity)
    expect(rng.calls).toBe(board.throws.length)
  })

  it('정해진 RNG 값이 윷 결과로 그대로 옮겨진다 (가중치 240·380·230·120·30)', () => {
    // 0 → 도, 240 → 개, 620 → 걸, 850 → 윷, 970 → 모
    const board = playBoard(BOARD, 100, new ScriptedRng([970, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), Infinity)
    expect(board.throws[0]).toMatchObject({ steps: 5, at: 'o5', route: 'a', extraThrow: true })
    expect(board.throws[1]).toMatchObject({ steps: 1, at: 'a1', tile: 'coin' })
  })

  it('replayBoard는 끝나지 않은 기록·남는 기록을 거절한다', () => {
    expect(() => replayBoard(BOARD, [1], 100, Infinity)).toThrow(RangeError)
    const board = playBoard(BOARD, 100, createSeededRng('x'), Infinity)
    expect(() => replayBoard(BOARD, [...board.throws.map((row) => row.steps), 1], 100, Infinity)).toThrow(RangeError)
  })
})

describe('스핀 연결', () => {
  const triggerStops = (): number[] => {
    // 릴 1·3·5에서 초롱이 가운데 행에 오는 정지 위치, 릴 2·4는 0.
    return HANBOK.strips.map((strip, reel) => {
      if (reel % 2 === 1) return 0
      const index = strip.indexOf('bonus')
      return (index - 1 + strip.length) % strip.length
    })
  }

  it('초롱 3개면 말판이 열리고 totalWin·boardWin에 지급이 들어간다', () => {
    const stops = triggerStops()
    const grid = buildGrid(HANBOK, stops)
    const result = resolveSpin(HANBOK, grid, stops, 100, 4, undefined, grid, [], createSeededRng('trigger'))
    const board = result.features.find((feature) => feature.type === 'boardBonus')
    expect(board).toBeDefined()
    if (board?.type !== 'boardBonus') return
    expect(result.boardWin).toBe(board.win)
    expect(result.totalWin).toBe(result.lineWin + result.scatterWin + board.win)
    expect(board.win).toBe(board.payout * 100)
    expect(result.nextState).toBeUndefined()
    expect(result.features[0]).toMatchObject({ type: 'scatterWin', count: 3, win: 200 })
  })

  it('rng 없이 트리거되면 던진다', () => {
    const stops = triggerStops()
    const grid = buildGrid(HANBOK, stops)
    expect(() => resolveSpin(HANBOK, grid, stops, 100, 4)).toThrow(RangeError)
  })

  it('RNG 소비: 비트리거 스핀 5회, 트리거 스핀 5 + 던진 수', () => {
    let plain = 0
    let triggered = 0
    const seeds = createSeededRng('seeds')
    for (let i = 0; i < 4_000 && (plain === 0 || triggered === 0); i += 1) {
      const rng = new CountingRng(createSeededRng(`spin-${seeds.nextInt(1e9)}`))
      const result = spinUnchecked(HANBOK, 100, rng)
      const board = result.features.find((feature) => feature.type === 'boardBonus')
      if (board?.type === 'boardBonus') {
        expect(rng.calls).toBe(5 + board.throws.length)
        triggered += 1
      } else {
        expect(rng.calls).toBe(5)
        expect(result.boardWin).toBeUndefined()
        plain += 1
      }
    }
    expect(plain).toBeGreaterThan(0)
    expect(triggered).toBeGreaterThan(0)
  })

  it('같은 시드면 말판까지 비트 단위로 같다', () => {
    const a = spinUnchecked(HANBOK, 100, createSeededRng('same'))
    const b = spinUnchecked(HANBOK, 100, createSeededRng('same'))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
