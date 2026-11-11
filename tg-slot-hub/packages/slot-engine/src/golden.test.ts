import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from './schema.js'
import { spin } from './spin.js'
import { createSeededRng } from './rng/seeded.js'
import type { RoundState, SpinResult } from './types.js'

/**
 * live 팩 결과 회귀 기준점. 엔진을 고쳐도 기존 팩의 스핀 결과는 한 비트도 바뀌면 안 된다.
 * 의도한 변경일 때만 `UPDATE_GOLDEN=1`로 다시 만든다.
 */
const LIVE_PACKS = [
  'astral-clocktower',
  'classic-777',
  'fruit-fiesta',
  'royal-diamond-777',
  'sheriff-sixgun',
  'shiba-shrine',
] as const
const PAID_ROUNDS = 2_000
const HASHES_URL = new URL('./__golden__/hashes.json', import.meta.url)

function goldenHash(id: string): string {
  const math = parseGameMath(JSON.parse(readFileSync(new URL(`../../../games/${id}/math.json`, import.meta.url), 'utf8')))
  const bet = { totalBet: math.betLevels[0] ?? 0 }
  const rng = createSeededRng(`golden-${id}`)
  const results: SpinResult[] = []
  for (let i = 0; i < PAID_ROUNDS; i += 1) {
    const paid = spin(math, bet, rng)
    results.push(paid)
    let state: RoundState | undefined = paid.nextState
    while (state !== undefined) {
      const free = spin(math, bet, rng, state)
      results.push(free)
      state = free.nextState
    }
  }
  return createHash('sha256').update(JSON.stringify(results)).digest('hex')
}

describe('golden: live 팩 비트 동일', () => {
  if (process.env.UPDATE_GOLDEN === '1') {
    it('해시를 다시 쓴다', () => {
      const hashes = Object.fromEntries(LIVE_PACKS.map((id) => [id, goldenHash(id)]))
      writeFileSync(HASHES_URL, `${JSON.stringify(hashes, null, 2)}\n`)
    }, 120_000)
    return
  }

  const expected = JSON.parse(readFileSync(HASHES_URL, 'utf8')) as Record<string, string>
  it('기준 해시가 live 팩 전부를 덮는다', () => {
    expect(Object.keys(expected).sort()).toEqual([...LIVE_PACKS])
  })
  for (const id of LIVE_PACKS) {
    it(`${id} 유료 ${PAID_ROUNDS}라운드`, () => {
      expect(goldenHash(id)).toBe(expected[id])
    }, 60_000)
  }
})
