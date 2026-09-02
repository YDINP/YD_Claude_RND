import type { FreeSpinsState } from '@tgslot/shared'
import type { RoundState } from '@tgslot/slot-engine'

/**
 * 저장된 세션의 수명. 이만큼 지나면 없는 것으로 본다.
 * 몇 달 전 세션이 남아 있다가 갑자기 "무료 스핀 10회"로 살아나는 일을 막는다.
 */
export const FREE_SPINS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface FreeSpinsWrap {
  gameId: string
  /** 이 스핀에 적용된 베팅액. 진입 스핀이면 이 값이 세션 내내 고정된다. */
  totalBet: number
  /** 이 스핀이 프리스핀이었는지 */
  isFreeSpin: boolean
  /** 이 스핀의 총 당첨 (배수가 이미 반영된 값) */
  win: number
  /** **엔진이 계산한** 다음 라운드 상태. 없으면 세션이 끝났다는 뜻이다. */
  nextState: RoundState | undefined
  now: Date
}

/**
 * 엔진의 라운드 상태를 서버 세션으로 감싼다.
 *
 * **남은 횟수·총 횟수·배수는 엔진이 결정한다.** 소진과 리트리거 계산이 엔진 안에 있으므로
 * 서버가 같은 로직을 또 갖고 있으면 둘이 어긋나는 순간 아무도 어느 쪽이 맞는지 모른다.
 * 서버가 얹는 것은 엔진이 모르는 두 가지뿐이다: 진입 시점에 고정된 베팅액과 누적 당첨.
 */
export function wrapFreeSpinsState(previous: FreeSpinsState | null, input: FreeSpinsWrap): FreeSpinsState | null {
  const next = input.nextState
  if (!next || next.freeSpinsLeft <= 0) return null

  return {
    gameId: input.gameId,
    left: next.freeSpinsLeft,
    total: next.freeSpinsTotal,
    multiplier: next.multiplier,
    // 진입 스핀에서 정해진 베팅을 세션 내내 유지한다.
    totalBet: previous?.totalBet ?? input.totalBet,
    // 진입 스핀의 당첨은 세션 누적에 넣지 않는다 (그 스핀은 유료였다).
    accumulatedWin: (previous?.accumulatedWin ?? 0) + (input.isFreeSpin ? input.win : 0),
    expiresAt: new Date(input.now.getTime() + FREE_SPINS_TTL_MS).toISOString(),
  }
}

/**
 * 이번 스핀으로 세션이 끝났다면 결과 요약. 아니면 undefined.
 * `previous.total`이 리트리거까지 반영된 총 부여 횟수이므로 그대로 "돌린 횟수"가 된다.
 */
export function freeSpinsSummary(
  previous: FreeSpinsState | null,
  input: { isFreeSpin: boolean; win: number; ended: boolean }
): { total: number; spins: number } | undefined {
  if (!input.ended || !input.isFreeSpin || !previous) return undefined
  return { total: previous.accumulatedWin + input.win, spins: previous.total }
}

/** 프리스핀이 남아 있고 만료되지 않은 세션인지. */
export function isFreeSpinsActive(state: FreeSpinsState | null, now: Date): boolean {
  if (state === null || state.left <= 0) return false
  if (state.expiresAt !== undefined && new Date(state.expiresAt).getTime() <= now.getTime()) return false
  return true
}
