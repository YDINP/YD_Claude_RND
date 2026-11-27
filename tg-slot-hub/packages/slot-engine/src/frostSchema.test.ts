import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { safeParseGameMath } from './schema.js'
import { VOID_CELL, inShape, reelHeight, shapeCellCount, shapeCells, shapeWaysBase } from './shape.js'

const RAW = JSON.parse(
  readFileSync(new URL('../../../games/aurora-ice-palace/math.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

/** 원본을 깊은 복사한 뒤 고친다. */
function variant(edit: (math: Record<string, any>) => void): Record<string, unknown> {
  const copy = structuredClone(RAW) as Record<string, any>
  edit(copy)
  return copy
}

function messages(json: unknown): string[] {
  const parsed = safeParseGameMath(json)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe('shape: 릴별 높이', () => {
  const diamond = { reels: 5, rows: 5, reelHeights: [3, 4, 5, 4, 3] }
  const square = { reels: 5, rows: 3 }

  it('칸 수·길 수·칸 순서', () => {
    expect(shapeCellCount(diamond)).toBe(19)
    expect(shapeWaysBase(diamond)).toBe(720)
    expect(shapeWaysBase(square)).toBe(243)
    expect(shapeCells(diamond).slice(0, 4)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ])
    expect(shapeCells(diamond)).toBe(shapeCells(diamond))
  })

  it('판 안 판정', () => {
    expect(reelHeight(diamond, 0)).toBe(3)
    expect(reelHeight(square, 4)).toBe(3)
    expect(inShape(diamond, 0, 2)).toBe(true)
    expect(inShape(diamond, 0, 3)).toBe(false)
    expect(inShape(diamond, 2, 4)).toBe(true)
    expect(inShape(diamond, 5, 0)).toBe(false)
  })
})

describe('스키마: reelHeights · ways.from center · frostRespin', () => {
  it('aurora-ice-palace math.json이 통과한다', () => {
    expect(messages(RAW)).toEqual([])
  })

  it('reelHeights 길이·최댓값·rows 불일치를 막는다', () => {
    expect(messages(variant((m) => (m.reelHeights = [3, 4, 5, 4])))).toContain('reelHeights 길이(4)가 reels(5)와 다르다')
    expect(messages(variant((m) => (m.reelHeights = [3, 4, 4, 4, 3])))).toEqual(
      expect.arrayContaining(['rows(5)는 reelHeights 최댓값과 같아야 한다']),
    )
  })

  it('ways.base는 Π 릴 높이와 같아야 한다', () => {
    expect(messages(variant((m) => (m.ways.base = 3125)))).toContain('ways.base(3125)가 rows^reels(720)와 다르다')
  })

  it('가운데부터 지급: bothWays 금지, 짝수 릴 금지, 배당 개수 빈칸 금지', () => {
    expect(messages(variant((m) => (m.ways.bothWays = true)))).toContain("ways.from 'center'와 bothWays는 함께 둘 수 없다")
    expect(messages(variant((m) => (m.paytable.bear = { 3: 113, 5: 678 })))).toEqual(
      expect.arrayContaining([expect.stringContaining('bear: 가운데부터 지급은 3~5개 배당이 빈칸 없이')]),
    )
  })

  it(`${VOID_CELL}은 심볼 id로 쓸 수 없다`, () => {
    const json = variant((m) => m.symbols.push({ id: VOID_CELL, name: { en: 'Void' } }))
    expect(messages(json)).toEqual(expect.arrayContaining([expect.stringContaining('판 밖 표시라 심볼 id로 쓸 수 없다')]))
  })

  it('frostRespin: scatter.freeSpins와 동시 사용 금지, round 필수', () => {
    expect(
      messages(variant((m) => (m.scatter.freeSpins = { trigger: 3, count: 8, multiplier: 1, retrigger: false }))),
    ).toContain('frostRespin과 scatter.freeSpins는 함께 둘 수 없다')
    expect(messages(variant((m) => delete m.round))).toContain('frostRespin 팩은 round.maxWinCap이 필요하다')
  })

  it('frostRespin: hardCap은 구조상 최대(19 − 3 + 1 = 17) 이상', () => {
    expect(messages(variant((m) => (m.frostRespin.hardCap = 16)))).toContain('hardCap(16)이 구조상 최대 다시 돌리기(17)보다 작다')
  })

  it('frostRespin: 등급 누락·중복, 표 길이·단조·정수 코인', () => {
    expect(messages(variant((m) => (m.frostRespin.tiers.low = ['flake', 'icicle', 'bead'])))).toContain(
      '배당 심볼 feather가 어느 등급에도 없다',
    )
    expect(messages(variant((m) => m.frostRespin.tiers.mid.push('bear')))).toEqual(
      expect.arrayContaining([expect.stringContaining('bear가 두 등급')]),
    )
    expect(messages(variant((m) => m.frostRespin.bonus.high.pop()))).toEqual(
      expect.arrayContaining([expect.stringContaining('bonus.high 길이(5)')]),
    )
    expect(messages(variant((m) => (m.frostRespin.bonus.low = [2, 1, 3, 4, 5, 6])))).toContain('bonus.low는 단조 증가여야 한다')
    expect(messages(variant((m) => (m.frostRespin.bonus.low[0] = 0.75)))).toEqual(
      expect.arrayContaining([expect.stringContaining('정수가 아니다')]),
    )
  })

  it('frostRespin: 다시 돌리기 칸 스트립에 스캐터 금지, 릴 수 일치', () => {
    expect(messages(variant((m) => m.frostRespin.respinStrips[0].push('scatter')))).toContain(
      '다시 돌리기 칸 스트립에 스캐터 scatter를 둘 수 없다',
    )
    expect(messages(variant((m) => m.frostRespin.freeStrips.pop()))).toContain('freeStrips 개수(4)가 reels(5)와 다르다')
  })

  it('frostRespin: 리트리거 기대 증가 ≥ 1이면 막는다', () => {
    const json = variant((m) => {
      m.frostRespin.freeStrips = m.frostRespin.freeStrips.map((strip: string[]) => strip.map(() => 'scatter'))
    })
    expect(messages(json)).toEqual(expect.arrayContaining([expect.stringContaining('retrigger x P상한')]))
  })

  it('frostRespin: 오로라 사다리는 1부터 단조 증가', () => {
    expect(messages(variant((m) => (m.frostRespin.aurora.ladder = [2, 3])))).toContain('aurora.ladder 첫 값은 1이어야 한다')
  })
})
