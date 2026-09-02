import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, GameStateResponse, SpinResponse } from '@tgslot/shared'
import { createSeededRng } from '@tgslot/slot-engine'
import type { Rng } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import type { ApplySpinInput, ApplySpinResult } from '../repos/types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR, JACKPOT_SEED_COINS } from '../economy/config.js'
import type { FreeSpinsAward } from '../economy/freeSpins.js'
import { isoWeekKey } from '../economy/time.js'

const GAME_ID = 'classic-777'
const BET = 100
/** 프리스핀 진입 피처. 10회, 배수 3. */
const TRIGGER: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 3, retrigger: false }
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

function noJackpotRng(seed: string, nonce: number): Rng {
  const rng = createSeededRng(`${seed}:${nonce}`)
  return { nextInt: (max) => (max === JACKPOT_ODDS_DENOMINATOR ? max - 1 : rng.nextInt(max)) }
}

/** 다음 스핀이 뱉을 피처와 당첨을 테스트가 정해 주는 레포. 엔진은 아직 트리거를 만들지 않는다. */
class ScriptedRepos extends MemoryRepos {
  /** 다음 스핀에 실릴 대본. 한 번 쓰면 비워진다. */
  private script: { features?: FeatureTrigger[]; award?: FreeSpinsAward; win?: number } | null = null

  next(script: { features?: FeatureTrigger[]; award?: FreeSpinsAward; win?: number }): void {
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
        return {
          ...computed,
          result: { ...computed.result, wins: [], lineWin: win, scatterWin: 0, totalWin: win },
          features: script.features ?? [],
          ...(script.award ? { freeSpinsAward: script.award } : {}),
        }
      },
    })
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: ScriptedRepos
  token: string
  userId: string
}

async function setup(): Promise<Harness> {
  const repos = new ScriptedRepos()
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry([classicPack()]),
    spinRng: noJackpotRng,
  })

  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9101:FreeSpinner' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

async function spin(harness: Harness, key: string, totalBet = BET): Promise<SpinResponse> {
  const res = await harness.app.request(`/games/${GAME_ID}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
    body: JSON.stringify({ totalBet, idempotencyKey: key }),
  })
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

/** 진입 스핀 1회. 이후 프리스핀 10회가 배수 3으로 잡힌다. */
async function triggerFreeSpins(harness: Harness, key = 'fs-trigger-00001'): Promise<SpinResponse> {
  harness.repos.next({ features: [TRIGGER], award: { spins: 10, multiplier: 3 }, win: 0 })
  return spin(harness, key)
}

describe('프리스핀 진입', () => {
  it('진입 스핀은 베팅을 차감하고 세션을 만든다', async () => {
    const harness = await setup()

    const body = await triggerFreeSpins(harness)

    expect(body.isFreeSpin).toBe(false)
    expect(body.wallet.coins).toBe(STARTING_COINS - BET)
    expect(body.features).toEqual([TRIGGER])
    expect(body.freeSpins).toEqual({
      gameId: GAME_ID,
      left: 10,
      total: 10,
      multiplier: 3,
      totalBet: BET,
      accumulatedWin: 0,
    })
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)
  })

  it('다음 스핀은 차감 없이 돌고 잔액이 그대로다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)
    const afterTrigger = (await harness.repos.getWallet(harness.userId))?.coins

    harness.repos.next({ win: 0 })
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
    harness.repos.next({ win: 0 })
    const free = await spin(harness, 'fs-bigbet-00001', 500)

    expect(free.isFreeSpin).toBe(true)
    expect(free.totalBet).toBe(BET)
  })
})

describe('프리스핀 진행', () => {
  it('횟수가 줄고 당첨이 누적되며 0이 되면 세션이 사라진다', async () => {
    const harness = await setup()
    harness.repos.next({ features: [{ ...TRIGGER, spins: 3 }], award: { spins: 3, multiplier: 3 }, win: 0 })
    await spin(harness, 'fs3-trigger-0001')

    harness.repos.next({ win: 150 })
    const first = await spin(harness, 'fs3-a-00000001')
    expect(first.freeSpins).toMatchObject({ left: 2, total: 3, accumulatedWin: 150 })

    harness.repos.next({ win: 90 })
    const second = await spin(harness, 'fs3-b-00000001')
    expect(second.freeSpins).toMatchObject({ left: 1, accumulatedWin: 240 })

    harness.repos.next({ win: 10 })
    const last = await spin(harness, 'fs3-c-00000001')
    expect(last.isFreeSpin).toBe(true)
    // 다 쓴 세션은 지운다. 클라이언트는 null을 보고 기본 게임으로 돌아간다.
    expect(last.freeSpins).toBeNull()
    expect((await gameState(harness)).freeSpins).toBeNull()

    // 다음 스핀은 다시 유료다.
    const walletBefore = (await harness.repos.getWallet(harness.userId))?.coins ?? 0
    harness.repos.next({ win: 0 })
    const paid = await spin(harness, 'fs3-paid-000001')
    expect(paid.isFreeSpin).toBe(false)
    expect(paid.wallet.coins).toBe(walletBefore - BET)
  })

  it('재발동은 남은 횟수와 총 횟수를 늘린다', async () => {
    const harness = await setup()
    harness.repos.next({ features: [{ ...TRIGGER, spins: 2 }], award: { spins: 2, multiplier: 3 }, win: 0 })
    await spin(harness, 'rt-trigger-0001')

    // 첫 프리스핀에서 재발동: 1회 소모 뒤 5회가 더해져 6회가 남아야 한다.
    harness.repos.next({ features: [RETRIGGER], award: { spins: 5, multiplier: 3 }, win: 0 })
    const retriggered = await spin(harness, 'rt-a-000000001')

    expect(retriggered.features).toEqual([RETRIGGER])
    expect(retriggered.freeSpins).toMatchObject({ left: 6, total: 7, multiplier: 3 })
  })

  it('마지막 프리스핀에서 재발동해도 세션이 끊기지 않는다', async () => {
    const harness = await setup()
    harness.repos.next({ features: [{ ...TRIGGER, spins: 1 }], award: { spins: 1, multiplier: 3 }, win: 0 })
    await spin(harness, 'lt-trigger-0001')

    harness.repos.next({ features: [RETRIGGER], award: { spins: 5, multiplier: 3 }, win: 0 })
    const body = await spin(harness, 'lt-a-000000001')

    // 소모(1 -> 0)를 먼저 하고 재발동분을 더하므로 5회가 남는다.
    expect(body.freeSpins).toMatchObject({ left: 5, total: 6 })
  })
})

describe('프리스핀과 다른 시스템', () => {
  it('잭팟은 유료 스핀만 적립한다', async () => {
    const harness = await setup()

    await triggerFreeSpins(harness)
    const afterTrigger = (await harness.repos.getJackpot()).pool
    expect(afterTrigger).toBe(JACKPOT_SEED_COINS + 1)

    for (let i = 0; i < 5; i += 1) {
      harness.repos.next({ win: 0 })
      await spin(harness, `jp-free-${String(i).padStart(7, '0')}`)
    }

    // 프리스핀 5회는 풀에 한 푼도 넣지 않는다.
    expect((await harness.repos.getJackpot()).pool).toBe(afterTrigger)
  })

  it('xp는 유료 베팅만 세지만 미션·리더보드는 프리스핀도 센다', async () => {
    const harness = await setup()
    await triggerFreeSpins(harness)

    harness.repos.next({ win: 300 })
    const free = await spin(harness, 'xp-free-000001')

    // 유료 1회분(100)만 xp에 들어간다.
    expect(free.missions?.find((mission) => mission.id === 'spin_50')?.progress).toBe(2)
    const me = await harness.app.request('/me', { headers: { authorization: `Bearer ${harness.token}` } })
    const body = (await me.json()) as { user: { xp: number } }
    expect(body.user.xp).toBe(BET)

    // 리더보드는 프리스핀도 한 판으로 세고 당첨도 합산한다.
    const board = await harness.repos.getLeaderboard(isoWeekKey(new Date()), 50, harness.userId)
    expect(board.me).toMatchObject({ spins: 2, totalWin: 300 })
  })

  it('피처 한 판을 통과해도 원장 불변식이 유지된다', async () => {
    const harness = await setup()
    harness.repos.next({ features: [{ ...TRIGGER, spins: 3 }], award: { spins: 3, multiplier: 3 }, win: 0 })
    await spin(harness, 'inv-trigger-001')

    for (let i = 0; i < 3; i += 1) {
      harness.repos.next({ win: 120 })
      await spin(harness, `inv-free-${String(i).padStart(6, '0')}`)
    }

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS - BET + 360)
    expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)
    // 차감은 진입 스핀 1회뿐이고 당첨은 3건이다.
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_win')).toBe(3)
  })
})

describe('GET /games/:id/state', () => {
  it('세션이 없으면 null, 있으면 그대로 준다', async () => {
    const harness = await setup()

    expect((await gameState(harness)).freeSpins).toBeNull()

    await triggerFreeSpins(harness)
    expect((await gameState(harness)).freeSpins).toMatchObject({ left: 10, multiplier: 3, totalBet: BET })
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

    harness.repos.next({ win: 200 })
    const first = await spin(harness, 'idem-free-00001')
    const replay = await spin(harness, 'idem-free-00001')

    expect(replay).toEqual(first)
    expect(replay.isFreeSpin).toBe(true)
    expect(replay.freeSpins?.left).toBe(9)
    expect((await gameState(harness)).freeSpins?.left).toBe(9)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_win')).toBe(1)
  })
})
