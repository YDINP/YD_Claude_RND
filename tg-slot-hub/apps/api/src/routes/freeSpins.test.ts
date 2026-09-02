import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, GameStateResponse, SpinResponse } from '@tgslot/shared'
import { createSeededRng } from '@tgslot/slot-engine'
import type { Rng, RoundState } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import type { ApplySpinInput, ApplySpinResult } from '../repos/types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR, JACKPOT_SEED_COINS } from '../economy/config.js'
import { FREE_SPINS_TTL_MS } from '../economy/freeSpins.js'
import { isoWeekKey } from '../economy/time.js'

const GAME_ID = 'classic-777'
const BET = 100
const START_AT = '2026-09-03T09:00:00Z'
/** 프리스핀 진입 피처. 엔진이 뱉는 모양 그대로. */
function trigger(spins: number): FeatureTrigger {
  return { type: 'freeSpins', spins, multiplier: 3, retrigger: false }
}

const TRIGGER = trigger(10)
const RETRIGGER: FeatureTrigger = { type: 'freeSpins', spins: 5, multiplier: 3, retrigger: true }

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
    allowDevMock: true,
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

/**
 * 다음 스핀의 엔진 결과를 테스트가 정해 주는 레포.
 *
 * 남은 횟수·배수는 **엔진의 `nextState`가 진실**이므로 대본도 그것을 그대로 넣는다.
 * (서버가 따로 세는 로직은 없다. 있으면 둘이 어긋난다.)
 */
class ScriptedRepos extends MemoryRepos {
  private script: { features?: FeatureTrigger[]; nextState?: RoundState; win?: number } | null = null

  next(script: { features?: FeatureTrigger[]; nextState?: RoundState; win?: number }): void {
    this.script = script
  }

  override applySpin(input: ApplySpinInput): Promise<ApplySpinResult> {
    const script = this.script
    this.script = null

    return super.applySpin({
      ...input,
      compute: (ctx) => {
        const computed = input.compute(ctx)
        if (!script) return computed
        const win = script.win ?? computed.result.totalWin
        const result = { ...computed.result, wins: [], lineWin: win, scatterWin: 0, totalWin: win }
        if (script.nextState) result.nextState = script.nextState
        else delete result.nextState
        return { ...computed, result, features: script.features ?? [] }
      },
    })
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: ScriptedRepos
  clock: ReturnType<typeof makeClock>
  token: string
  userId: string
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
    body: JSON.stringify({ initData: 'mock:9101:FreeSpinner' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, clock, token: body.token, userId: body.user.id }
}

async function spinRaw(harness: Harness, key: string, totalBet = BET): Promise<Response> {
  return harness.app.request(`/games/${GAME_ID}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
    body: JSON.stringify({ totalBet, idempotencyKey: key }),
  })
}

async function spin(harness: Harness, key: string, totalBet = BET): Promise<SpinResponse> {
  const res = await spinRaw(harness, key, totalBet)
  expect(res.status).toBe(200)
  return (await res.json()) as SpinResponse
}

async function gameState(harness: Harness): Promise<GameStateResponse> {
  const res = await harness.app.request(`/games/${GAME_ID}/state`, {
    headers: { authorization: `Bearer ${harness.token}` },
  })
  expect(res.status).toBe(200)
  return (await res.json()) as GameStateResponse
}

/** 진입 스핀 1회. 이후 프리스핀 `spins`회가 배수 3으로 잡힌다. */
async function triggerFreeSpins(harness: Harness, spins = 10, key = 'fs-trigger-00001'): Promise<SpinResponse> {
  harness.repos.next({
    features: [trigger(spins)],
    nextState: { freeSpinsLeft: spins, freeSpinsTotal: spins, multiplier: 3 },
    win: 0,
  })
  return spin(harness, key)
}

describe('프리스핀 진입', () => {
  it('진입 스핀은 베팅을 차감하고 세션을 만든다', async () => {
    const harness = await setup()

    const body = await triggerFreeSpins(harness)

    expect(body.isFreeSpin).toBe(false)
    expect(body.wallet.coins).toBe(STARTING_COINS - BET)
    expect(body.features).toEqual([TRIGGER])
    expect(body.freeSpins).toMatchObject({
      gameId: GAME_ID,
      left: 10,
      total: 10,
      multiplier: 3,
      totalBet: BET,
      accumulatedWin: 0,
    })
    expect(body.freeSpinsSummary).toBeUndefined()
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)
  })

  it('세션에 7일 만료가 붙는다', async () => {
    const harness = await setup()

    const body = await triggerFreeSpins(harness)

    expect(body.freeSpins?.expiresAt).toBe(new Date(new Date(START_AT).getTime() + FREE_SPINS_TTL_MS).toISOString())
  })

  it('다음 스핀은 차감 없이 돌고 잔액이 그대로다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)
    const afterTrigger = (await harness.repos.getWallet(harness.userId))?.coins

    harness.repos.next({ nextState: { freeSpinsLeft: 9, freeSpinsTotal: 10, multiplier: 3 }, win: 0 })
    const free = await spin(harness, 'fs-first-000001')

    expect(free.isFreeSpin).toBe(true)
    expect(free.totalBet).toBe(BET)
    expect(free.wallet.coins).toBe(afterTrigger)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)
    expect(free.freeSpins?.left).toBe(9)
  })

  it('프리스핀 중에는 요청의 totalBet을 무시하고 고정 베팅을 쓴다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)

    // 레벨 1이 못 거는 500을 보내도 400이 아니라 고정 베팅 100으로 돈다.
    harness.repos.next({ nextState: { freeSpinsLeft: 9, freeSpinsTotal: 10, multiplier: 3 }, win: 0 })
    const free = await spin(harness, 'fs-bigbet-00001', 500)

    expect(free.isFreeSpin).toBe(true)
    expect(free.totalBet).toBe(BET)
  })
})

describe('프리스핀 진행', () => {
  it('엔진의 nextState가 남은 횟수를 정하고 서버는 누적만 얹는다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness, 3, 'fs3-trigger-0001')

    harness.repos.next({ nextState: { freeSpinsLeft: 2, freeSpinsTotal: 3, multiplier: 3 }, win: 150 })
    const first = await spin(harness, 'fs3-a-00000001')
    expect(first.freeSpins).toMatchObject({ left: 2, total: 3, accumulatedWin: 150 })

    harness.repos.next({ nextState: { freeSpinsLeft: 1, freeSpinsTotal: 3, multiplier: 3 }, win: 90 })
    const second = await spin(harness, 'fs3-b-00000001')
    expect(second.freeSpins).toMatchObject({ left: 1, accumulatedWin: 240 })

    // 엔진이 nextState를 주지 않으면 세션이 끝난 것이다.
    harness.repos.next({ win: 10 })
    const last = await spin(harness, 'fs3-c-00000001')
    expect(last.isFreeSpin).toBe(true)
    expect(last.freeSpins).toBeNull()
    expect(last.freeSpinsSummary).toEqual({ total: 250, spins: 3 })
    expect((await gameState(harness)).freeSpins).toBeNull()

    // 다음 스핀은 다시 유료다.
    const walletBefore = (await harness.repos.getWallet(harness.userId))?.coins ?? 0
    harness.repos.next({ win: 0 })
    const paid = await spin(harness, 'fs3-paid-000001')
    expect(paid.isFreeSpin).toBe(false)
    expect(paid.wallet.coins).toBe(walletBefore - BET)
  })

  it('재발동은 엔진이 늘려 준 횟수를 그대로 반영한다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness, 2, 'rt-trigger-0001')

    // 엔진: 1회 소모 후 5회 추가 -> left 6, total 7.
    harness.repos.next({
      features: [RETRIGGER],
      nextState: { freeSpinsLeft: 6, freeSpinsTotal: 7, multiplier: 3 },
      win: 0,
    })
    const retriggered = await spin(harness, 'rt-a-000000001')

    expect(retriggered.features).toEqual([RETRIGGER])
    expect(retriggered.freeSpins).toMatchObject({ left: 6, total: 7, multiplier: 3 })
  })

  it('만료된 세션은 없는 것으로 보고 다시 유료 스핀이 된다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)
    expect((await gameState(harness)).freeSpins?.left).toBe(10)

    harness.clock.advance(FREE_SPINS_TTL_MS + 1)
    expect((await gameState(harness)).freeSpins).toBeNull()

    const walletBefore = (await harness.repos.getWallet(harness.userId))?.coins ?? 0
    harness.repos.next({ win: 0 })
    const body = await spin(harness, 'exp-paid-000001')

    expect(body.isFreeSpin).toBe(false)
    expect(body.wallet.coins).toBe(walletBefore - BET)
  })
})

describe('베팅 규칙은 락 안에서 판정한다', () => {
  it('유료 스핀의 잘못된 베팅 레벨은 400 INVALID_BET이다', async () => {
    const harness = await setup()

    const res = await spinRaw(harness, 'bad-level-00001', 37)

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('INVALID_BET')
    expect((await harness.repos.getWallet(harness.userId))?.coins).toBe(STARTING_COINS)
  })

  it('레벨 상한을 넘는 베팅은 400 BET_LOCKED이고 회계를 건드리지 않는다', async () => {
    const harness = await setup()

    const res = await spinRaw(harness, 'locked-00000001', 500)

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BET_LOCKED')
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(STARTING_COINS)
  })
})

describe('프리스핀과 다른 시스템', () => {
  it('잭팟은 유료 스핀만 적립한다', async () => {
    const harness = await setup()

    await triggerFreeSpins(harness)
    const afterTrigger = (await harness.repos.getJackpot()).pool
    expect(afterTrigger).toBe(JACKPOT_SEED_COINS + 1)

    for (let i = 0; i < 5; i += 1) {
      harness.repos.next({ nextState: { freeSpinsLeft: 9 - i, freeSpinsTotal: 10, multiplier: 3 }, win: 0 })
      await spin(harness, `jp-free-${String(i).padStart(7, '0')}`)
    }

    expect((await harness.repos.getJackpot()).pool).toBe(afterTrigger)
  })

  it('xp와 "아무 게임 N스핀" 미션은 유료 스핀만 센다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)

    harness.repos.next({ nextState: { freeSpinsLeft: 9, freeSpinsTotal: 10, multiplier: 3 }, win: 300 })
    const free = await spin(harness, 'xp-free-000001')

    // 유료 1회분만 센다.
    expect(free.missions?.find((mission) => mission.id === 'spin_50')?.progress).toBe(1)
    // 당첨 조건 미션은 프리스핀도 센다.
    expect(free.missions?.find((mission) => mission.id === 'win_3')?.progress).toBe(1)

    const me = await harness.app.request('/me', { headers: { authorization: `Bearer ${harness.token}` } })
    expect(((await me.json()) as { user: { xp: number } }).user.xp).toBe(BET)

    // 리더보드는 프리스핀도 한 판으로 세고 당첨도 합산한다.
    const board = await harness.repos.getLeaderboard(isoWeekKey(new Date(START_AT)), 50, harness.userId)
    expect(board.me).toMatchObject({ spins: 2, totalWin: 300 })
  })

  it('피처 한 판을 통과해도 원장 불변식이 유지된다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness, 3, 'inv-trigger-001')

    for (let i = 0; i < 3; i += 1) {
      const left = 2 - i
      harness.repos.next({
        ...(left > 0 ? { nextState: { freeSpinsLeft: left, freeSpinsTotal: 3, multiplier: 3 } } : {}),
        win: 120,
      })
      await spin(harness, `inv-free-${String(i).padStart(6, '0')}`)
    }

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS - BET + 360)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_win')).toBe(3)
  })
})

describe('GET /games/:id/state', () => {
  it('세션이 없으면 null, 있으면 state 컨테이너에도 같이 담아 준다', async () => {
    const harness = await setup()

    const empty = await gameState(harness)
    expect(empty.freeSpins).toBeNull()
    expect(empty.state).toEqual({ freeSpins: null })

    await triggerFreeSpins(harness)
    const active = await gameState(harness)
    expect(active.freeSpins).toMatchObject({ left: 10, multiplier: 3, totalBet: BET })
    expect(active.state.freeSpins).toEqual(active.freeSpins)
  })

  it('없는 게임은 404, 인증 없으면 401이다', async () => {
    const harness = await setup()

    const unknown = await harness.app.request('/games/no-such-game/state', {
      headers: { authorization: `Bearer ${harness.token}` },
    })
    expect(unknown.status).toBe(404)

    const unauth = await harness.app.request(`/games/${GAME_ID}/state`)
    expect(unauth.status).toBe(401)
  })
})

describe('프리스핀 멱등 재전송', () => {
  it('같은 키를 다시 보내도 상태를 두 번 소모하지 않는다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)

    harness.repos.next({ nextState: { freeSpinsLeft: 9, freeSpinsTotal: 10, multiplier: 3 }, win: 200 })
    const first = await spin(harness, 'idem-free-00001')
    const replay = await spin(harness, 'idem-free-00001')

    expect(replay).toEqual(first)
    expect(replay.isFreeSpin).toBe(true)
    expect(replay.freeSpins?.left).toBe(9)
    expect((await gameState(harness)).freeSpins?.left).toBe(9)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_win')).toBe(1)
  })

  it('세션을 끝낸 스핀은 재전송해도 같은 요약을 돌려준다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness, 1, 'sum-trigger-001')

    harness.repos.next({ win: 500 })
    const first = await spin(harness, 'sum-last-000001')
    expect(first.freeSpinsSummary).toEqual({ total: 500, spins: 1 })

    const replay = await spin(harness, 'sum-last-000001')
    expect(replay.freeSpinsSummary).toEqual(first.freeSpinsSummary)
    expect(replay).toEqual(first)
  })
})

describe('시드 공개', () => {
  it('프리스핀 라운드는 배수와 프리스핀 여부까지 공개한다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)

    harness.repos.next({ nextState: { freeSpinsLeft: 9, freeSpinsTotal: 10, multiplier: 3 }, win: 300 })
    const free = await spin(harness, 'seed-free-00001')

    const res = await harness.app.request(`/rounds/${free.roundId}/seed`, {
      headers: { authorization: `Bearer ${harness.token}` },
    })
    expect(res.status).toBe(200)

    const reveal = (await res.json()) as { isFreeSpin: boolean; multiplier: number; totalBet: number }
    expect(reveal.isFreeSpin).toBe(true)
    // 스핀 **직전**의 세션 배수. 마지막 프리스핀이라 세션이 사라져도 이 값은 남는다.
    expect(reveal.multiplier).toBe(3)
    expect(reveal.totalBet).toBe(BET)
  })

  it('기본 게임 라운드의 배수는 1이다', async () => {
    const harness = await setup()
    harness.repos.next({ win: 0 })
    const paid = await spin(harness, 'seed-paid-00001')

    const res = await harness.app.request(`/rounds/${paid.roundId}/seed`, {
      headers: { authorization: `Bearer ${harness.token}` },
    })
    const reveal = (await res.json()) as { isFreeSpin: boolean; multiplier: number }

    expect(reveal.isFreeSpin).toBe(false)
    expect(reveal.multiplier).toBe(1)
  })
})
