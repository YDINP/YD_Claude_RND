import type { FeatureTrigger, FreeSpinsState, RoundCarry as SharedRoundCarry } from '@tgslot/shared'
import type { RoundCarry, RoundState } from '@tgslot/slot-engine'

/**
 * 저장된 세션의 수명. 이만큼 지나면 없는 것으로 본다.
 * 몇 달 전 세션이 남아 있다가 갑자기 "무료 스핀 10회"로 살아나는 일을 막는다.
 */
export const FREE_SPINS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 엔진의 스핀 간 이월 상태 → 저장·응답용 shared 모양. 카드는 값 복사본으로 옮긴다. */
export function toSharedCarry(carry: RoundCarry): SharedRoundCarry {
  return {
    ...(carry.orders
      ? {
          orders: {
            cards: carry.orders.cards.map((card) => ({
              id: card.id,
              kind: card.kind,
              ...(card.symbol === undefined ? {} : { symbol: card.symbol }),
              target: card.target,
              progress: card.progress,
              prize: card.prize,
            })),
            drawn: carry.orders.drawn,
            completed: carry.orders.completed,
            prizeTotal: carry.orders.prizeTotal,
          },
        }
      : {}),
  }
}

/** 저장된 shared 이월 상태 → 엔진 입력. 구조가 같아 값 복사만 한다. */
export function toRoundCarry(carry: SharedRoundCarry): RoundCarry {
  return toSharedCarry(carry as RoundCarry) as RoundCarry
}

/**
 * 저장된 프리스핀 세션 → 엔진이 받는 라운드 상태. 필드 이름만 옮기고 `carry`를 함께 싣는다.
 * 만료된 세션은 호출부가 애초에 넘기지 않는다(`isFreeSpinsActive`가 false면 상태 없이 돈다).
 */
export function toRoundState(freeSpins: FreeSpinsState | null): RoundState | undefined {
  if (!freeSpins) return undefined
  return {
    freeSpinsLeft: freeSpins.left,
    freeSpinsTotal: freeSpins.total,
    multiplier: freeSpins.multiplier,
    ...(freeSpins.carry ? { carry: toRoundCarry(freeSpins.carry) } : {}),
  }
}

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
  // 소진: nextState가 없거나 0이면 세션과 carry가 함께 사라진다. 만료(`isFreeSpinsActive`)도
  // 상태 없이 도는 같은 경로라 carry가 새 세션으로 새지 않는다.
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
    // carry는 **엔진이 준 것만** 옮긴다. 이전 세션의 carry를 이어 붙이지 않는다.
    ...(next.carry ? { carry: toSharedCarry(next.carry) } : {}),
  }
}

/**
 * 이번 스핀으로 세션이 끝났다면 결과 요약. 아니면 undefined.
 * `previous.total`이 리트리거까지 반영된 총 부여 횟수이므로 그대로 "돌린 횟수"가 된다.
 */
export function freeSpinsSummary(
  previous: FreeSpinsState | null,
  input: { isFreeSpin: boolean; win: number; ended: boolean; features?: readonly FeatureTrigger[] }
): { total: number; spins: number; ordersCompleted?: number; orderPrizeTotal?: number } | undefined {
  if (!input.ended || !input.isFreeSpin || !previous) return undefined
  const base = { total: previous.accumulatedWin + input.win, spins: previous.total }
  const orders = previous.carry?.orders
  if (!orders) return base
  // 마지막 스핀은 nextState가 없어 carry가 이미 사라졌다. 이전 carry에 이 스핀의 완료를 더해 맞춘다.
  const last = (input.features ?? []).filter(
    (feature): feature is Extract<FeatureTrigger, { type: 'orderComplete' }> => feature.type === 'orderComplete'
  )
  return {
    ...base,
    ordersCompleted: orders.completed + last.length,
    orderPrizeTotal: orders.prizeTotal + last.reduce((sum, feature) => sum + feature.prize, 0),
  }
}

/** 프리스핀이 남아 있고 만료되지 않은 세션인지. */
export function isFreeSpinsActive(state: FreeSpinsState | null, now: Date): boolean {
  if (state === null || state.left <= 0) return false
  if (state.expiresAt !== undefined && new Date(state.expiresAt).getTime() <= now.getTime()) return false
  return true
}
