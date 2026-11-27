import { describe, expect, it } from 'vitest'
import { WIN_TIER_MULTIPLIERS } from './constants.js'
import {
  WIN_BAND_MULTIPLIERS,
  bandHoldMs,
  bandRollupMs,
  floorMultipleLabel,
  winBandFor,
  type TimedWinBand,
} from './winBands.js'

describe('winBandFor', () => {
  it('경계값: 0 / 0.99 / 1 / 1.99 / 2 / 4.99 / 5 / 9.99 / 10', () => {
    const bet = 100
    const band = (multiple: number) => winBandFor(multiple * bet, bet)
    expect(band(0)).toBe('none')
    expect(band(0.99)).toBe('under')
    expect(band(1)).toBe('small')
    expect(band(1.99)).toBe('small')
    expect(band(2)).toBe('good')
    expect(band(4.99)).toBe('good')
    expect(band(5)).toBe('great')
    expect(band(9.99)).toBe('great')
    expect(band(10)).toBe('big')
    expect(band(250)).toBe('big')
  })

  it('프리스핀 판(paid:false)은 베팅 미만도 small로 올린다', () => {
    expect(winBandFor(5, 20, { paid: false })).toBe('small')
    expect(winBandFor(5, 20, { paid: true })).toBe('under')
    expect(winBandFor(0, 20, { paid: false })).toBe('none')
  })

  it('총 베팅을 모르면(없음·0) 올리지 않고 small로 본다', () => {
    expect(winBandFor(5)).toBe('small')
    expect(winBandFor(5, 0)).toBe('small')
    expect(winBandFor(5, -1)).toBe('small')
  })

  it('big 경계는 기존 빅윈 문턱과 같은 값이다', () => {
    expect(WIN_BAND_MULTIPLIERS.big).toBe(WIN_TIER_MULTIPLIERS.big)
  })
})

describe('시간 표', () => {
  const cases: Array<[TimedWinBand, number, number, number, number, number]> = [
    // 단계, 보통, 터보, 오토, 오토+터보, 모션 줄이기
    ['under', 600, 330, 360, 300, 450],
    ['small', 900, 495, 540, 400, 450],
    ['good', 1500, 825, 900, 495, 450],
    ['great', 2200, 1210, 1320, 726, 450],
  ]
  for (const [band, normal, turbo, brief, briefTurbo, reduced] of cases) {
    it(`${band}: 보통 ${normal} / 터보 ${turbo} / 오토 ${brief} / 오토+터보 ${briefTurbo} / 모션 줄이기 ${reduced}`, () => {
      expect(bandHoldMs(band)).toBe(normal)
      expect(bandHoldMs(band, { speed: 'quick' })).toBe(normal)
      expect(bandHoldMs(band, { speed: 'turbo' })).toBe(turbo)
      expect(bandHoldMs(band, { brief: true })).toBe(brief)
      expect(bandHoldMs(band, { speed: 'turbo', brief: true })).toBe(briefTurbo)
      expect(bandHoldMs(band, { reducedMotion: true })).toBe(reduced)
    })
  }

  it('모션 줄이기는 450ms 상한을 넘지 않는다', () => {
    for (const band of ['under', 'small', 'good', 'great'] as const) {
      expect(bandHoldMs(band, { reducedMotion: true })).toBeLessThanOrEqual(450)
      expect(bandRollupMs(band, { reducedMotion: true })).toBeLessThanOrEqual(450)
    }
  })

  it('롤업: under는 0, 나머지는 유지 시간 × 비율', () => {
    expect(bandRollupMs('under')).toBe(0)
    expect(bandRollupMs('small')).toBe(495)
    expect(bandRollupMs('good')).toBe(900)
    expect(bandRollupMs('great')).toBe(1430)
    expect(bandRollupMs('great', { speed: 'turbo' })).toBe(Math.round(1210 * 0.65))
  })

  it('단계가 오를수록 길어진다', () => {
    const holds = (['under', 'small', 'good', 'great'] as const).map((band) => bandHoldMs(band))
    expect(holds).toEqual([...holds].sort((a, b) => a - b))
  })
})

describe('floorMultipleLabel', () => {
  it('소수 첫째 자리 내림이다', () => {
    expect(floorMultipleLabel(4.96)).toBe('4.9')
    expect(floorMultipleLabel(6.5)).toBe('6.5')
    expect(floorMultipleLabel(2.8)).toBe('2.8')
    expect(floorMultipleLabel(1)).toBe('1.0')
    expect(floorMultipleLabel(9.999)).toBe('9.9')
  })
})
