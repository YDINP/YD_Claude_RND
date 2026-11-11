import { describe, expect, it } from 'vitest'
import { evaluateClusters } from './cluster.js'
import { makeClusterMath } from './testFixtures.js'
import type { SymbolId } from './types.js'

const BET = 20
const math = makeClusterMath()

/** 문자열 한 줄이 한 행이다. 한 글자가 심볼 id 하나. */
function grid(...rows: string[]): SymbolId[][] {
  return rows.map((row) => row.split(''))
}

function run(g: SymbolId[][], ladder = 1, m = math) {
  return evaluateClusters(g, m, BET, ladder)
}

describe('evaluateClusters', () => {
  it('L자 그룹 4칸을 한 승리로 묶는다', () => {
    const { wins, removed } = run(grid('aaxx', 'axxx', 'axxx'))
    expect(wins).toHaveLength(1)
    expect(wins[0]).toMatchObject({
      line: -1,
      symbol: 'a',
      count: 4,
      multiplier: 0.5,
      win: 10,
      payKind: 'cluster',
      ladder: 1,
    })
    expect(wins[0]?.positions).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ])
    expect(removed).toEqual(wins[0]?.positions)
  })

  it('T자 그룹도 이어진 하나로 센다', () => {
    const { wins } = run(grid('aaax', 'xaxx', 'xxxx'))
    expect(wins).toHaveLength(1)
    expect(wins[0]?.count).toBe(4)
  })

  it('와일드가 두 덩이를 이어 주면 와일드까지 크기에 센다', () => {
    const { wins, removed } = run(grid('awax', 'axax', 'xxxx'))
    expect(wins).toHaveLength(1)
    expect(wins[0]?.count).toBe(5)
    expect(wins[0]?.multiplier).toBe(0.5)
    expect(removed).toContainEqual([1, 0])
  })

  it('와일드는 여러 심볼의 그룹에 동시에 끼고, 제거 좌표는 중복 없이 합친다', () => {
    const { wins, removed } = run(grid('aawb', 'axbb', 'xxxx'))
    expect(wins.map((win) => [win.symbol, win.count])).toEqual([
      ['a', 4],
      ['b', 4],
    ])
    expect(removed).toHaveLength(7)
    expect(new Set(removed.map(([reel, row]) => `${reel},${row}`)).size).toBe(7)
  })

  it('크기 4 미만은 지급하지 않는다', () => {
    expect(run(grid('aaax', 'xxxx', 'xxxx')).wins).toEqual([])
  })

  it('크기 7은 6 티어 배수로 지급한다', () => {
    const { wins } = run(grid('aaaa', 'aaax', 'xxxx'))
    expect(wins[0]?.count).toBe(7)
    expect(wins[0]?.multiplier).toBe(1)
    expect(wins[0]?.win).toBe(20)
  })

  it('스캐터는 길을 막는다 (스캐터가 끼면 이어지지 않는다)', () => {
    expect(run(grid('asaa', 'axxa', 'xxxx')).wins).toEqual([])
  })

  it('와일드만으로 된 그룹은 지급하지 않는다', () => {
    expect(run(grid('wwww', 'xxxx', 'xxxx')).wins).toEqual([])
  })

  it('사다리 배수가 금액에 곱해지고 ladder 필드에 남는다', () => {
    const { wins } = run(grid('aaxx', 'axxx', 'axxx'), 3)
    expect(wins[0]?.win).toBe(30)
    expect(wins[0]?.ladder).toBe(3)
  })

  it('30칸 전부 같은 심볼이면 한 그룹, 제거 30칸', () => {
    const big = makeClusterMath({
      reels: 6,
      rows: 5,
      strips: Array.from({ length: 6 }, () => ['a', 'b', 'c', 's', 'w', 'a']),
      cluster: { minCluster: 5, adjacency: 'orthogonal' },
      paytable: { a: { 5: 1, 30: 50 }, b: { 5: 1 }, c: { 5: 1 } },
    })
    const full = Array.from({ length: 5 }, () => new Array<string>(6).fill('a'))
    const { wins, removed } = evaluateClusters(full, big, BET, 1)
    expect(wins).toHaveLength(1)
    expect(wins[0]?.count).toBe(30)
    expect(wins[0]?.win).toBe(1000)
    expect(removed).toHaveLength(30)
  })

  it('removed는 reel, row 오름차순이다', () => {
    const { removed } = run(grid('xxbb', 'xxbb', 'aaaa'))
    const sorted = [...removed].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(removed).toEqual(sorted)
  })

  it('wildJoins가 꺼져 있으면 와일드는 이어 주지 않는다', () => {
    const noJoin = makeClusterMath({ cluster: { minCluster: 4, adjacency: 'orthogonal', wildJoins: false } })
    expect(evaluateClusters(grid('awax', 'axax', 'xxxx'), noJoin, BET, 1).wins).toEqual([])
  })
})
