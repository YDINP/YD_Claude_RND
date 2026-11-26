import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { safeParseGameMath } from './schema.js'

const RAW = JSON.parse(
  readFileSync(new URL('../../../games/hanbok-night-market/math.json', import.meta.url), 'utf8'),
) as Record<string, unknown> & { boardBonus: Record<string, unknown> }

type Board = {
  nodes: Record<string, { kind: string; value?: number }>
  routes: Record<string, string[]>
  forks: Record<string, string>
  [key: string]: unknown
}

function withBoard(patch: (board: Board) => void, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const board = JSON.parse(JSON.stringify(RAW.boardBonus)) as Board
  patch(board)
  return { ...RAW, boardBonus: board, ...extra }
}

function messages(json: Record<string, unknown>): string[] {
  const parsed = safeParseGameMath(json)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe('boardBonus 스키마', () => {
  it('팩 원본은 통과한다', () => {
    expect(messages(RAW)).toEqual([])
  })

  it('순환 길을 거부한다', () => {
    const errors = messages(withBoard((b) => b.routes['outer']?.splice(3, 0, 'o1')))
    expect(errors.some((m) => m.includes('두 번'))).toBe(true)
  })

  it('결승으로 끝나지 않는 길을 거부한다', () => {
    const errors = messages(withBoard((b) => b.routes['center']?.pop()))
    expect(errors.some((m) => m.includes('결승으로 끝나지'))).toBe(true)
  })

  it('첫 칸이 갈림길이 아닌 지름길을 거부한다', () => {
    const errors = messages(withBoard((b) => (b.forks['o4'] = 'a')))
    expect(errors.some((m) => m.includes('첫 칸이 갈림길'))).toBe(true)
  })

  it('없는 길을 가리키는 갈림길을 거부한다', () => {
    const errors = messages(withBoard((b) => (b.forks['o5'] = 'nope')))
    expect(errors.some((m) => m.includes('없는 길'))).toBe(true)
  })

  it('앞으로 칸이 앞으로 칸에 내려 주면 거부한다', () => {
    const errors = messages(withBoard((b) => (b.nodes['o15'] = { kind: 'forward', value: 1 })))
    expect(errors.some((m) => m.includes('또 앞으로 칸'))).toBe(true)
  })

  it('정수가 아닌 값을 거부한다', () => {
    const errors = messages(withBoard((b) => (b.nodes['o1'] = { kind: 'coin', value: 1.5 })))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('값이 빠진 코인 칸을 거부한다', () => {
    const errors = messages(withBoard((b) => (b.nodes['o1'] = { kind: 'coin' })))
    expect(errors.some((m) => m.includes('value가 필요'))).toBe(true)
  })

  it('구조상 최대가 maxWin을 넘으면 거부한다', () => {
    const errors = messages(withBoard((b) => (b['maxWin'] = 50)))
    expect(errors.some((m) => m.includes('maxWin'))).toBe(true)
  })

  it('지름길이 남은 걸음을 늘리면 거부한다 (단조 감소 척도)', () => {
    const errors = messages(
      withBoard((b) => {
        b.routes['b'] = ['o10', 'b1', 'b2', 'c', 'c1', 'c2', 'o15', 'o16', 'o17', 'o18', 'o19', 'f1', 'f2', 'goal']
      }),
    )
    expect(errors.some((m) => m.includes('남은 걸음'))).toBe(true)
  })

  it('처음 기회가 maxThrows보다 많으면 거부한다', () => {
    const errors = messages(withBoard((b) => (b['throws'] = 13)))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('orderRound·scatter.freeSpins·gamble과 공존을 거부한다', () => {
    const gamble = messages({ ...RAW, gamble: { type: 'coin-flip', chance: 0.5, payout: 2, maxSteps: 5 } })
    expect(gamble.some((m) => m.includes('gamble'))).toBe(true)
    const freeSpins = messages({
      ...RAW,
      scatter: { symbol: 'bonus', pays: { 3: 2 }, freeSpins: { trigger: 3, count: 8, multiplier: 2, retrigger: true } },
    })
    expect(freeSpins.some((m) => m.includes('freeSpins'))).toBe(true)
    const orders = messages({
      ...RAW,
      orderRound: {
        trigger: 3,
        spins: 5,
        slots: 1,
        maxOrders: 1,
        extraSpinsPerOrder: 0,
        pool: [{ id: 'x', kind: 'clusterSize', target: 5, prize: 1, weight: 1 }],
      },
    })
    expect(orders.some((m) => m.includes('orderRound'))).toBe(true)
  })

  it('스캐터가 없으면 거부한다', () => {
    const { scatter: _scatter, ...rest } = RAW
    void _scatter
    expect(messages(rest).some((m) => m.includes('scatter 설정이 필요'))).toBe(true)
  })

  it('트리거가 스캐터가 놓일 수 있는 칸 수보다 많으면 거부한다', () => {
    expect(messages(withBoard((b) => (b['trigger'] = 10))).some((m) => m.includes('트리거'))).toBe(true)
  })
})
