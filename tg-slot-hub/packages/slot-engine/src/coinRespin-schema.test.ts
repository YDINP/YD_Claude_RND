import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coinRespinGrowthBound } from './coinRespinSchema.js'
import { safeParseGameMath } from './schema.js'

const RAW = JSON.parse(readFileSync(new URL('../../../games/kraken-cove/math.json', import.meta.url), 'utf8')) as Record<
  string,
  unknown
>

function withCoin(patch: Record<string, unknown>, top: Record<string, unknown> = {}): Record<string, unknown> {
  const base = structuredClone(RAW)
  return { ...base, ...top, coinRespin: { ...(base['coinRespin'] as Record<string, unknown>), ...patch } }
}

function messages(raw: Record<string, unknown>): string[] {
  const parsed = safeParseGameMath(raw)
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

const expectIssue = (raw: Record<string, unknown>, fragment: string): void => {
  const found = messages(raw)
  expect(found.some((message) => message.includes(fragment)), `${fragment} 없음: ${found.join(' / ')}`).toBe(true)
}

describe('coinRespin 스키마', () => {
  it('kraken-cove math.json이 통과하고 q x 빈칸 < 1이다', () => {
    const parsed = safeParseGameMath(RAW)
    expect(parsed.success).toBe(true)
    if (!parsed.success || parsed.data.coinRespin === undefined) return
    expect(coinRespinGrowthBound(parsed.data.coinRespin, 15)).toBeLessThan(1)
  })

  it('리스핀 칸 스트립의 코인이 많아 q x 빈칸 ≥ 1이면 막는다', () => {
    const strips = Array.from({ length: 5 }, () => ['coin', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab', 'crab'])
    expectIssue(withCoin({ respinStrips: strips }), 'max q x 빈칸')
  })

  it('코인 없는/전부 코인인 칸 스트립, 릴 수 불일치, 와일드 칸을 막는다', () => {
    const strips = (RAW['coinRespin'] as { respinStrips: string[][] }).respinStrips
    expectIssue(withCoin({ respinStrips: [['crab', 'shell'], ...strips.slice(1)] }), '코인이 없다')
    expectIssue(withCoin({ respinStrips: strips.slice(1) }), 'respinStrips 개수')
    expectIssue(withCoin({ respinStrips: [['coin', 'wild', ...strips[0]!.slice(2)], ...strips.slice(1)] }), '와일드·스캐터')
  })

  it('hardCap이 구조상 최대보다 작으면 막는다', () => {
    expectIssue(withCoin({ hardCap: 29 }), 'hardCap(29)')
  })

  it('트리거가 칸 수보다 크면 막는다', () => {
    expectIssue(withCoin({ trigger: 16 }), '트리거 16개')
  })

  it('보물 오름차순, 보물 단계 중복, 숫자 코인 없음, 정수 지급을 검사한다', () => {
    expectIssue(withCoin({ treasures: { small: 50, medium: 20, large: 200, top: 1000 } }), 'small < medium')
    const values = (RAW['coinRespin'] as { values: unknown[] }).values
    expectIssue(withCoin({ values: [...values, { kind: 'treasure', tier: 'small', weight: 1 }] }), '두 번')
    expectIssue(withCoin({ values: values.filter((entry) => (entry as { kind: string }).kind === 'treasure') }), '숫자 코인')
    expectIssue(withCoin({ values: [{ kind: 'bet', value: 0.01, weight: 1 }] }), '정수가 아니다')
    expectIssue(withCoin({ treasures: { small: 20, medium: 50, large: 200, top: 1000.01 } }), '정수가 아니다')
  })

  it('촉수 배수는 2 이상 정수', () => {
    expect(safeParseGameMath(withCoin({ columnBonus: { multiplier: 1 } })).success).toBe(false)
    expect(safeParseGameMath(withCoin({ columnBonus: { multiplier: 2.5 } })).success).toBe(false)
  })

  it('코인이 라인 배당을 갖거나 와일드가 코인을 대체하면 막는다', () => {
    const paytable = { ...(RAW['paytable'] as Record<string, unknown>), coin: { 3: 5 } }
    expectIssue(withCoin({}, { paytable }), '라인 배당')
    expectIssue(withCoin({}, { wild: { substitutesFor: 'all' } }), 'wild.excludes')
  })

  it('다른 보너스·뮤테이션과 함께 둘 수 없다', () => {
    expectIssue(
      withCoin({}, { mutations: [{ type: 'upgrade', from: 'shell', to: 'crab', minCount: 3 }] }),
      'mutations',
    )
    expectIssue(
      withCoin({}, { cascade: { enabled: true, maxCascades: 5, refill: 'gravity', source: 'strip-pull', multiplierLadder: [1] } }),
      'cascade는 함께',
    )
  })

  it('라인 최대 + 스캐터 최대가 지급 상한 이상이면 막는다(진입하지 않은 스핀은 상한을 걸지 않는다)', () => {
    expect(messages(RAW).some((message) => message.includes('지급 상한'))).toBe(false)
    expectIssue(withCoin({}, { round: { maxWinCap: 1000 } }), '지급 상한 x1000')
  })

  it('선언되지 않은 코인 심볼', () => {
    expectIssue(withCoin({ symbol: 'doubloon' }), '선언되지 않은 심볼: doubloon')
  })
})
