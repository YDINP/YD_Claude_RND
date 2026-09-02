import { describe, expect, it } from 'vitest'
import { parseGameMath, safeParseGameMath } from './schema.js'

const VALID = {
  id: 'unit',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'w', name: { en: 'Wild' }, wild: true },
    { id: 'a', name: { en: 'Alpha', ko: '알파' } },
  ],
  strips: [
    ['w', 'a', 'a', 'a'],
    ['a', 'w', 'a', 'a'],
    ['a', 'a', 'w', 'a'],
  ],
  paylines: [
    [1, 1, 1],
    [0, 0, 0],
  ],
  paytable: { a: { 3: 10 }, w: { 3: 50 } },
  wild: { substitutesFor: 'all' },
  betLevels: [10, 20],
  rtpTarget: 0.96,
  volatility: 'medium',
} as const

function withOverride(patch: Record<string, unknown>): unknown {
  return { ...JSON.parse(JSON.stringify(VALID)), ...patch }
}

function messagesFor(patch: Record<string, unknown>): string {
  const result = safeParseGameMath(withOverride(patch))
  expect(result.success).toBe(false)
  return result.success ? '' : result.error.issues.map((issue) => issue.message).join(' | ')
}

describe('GameMathSchema', () => {
  it('올바른 모델을 통과시킨다', () => {
    const math = parseGameMath(withOverride({}))
    expect(math.id).toBe('unit')
    expect(math.paytable['a']?.[3]).toBe(10)
  })

  it('JSON의 문자열 키를 숫자 매치 개수로 변환한다', () => {
    const math = parseGameMath(withOverride({ paytable: { a: { '3': 10, '2': 1 }, w: { '3': 50 } } }))
    expect(math.paytable['a']?.[2]).toBe(1)
  })

  it('스트립 개수가 reels와 다르면 거부한다', () => {
    expect(messagesFor({ strips: [['a', 'a', 'a', 'a']] })).toContain('strips 개수')
  })

  it('선언되지 않은 심볼이 스트립에 있으면 거부한다', () => {
    expect(messagesFor({ strips: [['a', 'a', 'a', 'zz'], ['a', 'a', 'a', 'a'], ['a', 'a', 'a', 'a']] })).toContain(
      '선언되지 않은 심볼: zz',
    )
  })

  it('스트립이 rows보다 짧으면 거부한다', () => {
    expect(messagesFor({ strips: [['a', 'a'], ['a', 'a'], ['a', 'a']] })).toContain('보다 짧다')
  })

  it('페이라인 길이가 reels와 다르면 거부한다', () => {
    expect(messagesFor({ paylines: [[1, 1]] })).toContain('reels(3)와 다르다')
  })

  it('행 인덱스가 rows 범위를 벗어나면 거부한다', () => {
    expect(messagesFor({ paylines: [[0, 1, 3]] })).toContain('rows(3) 범위를 벗어났다')
  })

  it('베팅액이 라인 수로 나누어떨어지지 않으면 거부한다', () => {
    expect(messagesFor({ betLevels: [7] })).toContain('나누어떨어지지 않는다')
  })

  it('페이테이블 키가 선언되지 않은 심볼/그룹이면 거부한다', () => {
    expect(messagesFor({ paytable: { zz: { 3: 10 } } })).toContain('선언되지 않은 심볼/그룹의 페이테이블')
  })

  it('매치 개수가 릴 수를 넘으면 거부한다', () => {
    expect(messagesFor({ paytable: { a: { 4: 10 } } })).toContain('범위를 벗어났다')
  })

  it('중복 심볼 id를 거부한다', () => {
    expect(
      messagesFor({
        symbols: [
          { id: 'a', name: { en: 'A' } },
          { id: 'a', name: { en: 'A2' } },
        ],
      }),
    ).toContain('중복 심볼 id')
  })

  it('스캐터에 페이라인 페이테이블을 주면 거부한다', () => {
    expect(
      messagesFor({
        symbols: [
          { id: 'w', name: { en: 'Wild' }, wild: true },
          { id: 'a', name: { en: 'Alpha' } },
          { id: 's', name: { en: 'Scatter' }, scatter: true },
        ],
        strips: [
          ['w', 'a', 's', 'a'],
          ['a', 'w', 's', 'a'],
          ['a', 's', 'w', 'a'],
        ],
        paytable: { a: { 3: 10 }, w: { 3: 50 }, s: { 3: 20 } },
      }),
    ).toContain('페이라인 페이테이블을 가질 수 없다')
  })

  it('어느 스트립에도 없는 심볼의 페이테이블을 거부한다', () => {
    expect(
      messagesFor({
        symbols: [
          { id: 'w', name: { en: 'Wild' }, wild: true },
          { id: 'a', name: { en: 'Alpha' } },
          { id: 'ghost', name: { en: 'Ghost' } },
        ],
        paytable: { a: { 3: 10 }, w: { 3: 50 }, ghost: { 3: 99 } },
      }),
    ).toContain('어느 스트립에도 없는 심볼의 페이테이블')
  })

  it('중복 페이라인을 거부한다', () => {
    expect(
      messagesFor({
        paylines: [
          [1, 1, 1],
          [1, 1, 1],
        ],
      }),
    ).toContain('중복 페이라인')
  })

  it('짧은 연속이 긴 연속보다 많이 주는 페이테이블을 거부한다', () => {
    expect(messagesFor({ paytable: { a: { 2: 999, 3: 1 }, w: { 3: 50 } } })).toContain(
      '긴 연속이 더 많이 줘야 한다',
    )
  })

  it('배수가 같은 것은 허용한다', () => {
    expect(safeParseGameMath(withOverride({ paytable: { a: { 2: 10, 3: 10 }, w: { 3: 50 } } })).success).toBe(true)
  })

  it('지급액이 정수가 되지 않는 배수를 거부한다', () => {
    // 라인 2개, 베팅액 10 -> 라인당 5. 배수 0.5면 2.5코인이 되어 반올림 편향이 생긴다.
    expect(messagesFor({ paytable: { a: { 3: 0.5 }, w: { 3: 50 } } })).toContain('정수가 아니다')
  })

  it('가장 작은 베팅 레벨에서만 깨지는 배수도 거부한다', () => {
    // 라인 2개, 베팅액 2 -> 라인당 1. 배수 1.5면 1.5코인.
    expect(messagesFor({ betLevels: [2, 10], paytable: { a: { 3: 1.5 }, w: { 3: 50 } } })).toContain('정수가 아니다')
  })

  it('substitutesFor에 없는 심볼을 거부한다', () => {
    expect(messagesFor({ wild: { substitutesFor: ['zz'] } })).toContain('선언되지 않은 심볼: zz')
  })

  it('rtpTarget이 1을 넘으면 거부한다', () => {
    const result = safeParseGameMath(withOverride({ rtpTarget: 1.5 }))
    expect(result.success).toBe(false)
  })

  it('volatility 값이 잘못되면 거부한다', () => {
    const result = safeParseGameMath(withOverride({ volatility: 'extreme' }))
    expect(result.success).toBe(false)
  })

  it('parseGameMath는 실패 시 예외를 던진다', () => {
    expect(() => parseGameMath({})).toThrow()
  })
})

describe('GameMathSchema - 심볼 그룹', () => {
  const GROUPED = {
    ...JSON.parse(JSON.stringify(VALID)),
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
    ],
    strips: [
      ['w', 'a', 'b', 'a'],
      ['a', 'w', 'b', 'a'],
      ['a', 'b', 'w', 'a'],
    ],
    groups: { anyab: { name: { en: 'Any AB', ko: '아무 AB' }, members: ['a', 'b'] } },
    paytable: { a: { 3: 10 }, w: { 3: 50 }, anyab: { 3: 3 } },
  }

  function groupedWith(patch: Record<string, unknown>): unknown {
    return { ...JSON.parse(JSON.stringify(GROUPED)), ...patch }
  }

  function groupMessages(patch: Record<string, unknown>): string {
    const result = safeParseGameMath(groupedWith(patch))
    expect(result.success).toBe(false)
    return result.success ? '' : result.error.issues.map((issue) => issue.message).join(' | ')
  }

  it('그룹이 있는 모델을 통과시킨다', () => {
    const math = parseGameMath(groupedWith({}))
    expect(math.groups?.['anyab']?.members).toEqual(['a', 'b'])
    expect(math.paytable['anyab']?.[3]).toBe(3)
  })

  it('그룹이 없어도 된다', () => {
    expect(parseGameMath(withOverride({})).groups).toBeUndefined()
  })

  it('그룹 id가 심볼 id와 겹치면 거부한다', () => {
    expect(groupMessages({ groups: { a: { name: { en: 'Clash' }, members: ['a', 'b'] } } })).toContain(
      '심볼 id와 겹친다',
    )
  })

  it('선언되지 않은 멤버를 거부한다', () => {
    expect(groupMessages({ groups: { anyab: { name: { en: 'Any' }, members: ['a', 'zz'] } } })).toContain(
      '선언되지 않은 심볼: zz',
    )
  })

  it('스캐터를 멤버로 넣으면 거부한다', () => {
    expect(
      groupMessages({
        symbols: [
          { id: 'w', name: { en: 'Wild' }, wild: true },
          { id: 'a', name: { en: 'Alpha' } },
          { id: 's', name: { en: 'Scatter' }, scatter: true },
        ],
        strips: [
          ['w', 'a', 's', 'a'],
          ['a', 'w', 's', 'a'],
          ['a', 's', 'w', 'a'],
        ],
        groups: { anyas: { name: { en: 'Any' }, members: ['a', 's'] } },
        paytable: { a: { 3: 10 }, w: { 3: 50 }, anyas: { 3: 3 } },
      }),
    ).toContain('그룹 멤버가 될 수 없다')
  })

  it('어느 스트립에도 없는 멤버를 거부한다', () => {
    expect(
      groupMessages({
        symbols: [
          { id: 'w', name: { en: 'Wild' }, wild: true },
          { id: 'a', name: { en: 'Alpha' } },
          { id: 'b', name: { en: 'Beta' } },
          { id: 'ghost', name: { en: 'Ghost' } },
        ],
        groups: { anyab: { name: { en: 'Any' }, members: ['a', 'ghost'] } },
      }),
    ).toContain('어느 스트립에도 없는 그룹 멤버')
  })

  it('중복 멤버를 거부한다', () => {
    expect(groupMessages({ groups: { anyab: { name: { en: 'Any' }, members: ['a', 'a'] } } })).toContain(
      '중복 그룹 멤버',
    )
  })

  it('멤버가 1개면 거부한다', () => {
    expect(groupMessages({ groups: { anyab: { name: { en: 'Any' }, members: ['a'] } } })).not.toBe('')
  })

  it('그룹 페이테이블도 매치 개수 범위를 검사한다', () => {
    expect(groupMessages({ paytable: { a: { 3: 10 }, w: { 3: 50 }, anyab: { 4: 3 } } })).toContain(
      '범위를 벗어났다',
    )
  })

  it('그룹 페이테이블도 단조증가를 강제한다', () => {
    expect(groupMessages({ paytable: { a: { 3: 10 }, w: { 3: 50 }, anyab: { 2: 9, 3: 1 } } })).toContain(
      '긴 연속이 더 많이 줘야 한다',
    )
  })

  it('그룹 페이테이블도 정수 지급액을 강제한다', () => {
    expect(groupMessages({ paytable: { a: { 3: 10 }, w: { 3: 50 }, anyab: { 3: 0.5 } } })).toContain('정수가 아니다')
  })

  it('선언되지 않은 그룹의 페이테이블을 거부한다', () => {
    expect(groupMessages({ paytable: { a: { 3: 10 }, w: { 3: 50 }, nogroup: { 3: 3 } } })).toContain(
      '선언되지 않은 심볼/그룹의 페이테이블',
    )
  })

  it('그룹에 페이테이블이 없어도 된다', () => {
    expect(safeParseGameMath(groupedWith({ paytable: { a: { 3: 10 }, w: { 3: 50 } } })).success).toBe(true)
  })
})

describe('GameMathSchema - 1개 매치 배당', () => {
  it('매치 개수 1을 허용한다', () => {
    const math = parseGameMath(withOverride({ paytable: { a: { 1: 1, 2: 2, 3: 10 }, w: { 3: 50 } } }))
    expect(math.paytable['a']?.[1]).toBe(1)
  })

  it('매치 개수 0은 거부한다', () => {
    expect(safeParseGameMath(withOverride({ paytable: { a: { 0: 1, 3: 10 }, w: { 3: 50 } } })).success).toBe(false)
  })
})
