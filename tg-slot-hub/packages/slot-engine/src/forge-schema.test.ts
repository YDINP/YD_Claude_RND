import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { safeParseGameMath } from './schema.js'

type Json = Record<string, unknown>
const base = JSON.parse(readFileSync(new URL('../../../games/volcano-forge/math.json', import.meta.url), 'utf8')) as Json

function clone(): Json {
  return JSON.parse(JSON.stringify(base)) as Json
}

function messages(json: Json): string[] {
  const result = safeParseGameMath(json)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

function withForge(patch: Json): Json {
  const json = clone()
  json.forgeRail = { ...(json.forgeRail as Json), ...patch }
  return json
}

function withScatterFreeSpins(patch: Json): Json {
  const json = clone()
  const scatter = json.scatter as Json
  json.scatter = { ...scatter, freeSpins: { ...(scatter.freeSpins as Json), ...patch } }
  return json
}

describe('anywhere·forgeRail 스키마', () => {
  it('volcano-forge math.json이 통과한다', () => {
    expect(messages(clone())).toEqual([])
  })

  it("anywhere 게임은 anywhere·cascade가 필수이고 paylines·ways·cluster·와일드를 둘 수 없다", () => {
    expect(messages({ ...clone(), anywhere: undefined })).toContain("payModel이 'anywhere'면 anywhere 설정이 필요하다")
    expect(messages({ ...clone(), cascade: undefined })).toContain("payModel이 'anywhere'면 cascade 설정이 필요하다")
    expect(messages({ ...clone(), paylines: [[0, 0, 0, 0, 0, 0]] })).toContain('위치 무관 게임은 paylines를 두지 않는다')
    expect(messages({ ...clone(), ways: { base: 15625 } })).toContain('위치 무관 게임은 ways를 두지 않는다')
    expect(messages({ ...clone(), wild: { substitutesFor: 'all' } })).toContain('위치 무관 게임은 와일드를 두지 않는다')
  })

  it('anywhere 설정은 anywhere 게임에만, minCount 미만 배당 키는 금지', () => {
    const lines = { ...clone(), payModel: 'lines', paylines: [[0, 0, 0, 0, 0, 0]], forgeRail: undefined }
    expect(messages(lines)).toContain("anywhere 설정은 payModel이 'anywhere'일 때만 둔다")
    const json = clone()
    json.paytable = { ...(json.paytable as Json), coal: { 6: 0.1, 8: 0.3 } }
    expect(messages(json).some((message) => message.includes('minCount(8) 미만 키'))).toBe(true)
  })

  it('배당 키 상한은 reels*rows(30)이고 총 베팅액 기준 정수 지급을 강제한다', () => {
    const big = clone()
    big.paytable = { ...(big.paytable as Json), coal: { 8: 0.3, 31: 5 } }
    expect(messages(big).some((message) => message.includes('1..30'))).toBe(true)
    const frac = clone()
    frac.paytable = { ...(frac.paytable as Json), coal: { 8: 0.33 } }
    expect(messages(frac).some((message) => message.includes('정수가 아니다'))).toBe(true)
  })

  it('forgeRail 필수 조합: anywhere + cascade + round + scatter.freeSpins', () => {
    const noRound = { ...clone(), round: undefined }
    expect(messages(noRound)).toContain('forgeRail 팩은 round.maxWinCap이 필요하다')
    const noFree = clone()
    noFree.scatter = { symbol: 'anvil', pays: { 4: 3 } }
    expect(messages(noFree)).toContain('forgeRail 팩은 scatter.freeSpins(진입 규칙)가 필요하다')
  })

  it('forgeRail 금지 조합: 다른 보너스·뮤테이션·사다리·공용 리트리거·프리스핀 배수', () => {
    expect(messages({ ...clone(), mutations: [{ type: 'upgrade', from: 'coal', to: 'ingot', minCount: 3 }] })).toContain(
      'forgeRail 팩은 mutations를 둘 수 없다',
    )
    const ladder = clone()
    ladder.cascade = { ...(ladder.cascade as Json), multiplierLadder: [1, 2] }
    expect(messages(ladder)).toContain('forgeRail 팩의 cascade.multiplierLadder는 전부 1이어야 한다')
    expect(messages(withScatterFreeSpins({ retrigger: true }))).toContain(
      'forgeRail 팩은 scatter.freeSpins.retrigger를 false로 두고 forgeRail.retrigger를 쓴다',
    )
    expect(messages(withScatterFreeSpins({ multiplier: 2 }))).toContain('forgeRail 팩의 scatter.freeSpins.multiplier는 1이어야 한다')
    const order = clone()
    order.orderRound = { trigger: 4, spins: 8, slots: 1, maxOrders: 1, extraSpinsPerOrder: 0, pool: [{ id: 'x', kind: 'chainLength', target: 2, prize: 1, weight: 1 }] }
    expect(messages(order)).toContain('forgeRail과 orderRound는 함께 둘 수 없다')
  })

  it('불씨 값표: 키·가중치는 양의 정수, 확률은 0~10000 정수, heatCap ≥ 최대 값', () => {
    expect(messages(withForge({ values: { 2: 0.5 } })).length).toBeGreaterThan(0)
    expect(messages(withForge({ values: { 0: 10 } })).length).toBeGreaterThan(0)
    expect(messages(withForge({ spawn: { chanceBase: 10_001, chanceFree: 10 } })).length).toBeGreaterThan(0)
    expect(messages(withForge({ spawn: { chanceBase: 1.5, chanceFree: 10 } })).length).toBeGreaterThan(0)
    expect(messages(withForge({ heatCap: 40 }))).toContain('heatCap(40)이 불씨 최대값(50)보다 작다')
    expect(messages(withForge({ values: {} }))).toContain('불씨 값표가 비었다')
  })

  it('라운드 상한·시작 합계 정합성', () => {
    expect(messages(withForge({ maxRoundSpins: 9 }))).toContain('maxRoundSpins(9)가 진입 스핀 수(10)보다 작다')
    expect(messages(withForge({ startHeat: { 3: 5 } }))).toContain('startHeat 키 3가 진입 개수(4)보다 작다')
    expect(messages(withForge({ startHeat: { 5: 10, 6: 5 } }))).toContain('startHeat는 개수가 많을수록 작아질 수 없다')
    expect(messages(withForge({ startHeat: { 5: 400 } }))).toContain('startHeat 5개 값(400)이 heatCap(300)보다 크다')
    expect(messages(withForge({ retrigger: { trigger: 31, spins: 5 } }))).toContain('추가 스핀 트리거 31개가 화면 칸 수(30)보다 많다')
  })

  it('forgeRail은 anywhere 게임에서만', () => {
    const json = clone()
    json.payModel = 'cluster'
    json.cluster = { minCluster: 5, adjacency: 'orthogonal' }
    json.anywhere = undefined
    expect(messages(json)).toContain("forgeRail은 payModel 'anywhere'에서만 쓴다")
  })
})
