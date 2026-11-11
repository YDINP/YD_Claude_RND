import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from './paths.js'
import { generateStrips, scalePaytable, scalePrizes, snapToGrid, stripCounts } from './strips.js'
import type { DensityTable } from './strips.js'
import { applyTuning, formatMathJson, parseTuneArgs } from './tune-cli.js'

const raw = readJson(join(gamesDir(), 'candy-cluster-pop', 'math.json')) as Record<string, unknown>
const math: GameMath = parseGameMath(raw)

const reel = {
  wild: 3,
  scatter: 3,
  heart: 9,
  star: 10,
  bean: 11,
  drop_red: 17,
  drop_blue: 17,
  drop_green: 17,
  drop_purple: 17,
  drop_yellow: 16,
}

function runs(strip: readonly string[]): number {
  let count = 0
  for (let i = 1; i < strip.length; i += 1) if (strip[i] === strip[i - 1]) count += 1
  return count
}

describe('generateStrips', () => {
  it('밀도표 개수를 그대로 지키고 같은 시드면 같은 스트립을 낸다', () => {
    const table: DensityTable = { reels: reel, clump: 0.2 }
    const strips = generateStrips(math, table, 7)
    expect(strips).toHaveLength(math.reels)
    for (const counts of stripCounts(strips)) expect(counts).toEqual(reel)
    expect(generateStrips(math, table, 7)).toEqual(strips)
    expect(generateStrips(math, table, 8)).not.toEqual(strips)
  })

  it('와일드·스캐터는 같은 심볼끼리 행 수 이상 떨어진다(원형)', () => {
    for (const strip of generateStrips(math, { reels: reel, clump: 0.5 }, 3)) {
      for (const symbol of ['wild', 'scatter']) {
        const at = strip.flatMap((value, index) => (value === symbol ? [index] : []))
        for (let i = 0; i < at.length; i += 1) {
          const next = at[(i + 1) % at.length] ?? 0
          const gap = (next - (at[i] ?? 0) + strip.length) % strip.length || strip.length
          expect(gap).toBeGreaterThanOrEqual(math.rows)
        }
      }
    }
  })

  it('뭉침이 클수록 같은 심볼이 이어지는 칸이 늘어난다', () => {
    const loose = generateStrips(math, { reels: reel, clump: 0 }, 1).reduce((sum, strip) => sum + runs(strip), 0)
    const tight = generateStrips(math, { reels: reel, clump: 0.5 }, 1).reduce((sum, strip) => sum + runs(strip), 0)
    expect(tight).toBeGreaterThan(loose * 2)
  })

  it('릴별 표와 구역 뭉침도 개수를 지킨다', () => {
    const reels = [reel, reel, reel, reel, reel, { ...reel, scatter: 4, drop_yellow: 15 }]
    const strips = generateStrips(math, { reels, zone: { size: 12, bias: 0.3 } }, 2)
    expect(stripCounts(strips)).toEqual(reels)
  })

  it('모르는 심볼과 지킬 수 없는 간격은 던진다', () => {
    expect(() => generateStrips(math, { reels: { ...reel, ghost: 1 } }, 1)).toThrow(RangeError)
    expect(() => generateStrips(math, { reels: { scatter: 30, heart: 10 } }, 1)).toThrow(RangeError)
  })
})

describe('배율', () => {
  it('0.05 눈금으로 반올림하고 0 아래로 내리지 않는다', () => {
    expect(snapToGrid(0.123)).toBe(0.1)
    expect(snapToGrid(0.126)).toBe(0.15)
    expect(snapToGrid(0.001)).toBe(0.05)
    expect(snapToGrid(3.3683)).toBe(3.35)
  })

  it('페이테이블·상품 배율 결과는 최소 베팅에서도 정수 코인이다', () => {
    const minBet = Math.min(...math.betLevels)
    for (const rule of Object.values(scalePaytable(math, 1.37))) {
      for (const value of Object.values(rule)) expect(Number.isInteger(Math.round(value * minBet * 1e9) / 1e9)).toBe(true)
    }
    for (const entry of scalePrizes(math, 1.37)) {
      expect(Number.isInteger(Math.round(entry.prize * minBet * 1e9) / 1e9)).toBe(true)
    }
  })
})

describe('tune-cli', () => {
  it('applyTuning 결과는 스키마를 통과하고 배율이 걸린다', () => {
    const tuned = applyTuning(raw, { densities: { reels: reel, clump: 0.1 }, stripSeed: '2', payScale: 2, prizeScale: 2 })
    expect(tuned.math.strips.every((strip) => strip.length === 120)).toBe(true)
    const heart = tuned.math.paytable['heart'] as Record<string, number>
    const before = math.paytable['heart'] as Record<string, number>
    expect(heart['5']).toBe(snapToGrid((before['5'] ?? 0) * 2))
    expect(tuned.math.orderRound?.pool[0]?.prize).toBe(snapToGrid((math.orderRound?.pool[0]?.prize ?? 0) * 2))
  })

  it('formatMathJson은 같은 값을 되돌려주고 스트립을 한 줄로 쓴다', () => {
    const text = formatMathJson(raw)
    expect(JSON.parse(text)).toEqual(raw)
    const stripLines = text.split('\n').filter((line) => line.trimStart().startsWith('["'))
    expect(stripLines).toHaveLength(math.reels)
  })

  it('인자를 읽고 범위를 검사한다', () => {
    const options = parseTuneArgs(['candy-cluster-pop', '--spins', '500', '--shards', '4', '--pay-scale', '1.5'])
    expect(options).toMatchObject({ target: 'candy-cluster-pop', spins: 500, shards: 4, payScale: 1.5, write: false })
    expect(() => parseTuneArgs(['x', '--shards', '9'])).toThrow()
    expect(() => parseTuneArgs([])).toThrow()
  })
})
