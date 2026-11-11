import { describe, expect, it } from 'vitest'
import { safeParseGameMath } from './schema.js'
import { featureTriggerCount } from './evaluate.js'
import { getBetUnit } from './spin.js'
import { isAnalytic } from './analytic.js'
import { clusterMathJson, makeClusterMath, makeScatterMath } from './testFixtures.js'

type Json = Record<string, unknown>

function messages(json: Json): string[] {
  const result = safeParseGameMath(json)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

function orderRound(patch: Json): Json {
  const base = clusterMathJson().orderRound as Json
  return { ...base, ...patch }
}

function pool(entries: Json[]): Json {
  return orderRound({ pool: entries })
}

describe('클러스터·연쇄·주문 스키마', () => {
  it('픽스처가 통과하고 기본값이 채워진다', () => {
    const math = makeClusterMath()
    expect(math.payModel).toBe('cluster')
    expect(math.cluster?.wildJoins).toBe(true)
    expect(math.cascade?.multiplierLadder).toEqual([1, 2, 3])
    expect(math.round?.maxWinCap).toBe(500)
  })

  it('cluster 게임은 cluster와 cascade가 필수다', () => {
    expect(messages(clusterMathJson({ cluster: undefined }))).toContain("payModel이 'cluster'면 cluster 설정이 필요하다")
    expect(messages(clusterMathJson({ cascade: undefined }))).toContain("payModel이 'cluster'면 cascade 설정이 필요하다")
  })

  it('cluster 게임은 paylines와 ways를 둘 수 없다', () => {
    expect(messages(clusterMathJson({ paylines: [[0, 0, 0, 0]] }))).toContain('클러스터 게임은 paylines를 두지 않는다')
    expect(messages(clusterMathJson({ ways: { base: 81 } }))).toContain('클러스터 게임은 ways를 두지 않는다')
  })

  it('cluster 설정은 cluster 게임에만 둔다', () => {
    expect(
      messages(clusterMathJson({ payModel: 'lines', paylines: [[0, 0, 0, 0]], orderRound: undefined })),
    ).toContain("cluster 설정은 payModel이 'cluster'일 때만 둔다")
  })

  it('페이룰 키 상한은 reels*rows다', () => {
    expect(messages(clusterMathJson({ paytable: { a: { 4: 0.5, 12: 5 } } }))).toEqual([])
    expect(messages(clusterMathJson({ paytable: { a: { 4: 0.5, 13: 5 } } })).join()).toContain('1..12')
  })

  it('정수 지급 검사 단위는 총 베팅액(1)이다', () => {
    // 20 x 0.05 = 1 → 통과, 20 x 0.01 = 0.2 → 실패
    expect(messages(clusterMathJson({ paytable: { a: { 4: 0.05 } } }))).toEqual([])
    expect(messages(clusterMathJson({ paytable: { a: { 4: 0.01 } } })).join()).toContain('정수가 아니다')
  })

  it('0.05 눈금 배수의 부동소수 오차는 정수로 본다', () => {
    // 100 x 1.1 = 110.00000000000001
    expect(messages(clusterMathJson({ paytable: { a: { 4: 1.1 } } }))).toEqual([])
  })

  it('cascade 모양을 검사한다', () => {
    const cascade = clusterMathJson().cascade as Json
    expect(safeParseGameMath(clusterMathJson({ cascade: { ...cascade, maxCascades: 21 } })).success).toBe(false)
    expect(safeParseGameMath(clusterMathJson({ cascade: { ...cascade, multiplierLadder: [] } })).success).toBe(false)
    expect(safeParseGameMath(clusterMathJson({ cascade: { ...cascade, refill: 'random' } })).success).toBe(false)
  })

  it('orderRound와 scatter.freeSpins는 함께 둘 수 없다', () => {
    const scatter = { symbol: 's', freeSpins: { trigger: 3, count: 8, multiplier: 1, retrigger: false } }
    expect(messages(clusterMathJson({ scatter }))).toContain('orderRound와 scatter.freeSpins는 함께 둘 수 없다')
  })

  it('orderRound는 scatter가 필요하다', () => {
    expect(messages(clusterMathJson({ scatter: undefined })).join()).toContain('scatter 설정이 필요하다')
  })

  it('popSymbol은 비와일드·비스캐터 심볼이어야 한다', () => {
    const entry = { id: 'x', kind: 'popSymbol', target: 5, prize: 1, weight: 1 }
    const base = (clusterMathJson().orderRound as { pool: Json[] }).pool
    expect(messages(clusterMathJson({ orderRound: pool([...base, { ...entry, symbol: 'w' }]) })).join()).toContain(
      '와일드·스캐터가 아닌',
    )
    expect(messages(clusterMathJson({ orderRound: pool([...base, { ...entry, symbol: 's' }]) })).join()).toContain(
      '와일드·스캐터가 아닌',
    )
    expect(messages(clusterMathJson({ orderRound: pool([...base, entry]) }))).toContain(
      'popSymbol 주문에는 symbol이 필요하다',
    )
    expect(messages(clusterMathJson({ orderRound: pool([...base, { ...entry, symbol: 'zz' }]) }))).toContain(
      '선언되지 않은 심볼: zz',
    )
  })

  it('clusterSize target은 칸 수 이하, chainLength target은 maxCascades 이하다', () => {
    const base = (clusterMathJson().orderRound as { pool: Json[] }).pool
    const big = { id: 'huge', kind: 'clusterSize', target: 13, prize: 1, weight: 1 }
    const chain = { id: 'long', kind: 'chainLength', target: 6, prize: 1, weight: 1 }
    expect(messages(clusterMathJson({ orderRound: pool([...base, big]) })).join()).toContain('화면 칸 수(12)')
    expect(messages(clusterMathJson({ orderRound: pool([...base, chain]) })).join()).toContain('maxCascades(5)')
  })

  it('popSymbol이 아닌 주문은 symbol을 두지 않는다', () => {
    const base = (clusterMathJson().orderRound as { pool: Json[] }).pool
    const odd = { id: 'odd', kind: 'clusterSize', symbol: 'a', target: 5, prize: 1, weight: 1 }
    expect(messages(clusterMathJson({ orderRound: pool([...base, odd]) }))).toContain('clusterSize 주문은 symbol을 두지 않는다')
  })

  it('서로 다른 id가 slots 이상이어야 하고 중복 id는 금지다', () => {
    const one = { id: 'pop-a', kind: 'popSymbol', symbol: 'a', target: 10, prize: 5, weight: 1 }
    const result = messages(clusterMathJson({ orderRound: pool([one, one]) }))
    expect(result).toContain('중복 주문 id: pop-a')
    expect(result).toContain('서로 다른 주문 id(1)가 slots(3)보다 적다')
  })

  it('prize x 베팅 레벨이 정수여야 한다', () => {
    const base = (clusterMathJson().orderRound as { pool: Json[] }).pool
    const odd = { id: 'odd', kind: 'clusterSize', target: 5, prize: 1.01, weight: 1 }
    expect(messages(clusterMathJson({ orderRound: pool([...base, odd]) })).join()).toContain('상품 1.01')
  })

  it('최장 라운드가 프리스핀 상한을 넘으면 실패한다', () => {
    expect(messages(clusterMathJson({ orderRound: orderRound({ extraSpinsPerOrder: 5000, maxOrders: 2 }) })).join()).toContain(
      '최장 라운드',
    )
  })
})

describe('배당 단위와 해석 경로', () => {
  it('cluster 게임의 배당 단위는 총 베팅액이다', () => {
    expect(getBetUnit(makeClusterMath(), 40)).toBe(40)
  })

  it('cluster·cascade·orderRound가 있으면 해석 경로가 아니다', () => {
    expect(isAnalytic(makeClusterMath())).toBe(false)
  })
})

describe('featureTriggerCount', () => {
  it('orderRound.trigger를 먼저, 없으면 scatter.freeSpins.trigger를 쓴다', () => {
    expect(featureTriggerCount(makeClusterMath())).toBe(3)
    expect(featureTriggerCount(makeScatterMath())).toBe(makeScatterMath().scatter?.freeSpins?.trigger)
  })

  it('보너스가 없으면 undefined', () => {
    expect(featureTriggerCount(makeClusterMath({ orderRound: undefined }))).toBeUndefined()
  })
})
