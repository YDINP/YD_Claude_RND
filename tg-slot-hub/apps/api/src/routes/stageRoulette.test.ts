import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyTheme, parseGameManifest, toGameSummary } from '@tgslot/game-sdk'
import { FeatureTriggerSchema, STARTING_COINS, SpinResponseSchema, StageRouletteFeatureSchema } from '@tgslot/shared'
import type { SpinDebugPreset, SpinResponse } from '@tgslot/shared'
import { StageRouletteConfigSchema, createSeededRng, parseGameMath, spin as engineSpin } from '@tgslot/slot-engine'
import type { GameMath, SpinResult, StageRouletteTrigger } from '@tgslot/slot-engine'
import { createApp } from '../app.js'
import { MemoryRepos } from '../repos/memory.js'
import { loadGamePacks } from '../games/packs.js'
import { createGameRegistry } from '../games/registry.js'
import type { GamePack } from '../games/packs.js'
import { findDebugSeed, isRoulettePreset, matchesDebugPreset } from '../games/debugSpin.js'
import { toSharedFeature } from '../games/engineSpin.js'
import { createRoundRng } from '../spin/provablyFair.js'
import type { RoundSeedResponse } from './rounds.js'
import type { ApiConfig } from '../config.js'

const GAME = 'idol-stage-live'
const BET = 100
const ROULETTE_PRESETS: SpinDebugPreset[] = ['roulette', 'rouletteInner', 'roulette4', 'rouletteGrand', 'rouletteBig']

const diskPacks = loadGamePacks()

function pack(id: string): GamePack {
  const found = diskPacks.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`${id} 팩이 없다`)
  return found
}

/** manifest status와 무관하게 공개 라우트에서 보이도록 live로 고정한 사본을 쓴다. */
function visible(source: GamePack): GamePack {
  return { ...source, summary: { ...source.summary, status: 'live' } }
}

/**
 * idol-stage-live는 아트(썸네일·theme)가 다른 레인에서 들어오기 전에도 수학·API를 시험해야 한다.
 * 서빙 검증(자산 존재)을 건너뛰고 manifest·math만으로 팩을 조립한다. 스키마 검증은 그대로 한다.
 */
function idolPack(): GamePack {
  const dir = new URL(`../../../../games/${GAME}/`, import.meta.url)
  const rawMath = JSON.parse(readFileSync(new URL('math.json', dir), 'utf8')) as unknown
  const manifest = parseGameManifest(JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')))
  return {
    id: GAME,
    manifest,
    math: parseGameMath(rawMath),
    theme: emptyTheme(),
    hasTheme: false,
    prompts: null,
    fx: {},
    hasFxSource: false,
    rawFx: undefined,
    rawMath,
    summary: toGameSummary(manifest),
  }
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

async function setup(packs: GamePack[], telegramId = 9101) {
  const repos = new MemoryRepos()
  const app = createApp({ config: makeConfig(), repos, games: createGameRegistry(packs) })
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: `mock:${telegramId}:RouletteTester` }),
  })
  const body = (await res.json()) as { token: string; user: { id: string } }
  return { app, repos, token: body.token, userId: body.user.id }
}

type Harness = Awaited<ReturnType<typeof setup>>

async function spinRequest(h: Harness, key: string, preset?: SpinDebugPreset, maxTries?: number) {
  return h.app.request(`/games/${GAME}/spin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
    body: JSON.stringify({
      totalBet: BET,
      idempotencyKey: key,
      ...(preset === undefined ? {} : { debug: { preset, ...(maxTries === undefined ? {} : { maxTries }) } }),
    }),
  })
}

function rouletteOf(body: SpinResponse) {
  const feature = body.features.find((f) => f.type === 'stageRoulette')
  if (feature?.type !== 'stageRoulette') throw new Error('룰렛 피처가 없다')
  return feature
}

function trigger(patch: Partial<StageRouletteTrigger> = {}): StageRouletteTrigger {
  return {
    type: 'stageRoulette',
    bonusCount: 3,
    positions: [[0, 0], [1, 1], [2, 2]],
    cheer: 2,
    cheerPositions: [[3, 0], [4, 3]],
    lit: [[5, 1], [4, 2], [2, 4]],
    startRing: 0,
    steps: [
      { ring: 0, segment: 0, kind: 'coin', lit: false, win: 400, encoreCounted: false, songsLeft: 2 },
      { ring: 0, segment: 1, kind: 'coin', lit: true, win: 1000, encoreCounted: false, songsLeft: 1 },
      { ring: 0, segment: 4, kind: 'encore', lit: false, win: 300, encoreCounted: true, songsLeft: 1 },
      { ring: 0, segment: 3, kind: 'coin', lit: false, win: 400, encoreCounted: false, songsLeft: 0 },
    ],
    total: 2100,
    endedBy: 'songs',
    ...patch,
  }
}

function result(features: SpinResult['features']): SpinResult {
  return { stops: [], gridBefore: [], grid: [], mutations: [], wins: [], lineWin: 0, scatterWin: 0, totalWin: 0, features }
}

describe('무대 룰렛 프리셋 판정', () => {
  it('룰렛 프리셋 5종을 알아본다', () => {
    for (const preset of ROULETTE_PRESETS) expect(isRoulettePreset(preset)).toBe(true)
    expect(isRoulettePreset('bigWin')).toBe(false)
  })

  it('roulette는 유료 스핀 진입, 나머지는 안쪽 도달·가운데 시작·대상·100배 조건을 본다', () => {
    const plain = result([trigger()])
    expect(matchesDebugPreset('roulette', plain, BET, false)).toBe(true)
    expect(matchesDebugPreset('roulette', plain, BET, true)).toBe(false)
    expect(matchesDebugPreset('roulette', result([]), BET, false)).toBe(false)
    expect(matchesDebugPreset('rouletteInner', plain, BET, false)).toBe(false)
    expect(matchesDebugPreset('roulette4', plain, BET, false)).toBe(false)
    expect(matchesDebugPreset('rouletteGrand', plain, BET, false)).toBe(false)
    expect(matchesDebugPreset('rouletteBig', plain, BET, false)).toBe(false)

    const inner = trigger({
      steps: [
        { ring: 0, segment: 2, kind: 'stepUp', lit: false, win: 0, encoreCounted: false, songsLeft: 3 },
        { ring: 1, segment: 1, kind: 'stepUp', lit: false, win: 0, encoreCounted: false, songsLeft: 3 },
        { ring: 2, segment: 3, kind: 'grand', lit: false, win: 12000, encoreCounted: false, songsLeft: 2 },
      ],
      total: 12000,
    })
    expect(matchesDebugPreset('rouletteInner', result([inner]), BET, false)).toBe(true)
    expect(matchesDebugPreset('rouletteGrand', result([inner]), BET, false)).toBe(true)
    expect(matchesDebugPreset('rouletteBig', result([inner]), BET, false)).toBe(true)
    expect(matchesDebugPreset('roulette4', result([trigger({ startRing: 1, bonusCount: 4 })]), BET, false)).toBe(true)
  })

  it('엔진 피처를 shared 피처로 옮기면 응답 스키마를 통과하고 값이 같다', () => {
    const shared = toSharedFeature(trigger())
    expect(FeatureTriggerSchema.safeParse(shared).success).toBe(true)
    expect(shared).toEqual(trigger())
  })
})

describe('룰렛 프리셋은 룰렛이 있는 팩에서만 탐색한다', () => {
  for (const preset of ROULETTE_PRESETS) {
    it(`${preset}: 룰렛이 없는 팩은 탐색 없이 409 DEBUG_NO_MATCH다`, async () => {
      const h = await setup([pack('classic-777')])
      const res = await h.app.request('/games/classic-777/spin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${h.token}` },
        body: JSON.stringify({ totalBet: 10, idempotencyKey: `key-noroulette-${preset}`, debug: { preset } }),
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { code: string }).code).toBe('DEBUG_NO_MATCH')
      expect((await h.repos.getWallet(h.userId))?.coins).toBe(STARTING_COINS)
    })
  }
})

describe('idol-stage-live 종단', () => {
  const idol = (): GamePack => visible(idolPack())

  it('hidden 상태에서는 공개 라우트가 404다', async () => {
    const source = idolPack()
    const h = await setup([{ ...source, summary: { ...source.summary, status: 'hidden' } }])
    const res = await spinRequest(h, 'key-idol-hidden-01')
    expect(res.status).toBe(404)
  })

  it('roulette: 진입 응답에 피처가 통째로 실리고 지갑·totalWin이 맞으며 재전송은 같은 바이트다', async () => {
    const h = await setup([idol()])
    const res = await spinRequest(h, 'key-idol-roulette-1', 'roulette')
    const text = await res.text()
    expect(res.status).toBe(200)
    const body = JSON.parse(text) as SpinResponse
    expect(SpinResponseSchema.safeParse(body).success).toBe(true)
    const roulette = rouletteOf(body)
    expect(roulette.bonusCount).toBeGreaterThanOrEqual(3)
    expect(roulette.steps.length).toBeGreaterThanOrEqual(3)
    expect(roulette.steps.length).toBeLessThanOrEqual(7)
    expect(roulette.total).toBe(roulette.steps.reduce((sum, step) => sum + step.win, 0))
    const waysWin = body.wins.reduce((sum, win) => sum + win.win, 0)
    expect(body.totalWin).toBe(waysWin + roulette.total)
    expect(body.freeSpins).toBeNull()
    expect(body.isFreeSpin).toBe(false)
    const jackpot = body.jackpotWin ?? 0
    expect(body.wallet.coins).toBe(STARTING_COINS - BET + body.totalWin + jackpot + (body.levelUp?.bonus ?? 0))

    const replay = await spinRequest(h, 'key-idol-roulette-1')
    const replayText = await replay.text()
    const { debug: _debug, ...withoutDebug } = body
    expect(replayText).toBe(JSON.stringify(withoutDebug))
  })

  it('rouletteInner·roulette4·rouletteGrand·rouletteBig을 20,000회 안에 찾는다', async () => {
    const h = await setup([idol()], 9102)
    let index = 0
    for (const preset of ['rouletteInner', 'roulette4', 'rouletteGrand', 'rouletteBig'] as const) {
      index += 1
      const res = await spinRequest(h, `key-idol-preset-${index}`, preset, 20000)
      expect(res.status, preset).toBe(200)
      const body = (await res.json()) as SpinResponse
      const roulette = rouletteOf(body)
      if (preset === 'rouletteInner') expect(roulette.steps.some((step) => step.ring === 2)).toBe(true)
      if (preset === 'roulette4') {
        expect(roulette.startRing).toBe(1)
        expect(roulette.steps[0]?.ring).toBe(1)
      }
      if (preset === 'rouletteGrand') expect(roulette.steps.some((step) => step.kind === 'grand')).toBe(true)
      if (preset === 'rouletteBig') expect(roulette.total).toBeGreaterThanOrEqual(100 * BET)
    }
  }, 30_000)

  it('공개된 시드로 엔진을 다시 돌리면 정지·회전·totalWin이 그대로 재현된다', async () => {
    const h = await setup([idol()], 9103)
    const res = await spinRequest(h, 'key-idol-seed-0001', 'roulette')
    const body = (await res.json()) as SpinResponse
    const revealRes = await h.app.request(`/rounds/${body.roundId}/seed`, {
      headers: { authorization: `Bearer ${h.token}` },
    })
    expect(revealRes.status).toBe(200)
    const reveal = (await revealRes.json()) as RoundSeedResponse
    expect(reveal.stateBefore ?? null).toBeNull()
    const replay = engineSpin(idol().math as GameMath, { totalBet: reveal.totalBet }, createSeededRng(reveal.seedInput))
    expect(replay.stops).toEqual(body.stops)
    expect(replay.totalWin).toBe(body.totalWin)
    expect(replay.features.map(toSharedFeature)).toEqual(body.features)
  })

  it('끝내 못 찾는 20,000회 탐색이 3초 안에 끝난다 (락 15초 대비)', () => {
    const started = performance.now()
    const found = findDebugSeed({
      math: idol().math,
      totalBet: BET,
      state: undefined,
      nonce: 1,
      preset: 'cascade3',
      maxTries: 20000,
      createRng: createRoundRng,
    })
    expect(found).toBeNull()
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

/**
 * shared 응답 스키마의 상한(고리 번호 ≤ 2, 칸 번호 ≤ 11, 시작 고리 ≤ 1, 회전 ≤ 12)은 엔진 스키마 상한
 * (고리 ≤ 3개, 칸 ≤ 12개, 최장 회전 ≤ 12번)을 손으로 옮긴 값이다. 한쪽만 바뀌면 이 테스트가 깨진다.
 */
describe('무대 룰렛 스키마 상한 — 엔진과 응답 계약이 같다', () => {
  const step = (ring: number, segment: number) => ({
    ring,
    segment,
    kind: 'coin' as const,
    lit: false,
    win: 100,
    encoreCounted: false,
    songsLeft: 0,
  })
  const feature = (over: { ring?: number; segment?: number; steps?: number; rings?: number; startRing?: number } = {}) => ({
    type: 'stageRoulette' as const,
    bonusCount: 3,
    positions: [],
    cheer: 0,
    cheerPositions: [],
    lit: Array.from({ length: over.rings ?? 3 }, () => [over.segment ?? 11]),
    startRing: over.startRing ?? 1,
    steps: Array.from({ length: over.steps ?? 12 }, () => step(over.ring ?? 2, over.segment ?? 11)),
    total: 1200,
    endedBy: 'songs' as const,
  })
  const ring = (segments: number) => ({
    id: `r${segments}`,
    segments: Array.from({ length: segments }, () => ({ kind: 'coin' as const, value: 1 })),
    litOrder: [],
  })
  const config = (rings: number, segments: number) => ({
    trigger: 3,
    songs: 3,
    maxEncores: 0,
    cheer: { symbol: 'x', maxLit: 0, litMultiplier: 1 },
    rings: Array.from({ length: rings }, () => ring(segments)),
  })

  it('엔진이 허용하는 가장 큰 판(고리 3·칸 12·회전 12)은 응답 스키마도 받는다', () => {
    expect(StageRouletteConfigSchema.safeParse(config(3, 12)).success).toBe(true)
    expect(StageRouletteFeatureSchema.safeParse(feature()).success).toBe(true)
  })

  it('엔진이 막는 한 칸 더(고리 4·칸 13)는 응답 스키마도 막는다', () => {
    expect(StageRouletteConfigSchema.safeParse(config(4, 12)).success).toBe(false)
    expect(StageRouletteConfigSchema.safeParse(config(3, 13)).success).toBe(false)
    expect(StageRouletteFeatureSchema.safeParse(feature({ ring: 3 })).success).toBe(false)
    expect(StageRouletteFeatureSchema.safeParse(feature({ segment: 12 })).success).toBe(false)
    expect(StageRouletteFeatureSchema.safeParse(feature({ rings: 4 })).success).toBe(false)
    expect(StageRouletteFeatureSchema.safeParse(feature({ steps: 13 })).success).toBe(false)
    expect(StageRouletteFeatureSchema.safeParse(feature({ startRing: 2 })).success).toBe(false)
  })
})
