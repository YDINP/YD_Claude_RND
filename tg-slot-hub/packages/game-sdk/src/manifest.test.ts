import { describe, expect, it } from 'vitest'
import { GameManifestSchema, parseGameManifest, toGameSummary } from './manifest.js'

const VALID = {
  id: 'classic-777',
  name: { en: 'Classic 777', ko: '클래식 777' },
  version: '1.0.0',
  thumbnail: '/games/classic-777/thumb.svg',
  status: 'live',
  reels: 3,
  rows: 3,
  lines: 5,
  betLevels: [10, 20, 50, 100, 200, 500],
  rtpTarget: 0.96,
  volatility: 'medium',
  features: ['wild'],
  sort: 0,
}

describe('GameManifestSchema', () => {
  it('올바른 manifest를 통과시킨다', () => {
    const manifest = parseGameManifest(VALID)
    expect(manifest.id).toBe('classic-777')
    expect(manifest.features).toEqual(['wild'])
  })

  it('features와 sort는 기본값을 채운다', () => {
    const { features, sort, ...rest } = VALID
    void features
    void sort
    const manifest = parseGameManifest(rest)
    expect(manifest.features).toEqual([])
    expect(manifest.sort).toBe(0)
  })

  it('status 값이 잘못되면 거부한다', () => {
    expect(GameManifestSchema.safeParse({ ...VALID, status: 'beta' }).success).toBe(false)
  })

  it('volatility 값이 잘못되면 거부한다', () => {
    expect(GameManifestSchema.safeParse({ ...VALID, volatility: 'extreme' }).success).toBe(false)
  })

  it('betLevels가 비어 있으면 거부한다', () => {
    expect(GameManifestSchema.safeParse({ ...VALID, betLevels: [] }).success).toBe(false)
  })

  it('rtpTarget이 1을 넘으면 거부한다', () => {
    expect(GameManifestSchema.safeParse({ ...VALID, rtpTarget: 1.2 }).success).toBe(false)
  })

  it('필수 필드가 없으면 거부한다', () => {
    expect(GameManifestSchema.safeParse({ id: 'x' }).success).toBe(false)
  })
})

describe('toGameSummary', () => {
  it('로비 카드용 요약으로 변환한다', () => {
    expect(toGameSummary(parseGameManifest(VALID))).toEqual({
      id: 'classic-777',
      name: { en: 'Classic 777', ko: '클래식 777' },
      thumbnail: '/games/classic-777/thumb.svg',
      status: 'live',
      reels: 3,
      rows: 3,
      lines: 5,
      minBet: 10,
      maxBet: 500,
      sort: 0,
    })
  })

  it('betLevels 순서가 뒤섞여 있어도 최소/최대를 찾는다', () => {
    const summary = toGameSummary(parseGameManifest({ ...VALID, betLevels: [200, 10, 500, 50] }))
    expect(summary.minBet).toBe(10)
    expect(summary.maxBet).toBe(500)
  })

  it('베팅 후보가 1개면 최소와 최대가 같다', () => {
    const summary = toGameSummary(parseGameManifest({ ...VALID, betLevels: [100] }))
    expect(summary.minBet).toBe(100)
    expect(summary.maxBet).toBe(100)
  })
})
