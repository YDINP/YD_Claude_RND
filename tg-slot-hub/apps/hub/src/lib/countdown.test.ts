import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCountdown, formatRemainingLong, nextUtcMidnightIso } from './countdown'

describe('formatCountdown', () => {
  it('formats under a minute as m:ss', () => {
    expect(formatCountdown(45_000)).toBe('0:45')
  })

  it('formats several minutes as m:ss', () => {
    expect(formatCountdown(5 * 60_000 + 3_000)).toBe('5:03')
  })

  it('formats an hour or more as h:mm', () => {
    expect(formatCountdown(90 * 60_000)).toBe('1:30')
  })

  it('formats multiple hours as h:mm', () => {
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000)).toBe('3:05')
  })

  it('clamps negative/zero remaining time to 0:00', () => {
    expect(formatCountdown(-1000)).toBe('0:00')
    expect(formatCountdown(0)).toBe('0:00')
  })
})

describe('nextUtcMidnightIso', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the next UTC midnight, not local midnight (KST is UTC+9)', () => {
    // 2026-09-02T15:30:00Z는 KST(UTC+9)로는 이미 2026-09-03 00:30 — 로컬 자정 기준이었다면
    // 그 시점의 "다음 자정"이 하루 더 밀렸겠지만, 서버의 미션 day는 UTC 기준이므로
    // 이 함수는 항상 다음 UTC 자정을 가리켜야 한다.
    vi.setSystemTime(new Date('2026-09-02T15:30:00.000Z'))
    expect(nextUtcMidnightIso()).toBe('2026-09-03T00:00:00.000Z')
  })

  it('rolls over correctly at a UTC year boundary', () => {
    vi.setSystemTime(new Date('2026-12-31T23:59:59.000Z'))
    expect(nextUtcMidnightIso()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('formatRemainingLong', () => {
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('1시간 미만은 분만 보여 준다', () => {
    expect(formatRemainingLong(59 * MIN, 'ko')).toBe('59분')
    expect(formatRemainingLong(59 * MIN + 59_000, 'ko')).toBe('59분')
    expect(formatRemainingLong(0, 'ko')).toBe('0분')
  })

  it('1시간부터는 시간·분이다', () => {
    expect(formatRemainingLong(HOUR, 'ko')).toBe('1시간 0분')
    expect(formatRemainingLong(23 * HOUR + 59 * MIN, 'ko')).toBe('23시간 59분')
  })

  it('1일부터는 일·시간이다', () => {
    expect(formatRemainingLong(DAY, 'ko')).toBe('1일 0시간')
    expect(formatRemainingLong(2 * DAY + 17 * HOUR + 30 * MIN, 'ko')).toBe('2일 17시간')
  })

  it('영어 사전도 같은 경계를 따른다', () => {
    expect(formatRemainingLong(2 * DAY + 17 * HOUR, 'en')).toBe('2d 17h')
    expect(formatRemainingLong(5 * MIN, 'en')).toBe('5m')
  })
})
