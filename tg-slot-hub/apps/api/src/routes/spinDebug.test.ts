import { describe, expect, it } from 'vitest'
import { STARTING_COINS, SpinResponseSchema } from '@tgslot/shared'
import type { SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import type { GameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'

/** 4개 카탈로그 게임 전부 betLevels에 100이 있고, 레벨 1 상한(100)에도 걸리지 않는다. */
const BET = 100

const diskPacks = loadGamePacks()

function pack(id: string): GamePack {
  const found = diskPacks.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`${id} 팩이 없다`)
  return found
}

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    telegramBotToken: '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz',
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevMock: true,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
    ...overrides,
  }
}

interface Harness {
  app: ReturnType<typeof createApp>
  repos: MemoryRepos
  token: string
  userId: string
}

async function setup(registry: GameRegistry, config: Partial<ApiConfig> = {}): Promise<Harness> {
  const repos = new MemoryRepos()
  const app = createApp({ config: makeConfig(config), repos, games: registry })

  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:8001:Debugger' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

interface DebugSpinOptions {
  gameId: string
  idempotencyKey: string
  preset?: SpinDebugPreset
  maxTries?: number
  totalBet?: number
}

async function debugSpinRequest(harness: Harness, options: DebugSpinOptions): Promise<Response> {
  return harness.app.request(`/games/${options.gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
    body: JSON.stringify({
      totalBet: options.totalBet ?? BET,
      idempotencyKey: options.idempotencyKey,
      ...(options.preset
        ? { debug: { preset: options.preset, ...(options.maxTries === undefined ? {} : { maxTries: options.maxTries }) } }
        : {}),
    }),
  })
}

describe('POST /games/:id/spin debug presets', () => {
  it('rejects a debug request with 400 DEBUG_DISABLED when allowDevMock is false', async () => {
    const registry = createGameRegistry([pack('classic-777')])
    // mock: initData 로그인 자체가 allowDevMock을 요구하므로, 로그인은 켜진 앱으로 하고
    // 같은 레포/시크릿을 공유하는 꺼진 앱으로 스핀을 보낸다 (토큰은 발급된 뒤에 정책이 바뀐 상황을 흉내낸다).
    const harness = await setup(registry, { allowDevMock: true })
    const disabledApp = createApp({
      config: makeConfig({ allowDevMock: false }),
      repos: harness.repos,
      games: registry,
    })

    const res = await disabledApp.request('/games/classic-777/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({
        totalBet: BET,
        idempotencyKey: 'key-disabled-000001',
        debug: { preset: 'win' },
      }),
    })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('DEBUG_DISABLED')

    // 지갑/원장은 건드리지 않았다.
    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS)
  })

  it('returns 409 DEBUG_NO_MATCH immediately for the gamble preset on a game without a gamble config', async () => {
    const registry = createGameRegistry([pack('classic-777')])
    const harness = await setup(registry)

    const res = await debugSpinRequest(harness, {
      gameId: 'classic-777',
      idempotencyKey: 'key-nogamble-000001',
      preset: 'gamble',
    })

    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')

    // 시드 탐색을 시도조차 하지 않았으니 지갑도 그대로다.
    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS)
  })

  it('returns 409 DEBUG_NO_MATCH once maxTries is exhausted for an unattainable preset', async () => {
    // classic-777에는 scatter/freeSpins 설정이 아예 없으므로 freeSpins 프리셋은 항상 실패한다.
    const registry = createGameRegistry([pack('classic-777')])
    const harness = await setup(registry)

    const res = await debugSpinRequest(harness, {
      gameId: 'classic-777',
      idempotencyKey: 'key-nomatch-000001',
      preset: 'freeSpins',
      maxTries: 5,
    })

    expect(res.status).toBe(409)
    expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')

    const wallet = await harness.repos.getWallet(harness.userId)
    expect(wallet?.coins).toBe(STARTING_COINS)
  })

  interface Case {
    gameId: string
    preset: SpinDebugPreset
    maxTries?: number
  }

  // classic-777/fruit-fiesta/shiba-shrine은 gamble 설정이 없다. sheriff-sixgun만 gamble을 갖는다.
  const cases: Case[] = [
    { gameId: 'classic-777', preset: 'win' },
    { gameId: 'classic-777', preset: 'bigWin', maxTries: 20_000 },
    { gameId: 'classic-777', preset: 'lose' },
    { gameId: 'fruit-fiesta', preset: 'win' },
    { gameId: 'fruit-fiesta', preset: 'bigWin', maxTries: 20_000 },
    { gameId: 'fruit-fiesta', preset: 'freeSpins' },
    { gameId: 'fruit-fiesta', preset: 'lose' },
    { gameId: 'sheriff-sixgun', preset: 'win' },
    { gameId: 'sheriff-sixgun', preset: 'gamble' },
    { gameId: 'sheriff-sixgun', preset: 'freeSpins' },
    { gameId: 'sheriff-sixgun', preset: 'lose' },
    { gameId: 'shiba-shrine', preset: 'win' },
    { gameId: 'shiba-shrine', preset: 'freeSpins' },
    { gameId: 'shiba-shrine', preset: 'lose' },
  ]

  for (const { gameId, preset, maxTries } of cases) {
    it(`forces a "${preset}" outcome on ${gameId} and reports it in the debug block`, async () => {
      const registry = createGameRegistry([pack(gameId)])
      const harness = await setup(registry)
      const math = pack(gameId).math

      const res = await debugSpinRequest(harness, {
        gameId,
        idempotencyKey: `key-${gameId}-${preset}-000001`,
        preset,
        ...(maxTries === undefined ? {} : { maxTries }),
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as SpinResponse
      expect(SpinResponseSchema.safeParse(body).success).toBe(true)

      expect(body.debug).toBeDefined()
      expect(body.debug?.preset).toBe(preset)
      expect(body.debug?.triesUsed).toBeGreaterThanOrEqual(1)

      const hasFreeSpinsTrigger = body.features.some((feature) => feature.type === 'freeSpins')
      const totalBet = body.totalBet
      switch (preset) {
        case 'win':
          expect(body.totalWin).toBeGreaterThan(0)
          expect(body.features).toHaveLength(0)
          break
        case 'bigWin':
          expect(body.totalWin).toBeGreaterThanOrEqual(10 * totalBet)
          break
        case 'freeSpins':
          expect(hasFreeSpinsTrigger).toBe(true)
          break
        case 'gamble':
          expect(body.totalWin).toBeGreaterThan(0)
          expect(body.gambleOffer).toBeDefined()
          expect(body.gambleOffer?.pendingWin).toBe(body.totalWin)
          break
        case 'lose':
          expect(body.totalWin).toBe(0)
          expect(body.features).toHaveLength(0)
          break
      }

      // 지갑/원장 불변식은 강제 스핀에서도 그대로 유지된다.
      // 더블업 제안이 열렸으면 당첨금은 에스크로로 빠져 지갑에는 보이지 않는다 (README "판돈은
      // 지갑 밖에 잠긴다" 참고) — 그래도 sum(ledger) == wallet.coins는 항상 성립해야 한다.
      const expectedCoins = body.gambleOffer ? STARTING_COINS - BET : STARTING_COINS - BET + body.totalWin
      const wallet = await harness.repos.getWallet(harness.userId)
      expect(wallet?.coins).toBe(expectedCoins)
      expect(harness.repos.getLedgerSum(harness.userId)).toBe(wallet?.coins)

      // 응답이 실제로 그 math로 재현 가능한 스핀이다 (엔진 결과를 그대로 썼다는 증거).
      expect(body.stops).toHaveLength(math.reels)
    })
  }

  it('does not change idempotency semantics: a replay omits the debug block and does not re-search', async () => {
    const registry = createGameRegistry([pack('classic-777')])
    const harness = await setup(registry)

    const first = await debugSpinRequest(harness, {
      gameId: 'classic-777',
      idempotencyKey: 'key-replay-000001',
      preset: 'lose',
    })
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as SpinResponse
    expect(firstBody.debug).toBeDefined()

    // 같은 키로 다시 요청하면(이번엔 debug 없이) 저장된 결과를 그대로 돌려받는다.
    const replay = await harness.app.request('/games/classic-777/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({ totalBet: BET, idempotencyKey: 'key-replay-000001' }),
    })
    expect(replay.status).toBe(200)
    const replayBody = (await replay.json()) as SpinResponse

    // 재전송 응답은 debug를 제외한 모든 필드가 처음과 같고, debug 자체는 다시 실리지 않는다
    // (재검색이 일어나지 않았다는 신호다).
    expect(replayBody.debug).toBeUndefined()
    const { debug: _omitted, ...firstWithoutDebug } = firstBody
    expect(replayBody).toEqual(firstWithoutDebug)

    expect(harness.repos.countLedgerEntries(harness.userId, 'spin_bet')).toBe(1)
  })

  it('rejects an unknown debug preset with 400 BAD_REQUEST', async () => {
    const registry = createGameRegistry([pack('classic-777')])
    const harness = await setup(registry)

    const res = await harness.app.request('/games/classic-777/spin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${harness.token}` },
      body: JSON.stringify({
        totalBet: BET,
        idempotencyKey: 'key-badpreset-000001',
        debug: { preset: 'not-a-real-preset' },
      }),
    })

    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('BAD_REQUEST')
  })
})
