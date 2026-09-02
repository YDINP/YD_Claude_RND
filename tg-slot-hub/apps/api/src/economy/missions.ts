import type { Mission } from '@tgslot/shared'
import { MISSION_DEFS } from './config.js'
import type { MissionDef } from './config.js'

/** 유저별 미션 진행도 1건. 저장소가 이 모양으로 주고받는다. */
export interface MissionProgress {
  missionId: string
  progress: number
  claimed: boolean
}

export function listMissionDefs(): readonly MissionDef[] {
  return MISSION_DEFS
}

export function findMissionDef(missionId: string): MissionDef | undefined {
  return MISSION_DEFS.find((def) => def.id === missionId)
}

/** 이 스핀이 미션 진행도를 얼마나 올리는지. 지금은 0 또는 1이다. */
export function missionIncrement(def: MissionDef, spin: { gameId: string; win: number }): number {
  switch (def.scope.kind) {
    case 'any-spin':
      return 1
    case 'winning-spin':
      return spin.win > 0 ? 1 : 0
    case 'game':
      return spin.gameId === def.scope.gameId ? 1 : 0
  }
}

/**
 * 스핀 1회로 갱신된 전체 진행도. 저장소가 트랜잭션 안에서 이 결과를 그대로 기록한다.
 * 이미 목표를 채운 미션은 더 올리지 않는다 (진행도가 target을 넘어 보이지 않게).
 */
export function applySpinToMissions(
  current: readonly MissionProgress[],
  spin: { gameId: string; win: number }
): MissionProgress[] {
  return MISSION_DEFS.map((def) => {
    const existing = current.find((row) => row.missionId === def.id)
    const progress = existing?.progress ?? 0
    const claimed = existing?.claimed ?? false
    const next = Math.min(def.target, progress + missionIncrement(def, spin))
    return { missionId: def.id, progress: next, claimed }
  })
}

/** 저장된 진행도 + 정적 정의 → API 응답 DTO. 정의에 없는 저장 행은 무시한다. */
export function toMissionDtos(current: readonly MissionProgress[]): Mission[] {
  return MISSION_DEFS.map((def) => {
    const row = current.find((candidate) => candidate.missionId === def.id)
    const progress = Math.min(def.target, row?.progress ?? 0)
    return {
      id: def.id,
      name: def.name,
      target: def.target,
      progress,
      reward: def.reward,
      claimed: row?.claimed ?? false,
      completed: progress >= def.target,
    }
  })
}
