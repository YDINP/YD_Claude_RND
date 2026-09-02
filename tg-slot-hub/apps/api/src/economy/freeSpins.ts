import type { FreeSpinsState } from '@tgslot/shared'

/** 이번 스핀이 부여한 프리스핀. 진입과 재발동을 같은 모양으로 다룬다. */
export interface FreeSpinsAward {
  spins: number
  multiplier: number
}

export interface FreeSpinsTransition {
  gameId: string
  /** 이 스핀에 적용된 베팅액. 진입 스핀이면 이 값이 세션 내내 고정된다. */
  totalBet: number
  /** 이 스핀이 프리스핀이었는지 (= 차감 없이 돌았는지) */
  isFreeSpin: boolean
  /** 이 스핀의 총 당첨 (배수가 이미 반영된 값) */
  win: number
  award?: FreeSpinsAward
}

/**
 * 프리스핀 상태 전이. **서버가 소유하는 순수 함수**이고 엔진 구현에 의존하지 않는다.
 * 엔진은 "이번 스핀이 몇 번을 몇 배로 줬는가"만 알려주고, 남은 횟수·누적 당첨·고정 베팅은
 * 여기서 계산한다. 그래야 엔진이 바뀌어도 세션 회계가 흔들리지 않는다.
 *
 * 순서가 중요하다: **먼저 이번 프리스핀을 소모**하고, 그 다음 재발동분을 더한다.
 * 반대로 하면 마지막 스핀에서 재발동이 걸렸을 때 1회를 잃는다.
 */
export function nextFreeSpinsState(
  current: FreeSpinsState | null,
  transition: FreeSpinsTransition
): FreeSpinsState | null {
  let state = current

  if (transition.isFreeSpin) {
    if (!state) throw new Error('[free-spins] 프리스핀으로 표시됐는데 세션 상태가 없다')
    state = {
      ...state,
      left: Math.max(0, state.left - 1),
      accumulatedWin: state.accumulatedWin + transition.win,
    }
  }

  if (transition.award) {
    state = state
      ? {
          // 재발동: 남은 횟수와 총 횟수에 더하고 배수는 더 큰 쪽을 남긴다.
          ...state,
          left: state.left + transition.award.spins,
          total: state.total + transition.award.spins,
          multiplier: Math.max(state.multiplier, transition.award.multiplier),
        }
      : {
          // 진입: 이 스핀의 베팅액이 세션 내내 쓰인다. 진입 스핀 자체의 당첨은 누적에 넣지 않는다.
          gameId: transition.gameId,
          left: transition.award.spins,
          total: transition.award.spins,
          multiplier: transition.award.multiplier,
          totalBet: transition.totalBet,
          accumulatedWin: 0,
        }
  }

  // 다 쓴 세션은 지운다. 클라이언트는 `freeSpins: null`을 보고 기본 게임으로 돌아간다.
  if (!state || state.left <= 0) return null
  return state
}

/** 프리스핀이 남아 있는 세션인지. 저장된 행이 있어도 `left`가 0이면 활성이 아니다. */
export function isFreeSpinsActive(state: FreeSpinsState | null): boolean {
  return state !== null && state.left > 0
}
