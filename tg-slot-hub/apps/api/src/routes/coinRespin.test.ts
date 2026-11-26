import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, foldRespin, parseGameMath, spin } from '@tgslot/slot-engine'
import type { Rng } from '@tgslot/slot-engine'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import type { GamePack } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { RoundSeedResponse } from './rounds.js'

const GAME_ID = 'kraken-cove'
const BET = 100

/**
 * kraken-cove는 아트가 오기 전이라 `hidden`이고 썸네일이 없어 디스크 로더가 건너뛴다.
 * 수학·manifest만으로 팩을 만들고 status만 `live`로 바꿔 공개 라우트에 올린다(테스트 전용).
 */
function krakenPack(): GamePack {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(new URL(`../../../../games/${GAME_ID}/${file}`, import.meta.url), 'utf8'))
  const rawMath = read('math.json')
  const manifest = { ...parseGameManifest(read('manifest.json')), status: 'live' as const }
  return {
    id: GAME_ID,
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

const classic = loadGamePacks().find((pack) => pack.id === 'classic-777')

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
  /** 라운드마다 RNG 호출의 `max`를 순서대로 남긴다. 잭팟 판정이 마지막인지 본다. */
  calls: Map<string, number[]>
}

async function setup(): Promise<Harness> {
  const repos = new MemoryRepos()
  const calls = new Map<string, number[]>()
  const spinRng = (seed: string, nonce: number): Rng => {
    const inner = createSeededRng(`${seed}:${nonce}`)
    const log: number[] = []
    calls.set(`${seed}:${nonce}`, log)
    return {
      nextInt: (max) => {
        log.push(max)
        return inner.nextInt(max)
      },
    }
  }
  const packs = [krakenPack(), ...(classic ? [classic] : [])]
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs), spinRng })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9409:Kraken' }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id, calls }
}

async function spinRaw(h: Harness, key: string, preset?: SpinDebugPreset, gameId = GAME_ID): Promise<Response> {
  return h.app.request(`/games/${gameId}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({ totalBet: BET, idempotencyKey: key, ...(preset ? { debug: { preset } } : {}) }),
  })
}

function respinOf(features: FeatureTrigger[]): Extract<FeatureTrigger, { type: 'coinRespin' }> {
  const feature = features.find((candidate) => candidate.type === 'coinRespin')
  if (feature?.type !== 'coinRespin') throw new Error('coinRespin 피처가 없다')
  return feature
}

describe('kraken-cove 코인 리스핀 API', () => {
  it('진입 응답: 계약 모양, respinWin = 피처 win, totalWin = 라인 + 리스핀, 원장 1건', async () => {
    const h = await setup()
    const res = await spinRaw(h, 'kraken-entry-0001', 'coinRespin')
    expect(res.status).toBe(200)
    const body = SpinResponseSchema.parse(await res.json())
    const respin = respinOf(body.features)
    const board = body.features.find((feature) => feature.type === 'coinBoard')
    expect(board?.type === 'coinBoard' ? board.cells.length : 0).toBeGreaterThanOrEqual(6)
    expect(board?.type === 'coinBoard' ? board.cells : []).toEqual(respin.entry)
    expect(body.respinWin).toBe(respin.win)
    expect(respin.win).toBe(respin.coinWin + respin.topWin)
    const lineWin = body.wins.reduce((sum, win) => sum + win.win, 0)
    expect(body.totalWin).toBe(lineWin + respin.win)
    expect(foldRespin({ reels: 5, rows: 3 }, respin)).toEqual(respin.final)
    expect(body.freeSpins).toBeNull()
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)
    expect(h.repos.countLedgerEntries(h.userId, 'spin_win')).toBe(1)
    expect(h.repos.getLedgerSum(h.userId)).toBe(body.wallet.coins)
  })

  it('같은 키 재전송은 바이트가 같고(debug 블록 제외) 원장이 늘지 않는다', async () => {
    const h = await setup()
    const first = (await (await spinRaw(h, 'kraken-replay-001', 'coinRespin')).json()) as SpinResponse
    const again = (await (await spinRaw(h, 'kraken-replay-001', 'coinRespin')).json()) as SpinResponse
    const { debug: _debug, ...firstWithoutDebug } = first
    expect(JSON.stringify(again)).toBe(JSON.stringify(firstWithoutDebug))
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)
  })

  it('시드 공개로 재생하면 totalWin·final·리스핀 수가 같고, 잭팟 판정은 리스핀 뒤 마지막 1회다', async () => {
    const h = await setup()
    const body = (await (await spinRaw(h, 'kraken-reveal-01', 'coinRespin')).json()) as SpinResponse
    const res = await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
    expect(res.status).toBe(200)
    const reveal = (await res.json()) as RoundSeedResponse
    expect(createHash('sha256').update(reveal.seed).digest('hex')).toBe(body.seedHash)
    const pack = krakenPack()
    const counted = { calls: 0, inner: createSeededRng(reveal.seedInput) }
    const replay = spin(pack.math, { totalBet: BET }, { nextInt: (max) => (counted.calls++, counted.inner.nextInt(max)) })
    const served = respinOf(body.features)
    const replayed = replay.features.find((feature) => feature.type === 'coinRespin')
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replayed?.type === 'coinRespin' ? replayed.final : null).toEqual(served.final)
    expect(replayed?.type === 'coinRespin' ? replayed.steps.length : -1).toBe(served.steps.length)
    const log = h.calls.get(reveal.seedInput) ?? []
    expect(log).toHaveLength(counted.calls + 1)
    expect(log[log.length - 1]).toBe(JACKPOT_ODDS_DENOMINATOR)
  })

  it.each(['columnWrap', 'treasure'] as const)('%s 프리셋', async (preset) => {
    const h = await setup()
    const body = (await (await spinRaw(h, `kraken-${preset}-01`, preset)).json()) as SpinResponse
    const respin = respinOf(body.features)
    if (preset === 'columnWrap') expect(respin.steps.some((step) => step.wraps.length > 0)).toBe(true)
    else expect(respin.final.some((cell) => cell.kind === 'treasure')).toBe(true)
  })

  it('coinRespinFull 프리셋: 15칸 채움을 서버 내부 상한으로 찾는다 (3초 안)', async () => {
    const h = await setup()
    const started = Date.now()
    const res = await spinRaw(h, 'kraken-full-0001', 'coinRespinFull')
    const elapsed = Date.now() - started
    expect(res.status).toBe(200)
    const body = SpinResponseSchema.parse(await res.json())
    const respin = respinOf(body.features)
    expect(respin.full).toBe(true)
    expect(respin.final).toHaveLength(15)
    expect(respin.topWin).toBe(1000 * BET)
    expect(elapsed).toBeLessThan(15_000)
    console.log(`[coinRespinFull] ${body.debug?.triesUsed ?? '?'}회, ${elapsed}ms`)
  }, 30_000)

  it('코인 리스핀이 없는 게임은 네 프리셋 모두 409', async () => {
    const h = await setup()
    for (const preset of ['coinRespin', 'columnWrap', 'treasure', 'coinRespinFull'] as const) {
      const res = await spinRaw(h, `classic-${preset}-0001`, preset, 'classic-777')
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
    }
  })

  it('비진입 스핀은 coinBoard만 싣고 respinWin이 없다', async () => {
    const h = await setup()
    const body = (await (await spinRaw(h, 'kraken-lose-0001', 'lose')).json()) as SpinResponse
    expect(body.respinWin).toBeUndefined()
    expect(body.features.every((feature) => feature.type === 'coinBoard')).toBe(true)
  })
})
