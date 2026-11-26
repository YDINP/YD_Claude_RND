import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSeededRng, parseGameMath, spin } from '@tgslot/slot-engine'
import { FeatureTriggerSchema, type SpinResponse } from '@tgslot/shared'
import {
  RESPIN_REPLAY_KEY_PREFIX,
  RESPIN_REPLAY_MAX_AGE_MS,
  clearRespinReplay,
  hasCoinRespin,
  isReplayFresh,
  readRespinReplay,
  respinFeaturesMatch,
  saveRespinReplay,
} from './respinReplay'
import { useSessionStore } from '../store/session'

/** 실제 kraken-cove math.json으로 코인 리스핀 라운드 하나를 서버 응답 모양으로 만든다. */
function makeResponse(): SpinResponse {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), '..', '..', 'games', 'kraken-cove', 'math.json'), 'utf8')) as unknown
  const math = parseGameMath(raw)
  for (let i = 0; i < 60000; i += 1) {
    const result = spin(math, { totalBet: 100 }, createSeededRng(`replay:${i}`))
    if (!result.features.some((f) => f.type === 'coinRespin')) continue
    return {
      roundId: `round-${i}`,
      stops: result.stops,
      grid: result.grid,
      gridBefore: result.gridBefore,
      mutations: [],
      respinWin: result.respinWin ?? 0,
      wins: result.wins as SpinResponse['wins'],
      totalBet: 100,
      totalWin: result.totalWin,
      wallet: { coins: 10000, gems: 0 },
      seedHash: 'x'.repeat(64),
      nonce: i,
      jackpot: 1000,
      isFreeSpin: false,
      features: result.features as SpinResponse['features'],
      freeSpins: null,
    }
  }
  throw new Error('코인 리스핀 라운드를 못 찾았다')
}

const GAME = 'kraken-cove'
const KEY = `${RESPIN_REPLAY_KEY_PREFIX}${GAME}`

describe('코인 리스핀 이어 보기 저장소', () => {
  let response: SpinResponse
  beforeEach(() => {
    localStorage.clear()
    response = makeResponse()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('리스핀 응답만 저장한다', () => {
    expect(hasCoinRespin(response)).toBe(true)
    const plain: SpinResponse = { ...response, features: response.features.filter((f) => f.type !== 'coinRespin') }
    saveRespinReplay(GAME, plain)
    expect(localStorage.getItem(KEY)).toBeNull()
    saveRespinReplay(GAME, response, 1000)
    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('저장한 응답을 10분 안에 그대로 읽는다', () => {
    saveRespinReplay(GAME, response, 1000)
    const record = readRespinReplay(GAME, 1000 + 60_000)
    expect(record?.roundId).toBe(response.roundId)
    expect(record?.response.totalWin).toBe(response.totalWin)
    const original = response.features.find((f) => f.type === 'coinRespin')
    const restored = record?.response.features.find((f) => f.type === 'coinRespin')
    expect(restored).toEqual(original)
  })

  it('10분이 지나면 읽지 않고 지운다', () => {
    saveRespinReplay(GAME, response, 1000)
    expect(readRespinReplay(GAME, 1000 + RESPIN_REPLAY_MAX_AGE_MS + 1)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('경계: 정확히 10분은 아직 신선하다, 미래 시각은 신선하지 않다', () => {
    expect(isReplayFresh({ savedAt: 0 }, RESPIN_REPLAY_MAX_AGE_MS)).toBe(true)
    expect(isReplayFresh({ savedAt: 10 }, 0)).toBe(false)
    expect(isReplayFresh({ savedAt: Number.NaN }, 0)).toBe(false)
  })

  it('지우면 읽을 것이 없다', () => {
    saveRespinReplay(GAME, response, 1000)
    clearRespinReplay(GAME)
    expect(readRespinReplay(GAME, 1000)).toBeNull()
  })

  it('계정마다 따로 저장한다 — 다른 사용자로 바꾸면 남의 기록을 읽지 않는다', () => {
    const user = { id: 'alice', telegramId: 1, firstName: 'A', locale: 'ko' as const, level: 1, xp: 0 }
    useSessionStore.setState({ user })
    try {
      saveRespinReplay(GAME, response, 1000)
      expect(localStorage.getItem(`${KEY}.alice`)).not.toBeNull()
      useSessionStore.setState({ user: { ...user, id: 'bob' } })
      expect(readRespinReplay(GAME, 2000)).toBeNull()
      useSessionStore.setState({ user })
      expect(readRespinReplay(GAME, 2000)?.roundId).toBe(response.roundId)
    } finally {
      useSessionStore.setState({ user: null })
    }
  })

  it('게임마다 따로 저장한다', () => {
    saveRespinReplay(GAME, response, 1000)
    expect(readRespinReplay('other-game', 1000)).toBeNull()
  })

  it('깨진 기록은 null이고 지운다', () => {
    localStorage.setItem(KEY, '{깨진 json')
    expect(readRespinReplay(GAME)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ roundId: 'x', savedAt: Date.now(), response: { nope: true } }))
    expect(readRespinReplay(GAME)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('서버 스키마에 안 맞게 고친 응답은 재생하지 않는다', () => {
    saveRespinReplay(GAME, response, 1000)
    const record = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { response: { totalWin: unknown } }
    record.response.totalWin = 'abc'
    localStorage.setItem(KEY, JSON.stringify(record))
    expect(readRespinReplay(GAME, 1000)).toBeNull()
  })

  it('저장소가 막힌 환경에서도 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveRespinReplay(GAME, response)).not.toThrow()
    expect(readRespinReplay(GAME)).toBeNull()
    expect(() => clearRespinReplay(GAME)).not.toThrow()
  })
})

describe('시드 공개 리스핀 대조 (respinFeaturesMatch)', () => {
  /** 보물 코인이 종료 판에 있는 라운드. 엔진 셀은 tier가 맨 뒤, 서버 스키마는 tier가 amount 앞이다. */
  function treasureRound(): { engine: { type: string }[]; shown: { type: string }[] } {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), '..', '..', 'games', 'kraken-cove', 'math.json'), 'utf8')) as unknown
    const math = parseGameMath(raw)
    for (let i = 0; i < 400000; i += 1) {
      const result = spin(math, { totalBet: 100 }, createSeededRng(`match:${i}`))
      const feature = result.features.find((f) => f.type === 'coinRespin') as { final?: { kind: string }[] } | undefined
      if (feature?.final?.some((cell) => cell.kind === 'treasure') !== true) continue
      const shown = (JSON.parse(JSON.stringify(result.features)) as unknown[]).map((f) => FeatureTriggerSchema.parse(f))
      return { engine: result.features, shown }
    }
    throw new Error('보물 코인 라운드를 못 찾았다')
  }

  it('보물 코인이 낀 라운드도 서버 응답(스키마 키 순서)과 일치로 판정한다', () => {
    const { engine, shown } = treasureRound()
    expect(respinFeaturesMatch(engine, shown)).toBe(true)
  })

  it('종료 판 금액이 하나라도 다르면 불일치다', () => {
    const { engine, shown } = treasureRound()
    const tampered = JSON.parse(JSON.stringify(shown)) as { type: string; final?: { amount: number }[] }[]
    const feature = tampered.find((f) => f.type === 'coinRespin')
    if (feature?.final?.[0] === undefined) throw new Error('종료 판이 비었다')
    feature.final[0].amount += 1
    expect(respinFeaturesMatch(engine, tampered)).toBe(false)
  })

  it('양쪽 다 리스핀이 없으면 일치, 한쪽만 있으면 불일치다', () => {
    const { engine } = treasureRound()
    expect(respinFeaturesMatch([], [])).toBe(true)
    expect(respinFeaturesMatch(engine, [])).toBe(false)
  })
})
