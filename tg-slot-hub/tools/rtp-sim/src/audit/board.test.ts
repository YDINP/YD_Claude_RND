import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { boardExpectation, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from '../paths.js'
import { scaleBoard } from '../tune-cli.js'
import { boardGates } from './compute.js'
import { buildAuditMarkdown } from './report.js'
import { collectSample, finishSample, mergeSampleStates } from './sampleDistribution.js'

const BET = 100
const hanbok: GameMath = parseGameMath(readJson(join(gamesDir(), 'hanbok-night-market', 'math.json')))

describe('말판 감사 통', () => {
  const a = collectSample(hanbok, BET, { spins: 60_000, seed: 'board-a', rtpSource: 'sample', skipEngineMc: true })
  const b = collectSample(hanbok, BET, { spins: 60_000, seed: 'board-b', rtpSource: 'sample', skipEngineMc: true })
  const merged = mergeSampleStates(hanbok, [a, b], 'board')
  const report = finishSample(hanbok, merged)

  it('말판 리포트가 실리고 종료 사유 합이 1, 지급 출처 합이 표본 RTP다', () => {
    const board = report.board
    expect(board).toBeDefined()
    if (board === undefined) return
    expect(board.paidSpins).toBe(120_000)
    expect(board.boards).toBe((a.board?.boards ?? 0) + (b.board?.boards ?? 0))
    expect(board.boards).toBeGreaterThan(300)
    expect(board.ends.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 12)
    const sampleRtp = merged.multiplierSum / merged.spins
    expect(board.breakdown.lines + board.breakdown.scatter + board.breakdown.board).toBeCloseTo(sampleRtp, 9)
    expect(board.exactMean).toBeCloseTo(boardExpectation(hanbok.boardBonus!).mean, 12)
    expect(board.overMaxThrows).toBe(0)
  })

  it('게이트 5개가 나오고 리포트 마크다운에 말판 절이 있다', () => {
    const board = report.board
    if (board === undefined) throw new Error('말판 리포트 없음')
    const gates = boardGates(board)
    expect(gates).toHaveLength(5)
    expect(gates.find((gate) => gate.label.startsWith('최장 던지기'))?.pass).toBe(true)
    expect(gates.find((gate) => gate.label.startsWith('winCapped'))?.pass).toBe(true)
    expect(typeof buildAuditMarkdown).toBe('function')
  })
})

describe('scaleBoard', () => {
  it('값 배율 k면 말판 평균이 거의 k배, maxWin은 DP 최대로 다시 맞춘다', () => {
    const config = hanbok.boardBonus!
    const before = boardExpectation(config)
    const scaled = scaleBoard(config, 2)
    const after = boardExpectation(scaled)
    expect(after.mean / before.mean).toBeCloseTo(2, 6)
    expect(scaled.maxWin).toBe(after.max)
    expect(scaled.minPayout).toBe(config.minPayout * 2)
  })
})
