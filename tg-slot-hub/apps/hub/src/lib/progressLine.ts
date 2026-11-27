/**
 * 게임 화면 당첨 패널의 «빈 시간» 한 줄 — 꽝 판 뒤나 진입 직후에 지금 가장 가까운 목표를 알려 준다.
 * 순수 함수: 상태를 읽지 않고 입력만으로 어떤 줄을 보일지 정한다(문구는 formatProgressLine이 만든다).
 *
 * 우선순위: ① 받을 미션 > ② 진행률이 가장 높은 미완료 미션(이 게임 전용이 있으면 그것 먼저) > ③ 다음 레벨까지 남은 xp
 * 다른 게임 전용 미션은 여기서 돌려도 오르지 않으므로 고르지 않는다(«클래식 777에서 20회 0/20»이 계속 떠 있지 않게).
 */
import type { Level, Locale, Mission } from '@tgslot/shared'
import { t as translate } from '../i18n'

export type ProgressLine =
  | { kind: 'claim' }
  | { kind: 'mission'; mission: Mission }
  | { kind: 'level'; level: number; remainingXp: number }

/**
 * 미션 id가 이 게임 전용인지. 전용 미션 id는 `<게임 접두사>_<목표>` 꼴이다(예: `classic_20` -> `classic-777`).
 * `spin_50`·`win_3` 같은 공용 미션은 어느 게임 id와도 맞지 않는다.
 */
export function isGameMission(missionId: string, gameId: string): boolean {
  const prefix = missionId.split('_')[0] ?? ''
  if (prefix === '') return false
  return gameId === prefix || gameId.startsWith(`${prefix}-`)
}

/** 어느 게임에서 돌려도 오르는 공용 미션의 id 접두사(apps/api economy/config.ts MISSION_DEFS의 any-spin·winning-spin). */
const SHARED_MISSION_PREFIXES: readonly string[] = ['spin', 'win']

export function isSharedMission(missionId: string): boolean {
  return SHARED_MISSION_PREFIXES.includes(missionId.split('_')[0] ?? '')
}

function progressRatio(mission: Mission): number {
  return mission.target > 0 ? mission.progress / mission.target : 1
}

export function pickProgressLine(input: {
  missions: Mission[] | null | undefined
  gameId: string
  levelInfo: Level | null | undefined
}): ProgressLine | null {
  const missions = input.missions ?? []

  if (missions.some((m) => m.completed && !m.claimed)) return { kind: 'claim' }

  const open = missions.filter((m) => !m.completed)
  if (open.length > 0) {
    // 이 게임 전용 미션이 하나라도 남아 있으면 그 안에서만 고른다. 없으면 공용 미션. 동률이면 목록 앞쪽.
    const own = open.filter((m) => isGameMission(m.id, input.gameId))
    const pool = own.length > 0 ? own : open.filter((m) => isSharedMission(m.id))
    if (pool.length > 0) {
      let best = pool[0]!
      for (const m of pool) if (progressRatio(m) > progressRatio(best)) best = m
      return { kind: 'mission', mission: best }
    }
  }

  const info = input.levelInfo
  if (info) {
    return { kind: 'level', level: info.level + 1, remainingXp: Math.max(0, info.nextLevelXp - info.xp) }
  }
  return null
}

/** 화면에 그릴 문구 */
export function formatProgressLine(line: ProgressLine, locale: Locale): string {
  switch (line.kind) {
    case 'claim':
      return translate(locale, 'progressLineClaim')
    case 'mission': {
      const { mission } = line
      const name = locale === 'ko' && mission.name.ko ? mission.name.ko : mission.name.en
      return translate(locale, 'progressLineMission', {
        name,
        progress: Math.min(mission.progress, mission.target).toLocaleString('en-US'),
        target: mission.target.toLocaleString('en-US'),
      })
    }
    case 'level':
      return translate(locale, 'progressLineLevel', {
        level: line.level,
        xp: line.remainingXp.toLocaleString('en-US'),
      })
  }
}
