import { describe, expect, it } from 'vitest'
import {
  DAILY_BONUS_BY_STREAK_DAY,
  JACKPOT_HUNDREDTHS_PER_COIN,
  JACKPOT_ODDS_DENOMINATOR,
  JACKPOT_SEED_COINS,
  JACKPOT_SEED_HUNDREDTHS,
  leaderboardRewardForRank,
} from './config.js'
import { hundredthsToCoins, isJackpotHit, jackpotAccrualHundredths } from './jackpot.js'
import { dailyAmountForStreakDay, decideDaily, decideRescue, decideTimed, projectDaily } from './bonus.js'
import type { BonusClaim } from './bonus.js'
import { legacyXpForLevel, levelFromXp, levelUpBonus, maxBetForLevel, toLevelState, xpForLevel } from './level.js'
import { applySpinToMissions, toMissionDtos } from './missions.js'
import { isoWeekEnd, isoWeekKey, previousIsoWeekKey, utcDayKey } from './time.js'

function claim(iso: string, streakDay = 1): BonusClaim {
  return { kind: 'daily', claimedAt: new Date(iso), streakDay }
}

describe('시간 버킷', () => {
  it('UTC 일자 키는 로컬 타임존이 아니라 UTC를 따른다', () => {
    expect(utcDayKey(new Date('2026-09-02T23:59:59Z'))).toBe('2026-09-02')
    expect(utcDayKey(new Date('2026-09-03T00:00:00Z'))).toBe('2026-09-03')
  })

  it('ISO 주차는 월요일에 시작하고 일요일 밤까지 같은 키를 유지한다', () => {
    // 2026-08-31은 월요일, 2026-09-06은 그 주 일요일이다.
    expect(isoWeekKey(new Date('2026-08-31T00:00:00Z'))).toBe(isoWeekKey(new Date('2026-09-06T23:59:59Z')))
    expect(isoWeekKey(new Date('2026-09-07T00:00:00Z'))).not.toBe(isoWeekKey(new Date('2026-09-06T23:59:59Z')))
  })

  it('주 종료 시각은 다음 월요일 00:00 UTC다', () => {
    expect(isoWeekEnd(new Date('2026-09-02T12:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z')
  })

  it('연초 주차도 ISO 규칙(첫 목요일이 낀 주가 1주차)을 따른다', () => {
    // 2026-01-01은 목요일이므로 그 주가 2026년 1주차다.
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })
})

describe('데일리 보너스 판정', () => {
  it('처음 수령은 항상 1일차다', () => {
    expect(decideDaily(null, new Date('2026-09-02T10:00:00Z'))).toEqual({
      amount: DAILY_BONUS_BY_STREAK_DAY[0],
      streakDay: 1,
    })
  })

  it('같은 UTC 날짜에 두 번째 수령은 거부된다', () => {
    const last = claim('2026-09-02T00:30:00Z')
    expect(decideDaily(last, new Date('2026-09-02T23:30:00Z'))).toBeNull()
  })

  it('바로 다음 날이면 연속 일차가 이어진다', () => {
    const last = claim('2026-09-02T23:00:00Z', 3)
    expect(decideDaily(last, new Date('2026-09-03T00:10:00Z'))).toEqual({
      amount: DAILY_BONUS_BY_STREAK_DAY[3],
      streakDay: 4,
    })
  })

  it('하루를 건너뛰면 1일차로 리셋된다', () => {
    const last = claim('2026-09-02T12:00:00Z', 6)
    expect(decideDaily(last, new Date('2026-09-04T12:00:00Z'))).toEqual({
      amount: DAILY_BONUS_BY_STREAK_DAY[0],
      streakDay: 1,
    })
  })

  it('8일차 이후는 7일차 금액이 반복된다', () => {
    expect(dailyAmountForStreakDay(8)).toBe(3500)
    expect(dailyAmountForStreakDay(30)).toBe(3500)
  })

  it('오늘 이미 받았으면 다음 수령 시각이 내일 자정으로 나온다', () => {
    const projection = projectDaily(claim('2026-09-02T09:00:00Z', 2), new Date('2026-09-02T20:00:00Z'))
    expect(projection.claimable).toBe(false)
    expect(projection.streakDay).toBe(3)
    expect(projection.nextAvailableAt?.toISOString()).toBe('2026-09-03T00:00:00.000Z')
  })
})

describe('시간·구제 보너스 판정', () => {
  it('4시간이 지나야 다시 받을 수 있다', () => {
    const last: BonusClaim = { kind: 'timed', claimedAt: new Date('2026-09-02T10:00:00Z'), streakDay: 1 }
    expect(decideTimed(last, new Date('2026-09-02T13:59:59Z'))).toBeNull()
    expect(decideTimed(last, new Date('2026-09-02T14:00:00Z'))).toEqual({ amount: 300, streakDay: 1 })
  })

  it('코인이 10 이상이면 구제 대상이 아니다', () => {
    const now = new Date('2026-09-02T10:00:00Z')
    expect(decideRescue(null, 10, now)).toBeNull()
    expect(decideRescue(null, 9, now)).toEqual({ amount: 500, streakDay: 1 })
  })

  it('구제는 6시간 쿨다운을 갖는다', () => {
    const last: BonusClaim = { kind: 'rescue', claimedAt: new Date('2026-09-02T10:00:00Z'), streakDay: 1 }
    expect(decideRescue(last, 0, new Date('2026-09-02T15:59:59Z'))).toBeNull()
    expect(decideRescue(last, 0, new Date('2026-09-02T16:00:00Z'))).toEqual({ amount: 500, streakDay: 1 })
  })
})

describe('잭팟 경제', () => {
  const BET_LEVELS = [10, 20, 50, 100, 200, 500]

  it('적립은 1/100 코인 단위라 모든 베팅에서 정확히 1%다', () => {
    // 1/100 코인 단위에서 1% 적립은 곧 베팅액과 같은 수다 (10 베팅 -> 0.1 코인).
    expect(BET_LEVELS.map(jackpotAccrualHundredths)).toEqual(BET_LEVELS)

    for (const bet of BET_LEVELS) {
      const rate = jackpotAccrualHundredths(bet) / JACKPOT_HUNDREDTHS_PER_COIN / bet
      expect(rate).toBeCloseTo(0.01, 12)
    }
  })

  it('당첨 확률은 적립액에 비례하고 적립이 0이면 기회가 없다', () => {
    expect(isJackpotHit(0, 0)).toBe(false)
    expect(isJackpotHit(0, 1)).toBe(true)
    expect(isJackpotHit(1, 1)).toBe(false)
    // 100 베팅은 적립 100, 분모 500만이라 정확히 5만분의 1이다.
    expect(JACKPOT_ODDS_DENOMINATOR / jackpotAccrualHundredths(100)).toBe(50_000)
  })

  it('1/100 코인은 코인으로 내림해서 나간다', () => {
    expect(JACKPOT_SEED_COINS).toBe(25_000)
    expect(hundredthsToCoins(JACKPOT_SEED_HUNDREDTHS)).toBe(JACKPOT_SEED_COINS)
    expect(hundredthsToCoins(2_500_099)).toBe(25_000)
    expect(hundredthsToCoins(2_500_100)).toBe(25_001)
  })

  it('잭팟의 RTP 기여가 모든 베팅 레벨에서 1.5%다', () => {
    // 정상 상태에서 당첨 시점의 평균 풀 = 시드 + 분모 (적립 1단위당 위험률이 1/분모라
    // 리셋 이후 누적액이 평균 분모만큼 쌓인다). 단위는 1/100 코인.
    const expectedPoolAtHit = JACKPOT_SEED_HUNDREDTHS + JACKPOT_ODDS_DENOMINATOR
    expect(expectedPoolAtHit / JACKPOT_ODDS_DENOMINATOR).toBe(1.5)

    for (const bet of BET_LEVELS) {
      const hitChance = jackpotAccrualHundredths(bet) / JACKPOT_ODDS_DENOMINATOR
      const expectedPayoutCoins = (hitChance * expectedPoolAtHit) / JACKPOT_HUNDREDTHS_PER_COIN
      expect(expectedPayoutCoins / bet).toBeCloseTo(0.015, 12)
    }
  })
})

describe('레벨', () => {
  // 곡선을 바꾸기 전 규칙. 기존 사용자의 레벨·최대 베팅이 내려가지 않음을 비교하는 기준이다.
  const LEGACY_TIERS = [
    { minLevel: 6, maxBet: 500 },
    { minLevel: 3, maxBet: 200 },
    { minLevel: 1, maxBet: 100 },
  ]
  function legacyLevelFromXp(xp: number): number {
    let level = 1
    while (level < 999 && xp >= legacyXpForLevel(level + 1)) level += 1
    return level
  }
  function legacyMaxBet(level: number): number {
    return LEGACY_TIERS.find((tier) => level >= tier.minLevel)!.maxBet
  }

  it('레벨 1의 요구 xp는 0이고 레벨 2는 800이다', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(800)
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(799)).toBe(1)
    expect(levelFromXp(800)).toBe(2)
  })

  it('레벨 L2~L12 문턱이 명세 표와 같다', () => {
    const expected: Record<number, number> = {
      2: 800,
      3: 2599,
      4: 5178,
      5: 8445,
      6: 12341,
      7: 16825,
      8: 21865,
      9: 27437,
      10: 33520,
      11: 40095,
      12: 47147,
    }
    for (const [level, xp] of Object.entries(expected)) {
      expect(xpForLevel(Number(level))).toBe(xp)
    }
  })

  it('n=1..999 전부 새 문턱은 옛 문턱 이하다', () => {
    for (let n = 1; n <= 999; n += 1) {
      expect(xpForLevel(n)).toBeLessThanOrEqual(legacyXpForLevel(n))
    }
  })

  it('xp 0~2,000,000 어디서도 새 레벨 >= 옛 레벨, 새 최대 베팅 >= 옛 최대 베팅', () => {
    for (let xp = 0; xp <= 2_000_000; xp += 1000) {
      const next = levelFromXp(xp)
      const prev = legacyLevelFromXp(xp)
      expect(next).toBeGreaterThanOrEqual(prev)
      expect(maxBetForLevel(next)).toBeGreaterThanOrEqual(legacyMaxBet(prev))
    }
  })

  it('xp가 크게 튀면 여러 레벨을 한 번에 건너뛴다', () => {
    expect(levelFromXp(xpForLevel(7))).toBe(7)
    expect(levelUpBonus(7)).toBe(700)
  })

  it('레벨업 보너스는 max(300, 100 x 레벨)이다', () => {
    expect(levelUpBonus(2)).toBe(300)
    expect(levelUpBonus(4)).toBe(400)
    expect(levelUpBonus(10)).toBe(1000)
  })

  it('베팅 상한은 레벨 구간으로 해금된다', () => {
    expect([1, 2, 4].map(maxBetForLevel)).toEqual([100, 100, 100])
    expect([5, 6, 9].map(maxBetForLevel)).toEqual([200, 200, 200])
    expect([10, 12].map(maxBetForLevel)).toEqual([500, 500])
  })

  it('레벨 상태는 xp에서 파생되고 구간 시작·다음 보상·다음 해금을 채운다', () => {
    expect(toLevelState(0)).toEqual({
      level: 1,
      xp: 0,
      nextLevelXp: 800,
      maxBet: 100,
      levelStartXp: 0,
      nextLevelBonus: 300,
      nextUnlock: { level: 5, maxBet: 200 },
    })
    expect(toLevelState(9000)).toMatchObject({
      level: 5,
      levelStartXp: 8445,
      nextLevelBonus: 600,
      maxBet: 200,
      nextUnlock: { level: 10, maxBet: 500 },
    })
    expect(toLevelState(40000).level).toBe(10)
    expect(toLevelState(40000).nextUnlock).toBeNull()
  })
})

describe('리더보드 보상·지난 주 키', () => {
  it('순위별 보상 표', () => {
    expect([1, 2, 3, 4, 10, 11, 50, 51].map(leaderboardRewardForRank)).toEqual([
      10000, 6000, 4000, 2000, 2000, 800, 800, 0,
    ])
  })

  it('지난 주 키는 월요일 경계와 연말을 건넌다', () => {
    expect(previousIsoWeekKey(new Date('2026-09-07T00:00:00Z'))).toBe(isoWeekKey(new Date('2026-09-06T12:00:00Z')))
    expect(previousIsoWeekKey(new Date('2026-09-13T23:59:59Z'))).toBe(isoWeekKey(new Date('2026-09-06T12:00:00Z')))
    expect(previousIsoWeekKey(new Date('2027-01-04T00:00:00Z'))).toBe('2026-W53')
  })
})

describe('미션 진행도', () => {
  it('스핀 1회가 조건에 맞는 미션만 올린다', () => {
    const progress = applySpinToMissions([], { gameId: 'classic-777', win: 0, totalBet: 10, isFreeSpin: false })
    expect(progress).toEqual([
      { missionId: 'spin_50', progress: 1, claimed: false },
      { missionId: 'win_3', progress: 0, claimed: false },
      { missionId: 'classic_20', progress: 1, claimed: false },
    ])
  })

  it('당첨 스핀은 win_3을, 다른 게임 스핀은 classic_20을 올리지 않는다', () => {
    const progress = applySpinToMissions([], { gameId: 'fruit-fiesta', win: 250, totalBet: 10, isFreeSpin: false })
    expect(progress.find((row) => row.missionId === 'win_3')?.progress).toBe(1)
    expect(progress.find((row) => row.missionId === 'classic_20')?.progress).toBe(0)
  })

  it('베팅보다 적은 당첨은 win_3을 올리지 않고, 베팅과 같은 당첨부터 센다', () => {
    // 베팅 미만 당첨은 실제로는 손실이다(개선안 1: 손실을 당첨처럼 꾸미지 않는다).
    const under = applySpinToMissions([], { gameId: 'fruit-fiesta', win: 8, totalBet: 10, isFreeSpin: false })
    expect(under.find((row) => row.missionId === 'win_3')?.progress).toBe(0)
    const even = applySpinToMissions([], { gameId: 'fruit-fiesta', win: 10, totalBet: 10, isFreeSpin: false })
    expect(even.find((row) => row.missionId === 'win_3')?.progress).toBe(1)
    // 프리스핀은 라운드를 연 베팅과 비교한다.
    const freeUnder = applySpinToMissions([], { gameId: 'fruit-fiesta', win: 4, totalBet: 10, isFreeSpin: true })
    expect(freeUnder.find((row) => row.missionId === 'win_3')?.progress).toBe(0)
  })

  it('목표를 채운 뒤에는 진행도가 더 오르지 않는다', () => {
    const progress = applySpinToMissions([{ missionId: 'win_3', progress: 3, claimed: false }], {
      gameId: 'classic-777',
      win: 100,
      totalBet: 10,
      isFreeSpin: false,
    })
    expect(progress.find((row) => row.missionId === 'win_3')?.progress).toBe(3)
  })

  it('프리스핀은 "아무 게임 N스핀"을 채우지 않는다', () => {
    // 트리거 한 번으로 10~20칸이 공짜로 채워지면 "오늘 N번 돌기"가 의미를 잃는다.
    const progress = applySpinToMissions([], { gameId: 'classic-777', win: 250, totalBet: 10, isFreeSpin: true })

    expect(progress.find((row) => row.missionId === 'spin_50')?.progress).toBe(0)
    // 당첨 조건과 게임 지정 미션은 프리스핀도 센다.
    expect(progress.find((row) => row.missionId === 'win_3')?.progress).toBe(1)
    expect(progress.find((row) => row.missionId === 'classic_20')?.progress).toBe(1)
  })

  it('DTO는 완료 여부를 목표 대비로 계산한다', () => {
    const dtos = toMissionDtos([{ missionId: 'win_3', progress: 3, claimed: false }])
    const win3 = dtos.find((row) => row.id === 'win_3')
    expect(win3?.completed).toBe(true)
    expect(win3?.reward).toBe(500)
    expect(dtos.find((row) => row.id === 'spin_50')?.completed).toBe(false)
  })
})
