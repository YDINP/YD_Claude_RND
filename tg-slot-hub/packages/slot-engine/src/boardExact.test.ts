import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { playBoard } from './board.js'
import { boardExpectation } from './boardExact.js'
import { computeBoardRtp } from './boardRtp.js'
import type { BoardBonusConfig } from './boardSchema.js'
import { parseGameMath } from './schema.js'
import { createSeededRng } from './rng/seeded.js'

const HANBOK = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../games/hanbok-night-market/math.json', import.meta.url), 'utf8')),
)
const BOARD = HANBOK.boardBonus as BoardBonusConfig

describe('boardExpectation', () => {
  const exact = boardExpectation(BOARD)

  it('확률 합이 1이다', () => {
    const ends = exact.pEnd.goal + exact.pEnd.traps + exact.pEnd.throws
    expect(ends).toBeCloseTo(1, 12)
    expect(exact.distribution.reduce((sum, row) => sum + row.p, 0)).toBeCloseTo(1, 12)
    expect(exact.throwsDistribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12)
  })

  it('최대 지급이 maxWin을 넘지 않고, 최소 지급 아래는 없다', () => {
    expect(exact.max).toBeLessThanOrEqual(BOARD.maxWin)
    expect(exact.distribution[0]?.payout).toBeGreaterThanOrEqual(BOARD.minPayout)
  })

  it('MC 200만 판 평균이 DP 평균과 3SE 안이고 관측 최대 <= DP 최대', () => {
    const rng = createSeededRng('board-mc')
    const n = 2_000_000
    let sum = 0
    let squares = 0
    let max = 0
    let goal = 0
    for (let i = 0; i < n; i += 1) {
      const board = playBoard(BOARD, 1, rng, Infinity)
      sum += board.payout
      squares += board.payout * board.payout
      if (board.payout > max) max = board.payout
      if (board.end === 'goal') goal += 1
    }
    const mean = sum / n
    const se = Math.sqrt((squares / n - mean * mean) / n)
    expect(Math.abs(mean - exact.mean)).toBeLessThan(3 * se)
    expect(max).toBeLessThanOrEqual(exact.max)
    const seGoal = Math.sqrt((exact.pGoal * (1 - exact.pGoal)) / n)
    expect(Math.abs(goal / n - exact.pGoal)).toBeLessThan(4 * seGoal)
  }, 120_000)

  it('던지기 수는 maxThrows를 넘지 않는다', () => {
    exact.throwsDistribution.forEach((p, thrown) => {
      if (thrown > BOARD.maxThrows) expect(p).toBe(0)
    })
  })
})

describe('computeBoardRtp', () => {
  it('말판 몫 = P(트리거) x E[말판]', () => {
    const report = computeBoardRtp(HANBOK, 100)
    expect(report.board).toBeCloseTo(report.triggerProbability * report.expectation.mean, 12)
    expect(report.rtp).toBeCloseTo(report.lines + report.scatter + report.board, 12)
  })
})
