import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseGameMath } from '@tgslot/slot-engine'
import { featureBuyBlockReason, featureBuyCost, featureBuyTriggerCount } from './featureBuy'

const base = { autoSpinning: false, inRound: false, busy: false, gambleOpen: false, balance: 10_000, cost: 2_000 }

describe('피처 구매 — 비용', () => {
  it('비용 = 가격 × 베팅(부동소수 오차는 정수로)', () => {
    expect(featureBuyCost(100, 20)).toBe(2000)
    expect(featureBuyCost(18.4, 50)).toBe(920)
    expect(featureBuyCost(1.1, 100)).toBe(110)
  })
})

describe('피처 구매 — 막힌 이유(우선순위 순)', () => {
  it('막힌 것이 없으면 null', () => {
    expect(featureBuyBlockReason(base)).toBeNull()
  })
  it('오토스핀 > 보너스 진행 > 스핀 중 > 더블업 > 잔액', () => {
    const all = { autoSpinning: true, inRound: true, busy: true, gambleOpen: true, balance: 0, cost: 2000 }
    expect(featureBuyBlockReason(all)).toBe('autoSpin')
    expect(featureBuyBlockReason({ ...all, autoSpinning: false })).toBe('freeSpins')
    expect(featureBuyBlockReason({ ...all, autoSpinning: false, inRound: false })).toBe('spinning')
    expect(featureBuyBlockReason({ ...all, autoSpinning: false, inRound: false, busy: false })).toBe('gamble')
    expect(featureBuyBlockReason({ ...base, balance: 1999 })).toBe('funds')
    expect(featureBuyBlockReason({ ...base, balance: 2000 })).toBeNull()
  })
})

describe('피처 구매 — 시작 판의 스캐터(코인) 개수', () => {
  const read = (id: string) =>
    parseGameMath(JSON.parse(readFileSync(resolve(__dirname, '../../../../games', id, 'math.json'), 'utf8')))
  it.each([
    ['fruit-fiesta', 3],
    ['volcano-forge', 4],
    ['aurora-ice-palace', 3],
    ['greenhouse-garden', 3],
    ['kraken-cove', 6],
    ['hanbok-night-market', 3],
  ])('%s → %i', (id, n) => {
    const math = read(id)
    expect(featureBuyTriggerCount(math, math.featureBuy!.trigger)).toBe(n)
  })
})
