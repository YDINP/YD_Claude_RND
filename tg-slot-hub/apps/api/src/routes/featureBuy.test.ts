import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SpinResponseSchema } from '@tgslot/shared'
import type { SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, parseGameMath, spin } from '@tgslot/slot-engine'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import type { GamePack } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import type { RoundSeedResponse } from './rounds.js'
import { isoWeekKey } from '../economy/time.js'
import { listMissionDefs } from '../economy/missions.js'

const BET = 100

/** 디스크 로더는 썸네일 없는 팩을 건너뛴다. 수학·manifest만으로 팩을 만들고 공개 상태로 올린다(테스트 전용). */
function packOf(id: string): GamePack {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../../../games/${id}/${file}`, import.meta.url), 'utf8'))
  const rawMath = read('math.json')
  const manifest = { ...parseGameManifest(read('manifest.json')), status: 'live' as const }
  return {
    id,
    manifest,
    math: parseGameMath(rawMath),
    theme: emptyTheme(),
    hasTheme: false,
    prompts: null,
    fx: {},
    hasFxSource: false,
    rawFx: {},
    rawMath,
    summary: toGameSummary(manifest),
  }
}

const GAMES = ['fruit-fiesta', 'kraken-cove', 'sheriff-sixgun', 'classic-777', 'hanbok-night-market', 'idol-stage-live']
const packs = GAMES.map(packOf)
const priceOf = (id: string): number => packs.find((pack) => pack.id === id)!.math.featureBuy!.price

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

interface Harness {
  app: ReturnType<typeof createApp>
  repos: MemoryRepos
  token: string
  userId: string
}

async function setup(): Promise<Harness> {
  const repos = new MemoryRepos()
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs) })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:7707:Buyer' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

async function post(h: Harness, gameId: string, body: Record<string, unknown>): Promise<Response> {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify(body),
  })
}

const buy = (h: Harness, gameId: string, key: string, totalBet = BET) =>
  post(h, gameId, { totalBet, idempotencyKey: key, buyFeature: true })
const plain = (h: Harness, gameId: string, key: string, preset?: SpinDebugPreset) =>
  post(h, gameId, { totalBet: BET, idempotencyKey: key, ...(preset ? { debug: { preset } } : {}) })

async function coins(h: Harness): Promise<number> {
  return (await h.repos.getWallet(h.userId))!.coins
}

describe('피처 구매 API — POST /games/:id/spin { buyFeature: true }', () => {
  it('비용 = 가격 × 베팅을 한 번만 차감하고, 진입 판이 보너스를 연다(프리스핀 게임)', async () => {
    const h = await setup()
    const before = await coins(h)
    const res = await buy(h, 'fruit-fiesta', 'buy-fruit-0001')
    expect(res.status).toBe(200)
    const body = SpinResponseSchema.parse(await res.json())
    const cost = Math.round(priceOf('fruit-fiesta') * BET)
    expect(body.featureBuy).toEqual({ cost })
    expect(body.totalBet).toBe(BET)
    expect(body.isFreeSpin).toBe(false)
    expect(body.features.some((feature) => feature.type === 'freeSpins')).toBe(true)
    expect(body.freeSpins?.left).toBeGreaterThan(0)
    expect(body.freeSpins?.totalBet).toBe(BET)
    // 진입 판 베팅은 비용에 들어 있다: 잔액 변화 = −비용 + 당첨(레벨업 보너스가 있으면 더한다).
    expect(body.wallet.coins).toBe(before - cost + body.totalWin + (body.levelUp?.bonus ?? 0))
    expect(h.repos.countLedgerEntries(h.userId, 'feature_buy')).toBe(1)
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(0)
    expect(h.repos.getLedgerSum(h.userId)).toBe(body.wallet.coins)
    // 더블업은 열지 않는다.
    expect(body.gambleOffer).toBeUndefined()
  })

  it('그 판 안에서 끝나는 보너스(코인 리스핀·말판·룰렛)도 진입 판으로 산다', async () => {
    const h = await setup()
    const cases: [string, string][] = [
      ['kraken-cove', 'coinRespin'],
      ['hanbok-night-market', 'boardBonus'],
      ['idol-stage-live', 'stageRoulette'],
    ]
    for (const [gameId, type] of cases) {
      const res = await buy(h, gameId, `buy-${gameId}`)
      expect(res.status).toBe(200)
      const body = SpinResponseSchema.parse(await res.json())
      expect(body.features.some((feature) => feature.type === type)).toBe(true)
      expect(body.featureBuy?.cost).toBe(Math.round(priceOf(gameId) * BET))
    }
  })

  it('공개 시드로 평범한 유료 판을 다시 돌리면 같은 결과가 나온다(provably fair)', async () => {
    const h = await setup()
    const body = (await (await buy(h, 'fruit-fiesta', 'buy-reveal-001')).json()) as SpinResponse
    // 프리스핀을 끝까지 돌려야 시드가 공개된다.
    let left = body.freeSpins?.left ?? 0
    for (let i = 0; left > 0; i += 1) {
      const free = (await (await plain(h, 'fruit-fiesta', `buy-reveal-free-${i}`)).json()) as SpinResponse
      left = free.freeSpins?.left ?? 0
    }
    const reveal = await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
    expect(reveal.status).toBe(200)
    const seed = (await reveal.json()) as RoundSeedResponse
    const math = packs.find((pack) => pack.id === 'fruit-fiesta')!.math
    const replay = spin(math, { totalBet: BET }, createSeededRng(seed.seedInput))
    expect(replay.stops).toEqual(body.stops)
    expect(replay.totalWin).toBe(body.totalWin)
    expect(seed.seedInput).toBe(`${seed.seed}:${body.nonce}`)
  })

  it('같은 키 재전송은 같은 응답(featureBuy 포함)이고 다시 차감하지 않는다', async () => {
    const h = await setup()
    const first = await (await buy(h, 'kraken-cove', 'buy-replay-0001')).text()
    const afterFirst = await coins(h)
    const again = await buy(h, 'kraken-cove', 'buy-replay-0001')
    expect(again.status).toBe(200)
    expect(await again.text()).toBe(first)
    expect(await coins(h)).toBe(afterFirst)
    expect(h.repos.countLedgerEntries(h.userId, 'feature_buy')).toBe(1)
  })

  it('프리스핀이 이어지는 중이면 409 FEATURE_BUY_BLOCKED(FREE_SPINS_ACTIVE)이고 아무것도 차감하지 않는다', async () => {
    const h = await setup()
    await buy(h, 'fruit-fiesta', 'buy-block-0001')
    const before = await coins(h)
    const res = await buy(h, 'fruit-fiesta', 'buy-block-0002')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'FEATURE_BUY_BLOCKED', reason: 'FREE_SPINS_ACTIVE' })
    expect(await coins(h)).toBe(before)
  })

  it('더블업 판돈이 걸려 있으면 409 FEATURE_BUY_BLOCKED(GAMBLE_OPEN)', async () => {
    const h = await setup()
    const offer = (await (await plain(h, 'sheriff-sixgun', 'gamble-open-001', 'gamble')).json()) as SpinResponse
    expect(offer.gambleOffer).toBeDefined()
    const res = await buy(h, 'sheriff-sixgun', 'buy-gamble-0001')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'FEATURE_BUY_BLOCKED', reason: 'GAMBLE_OPEN' })
  })

  it('잔액이 비용보다 적으면 402, 허용되지 않은 베팅은 400 INVALID_BET, 레벨 상한 초과는 400 BET_LOCKED', async () => {
    const h = await setup()
    const big = await buy(h, 'fruit-fiesta', 'buy-funds-0001', 1000)
    expect(big.status).toBe(402)
    expect(await big.json()).toMatchObject({ code: 'INSUFFICIENT_FUNDS' })
    const invalid = await buy(h, 'fruit-fiesta', 'buy-invalid-001', 30)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_BET' })
    const locked = await buy(h, 'fruit-fiesta', 'buy-locked-0001', 200)
    expect(locked.status).toBe(400)
    expect(await locked.json()).toMatchObject({ code: 'BET_LOCKED' })
    expect(h.repos.countLedgerEntries(h.userId, 'feature_buy')).toBe(0)
  })

  it('featureBuy가 없는 게임은 409 FEATURE_BUY_UNAVAILABLE, debug와 함께 오면 400', async () => {
    const h = await setup()
    const none = await buy(h, 'classic-777', 'buy-classic-001')
    expect(none.status).toBe(409)
    expect(await none.json()).toMatchObject({ code: 'FEATURE_BUY_UNAVAILABLE' })
    const both = await post(h, 'fruit-fiesta', { totalBet: BET, idempotencyKey: 'buy-both-00001', buyFeature: true, debug: { preset: 'win' } })
    expect(both.status).toBe(400)
  })

  it('XP·리더보드·미션은 비용을 베팅액으로, 스핀 횟수는 1회로 센다', async () => {
    const h = await setup()
    const body = (await (await buy(h, 'kraken-cove', 'buy-stats-0001')).json()) as SpinResponse
    const cost = body.featureBuy!.cost
    const me = (await (await h.app.request('/me', { headers: { authorization: `Bearer ${h.token}` } })).json()) as {
      levelInfo: { xp: number }
    }
    expect(me.levelInfo.xp).toBe(cost)
    const board = await h.repos.getLeaderboard(isoWeekKey(new Date()), 10, h.userId)
    expect(board.me?.spins).toBe(1)
    expect(board.me?.bestMultiplier).toBeCloseTo(body.totalWin / cost, 6)
    for (const def of listMissionDefs().filter((candidate) => candidate.scope.kind === 'any-spin')) {
      expect(body.missions?.find((mission) => mission.id === def.id)?.progress).toBe(1)
    }
  })

  it('/math 응답에 featureBuy가 실린다', async () => {
    const h = await setup()
    const res = await h.app.request('/games/fruit-fiesta/math')
    const math = (await res.json()) as { featureBuy?: { price: number; trigger: string } }
    expect(math.featureBuy).toEqual({ price: priceOf('fruit-fiesta'), trigger: 'freeSpins' })
  })
})
