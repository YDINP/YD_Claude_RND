import { describe, expect, it } from 'vitest'
import { coinAnticipatedReels, coinCountsByReel, type CoinAnticipationMath } from './coinAnticipation.js'
import { loadGameMath } from './testSupport.js'

/** 릴마다 길이 10의 스트립. 0번 칸이 코인이고, 정지 위치 0이면 창(3칸)의 첫 칸이 코인이다. */
function makeMath(coinRows: number[][]): { math: CoinAnticipationMath; stops: number[] } {
  const strips = coinRows.map((rows) => {
    const strip = new Array<string>(10).fill('crab')
    for (const row of rows) strip[row] = 'coin'
    return strip
  })
  return {
    math: { reels: 5, rows: 3, strips, coinRespin: { symbol: 'coin', trigger: 6 } },
    stops: [0, 0, 0, 0, 0],
  }
}

describe('코인 기대감', () => {
  it('코인 리스핀이 없는 게임은 비어 있다', () => {
    const { stops } = makeMath([[], [], [], [], []])
    expect(coinAnticipatedReels({ reels: 5, rows: 3, strips: [], coinRespin: undefined }, stops)).toEqual([])
  })

  it('릴 3 뒤 코인이 4개면 릴 4·5를 늦춘다', () => {
    const { math, stops } = makeMath([[0, 1], [0, 1], [], [], []])
    expect(coinAnticipatedReels(math, stops)).toEqual([3, 4])
  })

  it('릴 3 뒤 코인이 3개면 아직 아니다', () => {
    const { math, stops } = makeMath([[0, 1], [0], [], [], []])
    expect(coinAnticipatedReels(math, stops)).toEqual([])
  })

  it('릴 4 뒤 코인이 5개면 릴 5만 늦춘다', () => {
    const { math, stops } = makeMath([[0], [0], [0, 1], [0, 1], []])
    // 릴 3 뒤 코인 4개 → 릴 4가 늦는다. 릴 4 뒤에는 이미 6개라 릴 5는 더 늦출 이유가 없다.
    expect(coinAnticipatedReels(math, stops)).toEqual([3])
    const second = makeMath([[0], [0], [0], [0, 1], [0, 1]])
    expect(coinAnticipatedReels(second.math, second.stops)).toEqual([4])
  })

  it('이미 6개가 모였으면 더 늦추지 않는다', () => {
    const { math, stops } = makeMath([[0, 1, 2], [0, 1, 2], [0], [], []])
    expect(coinAnticipatedReels(math, stops)).toEqual([])
  })

  it('릴당 개수는 정지 위치의 창 3칸만 센다', () => {
    const { math } = makeMath([[0, 1, 2], [], [], [], []])
    expect(coinCountsByReel(math, [0, 0, 0, 0, 0])).toEqual([3, 0, 0, 0, 0])
    // 정지 위치를 뒤로 밀면 창에 코인이 한 칸만 남는다(strip[2]).
    expect(coinCountsByReel(math, [2, 0, 0, 0, 0])).toEqual([1, 0, 0, 0, 0])
    // 스트립 끝을 넘어가는 창도 한 바퀴를 돈다(인덱스 9, 0, 1).
    expect(coinCountsByReel(math, [9, 0, 0, 0, 0])).toEqual([2, 0, 0, 0, 0])
  })

  it('결과가 아니라 시간만 정한다: 같은 입력은 늘 같은 목록이다', () => {
    const { math, stops } = makeMath([[0, 1], [0, 1], [], [], []])
    expect(coinAnticipatedReels(math, stops)).toEqual(coinAnticipatedReels(math, stops))
  })

  it('실제 팩에서 기대감이 걸리는 판은 드물다(3% 이하)', () => {
    const real = loadGameMath('kraken-cove')
    let hits = 0
    const total = 20000
    // 정지 위치를 균등하게 훑는다(릴 길이가 서로 달라 소수 보폭으로 어긋나게 한다).
    for (let i = 0; i < total; i += 1) {
      const stops = real.strips.map((strip, reel) => (i * (7 + reel * 4) + reel * 13) % strip.length)
      if (coinAnticipatedReels(real, stops).length > 0) hits += 1
    }
    expect(hits / total).toBeLessThan(0.03)
    expect(hits).toBeGreaterThan(0)
  })
})
