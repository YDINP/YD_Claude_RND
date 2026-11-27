import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickDefaultBetIndex, storedBetIndex } from './defaultBet'

const GAMES_DIR = resolve(__dirname, '../../../../games')
const IDS = [
  'classic-777',
  'fruit-fiesta',
  'royal-diamond-777',
  'sheriff-sixgun',
  'shiba-shrine',
  'astral-clocktower',
  'candy-cluster-pop',
  'kraken-cove',
  'hanbok-night-market',
  'idol-stage-live',
] as const

function levelsOf(id: string): number[] {
  const math = JSON.parse(readFileSync(resolve(GAMES_DIR, id, 'math.json'), 'utf8')) as { betLevels: number[] }
  return math.betLevels
}

function betFor(id: string, balance: number, maxBet: number): number {
  const levels = levelsOf(id)
  return levels[pickDefaultBetIndex(levels, balance, maxBet)] as number
}

describe('pickDefaultBetIndex — 10종 표(잔액 10,000 · Lv1 최대 100)', () => {
  const expected: Record<(typeof IDS)[number], number> = {
    'classic-777': 20,
    'fruit-fiesta': 20,
    'royal-diamond-777': 20,
    'sheriff-sixgun': 20,
    'shiba-shrine': 25,
    'astral-clocktower': 100,
    'candy-cluster-pop': 20,
    'kraken-cove': 20,
    'hanbok-night-market': 25,
    'idol-stage-live': 50,
  }
  for (const id of IDS) {
    it(`${id} → ${expected[id]}`, () => {
      expect(betFor(id, 10_000, 100)).toBe(expected[id])
    })
  }
  it('astral만 0.5%를 넘는다(betDivisor 100 예외)', () => {
    for (const id of IDS) {
      const ratio = betFor(id, 10_000, 100) / 10_000
      if (id === 'astral-clocktower') expect(ratio).toBeGreaterThan(0.005)
      else expect(ratio).toBeLessThanOrEqual(0.005)
    }
  })
})

describe('pickDefaultBetIndex — games/* 전부(새 게임도 자동 포함)', () => {
  const all = readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
  it('10종 표의 게임이 모두 있다', () => {
    for (const id of IDS) expect(all).toContain(id)
  })
  for (const id of all) {
    it(`${id}: 잔액 10,000·5,000·50,000에서 기본 베팅이 0.5% 이하이거나 허용된 최소 단계`, () => {
      const levels = levelsOf(id)
      for (const [balance, maxBet] of [[10_000, 100], [5_000, 100], [50_000, 500]] as const) {
        const bet = betFor(id, balance, maxBet)
        const minAllowed = Math.min(...levels.filter((v) => v <= maxBet))
        expect(bet <= balance * 0.005 || bet === minAllowed).toBe(true)
      }
    })
  }
})

describe('pickDefaultBetIndex — 잔액 예', () => {
  it('3,000 → classic·royal 10, 나머지는 최소 단계', () => {
    expect(betFor('classic-777', 3_000, 100)).toBe(10)
    expect(betFor('royal-diamond-777', 3_000, 100)).toBe(10)
    for (const id of IDS.filter((x) => x !== 'classic-777' && x !== 'royal-diamond-777')) {
      expect(betFor(id, 3_000, 100)).toBe(levelsOf(id)[0])
    }
  })
  it('30,000(최대 100) → 전 게임 100', () => {
    for (const id of IDS) expect(betFor(id, 30_000, 100)).toBe(100)
  })
  it('50,000(Lv5) → 전 게임 100', () => {
    for (const id of IDS) expect(betFor(id, 50_000, 500)).toBe(100)
  })
  it('200,000(Lv10) → fruit·sheriff·astral 400, 나머지 500', () => {
    for (const id of ['fruit-fiesta', 'sheriff-sixgun', 'astral-clocktower']) expect(betFor(id, 200_000, 2_000)).toBe(400)
    for (const id of ['classic-777', 'royal-diamond-777', 'shiba-shrine', 'candy-cluster-pop', 'kraken-cove', 'hanbok-night-market', 'idol-stage-live']) {
      expect(betFor(id, 200_000, 2_000)).toBe(500)
    }
  })
})

describe('pickDefaultBetIndex — 경계', () => {
  it('maxBet을 넘는 단계는 쓰지 않는다', () => {
    expect(betFor('classic-777', 200_000, 50)).toBe(50)
  })
  it('maxBet이 최소 단계보다 작아도 최소 단계를 고른다', () => {
    expect(betFor('astral-clocktower', 10_000, 10)).toBe(100)
  })
  it('동점이면 작은 쪽', () => {
    expect(pickDefaultBetIndex([100, 200], 50_000, 1_000)).toBe(0)
  })
  it('잔액 0이면 최소 단계', () => {
    expect(pickDefaultBetIndex([10, 20], 0, 100)).toBe(0)
  })
})

describe('storedBetIndex', () => {
  const levels = [10, 20, 50, 100]
  it('저장 없음 → -1', () => expect(storedBetIndex(levels, null, 10_000, 100)).toBe(-1))
  it('쓸 수 있으면 그 인덱스', () => expect(storedBetIndex(levels, 50, 10_000, 100)).toBe(2))
  it('maxBet 초과 → -1', () => expect(storedBetIndex(levels, 100, 10_000, 50)).toBe(-1))
  it('잔액 초과 → -1', () => expect(storedBetIndex(levels, 100, 80, 100)).toBe(-1))
  it('단계에 없는 금액 → -1', () => expect(storedBetIndex(levels, 33, 10_000, 100)).toBe(-1))
})
