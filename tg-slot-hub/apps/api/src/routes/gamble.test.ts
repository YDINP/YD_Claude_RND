import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '@tgslot/shared'
import type { GambleResponse, GambleStep, MutationEvent, SpinResponse } from '@tgslot/shared'
import type { Rng } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import type { ApplySpinInput, ApplySpinResult } from '../repos/types.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { ApiConfig } from '../config.js'
import { GAMBLE_TTL_MS } from '../economy/gamble.js'
import type { GambleConfig } from '@tgslot/slot-engine'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { Clock } from '../economy/time.js'

const GAME_ID = 'classic-777'
const BET = 100
const WIN = 400
const START_AT = '2026-09-03T09:00:00Z'

/** sheriff-sixgun 카탈로그 값. 코인 플립 50%, 2배, 5단계까지. */
const GAMBLE: GambleConfig = { type: 'coin-flip', chance: 0.5, payout: 2, maxSteps: 5 }

const diskPacks = loadGamePacks()

function basePack(): GamePack {
  const pack = diskPacks.find((candidate) => candidate.id === GAME_ID)
  if (!pack) throw new Error(`${GAME_ID} 팩이 없다`)
  return pack
}

/** 더블업이 달린 팩. sheriff-sixgun처럼 math.json에 gamble 블록이 있는 게임을 흉내낸다. */
function gamblePack(config: GambleConfig = GAMBLE): GamePack {
  const pack = basePack()
  return { ...pack, math: { ...pack.math, gamble: config } }
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

/** 잭팟은 절대 안 터지게 고정. 이 파일의 관심사가 아니다. */
function noJackpotRng(): Rng {
  return { nextInt: (max) => (max === JACKPOT_ODDS_DENOMINATOR ? max - 1 : 0) }
}

/** 항상 이기는 판정 / 항상 지는 판정. */
const alwaysWin = (): Rng => ({ nextInt: () => 0 })
const alwaysLose = (): Rng => ({ nextInt: (max) => max - 1 })

/** 스핀 결과의 당첨·뮤테이션·프리스핀 여부를 테스트가 정해 주는 레포. */
class ScriptedRepos extends MemoryRepos {
  private script: {
    win?: number
    mutations?: MutationEvent[]
    gridBefore?: string[][]
    freeSpins?: { left: number; total: number; multiplier: number }
  } | null = null

  next(script: {
    win?: number
    mutations?: MutationEvent[]
    gridBefore?: string[][]
    freeSpins?: { left: number; total: number; multiplier: number }
  }): void {
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
        const result = {
          ...computed.result,
          wins: [],
          lineWin: win,
          scatterWin: 0,
          totalWin: win,
          ...(script.gridBefore ? { gridBefore: script.gridBefore } : {}),
          ...(script.mutations ? { mutations: script.mutations } : {}),
        }
        if (script.freeSpins) {
          result.nextState = {
            freeSpinsLeft: script.freeSpins.left,
            freeSpinsTotal: script.freeSpins.total,
            multiplier: script.freeSpins.multiplier,
          }
        }
        return { ...computed, result }
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

async function setup(
  options: { pack?: GamePack; gambleRng?: (seedInput: string) => Rng } = {}
): Promise<Harness> {
  const clock = makeClock(START_AT)
  const repos = new ScriptedRepos(clock.now as Clock)
  const app = createApp({
    config: makeConfig(),
    repos,
    games: createGameRegistry([options.pack ?? gamblePack()]),
    clock: clock.now,
    spinRng: noJackpotRng,
    gambleRng: options.gambleRng ?? alwaysWin,
  })

  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9301:Gambler' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, clock, token: body.token, userId: body.user.id }
}

async function spin(harness: Harness, key: string, win = WIN): Promise<SpinResponse> {
  harness.repos.next({ win })
  const res = await harness.app.request(`/games/${GAME_ID}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
    body: JSON.stringify({ totalBet: BET, idempotencyKey: key }),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as SpinResponse
}

async function post(harness: Harness, path: string, body?: unknown): Promise<Response> {
  return harness.app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

let keyCounter = 0

async function gamble(
  harness: Harness,
  roundId: string,
  options: { pick?: 'heads' | 'tails'; key?: string } = {}
): Promise<Response> {
  keyCounter += 1
  return post(harness, `/rounds/${roundId}/gamble`, {
    pick: options.pick ?? 'heads',
    idempotencyKey: options.key ?? `gk-${String(keyCounter).padStart(12, '0')}`,
  })
}

async function gambleBody(
  harness: Harness,
  roundId: string,
  options: { pick?: 'heads' | 'tails'; key?: string } = {}
): Promise<GambleResponse> {
  const res = await gamble(harness, roundId, options)
  expect(res.status).toBe(200)
  return (await res.json()) as GambleResponse
}

function wallet(harness: Harness): Promise<number> {
  return harness.repos.getWallet(harness.userId).then((w) => w?.coins ?? 0)
}

/** 어떤 경로를 지나든 지갑 잔액과 원장 합은 같아야 한다. */
async function expectLedgerInvariant(harness: Harness): Promise<void> {
  expect(harness.repos.getLedgerSum(harness.userId)).toBe(await wallet(harness))
}

describe('설정은 math.json에서 온다', () => {
  it('디스크의 팩에서 더블업 설정을 그대로 읽는다', () => {
    // 값 자체는 게임 담당이 튜닝하므로 고정하지 않고, 쓸 수 있는 모양인지만 본다.
    const withGamble = diskPacks.filter((pack) => pack.math.gamble !== undefined)
    expect(withGamble.length).toBeGreaterThan(0)

    for (const pack of withGamble) {
      const gamble = pack.math.gamble
      expect(gamble?.type).toBe('coin-flip')
      expect(gamble?.chance).toBeGreaterThan(0)
      expect(gamble?.chance).toBeLessThan(1)
      expect(gamble?.payout).toBeGreaterThan(1)
      // 엔진이 기대값 중립(chance x payout <= 1)까지 검증해 준다.
      expect((gamble?.chance ?? 0) * (gamble?.payout ?? 0)).toBeLessThanOrEqual(1)
    }
  })
})

describe('더블업 제안과 에스크로', () => {
  it('당첨금은 지갑에서 빠져 판돈으로 잠긴다', async () => {
    const harness = await setup()

    const body = await spin(harness, 'gm-win-00000001')

    expect(body.gambleOffer).toEqual({
      pendingWin: WIN,
      maxSteps: 5,
      // 결과 화면이 바로 카운트다운을 띄울 수 있게 만료 시각을 함께 준다.
      expiresAt: new Date(new Date(START_AT).getTime() + GAMBLE_TTL_MS).toISOString(),
    })
    // 당첨금이 잠겼으므로 잔액에는 베팅 차감만 남는다.
    expect(body.wallet.coins).toBe(STARTING_COINS - BET)
    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_win')).toBe(1)
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_escrow')).toBe(1)
    await expectLedgerInvariant(harness)
  })

  it('당첨이 없거나 더블업이 없는 게임은 제안하지 않는다', async () => {
    const harness = await setup()
    const noWin = await spin(harness, 'gm-nowin-0000001', 0)
    expect(noWin.gambleOffer).toBeUndefined()

    const plain = await setup({ pack: basePack() })
    const body = await spin(plain, 'gm-nogame-000001')
    expect(body.gambleOffer).toBeUndefined()
    expect(body.wallet.coins).toBe(STARTING_COINS - BET + WIN)

    const res = await gamble(plain, body.roundId)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('GAMBLE_UNAVAILABLE')
  })

  it('프리스핀 당첨에는 제안이 붙지 않는다', async () => {
    const harness = await setup()

    // 진입 스핀에서 프리스핀 3회를 연다.
    harness.repos.next({ win: 0, freeSpins: { left: 3, total: 3, multiplier: 2 } })
    await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'gm-fs-trigger-01' }),
    })

    harness.repos.next({ win: WIN, freeSpins: { left: 2, total: 3, multiplier: 2 } })
    const free = await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'gm-fs-win-00001' }),
    })
    const body = (await free.json()) as SpinResponse

    expect(body.isFreeSpin).toBe(true)
    expect(body.gambleOffer).toBeUndefined()
    // 프리스핀 당첨금은 잠기지 않고 그대로 지갑에 남는다.
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_escrow')).toBe(0)
    await expectLedgerInvariant(harness)
  })
})

describe('더블업 판정', () => {
  it('이기면 판돈이 두 배가 되지만 지갑은 아직 그대로다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-w-000000001')
    const before = round.wallet.coins

    const body = await gambleBody(harness, round.roundId)

    expect(body.outcome).toBe('win')
    expect(body.side).toBe('heads')
    expect(body.pendingWin).toBe(WIN * 2)
    expect(body.autoCollected).toBe(false)
    // 판돈은 여전히 잠겨 있다. 회수해야 지갑에 들어온다.
    expect(body.wallet.coins).toBe(before)
    expect(body.stepsLeft).toBe(4)
    // 세션이 이어지므로 만료 시각이 갱신돼 함께 온다.
    expect(body.expiresAt).toBe(new Date(new Date(START_AT).getTime() + GAMBLE_TTL_MS).toISOString())
    expect(body.seedInput).toMatch(/:gamble:1$/)
    await expectLedgerInvariant(harness)
  })

  it('지면 잠긴 판돈이 사라지고 지갑은 마이너스로 가지 않는다', async () => {
    const harness = await setup({ gambleRng: alwaysLose })
    const round = await spin(harness, 'gm-l-000000001')
    const before = round.wallet.coins

    const body = await gambleBody(harness, round.roundId)

    expect(body.outcome).toBe('lose')
    expect(body.side).toBe('tails')
    expect(body.pendingWin).toBe(0)
    // 에스크로가 이미 빠져 있었으므로 여기서 더 차감할 것이 없다.
    expect(body.wallet.coins).toBe(before)
    expect(body.stepsLeft).toBe(0)
    // 끝난 판정에는 만료 시각이 없다.
    expect(body.expiresAt).toBeUndefined()
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_collect')).toBe(0)
    await expectLedgerInvariant(harness)

    expect((await gamble(harness, round.roundId)).status).toBe(409)
  })

  it('잔액을 다 써도 더블업이 지갑을 마이너스로 만들지 않는다', async () => {
    const harness = await setup({ gambleRng: alwaysLose })
    const round = await spin(harness, 'gm-drain-00001')

    // 당첨금이 잠긴 사이 남은 잔액을 전부 태운다.
    const remaining = await wallet(harness)
    harness.repos.next({ win: 0 })
    await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'gm-drain-00002' }),
    })

    // 새 스핀이 잠긴 판돈을 먼저 돌려주므로 예전 제안으로는 더 못 건다.
    expect((await gamble(harness, round.roundId)).status).toBe(409)
    expect(await wallet(harness)).toBe(remaining + WIN - BET)
    await expectLedgerInvariant(harness)
  })

  it('연속으로 이기면 판돈이 계속 두 배가 된다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-chain-000001')

    const first = await gambleBody(harness, round.roundId)
    const second = await gambleBody(harness, round.roundId)

    expect(first.pendingWin).toBe(WIN * 2)
    expect(second.pendingWin).toBe(WIN * 4)
    expect(second.stepsLeft).toBe(3)
    expect(second.seedInput).toMatch(/:gamble:2$/)
    await expectLedgerInvariant(harness)
  })
})

describe('멱등 재전송', () => {
  it('같은 키는 판정을 다시 하지 않고 같은 결과를 돌려준다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-idem-000001')

    const first = await gambleBody(harness, round.roundId, { key: 'gamble-key-0001' })
    const replay = await gambleBody(harness, round.roundId, { key: 'gamble-key-0001' })

    expect(replay).toEqual(first)
    // 단계가 한 번만 기록됐다.
    const state = await harness.repos.getGameState(harness.userId, GAME_ID)
    expect(state.gamble?.steps).toHaveLength(1)
    expect(state.gamble?.pendingWin).toBe(WIN * 2)
    await expectLedgerInvariant(harness)
  })

  it('세션이 닫힌 뒤에 재전송해도 그때 결과를 돌려준다', async () => {
    const harness = await setup({ gambleRng: alwaysLose })
    const round = await spin(harness, 'gm-idem-lose-01')

    const lost = await gambleBody(harness, round.roundId, { key: 'lose-key-00001' })
    expect(lost.outcome).toBe('lose')
    // 세션은 이미 닫혔다. 그래도 같은 키는 409가 아니라 그때 결과여야 한다 (네트워크 재전송).
    const replay = await gambleBody(harness, round.roundId, { key: 'lose-key-00001' })

    expect(replay).toEqual(lost)
    // 다른 키로는 여전히 못 건다.
    expect((await gamble(harness, round.roundId)).status).toBe(409)
    await expectLedgerInvariant(harness)
  })

  it('자동 회수로 닫힌 뒤에 재전송해도 그때 결과를 돌려준다', async () => {
    const harness = await setup({ gambleRng: alwaysWin, pack: gamblePack({ ...GAMBLE, maxSteps: 1 }) })
    const round = await spin(harness, 'gm-idem-auto-01')

    const won = await gambleBody(harness, round.roundId, { key: 'auto-key-00001' })
    expect(won.autoCollected).toBe(true)

    const walletAfter = await wallet(harness)
    const replay = await gambleBody(harness, round.roundId, { key: 'auto-key-00001' })

    expect(replay.outcome).toBe('win')
    expect(replay.autoCollected).toBe(true)
    expect(replay.pendingWin).toBe(won.pendingWin)
    // 재전송이 돈을 두 번 주지 않는다.
    expect(await wallet(harness)).toBe(walletAfter)
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_collect')).toBe(1)
    await expectLedgerInvariant(harness)
  })

  it('헤더로 보낸 키도 받는다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-hdr-000001')

    const res = await harness.app.request(`/rounds/${round.roundId}/gamble`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${harness.token}`,
        'Idempotency-Key': 'header-key-0001',
      },
      body: JSON.stringify({ pick: 'heads' }),
    })

    expect(res.status).toBe(200)
    const state = await harness.repos.getGameState(harness.userId, GAME_ID)
    expect(state.gamble?.steps[0]?.idempotencyKey).toBe('header-key-0001')
  })

  it('키가 없으면 400이다', async () => {
    const harness = await setup()
    const round = await spin(harness, 'gm-nokey-00001')

    const res = await post(harness, `/rounds/${round.roundId}/gamble`, { pick: 'heads' })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BAD_REQUEST')
  })
})

describe('더블업 종료', () => {
  it('회수하면 잠긴 판돈이 지갑으로 들어온다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-col-000000001')
    const won = await gambleBody(harness, round.roundId)

    const res = await post(harness, `/rounds/${round.roundId}/collect`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as GambleResponse

    expect(body.outcome).toBe('collected')
    expect(body.autoCollected).toBe(false)
    expect(body.pendingWin).toBe(won.pendingWin)
    expect(body.wallet.coins).toBe(won.wallet.coins + won.pendingWin)
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_collect')).toBe(1)
    await expectLedgerInvariant(harness)

    expect((await gamble(harness, round.roundId)).status).toBe(409)
    expect((await post(harness, `/rounds/${round.roundId}/collect`)).status).toBe(409)
  })

  it('단계 상한에 닿으면 자동으로 회수된다', async () => {
    const harness = await setup({ gambleRng: alwaysWin, pack: gamblePack({ ...GAMBLE, maxSteps: 2 }) })
    const round = await spin(harness, 'gm-cap-000000001')

    const first = await gambleBody(harness, round.roundId)
    expect(first.stepsLeft).toBe(1)
    expect(first.autoCollected).toBe(false)

    const second = await gambleBody(harness, round.roundId)
    expect(second.outcome).toBe('win')
    expect(second.autoCollected).toBe(true)
    expect(second.pendingWin).toBe(WIN * 4)
    expect(second.stepsLeft).toBe(0)
    expect(second.expiresAt).toBeUndefined()
    // 자동 회수라 지갑에 이미 들어와 있다.
    expect(second.wallet.coins).toBe(first.wallet.coins + WIN * 4)
    await expectLedgerInvariant(harness)

    expect((await gamble(harness, round.roundId)).status).toBe(409)
  })

  it('금액 상한은 총 베팅액의 배수로 판단한다', async () => {
    // 상한 6배 = 600코인. 400 -> 800이면 넘으므로 한 번만 걸 수 있다.
    const harness = await setup({ gambleRng: alwaysWin, pack: gamblePack({ ...GAMBLE, maxWinCap: 6 }) })
    const round = await spin(harness, 'gm-wincap-00001')

    const body = await gambleBody(harness, round.roundId)

    expect(body.pendingWin).toBe(WIN * 2)
    expect(body.autoCollected).toBe(true)
    expect(body.stepsLeft).toBe(0)
    expect((await gamble(harness, round.roundId)).status).toBe(409)
    await expectLedgerInvariant(harness)
  })

  it('만료되면 상태 조회가 그 자리에서 잠긴 돈을 돌려준다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    await spin(harness, 'gm-exp-000000001')
    const locked = await wallet(harness)

    harness.clock.advance(GAMBLE_TTL_MS + 1)

    // 조회만 해도 회수된다. 숨기기만 하면 다음 스핀 전까지 돈이 잠긴 채로 남는다.
    const res = await harness.app.request(`/games/${GAME_ID}/state`, {
      headers: { authorization: `Bearer ${harness.token}` },
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { state: { gamble: unknown } }).state.gamble).toBeNull()

    expect(await wallet(harness)).toBe(locked + WIN)
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_collect')).toBe(1)
    await expectLedgerInvariant(harness)
  })

  it('만료된 뒤 도전하면 판정 대신 자동 회수로 끝난다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-exp2-00000001')
    const locked = await wallet(harness)

    harness.clock.advance(GAMBLE_TTL_MS + 1)

    // 상태 조회를 거치지 않고 바로 도전한 경우에도 잠긴 돈은 잃지 않는다.
    const body = await gambleBody(harness, round.roundId)
    expect(body.outcome).toBe('collected')
    expect(body.autoCollected).toBe(true)
    expect(body.pendingWin).toBe(WIN)
    expect(await wallet(harness)).toBe(locked + WIN)
    await expectLedgerInvariant(harness)
  })

  it('새 스핀은 잠긴 판돈을 먼저 돌려준다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const first = await spin(harness, 'gm-void-000001')
    const before = first.wallet.coins

    const next = await spin(harness, 'gm-void-000002', 0)

    // 잠겼던 400이 돌아오고 새 베팅 100이 빠진다.
    expect(next.wallet.coins).toBe(before + WIN - BET)
    expect(harness.repos.countLedgerEntries(harness.userId, 'gamble_collect')).toBe(1)
    await expectLedgerInvariant(harness)

    const res = await gamble(harness, first.roundId)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('NOT_GAMBLEABLE')
  })
})

describe('더블업 접근 제어', () => {
  it('없는 라운드와 남의 라운드는 404다', async () => {
    const harness = await setup()
    const round = await spin(harness, 'gm-owner-00001')

    expect((await gamble(harness, '00000000-0000-0000-0000-000000000000')).status).toBe(404)

    const otherLogin = await harness.app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'mock:9302:Nosy' }),
    })
    const other = (await otherLogin.json()) as { token: string }

    const res = await harness.app.request(`/rounds/${round.roundId}/gamble`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${other.token}` },
      body: JSON.stringify({ pick: 'heads', idempotencyKey: 'nosy-key-000001' }),
    })
    expect(res.status).toBe(404)
  })

  it('본문이 잘못되면 400, 인증이 없으면 401이다', async () => {
    const harness = await setup()
    const round = await spin(harness, 'gm-body-000001')

    const bad = await post(harness, `/rounds/${round.roundId}/gamble`, {
      pick: 'edge',
      idempotencyKey: 'bad-pick-00001',
    })
    expect(bad.status).toBe(400)

    const unauth = await harness.app.request(`/rounds/${round.roundId}/gamble`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pick: 'heads', idempotencyKey: 'unauth-key-0001' }),
    })
    expect(unauth.status).toBe(401)
  })
})

describe('provably fair 공개', () => {
  it('시드 공개에 더블업 단계가 실린다', async () => {
    const harness = await setup({ gambleRng: alwaysWin })
    const round = await spin(harness, 'gm-seed-000001')
    await gambleBody(harness, round.roundId, { pick: 'tails', key: 'seed-key-00001' })

    const res = await harness.app.request(`/rounds/${round.roundId}/seed`, {
      headers: { authorization: `Bearer ${harness.token}` },
    })
    const reveal = (await res.json()) as { seed: string; nonce: number; gamble: GambleStep[] }

    expect(reveal.gamble).toHaveLength(1)
    expect(reveal.gamble[0]).toMatchObject({
      step: 1,
      idempotencyKey: 'seed-key-00001',
      pick: 'tails',
      side: 'tails',
      won: true,
      stake: WIN,
      pendingWin: WIN * 2,
      seedInput: `${reveal.seed}:${reveal.nonce}:gamble:1`,
    })
  })
})

describe('뮤테이션 왕복', () => {
  const MUTATION: MutationEvent = {
    type: 'mystery',
    symbol: 'seven',
    cells: [
      { position: [0, 1], from: 'mystery', to: 'seven' },
      { position: [1, 1], from: 'mystery', to: 'seven' },
    ],
  }

  const GRID_BEFORE = [
    ['a', 'b', 'c'],
    ['mystery', 'mystery', 'c'],
    ['a', 'b', 'c'],
  ]

  async function mutatedSpin(harness: Harness, key: string): Promise<SpinResponse> {
    harness.repos.next({ win: WIN, gridBefore: GRID_BEFORE, mutations: [MUTATION] })
    const res = await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: key }),
    })
    expect(res.status).toBe(200)
    return (await res.json()) as SpinResponse
  }

  it('gridBefore와 mutations를 응답에 싣고 grid는 적용 후 격자다', async () => {
    const harness = await setup()

    const body = await mutatedSpin(harness, 'mut-000000000001')

    expect(body.gridBefore).toEqual(GRID_BEFORE)
    expect(body.mutations).toEqual([MUTATION])
    expect(body.grid[1]).toEqual(['seven', 'seven', 'c'])
    expect(body.grid[0]).toEqual(GRID_BEFORE[0])
  })

  it('멱등 재전송도 같은 격자와 뮤테이션을 돌려준다', async () => {
    const harness = await setup()

    const first = await mutatedSpin(harness, 'mut-replay-00001')
    harness.repos.next({ win: WIN, gridBefore: GRID_BEFORE, mutations: [MUTATION] })
    const second = await harness.app.request(`/games/${GAME_ID}/spin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'mut-replay-00001' }),
    })
    const secondBody = (await second.json()) as SpinResponse

    expect(secondBody).toEqual(first)
    expect(secondBody.mutations).toEqual([MUTATION])
  })

  it('뮤테이션이 없으면 gridBefore와 grid가 같다', async () => {
    const harness = await setup()
    const body = await spin(harness, 'mut-none-000001')

    expect(body.mutations).toEqual([])
    expect(body.gridBefore).toEqual(body.grid)
  })
})
