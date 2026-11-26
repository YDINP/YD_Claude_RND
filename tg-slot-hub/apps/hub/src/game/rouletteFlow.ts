/**
 * 무대 룰렛 한 판의 «바깥 흐름» — 스핀 응답을 받은 뒤 화면 전체가 어떤 단계를 지나는지.
 *
 *   pre     응원봉 칩만 보인다. 릴 위에서 초대권·응원봉 강조가 돈다(렌더러 `showWins` 첫 바퀴).
 *   curtain 진입 클립이 화면을 덮고 걷히는 동안. 오버레이는 숨는다.
 *   show    판이 떠올라 돌리기·결과·요약이 진행된다(`StageRoulette`).
 *   exit    요약이 닫혔다. 퇴장 클립이 덮는 동안 오버레이는 사라진다.
 *
 * 이 모듈은 상태 모양과 순수 판정만 가진다. 렌더러 호출·타이머는 store가 한다(테스트가 가짜로 갈아 끼운다).
 */
import type { StageRouletteFeature } from '@tgslot/shared'

export type RouletteStage = 'pre' | 'curtain' | 'show' | 'exit'

export interface RouletteSession {
  gameId: string
  roundId: string
  feature: StageRouletteFeature
  totalBet: number
  /** 룰렛을 뺀 지급(기본 ways). `totalWin - feature.total`. */
  baseWin: number
  totalWin: number
  /** 이미 끝까지 본 회전 수(이어 보기). 처음이면 0. */
  startAt: number
  /** 새로고침 뒤 이어 보는 중이면 true — «무대 룰렛 이어 보기» 문구를 잠깐 보인다. */
  resumed: boolean
  stage: RouletteStage
}

/** 스핀 응답에서 룰렛 진입 피처를 찾는다. 없으면 null. */
export function findRouletteFeature(features: readonly { type: string }[]): StageRouletteFeature | null {
  const found = features.find((f) => f.type === 'stageRoulette')
  return found === undefined ? null : (found as StageRouletteFeature)
}

/** 응답 → 세션. 룰렛 합이 `totalWin`보다 크면(계약 위반) 기본 지급을 0으로 접는다. */
export function sessionFromResult(
  gameId: string,
  result: { roundId: string; totalBet: number; totalWin: number },
  feature: StageRouletteFeature,
): RouletteSession {
  return {
    gameId,
    roundId: result.roundId,
    feature,
    totalBet: result.totalBet,
    baseWin: Math.max(0, result.totalWin - feature.total),
    totalWin: result.totalWin,
    startAt: 0,
    resumed: false,
    stage: 'pre',
  }
}

/** 렌더러가 룰렛 모드로 들어갈 때 넘기는 모드. 릴 자리는 DOM 오버레이가 쓰므로 릴을 감춘다. */
export function rouletteRendererMode(songs: number): {
  freeSpins: { left: number; total: number; multiplier: number }
  hideReels: true
} {
  return { freeSpins: { left: songs, total: songs, multiplier: 1 }, hideReels: true }
}
