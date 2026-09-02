import { describe, expect, it } from 'vitest'
import { evaluate, getBetPerLine } from './evaluate.js'
import { parseGameMath } from './schema.js'
import { BLANK_ROW, makeBarMath, makeGrid, makeTestMath } from './testFixtures.js'

const math = makeTestMath()
const BET_PER_LINE = 1

/** 가운데 라인만 채우고 나머지는 블랭크로 둔 그리드. */
function middleLine(symbols: string[]): string[][] {
  return makeGrid([BLANK_ROW, symbols, BLANK_ROW])
}

describe('evaluate', () => {
  it('3연속 매치는 페이테이블의 3개 배수로 지급한다', () => {
    const result = evaluate(middleLine(['a', 'a', 'a']), math, BET_PER_LINE)
    expect(result.wins).toHaveLength(1)
    expect(result.wins[0]).toMatchObject({ line: 0, symbol: 'a', count: 3, multiplier: 10, win: 10 })
    expect(result.wins[0]?.positions).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ])
    expect(result.totalWin).toBe(10)
  })

  it('와일드가 일반 심볼을 대체한다', () => {
    expect(evaluate(middleLine(['a', 'w', 'a']), math, BET_PER_LINE).totalWin).toBe(10)
    expect(evaluate(middleLine(['w', 'a', 'a']), math, BET_PER_LINE).totalWin).toBe(10)
  })

  it('와일드만 있는 라인은 와일드 자신의 배수가 더 높으면 그것으로 지급한다', () => {
    const result = evaluate(middleLine(['w', 'w', 'w']), math, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'w', multiplier: 100 })
  })

  it('와일드 자신의 배수가 낮으면 더 높은 일반 심볼 해석으로 지급한다', () => {
    const cheapWild = makeTestMath({ paytable: { w: { 3: 3 }, a: { 3: 10, 2: 2 }, b: { 3: 5 } } })
    const result = evaluate(middleLine(['w', 'w', 'w']), cheapWild, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', multiplier: 10 })
  })

  it('3연속일 때 2연속 배수를 중복 지급하지 않는다', () => {
    const result = evaluate(middleLine(['a', 'a', 'a']), math, BET_PER_LINE)
    expect(result.totalWin).toBe(10)
  })

  it('긴 연속이 이긴다: 2개와 3개 배수가 같아도 3연속은 3개로 보고한다', () => {
    const flat = makeTestMath({ paytable: { w: { 3: 100 }, a: { 2: 10, 3: 10 }, b: { 3: 5 } } })
    const result = evaluate(middleLine(['a', 'a', 'a']), flat, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 3, multiplier: 10 })
    expect(result.wins[0]?.positions).toHaveLength(3)
    expect(result.totalWin).toBe(10)
  })

  it('3개 배수가 없는 심볼은 3연속이어도 정의된 최장 개수(2개)로 지급한다', () => {
    const twoOnly = makeTestMath({ paytable: { w: { 3: 100 }, a: { 2: 4 }, b: { 3: 5 } } })
    const result = evaluate(middleLine(['a', 'a', 'a']), twoOnly, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 2, multiplier: 4 })
  })

  it('2연속 뒤에 끊기면 2개 배수만 지급한다', () => {
    const result = evaluate(middleLine(['a', 'a', 'b']), math, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 2, multiplier: 2 })
    expect(result.wins[0]?.positions).toEqual([
      [0, 1],
      [1, 1],
    ])
  })

  it('왼쪽부터 연속이 아니면 지급하지 않는다', () => {
    expect(evaluate(middleLine(['a', 'b', 'a']), math, BET_PER_LINE).totalWin).toBe(0)
    expect(evaluate(middleLine(['b', 'a', 'a']), math, BET_PER_LINE).totalWin).toBe(0)
  })

  it('2개 배수가 없는 심볼은 2연속으로 지급하지 않는다', () => {
    expect(evaluate(middleLine(['b', 'b', 'a']), math, BET_PER_LINE).totalWin).toBe(0)
  })

  it('여러 라인이 동시에 지급된다', () => {
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
      ['_', '_', '_'],
    ])
    const result = evaluate(grid, math, BET_PER_LINE)
    expect(result.wins.map((win) => win.line).sort()).toEqual([0, 1])
    expect(result.totalWin).toBe(15)
  })

  it('스캐터는 라인으로 지급하지 않는다', () => {
    expect(evaluate(middleLine(['s', 's', 's']), math, BET_PER_LINE).totalWin).toBe(0)
  })

  it('와일드는 스캐터를 대체하지 않는다', () => {
    expect(evaluate(middleLine(['s', 'w', 's']), math, BET_PER_LINE).totalWin).toBe(0)
  })

  it('substitutesFor 목록에 없는 심볼은 대체하지 않는다', () => {
    const restricted = makeTestMath({ wild: { substitutesFor: ['a'] } })
    expect(evaluate(middleLine(['a', 'w', 'a']), restricted, BET_PER_LINE).totalWin).toBe(10)
    expect(evaluate(middleLine(['b', 'w', 'b']), restricted, BET_PER_LINE).totalWin).toBe(0)
  })

  it('excludes에 걸린 심볼은 대체하지 않는다', () => {
    const excluded = makeTestMath({ wild: { substitutesFor: 'all', excludes: ['b'] } })
    expect(evaluate(middleLine(['b', 'w', 'b']), excluded, BET_PER_LINE).totalWin).toBe(0)
    expect(evaluate(middleLine(['a', 'w', 'a']), excluded, BET_PER_LINE).totalWin).toBe(10)
  })

  it('배수에 라인당 베팅액을 곱해 정수 코인으로 지급한다', () => {
    expect(evaluate(middleLine(['a', 'a', 'a']), math, 10).totalWin).toBe(100)
  })

  it('그리드가 페이라인 범위를 벗어나면 예외', () => {
    expect(() => evaluate([['a', 'a', 'a']], math, BET_PER_LINE)).toThrow(RangeError)
  })
})

describe('getBetPerLine', () => {
  it('총 베팅액을 라인 수로 나눈다', () => {
    expect(getBetPerLine(math, 30)).toBe(10)
  })

  it('나누어떨어지지 않으면 예외', () => {
    expect(() => getBetPerLine(math, 10)).toThrow(RangeError)
  })

  it('0 이하 베팅액은 예외', () => {
    expect(() => getBetPerLine(math, 0)).toThrow(RangeError)
  })

  it('페이라인이 1개면 라인당 베팅액이 총 베팅액과 같다', () => {
    const single = parseGameMath({
      ...JSON.parse(JSON.stringify(math)),
      paylines: [[1, 1, 1]],
      betLevels: [7],
    })
    expect(getBetPerLine(single, 7)).toBe(7)
  })
})

describe('evaluate - 심볼 그룹 (믹스 배당)', () => {
  const bars = makeBarMath()

  /** 가운데 라인만 채우고 나머지는 블랭크로 둔 그리드. */
  function barLine(symbols: string[]): string[][] {
    return makeGrid([BLANK_ROW, symbols, BLANK_ROW])
  }

  it('종류가 섞인 BAR 3개는 그룹 배당으로 지급한다', () => {
    const result = evaluate(barLine(['bar1', 'bar2', 'bar3']), bars, BET_PER_LINE)
    expect(result.wins).toHaveLength(1)
    expect(result.wins[0]).toMatchObject({ symbol: 'anybar', group: 'anybar', count: 3, multiplier: 5, win: 5 })
    expect(result.wins[0]?.positions).toHaveLength(3)
  })

  it('같은 BAR 3개는 그룹이 아니라 그 심볼 배당으로 지급한다', () => {
    const result = evaluate(barLine(['bar3', 'bar3', 'bar3']), bars, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'bar3', count: 3, multiplier: 50 })
    expect(result.wins[0]?.group).toBeUndefined()
  })

  it('와일드는 그룹 연속에도 낀다', () => {
    const result = evaluate(barLine(['w', 'bar1', 'bar2']), bars, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'anybar', group: 'anybar', multiplier: 5 })
  })

  it('와일드가 앞을 채운 같은 BAR는 여전히 그 심볼 배당이 이긴다', () => {
    const result = evaluate(barLine(['w', 'bar3', 'bar3']), bars, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'bar3', multiplier: 50 })
  })

  it('2개 배당이 없으면 BAR 2개 + 블랭크는 지급하지 않는다', () => {
    expect(evaluate(barLine(['bar1', 'bar2', '_']), bars, BET_PER_LINE).totalWin).toBe(0)
  })

  it('그룹에 2개 배당이 있으면 BAR 2개 + 블랭크도 지급한다', () => {
    const withTwo = makeBarMath({
      paytable: {
        w: { 3: 100 },
        bar3: { 3: 50 },
        bar2: { 3: 25 },
        bar1: { 3: 15 },
        anybar: { 2: 1, 3: 5 },
      },
    })
    const result = evaluate(barLine(['bar1', 'bar2', '_']), withTwo, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'anybar', group: 'anybar', count: 2, multiplier: 1 })
  })

  it('그룹 밖 심볼이 끼면 그룹 연속이 끊긴다', () => {
    expect(evaluate(barLine(['bar1', '_', 'bar2']), bars, BET_PER_LINE).totalWin).toBe(0)
  })

  it('배수가 같으면 순수 심볼 해석이 그룹을 이긴다', () => {
    const tie = makeBarMath({
      paytable: {
        w: { 3: 100 },
        bar3: { 3: 5 },
        bar2: { 3: 25 },
        bar1: { 3: 15 },
        anybar: { 3: 5 },
      },
    })
    const result = evaluate(barLine(['bar3', 'bar3', 'bar3']), tie, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'bar3', multiplier: 5 })
    expect(result.wins[0]?.group).toBeUndefined()
  })

  it('그룹 배당이 더 크면 그룹이 이긴다', () => {
    const richGroup = makeBarMath({
      paytable: {
        w: { 3: 100 },
        bar3: { 3: 50 },
        bar2: { 3: 25 },
        bar1: { 3: 2 },
        anybar: { 3: 9 },
      },
    })
    const result = evaluate(barLine(['bar1', 'bar1', 'bar1']), richGroup, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'anybar', group: 'anybar', multiplier: 9 })
  })

  it('그룹에 페이테이블이 없으면 후보로 쓰이지 않는다', () => {
    const noPay = makeBarMath({
      paytable: { w: { 3: 100 }, bar3: { 3: 50 }, bar2: { 3: 25 }, bar1: { 3: 15 } },
    })
    expect(evaluate(barLine(['bar1', 'bar2', 'bar3']), noPay, BET_PER_LINE).totalWin).toBe(0)
  })
})

describe('evaluate - 1개 매치 배당', () => {
  const single = makeTestMath({ paytable: { w: { 3: 100 }, a: { 1: 1, 2: 2, 3: 10 }, b: { 3: 5 } } })

  function line(symbols: string[]): string[][] {
    return makeGrid([BLANK_ROW, symbols, BLANK_ROW])
  }

  it('릴 0만 맞아도 지급한다', () => {
    const result = evaluate(line(['a', 'b', 'b']), single, BET_PER_LINE)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 1, multiplier: 1, win: 1 })
    expect(result.wins[0]?.positions).toEqual([[0, 1]])
  })

  it('릴 0이 아니면 지급하지 않는다', () => {
    expect(evaluate(line(['b', 'a', 'a']), single, BET_PER_LINE).totalWin).toBe(0)
  })

  it('연속이 길어지면 더 긴 배당으로 올라간다', () => {
    expect(evaluate(line(['a', 'a', 'b']), single, BET_PER_LINE).wins[0]).toMatchObject({ count: 2, multiplier: 2 })
    expect(evaluate(line(['a', 'a', 'a']), single, BET_PER_LINE).wins[0]).toMatchObject({ count: 3, multiplier: 10 })
  })

  it('와일드도 1개 배당을 대신 채운다', () => {
    // 뒤가 블랭크라 b의 3연속 해석(5배)이 성립하지 않고 a의 1개 배당만 남는다.
    expect(evaluate(line(['w', '_', '_']), single, BET_PER_LINE).wins[0]).toMatchObject({ symbol: 'a', count: 1 })
  })

  it('더 비싼 해석이 있으면 1개 배당은 밀린다', () => {
    // w,b,b는 b의 3연속(5배)으로 읽히므로 a의 1개 배당(1배)이 아니라 5배를 준다.
    expect(evaluate(line(['w', 'b', 'b']), single, BET_PER_LINE).wins[0]).toMatchObject({ symbol: 'b', multiplier: 5 })
  })
})
