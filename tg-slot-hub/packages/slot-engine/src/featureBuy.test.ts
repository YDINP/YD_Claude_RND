import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath, safeParseGameMath } from './schema.js'
import { spin } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import { FEATURE_BUY_MAX_TRIES, findFeatureBuySpin, isFeatureBuyTriggered } from './featureBuy.js'

const GAMES = new URL('../../../games/', import.meta.url)
const rng = (seed: string, nonce: number) => createSeededRng(`${seed}:${nonce}`)

function counterSeeds(prefix: string): () => string {
  let n = 0
  return () => `${prefix}-${(n += 1)}`
}

const packs = readdirSync(GAMES)
  .filter((id) => !id.startsWith('_') && existsSync(new URL(`${id}/math.json`, GAMES)))
  .map((id) => ({ id, raw: JSON.parse(readFileSync(new URL(`${id}/math.json`, GAMES), 'utf8')) as Record<string, unknown> }))

describe('피처 구매 — 거절 표본 추출', () => {
  const buyable = packs.filter((pack) => pack.raw.featureBuy !== undefined)

  it('대표 보너스가 있는 팩은 모두 featureBuy를 가진다(클래식 3릴만 빠진다)', () => {
    expect(buyable.length).toBeGreaterThanOrEqual(12)
    expect(packs.filter((pack) => pack.raw.featureBuy === undefined).map((pack) => pack.id)).toEqual(['classic-777'])
  })

  for (const pack of buyable) {
    it(`${pack.id}: 찾은 판은 항상 보너스에 진입하고 공개 시드로 그대로 재현된다`, () => {
      const math = parseGameMath(pack.raw)
      const buy = math.featureBuy!
      const totalBet = math.betLevels[0]!
      const newSeed = counterSeeds(pack.id)
      for (let nonce = 1; nonce <= 20; nonce += 1) {
        const found = findFeatureBuySpin({ math, trigger: buy.trigger, totalBet, nonce, newSeed, createRng: rng })
        expect(found).not.toBeNull()
        expect(isFeatureBuyTriggered(buy.trigger, found!.result)).toBe(true)
        expect(found!.tries).toBeLessThanOrEqual(FEATURE_BUY_MAX_TRIES)
        // 재현: 같은 (seed, nonce)로 평범한 유료 판을 돌리면 같은 결과, 이어지는 잭팟 추첨값까지 같다.
        const replay = createSeededRng(`${found!.seed}:${nonce}`)
        expect(spin(math, { totalBet }, replay)).toEqual(found!.result)
        expect(replay.nextInt(1_000_000)).toBe(found!.rng.nextInt(1_000_000))
      }
    })
  }

  it('상한 안에서 못 찾으면 null', () => {
    const math = parseGameMath(packs.find((pack) => pack.id === 'fruit-fiesta')!.raw)
    // 시도 1번으로는 대부분 못 찾는다. 찾지 못한 경우만 본다.
    let misses = 0
    for (let nonce = 1; nonce <= 20; nonce += 1) {
      const found = findFeatureBuySpin({
        math,
        trigger: 'freeSpins',
        totalBet: math.betLevels[0]!,
        nonce,
        newSeed: counterSeeds('miss'),
        createRng: rng,
        maxTries: 1,
      })
      if (found === null) misses += 1
    }
    expect(misses).toBeGreaterThan(0)
  })
})

describe('피처 구매 — 스키마', () => {
  it('그 팩에서 열 수 없는 보너스를 trigger로 두면 거부한다', () => {
    const raw = { ...packs.find((pack) => pack.id === 'fruit-fiesta')!.raw, featureBuy: { price: 100, trigger: 'coinRespin' } }
    const parsed = safeParseGameMath(raw)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.some((issue) => issue.path.join('.') === 'featureBuy.trigger')).toBe(true)
  })

  it('가격은 2배 이상이고 모든 베팅 단계에서 비용이 정수 코인', () => {
    const base = packs.find((pack) => pack.id === 'fruit-fiesta')!.raw
    expect(safeParseGameMath({ ...base, featureBuy: { price: 1, trigger: 'freeSpins' } }).success).toBe(false)
    expect(safeParseGameMath({ ...base, featureBuy: { price: 72.33, trigger: 'freeSpins' } }).success).toBe(false)
    expect(safeParseGameMath({ ...base, featureBuy: { price: 72.5, trigger: 'freeSpins' } }).success).toBe(true)
    expect(safeParseGameMath({ ...base, featureBuy: { price: 70, trigger: 'freeSpins' } }).success).toBe(true)
  })
})
