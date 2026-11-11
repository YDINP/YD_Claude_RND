import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { GameStateResponse, SpinResponse } from '@tgslot/shared'
import { createSeededRng, foldCascades } from '@tgslot/slot-engine'
import type { CascadeStep, FeatureTrigger, Rng, RoundState } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import type { ApplySpinInput, ApplySpinResult } from '../repos/types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { RoundSeedResponse } from './rounds.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import { FREE_SPINS_TTL_MS } from '../economy/freeSpins.js'
import { ORDER_CARDS, applyCascadeScript, orderCarry, orderRoundEntry } from '../testing/cascadeScript.js'
import type { CascadeScript } from '../testing/cascadeScript.js'

const GAME_ID = 'classic-777'
const BET = 100
const START_AT = '2026-11-11T09:00:00Z'

const diskPacks = loadGamePacks()

function classicPack(): GamePack {
  const pack = diskPacks.find((candidate) => candidate.id === GAME_ID)
  if (!pack) throw new Error(`${GAME_ID} 팩이 없다`)
  return pack
}

function makeConfig(): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevAuth: true,
    allowDebugSpin: true,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
  }
}

function makeClock(startIso: string) {
  let current = new Date(startIso)
  return {
    now: (): Date => current,
    advance(ms: number): void {
      current = new Date(current.getTime() + ms)
    },
  }
}

function noJackpotRng(seed: string, nonce: number): Rng {
  const rng = createSeededRng(`${seed}:${nonce}`)
  return { nextInt: (max) => (max === JACKPOT_ODDS_DENOMINATOR ? max - 1 : rng.nextInt(max)) }
}

/** 엔진 대신 대본이 결과를 정하고, 레포가 받은 "스핀 직전 세션"과 프리스핀 여부를 기록한다. */
class ScriptedRepos extends MemoryRepos {
  private script: CascadeScript | null = null
  lastFreeSpins: unknown = null
  lastIsFreeSpin: boolean | null = null

  next(script: CascadeScript): void {
    this.script = script
  }

  override applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    const script = this.script
    this.script = null
    return super.applySpin({
      ...input,
      compute: (ctx) => {
        this.lastFreeSpins = ctx.freeSpins
        this.lastIsFreeSpin = ctx.isFreeSpin
        return applyCascadeScript(input.compute(ctx), script)
      },
    })
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: ScriptedRepos
  clock: ReturnType<typeof makeClock>
  token: string
}

async function setup(): Promise<Harness> {
  const clock = makeClock(START_AT)
  const repos = new ScriptedRepos(clock.now)
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry([classicPack()]),
    clock: clock.now,
    spinRng: noJackpotRng,
  })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9301:Cascader' }),
  })
  const body = (await res.json()) as { token: string }
  return { app, repos, clock, token: body.token }
}

async function spinRaw(h: Harness, key: string, totalBet = BET): Promise<Response> {
  return h.app.request(`/games/${GAME_ID}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({ totalBet, idempotencyKey: key }),
  })
}

async function spin(h: Harness, key: string, script: CascadeScript, totalBet = BET): Promise<SpinResponse> {
  h.repos.next(script)
  const res = await spinRaw(h, key, totalBet)
  expect(res.status).toBe(200)
  return (await res.json()) as SpinResponse
}

async function gameState(h: Harness): Promise<GameStateResponse> {
  const res = await h.app.request(`/games/${GAME_ID}/state`, { headers: { authorization: `Bearer ${h.token}` } })
  expect(res.status).toBe(200)
  return (await res.json()) as GameStateResponse
}

async function reveal(h: Harness, roundId: string): Promise<RoundSeedResponse> {
  const res = await h.app.request(`/rounds/${roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
  expect(res.status).toBe(200)
  return (await res.json()) as RoundSeedResponse
}

const ORDER_COMPLETE_A: FeatureTrigger = { type: 'orderComplete', id: 'pop-heart-12', prize: 200 }
const ORDER_COMPLETE_B: FeatureTrigger = { type: 'orderComplete', id: 'size-9', prize: 300 }

/** 첫 카드 진행만 바뀐 라운드 스핀의 nextState. */
function progressed(left: number, progress: number): RoundState {
  const cards = ORDER_CARDS.map((card, index) => (index === 0 ? { ...card, progress } : { ...card }))
  return { freeSpinsLeft: left, freeSpinsTotal: 8, multiplier: 1, carry: orderCarry(cards) }
}

describe('연쇄 라운드 저장과 멱등 재전송', () => {
  it('재전송은 재실행 없이 저장된 연쇄로 조립하고 바이트까지 같다', async () => {
    const h = await setup()
    h.repos.next({ cascadeSteps: 3, win: 300 })
    const firstRes = await spinRaw(h, 'cas-resend-0001')
    const firstText = await firstRes.text()
    expect(firstRes.status).toBe(200)
    const first = JSON.parse(firstText) as SpinResponse
    expect(first.cascades).toHaveLength(3)
    expect(SpinResponseSchema.safeParse(first).success).toBe(true)

    // 두 번째 호출에는 대본이 없다. 엔진을 다시 돌렸다면 cascades가 사라졌을 것이다.
    const res = await spinRaw(h, 'cas-resend-0001')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(firstText)
  })

  it('finalGrid는 grid에서 연쇄를 접은 값이고 refill은 릴별 배열이다', async () => {
    const h = await setup()
    const body = await spin(h, 'cas-final-00001', { cascadeSteps: 2, win: 150 })

    const cascades = body.cascades as unknown as CascadeStep[]
    expect(body.finalGrid).toEqual(foldCascades(body.grid, cascades))
    // 릴 수만큼의 배열이어야 하고, 칸 객체 목록이 아니다 (응답 크기 O13).
    expect(cascades[0]?.refill).toHaveLength(body.grid[0]?.length ?? 0)
    expect(cascades[0]?.refill.every((column) => Array.isArray(column))).toBe(true)
    expect(body.wins).toEqual([])
    expect(cascades[0]?.wins[0]).toMatchObject({ payKind: 'cluster', line: -1, cascade: 0, ladder: 1 })
  })

  it('연쇄가 없는 팩의 응답에는 cascades·finalGrid·orderWin 키가 없다 (옛 라운드와 같다)', async () => {
    const h = await setup()
    const first = await spin(h, 'cas-legacy-0001', { win: 0 })
    const replay = await (await spinRaw(h, 'cas-legacy-0001')).json()

    for (const body of [first, replay] as Record<string, unknown>[]) {
      expect('cascades' in body).toBe(false)
      expect('finalGrid' in body).toBe(false)
      expect('orderWin' in body).toBe(false)
    }
  })
})

describe('주문 라운드 carry', () => {
  it('진입 스핀이 carry를 만들고 GET /state가 그대로 돌려준다 (새로고침 복원)', async () => {
    const h = await setup()
    const body = await spin(h, 'ord-entry-00001', orderRoundEntry())

    expect(body.freeSpins?.carry?.orders?.cards).toHaveLength(3)
    expect(body.features.map((feature) => feature.type)).toEqual(['freeSpins', 'orderRound'])
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)

    const state = await gameState(h)
    expect(state.freeSpins?.carry).toEqual(body.freeSpins?.carry)
    expect(state.state.freeSpins?.carry?.orders?.drawn).toBe(3)
  })

  it('진행이 스핀을 넘어 이월되고 엔진은 직전 carry를 입력으로 받는다', async () => {
    const h = await setup()
    await spin(h, 'ord-carry-00001', orderRoundEntry())

    const round1 = await spin(h, 'ord-carry-00002', { nextState: progressed(7, 5), win: 0 })
    expect(h.repos.lastIsFreeSpin).toBe(true)
    expect(h.repos.lastFreeSpins).toMatchObject({ carry: { orders: { cards: [{ progress: 0 }, {}, {}] } } })
    expect(round1.freeSpins?.carry?.orders?.cards[0]?.progress).toBe(5)

    await spin(h, 'ord-carry-00003', { nextState: progressed(6, 9), win: 0 })
    expect(h.repos.lastFreeSpins).toMatchObject({ carry: { orders: { cards: [{ progress: 5 }, {}, {}] } } })
    expect((await gameState(h)).freeSpins?.carry?.orders?.cards[0]?.progress).toBe(9)
  })

  it('라운드 스핀의 orderWin은 완료 상품 합이고 totalWin에 들어 있다', async () => {
    const h = await setup()
    await spin(h, 'ord-win-000001', orderRoundEntry())

    const body = await spin(h, 'ord-win-000002', {
      features: [ORDER_COMPLETE_A, ORDER_COMPLETE_B],
      nextState: progressed(8, 0),
      win: 500,
    })

    expect(body.orderWin).toBe(500)
    expect(body.totalWin).toBe(500)
    expect(await (await spinRaw(h, 'ord-win-000002')).json()).toEqual(body)
  })

  it('진입 스핀에는 orderWin이 없다', async () => {
    const h = await setup()
    const entry = await spin(h, 'ord-none-000001', orderRoundEntry())
    expect(entry.orderWin).toBeUndefined()
  })

  it('소진: 마지막 스핀이 carry와 세션을 함께 지우고 요약에 주문 결과를 싣는다', async () => {
    const h = await setup()
    await spin(h, 'ord-end-0000001', orderRoundEntry(2))
    await spin(h, 'ord-end-0000002', {
      features: [ORDER_COMPLETE_A],
      nextState: { freeSpinsLeft: 1, freeSpinsTotal: 2, multiplier: 1, carry: orderCarry(ORDER_CARDS, 4, 1, 200) },
      win: 200,
    })

    const last = await spin(h, 'ord-end-0000003', { features: [ORDER_COMPLETE_B], win: 300 })

    expect(last.freeSpins).toBeNull()
    expect(last.freeSpinsSummary).toEqual({ total: 500, spins: 2, ordersCompleted: 2, orderPrizeTotal: 500 })
    const state = await gameState(h)
    expect(state.freeSpins).toBeNull()
    expect(state.state.freeSpins).toBeNull()
  })

  it('만료: 세션이 죽으면 carry도 없고 다음 스핀은 상태 없는 유료 스핀이다', async () => {
    const h = await setup()
    await spin(h, 'ord-exp-0000001', orderRoundEntry())
    h.clock.advance(FREE_SPINS_TTL_MS + 1)

    expect((await gameState(h)).freeSpins).toBeNull()

    const paid = await spin(h, 'ord-exp-0000002', { win: 0 })
    expect(paid.isFreeSpin).toBe(false)
    expect(paid.wallet.coins).toBe(STARTING_COINS - BET * 2)
    expect(paid.freeSpins).toBeNull()
    expect(h.repos.lastIsFreeSpin).toBe(false)
    expect((await gameState(h)).state.freeSpins).toBeNull()
  })

  it('만료 뒤 새 진입은 죽은 세션의 베팅·누적·carry를 물려받지 않는다', async () => {
    const h = await setup()
    await spin(h, 'ord-re-00000001', orderRoundEntry())
    await spin(h, 'ord-re-00000002', { nextState: progressed(7, 7), win: 40 })
    h.clock.advance(FREE_SPINS_TTL_MS + 1)

    const second = await spin(h, 'ord-re-00000003', orderRoundEntry(), 50)

    expect(second.isFreeSpin).toBe(false)
    expect(second.freeSpins).toMatchObject({ totalBet: 50, accumulatedWin: 0, left: 8 })
    expect(second.freeSpins?.carry?.orders?.cards[0]?.progress).toBe(0)
  })
})

describe('시드 공개 stateBefore', () => {
  it('프리스핀 라운드는 스핀 직전 상태(carry 포함)를, 유료 스핀은 null을 돌려준다', async () => {
    const h = await setup()
    const entry = await spin(h, 'ord-seed-000001', orderRoundEntry())
    const round1 = await spin(h, 'ord-seed-000002', { nextState: progressed(7, 5), win: 0 })
    const round2 = await spin(h, 'ord-seed-000003', { nextState: progressed(6, 9), win: 0 })

    expect((await reveal(h, entry.roundId)).stateBefore).toBeNull()
    expect((await reveal(h, round1.roundId)).stateBefore).toEqual({
      freeSpinsLeft: 8,
      freeSpinsTotal: 8,
      multiplier: 1,
      carry: orderCarry(ORDER_CARDS),
    })
    expect((await reveal(h, round2.roundId)).stateBefore).toMatchObject({
      freeSpinsLeft: 7,
      carry: { orders: { cards: [{ id: 'pop-heart-12', progress: 5 }, {}, {}] } },
    })
  })

  it('carry가 없던 라운드는 stateBefore에 carry 키가 없다', async () => {
    const h = await setup()
    await spin(h, 'fs-seed-0000001', {
      features: [{ type: 'freeSpins', spins: 3, multiplier: 2, retrigger: false }],
      nextState: { freeSpinsLeft: 3, freeSpinsTotal: 3, multiplier: 2 },
      win: 0,
    })
    const free = await spin(h, 'fs-seed-0000002', {
      nextState: { freeSpinsLeft: 2, freeSpinsTotal: 3, multiplier: 2 },
      win: 0,
    })

    expect((await reveal(h, free.roundId)).stateBefore).toEqual({ freeSpinsLeft: 3, freeSpinsTotal: 3, multiplier: 2 })
  })
})
