import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SpinResponseSchema } from '@tgslot/shared'
import type { FeatureTrigger, GameStateResponse, SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { createSeededRng, foldCascades, parseGameMath, spin } from '@tgslot/slot-engine'
import type { Rng, RoundState } from '@tgslot/slot-engine'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import type { GamePack } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { ApiConfig } from '../config.js'
import { JACKPOT_ODDS_DENOMINATOR } from '../economy/config.js'
import type { RoundSeedResponse } from './rounds.js'

const GAME_ID = 'volcano-forge'
const BET = 100

/**
 * volcano-forge는 아트가 오기 전이라 `hidden`이고 썸네일이 없어 디스크 로더가 건너뛴다.
 * 수학·manifest만으로 팩을 만들고 status만 `live`로 바꿔 공개 라우트에 올린다(테스트 전용).
 */
function forgePack(): GamePack {
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
  const packs = [forgePack(), ...(classic ? [classic] : [])]
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs), spinRng })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'mock:9512:Forge' }),
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

async function spinOk(h: Harness, key: string, preset?: SpinDebugPreset): Promise<SpinResponse> {
  const res = await spinRaw(h, key, preset)
  expect(res.status).toBe(200)
  return SpinResponseSchema.parse(await res.json())
}

async function state(h: Harness): Promise<GameStateResponse> {
  const res = await h.app.request(`/games/${GAME_ID}/state`, { headers: { authorization: `Bearer ${h.token}` } })
  return (await res.json()) as GameStateResponse
}

function railOf(features: FeatureTrigger[]): Extract<FeatureTrigger, { type: 'forgeRail' }> | undefined {
  const feature = features.find((candidate) => candidate.type === 'forgeRail')
  return feature?.type === 'forgeRail' ? feature : undefined
}

function scatterOf(features: FeatureTrigger[]): number {
  const feature = features.find((candidate) => candidate.type === 'scatterWin')
  return feature?.type === 'scatterWin' ? feature.win : 0
}

describe('volcano-forge 화로 배율 줄 API', () => {
  it('forgeEmbers: 계약 모양, totalWin = boostedWin + 모루, 연쇄 접기 = finalGrid, 원장 1건', async () => {
    const h = await setup()
    const body = await spinOk(h, 'forge-embers-0001', 'forgeEmbers')
    const rail = railOf(body.features)
    expect(rail).toBeDefined()
    expect(rail!.embers.length).toBeGreaterThanOrEqual(2)
    expect(rail!.heatBefore).toBe(0)
    expect(rail!.multiplier).toBe(rail!.heatAfter)
    const baseWin = (body.cascades ?? []).reduce((sum, step) => sum + step.stepWin, 0)
    expect(rail!.baseWin).toBe(baseWin)
    expect(body.totalWin).toBe(rail!.boostedWin + scatterOf(body.features))
    expect(body.wins.every((win) => win.payKind === 'anywhere' && win.line === -1)).toBe(true)
    expect(foldCascades(body.grid, body.cascades ?? [])).toEqual(body.finalGrid)
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)
    expect(h.repos.getLedgerSum(h.userId)).toBe(body.wallet.coins)
    console.log(`[forgeEmbers] ${body.debug?.triesUsed}회, 불씨 ${rail!.embers.map((e) => e.value).join(',')} → ×${rail!.multiplier}`)
  }, 30_000)

  it('같은 키 재전송은 바이트가 같고(debug 블록 제외) 원장이 늘지 않는다', async () => {
    const h = await setup()
    const first = (await (await spinRaw(h, 'forge-replay-001', 'forgeEmbers')).json()) as SpinResponse
    const again = (await (await spinRaw(h, 'forge-replay-001', 'forgeEmbers')).json()) as SpinResponse
    const { debug: _debug, ...firstWithoutDebug } = first
    expect(JSON.stringify(again)).toBe(JSON.stringify(firstWithoutDebug))
    expect(h.repos.countLedgerEntries(h.userId, 'spin_bet')).toBe(1)
  }, 30_000)

  it('시드 공개 재생: 불씨·totalWin 일치, 잭팟 판정은 불씨 뒤 마지막 1회', async () => {
    const h = await setup()
    const body = await spinOk(h, 'forge-reveal-001', 'forgeEmbers')
    const res = await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })
    const reveal = (await res.json()) as RoundSeedResponse
    expect(createHash('sha256').update(reveal.seed).digest('hex')).toBe(body.seedHash)
    let calls = 0
    const inner = createSeededRng(reveal.seedInput)
    const replay = spin(forgePack().math, { totalBet: reveal.totalBet }, { nextInt: (max) => (calls++, inner.nextInt(max)) }, reveal.stateBefore ?? undefined)
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replay.stops).toEqual(body.stops)
    const replayed = replay.features.find((feature) => feature.type === 'forgeRail')
    expect(replayed?.type === 'forgeRail' ? replayed.embers : null).toEqual(railOf(body.features)?.embers)
    const log = h.calls.get(reveal.seedInput) ?? []
    expect(log).toHaveLength(calls + 1)
    expect(log[log.length - 1]).toBe(JACKPOT_ODDS_DENOMINATOR)
  }, 30_000)

  it('프리스핀 라운드: 진입 carry → 새로고침(state) 복원 → 이월 → 끝까지, 종료 요약에 화로 3항목', async () => {
    const h = await setup()
    const entry = await spinOk(h, 'forge-fs-entry-01', 'freeSpins')
    expect(entry.isFreeSpin).toBe(false)
    const forge = entry.freeSpins?.carry?.forge
    expect(forge).toBeDefined()
    expect(entry.freeSpins?.left).toBe(10)
    expect(entry.freeSpins?.multiplier).toBe(1)
    expect(forge!.paid).toBe(entry.totalWin)
    expect([0, 5, 10]).toContain(forge!.heat)

    // 새로고침: 서버 상태가 남은 횟수·화로 합계·켜진 칸을 그대로 준다.
    const restored = await state(h)
    expect(restored.freeSpins?.left).toBe(10)
    expect(restored.freeSpins?.carry?.forge).toEqual(forge)

    let previous = forge!
    let spins = 0
    let last: SpinResponse | undefined
    for (let i = 0; i < 40; i += 1) {
      const body = await spinOk(h, `forge-fs-spin-${String(i).padStart(3, '0')}`)
      expect(body.isFreeSpin).toBe(true)
      spins += 1
      const rail = railOf(body.features)
      expect(rail).toBeDefined()
      expect(rail!.heatBefore).toBe(previous.heat)
      expect(rail!.filledBefore).toBe(previous.filled)
      expect(rail!.multiplier).toBe(Math.max(1, rail!.heatAfter))
      expect(body.totalWin).toBe(rail!.boostedWin + scatterOf(body.features))
      last = body
      const next = body.freeSpins?.carry?.forge
      if (body.freeSpins === null) break
      expect(next?.heat).toBe(rail!.heatAfter)
      expect(next?.filled).toBe(rail!.filledAfter)
      expect(next?.paid).toBe(previous.paid + body.totalWin)
      previous = next!
    }
    expect(last?.freeSpins).toBeNull()
    const summary = last?.freeSpinsSummary
    expect(summary).toBeDefined()
    expect(summary!.spins).toBe(spins)
    expect(summary!.forgeHeat).toBe(railOf(last!.features)?.heatAfter)
    expect(summary!.forgeFulls).toBe(previous.fulls + (railOf(last!.features)?.fulls.length ?? 0))
    expect(summary!.bestSpin).toBe(Math.max(previous.bestSpin, last!.totalWin))
    expect((await state(h)).freeSpins).toBeNull()
  }, 60_000)

  it('라운드 안 forgeFull·forgeRetrigger 프리셋, 라운드 밖 forgeRetrigger는 409', async () => {
    const h = await setup()
    const outside = await spinRaw(h, 'forge-retr-out-01', 'forgeRetrigger')
    expect(outside.status).toBe(409)
    await spinOk(h, 'forge-round-0001', 'freeSpins')
    const full = await spinOk(h, 'forge-full-00001', 'forgeFull')
    expect(full.isFreeSpin).toBe(true)
    expect(railOf(full.features)!.fulls.length).toBeGreaterThanOrEqual(1)
    const retrigger = await spinOk(h, 'forge-retr-00001', 'forgeRetrigger')
    expect(retrigger.features.some((feature) => feature.type === 'freeSpins' && feature.retrigger)).toBe(true)
  }, 60_000)

  it('forgeBig: 배율 ×10 이상이 곱해진 연쇄 지급이 50배 이상', async () => {
    const h = await setup()
    const body = await spinOk(h, 'forge-big-000001', 'forgeBig')
    const rail = railOf(body.features)!
    expect(rail.multiplier).toBeGreaterThanOrEqual(10)
    expect(rail.boostedWin).toBeGreaterThanOrEqual(50 * BET)
    console.log(`[forgeBig] ${body.debug?.triesUsed}회, ×${rail.multiplier} → ${body.totalWin / BET}배`)
  }, 60_000)

  it('화로 줄이 없는 게임은 forge 프리셋 네 가지 모두 409', async () => {
    const h = await setup()
    for (const preset of ['forgeEmbers', 'forgeFull', 'forgeRetrigger', 'forgeBig'] as const) {
      const res = await spinRaw(h, `classic-${preset}-0001`, preset, 'classic-777')
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
    }
  })

  it('stateBefore가 carry.forge를 실어 프리스핀도 시드 공개로 재생된다', async () => {
    const h = await setup()
    await spinOk(h, 'forge-sb-entry-01', 'freeSpins')
    const body = await spinOk(h, 'forge-sb-free-001')
    const reveal = (await (await h.app.request(`/rounds/${body.roundId}/seed`, { headers: { authorization: `Bearer ${h.token}` } })).json()) as RoundSeedResponse
    expect(reveal.isFreeSpin).toBe(true)
    const stateBefore = reveal.stateBefore as RoundState
    expect(stateBefore.carry?.forge).toBeDefined()
    const replay = spin(forgePack().math, { totalBet: reveal.totalBet }, createSeededRng(reveal.seedInput), stateBefore)
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replay.nextState?.carry?.forge ?? null).toEqual(body.freeSpins?.carry?.forge ?? null)
  }, 30_000)
})
