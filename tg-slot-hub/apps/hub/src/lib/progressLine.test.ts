import { describe, expect, it } from 'vitest'
import type { Level, Mission } from '@tgslot/shared'
import { formatProgressLine, isGameMission, pickProgressLine } from './progressLine'

function mission(id: string, patch: Partial<Mission> = {}): Mission {
  return {
    id,
    name: { en: `${id} en`, ko: `${id} ko` },
    target: 10,
    progress: 0,
    reward: 100,
    claimed: false,
    completed: false,
    ...patch,
  }
}

const level: Level = { level: 3, xp: 3000, nextLevelXp: 5178, maxBet: 100 }

describe('isGameMission', () => {
  it('접두사가 게임 id와 맞는 전용 미션만 true', () => {
    expect(isGameMission('classic_20', 'classic-777')).toBe(true)
    expect(isGameMission('classic_20', 'fruit-fiesta')).toBe(false)
    expect(isGameMission('spin_50', 'classic-777')).toBe(false)
    expect(isGameMission('win_3', 'classic-777')).toBe(false)
  })
})

describe('pickProgressLine', () => {
  it('1순위: 받을 미션이 있으면 안내', () => {
    const line = pickProgressLine({
      missions: [mission('a', { completed: true }), mission('b', { progress: 9 })],
      gameId: 'classic-777',
      levelInfo: level,
    })
    expect(line).toEqual({ kind: 'claim' })
  })

  it('2순위: 진행률이 가장 높은 미완료 미션', () => {
    const line = pickProgressLine({
      missions: [mission('spin_50', { progress: 5, target: 50 }), mission('win_3', { progress: 2, target: 3 })],
      gameId: 'fruit-fiesta',
      levelInfo: level,
    })
    expect(line).toMatchObject({ kind: 'mission', mission: { id: 'win_3' } })
  })

  it('이 게임 전용 미션이 있으면 진행률이 낮아도 먼저', () => {
    const line = pickProgressLine({
      missions: [mission('win_3', { progress: 2, target: 3 }), mission('classic_20', { progress: 1, target: 20 })],
      gameId: 'classic-777',
      levelInfo: level,
    })
    expect(line).toMatchObject({ kind: 'mission', mission: { id: 'classic_20' } })
  })

  it('전용 미션을 이미 끝냈으면 공용 미션으로 넘어간다', () => {
    const line = pickProgressLine({
      missions: [
        mission('classic_20', { progress: 20, target: 20, completed: true, claimed: true }),
        mission('win_3', { progress: 1, target: 3 }),
      ],
      gameId: 'classic-777',
      levelInfo: level,
    })
    expect(line).toMatchObject({ kind: 'mission', mission: { id: 'win_3' } })
  })

  it('남은 미션이 다른 게임 전용뿐이면 그 미션 대신 다음 레벨까지', () => {
    const line = pickProgressLine({
      missions: [
        mission('spin_50', { progress: 50, target: 50, completed: true, claimed: true }),
        mission('win_3', { progress: 3, target: 3, completed: true, claimed: true }),
        mission('classic_20', { progress: 0, target: 20 }),
      ],
      gameId: 'kraken-treasure',
      levelInfo: level,
    })
    expect(line).toEqual({ kind: 'level', level: 4, remainingXp: 2178 })
  })

  it('공용 미션이 남아 있으면 다른 게임 전용 미션보다 진행률이 낮아도 공용 미션', () => {
    const line = pickProgressLine({
      missions: [mission('spin_50', { progress: 1, target: 50 }), mission('classic_20', { progress: 15, target: 20 })],
      gameId: 'kraken-treasure',
      levelInfo: level,
    })
    expect(line).toMatchObject({ kind: 'mission', mission: { id: 'spin_50' } })
  })

  it('3순위: 미션을 다 받았으면 다음 레벨까지', () => {
    const line = pickProgressLine({
      missions: [mission('a', { completed: true, claimed: true })],
      gameId: 'classic-777',
      levelInfo: level,
    })
    expect(line).toEqual({ kind: 'level', level: 4, remainingXp: 2178 })
  })

  it('아무것도 없으면 null', () => {
    expect(pickProgressLine({ missions: null, gameId: 'x', levelInfo: null })).toBeNull()
  })
})

describe('formatProgressLine', () => {
  it('한국어 문구', () => {
    expect(formatProgressLine({ kind: 'claim' }, 'ko')).toBe('미션 완료! 미션 탭에서 받기')
    expect(
      formatProgressLine({ kind: 'mission', mission: mission('spin_50', { progress: 32, target: 50 }) }, 'ko'),
    ).toBe('미션 · spin_50 ko 32/50')
    expect(formatProgressLine({ kind: 'level', level: 4, remainingXp: 1240 }, 'ko')).toBe('Lv.4까지 1,240')
  })
})
