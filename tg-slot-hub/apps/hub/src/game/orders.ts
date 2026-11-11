/**
 * 주문 카드 표시용 순수 함수 — 연쇄 재생 중 화면에 보이는 진행도를 올리고, 서버 값과 맞춘다.
 * 정본은 항상 서버(`SpinResponse.freeSpins.carry.orders`)다. 여기서 계산한 값은 표시용이고
 * 스핀 응답이 오면 서버 값으로 덮인다.
 */
import type { FeatureTrigger, Locale, OrderCard } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'
import { symbolLabel } from './labels'

/** 연쇄 한 단계에서 카드로 날리는 토큰 상한. */
export const MAX_TOKENS_PER_STEP = 8

function clamp(card: OrderCard, value: number): number {
  return Math.min(card.target, Math.max(card.progress, value))
}

/** 지워진 심볼 목록으로 popSymbol 카드 진행도를 올린다. 와일드·스캐터는 카드 심볼이 아니라 자연히 세지 않는다. */
export function addPoppedSymbols(cards: readonly OrderCard[], removedSymbols: readonly string[]): OrderCard[] {
  return cards.map((card) => {
    if (card.kind !== 'popSymbol' || card.symbol === undefined) return card
    const hit = removedSymbols.filter((id) => id === card.symbol).length
    return hit === 0 ? card : { ...card, progress: clamp(card, card.progress + hit) }
  })
}

/** 연쇄 `index`(0부터) 단계에 도달했다. chainLength 카드는 한 스핀 최고치다. */
export function addChainStep(cards: readonly OrderCard[], index: number): OrderCard[] {
  return cards.map((card) =>
    card.kind === 'chainLength' && index + 1 > card.progress ? { ...card, progress: clamp(card, index + 1) } : card,
  )
}

/** 한 번에 지운 클러스터 크기. clusterSize 카드는 한 스핀 최고치다. */
export function addClusterSize(cards: readonly OrderCard[], size: number): OrderCard[] {
  return cards.map((card) =>
    card.kind === 'clusterSize' && size > card.progress ? { ...card, progress: clamp(card, size) } : card,
  )
}

/** 사다리 배수가 몇 번째 칸인지. 배수가 사다리에 없으면 단계 번호로 짚는다(마지막 칸에서 멈춘다). */
export function ladderIndexOf(ladder: readonly number[] | undefined, multiplier: number, step: number): number {
  if (ladder === undefined || ladder.length === 0) return 0
  const found = ladder.indexOf(multiplier)
  return found >= 0 ? found : Math.min(step, ladder.length - 1)
}

export interface TokenPlan {
  /** 카드 칸 인덱스(왼쪽부터). */
  slot: number
  /** 출발 칸 [reel, row]. */
  from: readonly [number, number]
}

/**
 * 이번 단계에서 날릴 토큰. 아직 안 찬 popSymbol 카드마다 남은 만큼만, 전체 합이 `max`를 넘지 않는다.
 * 카드 칸 순서대로 채운다.
 */
export function planTokens(
  cards: readonly OrderCard[],
  removed: readonly (readonly [number, number])[],
  removedSymbols: readonly string[],
  max: number = MAX_TOKENS_PER_STEP,
): TokenPlan[] {
  const plan: TokenPlan[] = []
  cards.forEach((card, slot) => {
    if (card.kind !== 'popSymbol' || card.symbol === undefined) return
    let room = card.target - card.progress
    for (let i = 0; i < removed.length && room > 0 && plan.length < max; i++) {
      const at = removed[i]
      if (removedSymbols[i] === card.symbol && at !== undefined) {
        plan.push({ slot, from: at })
        room -= 1
      }
    }
  })
  return plan
}

export interface OrderMismatch {
  slot: number
  id: string
  shown: number
  server: number
}

/**
 * 칸의 카드가 서버에서 새 카드로 바뀌었는가(완료 후 새로 깔림). id가 다르면 바뀐 것이다.
 * 같은 id가 다시 뽑힌 경우는 화면이 가득 찼는데(목표 도달) 서버 진행도가 내려간 때만 바뀐 것으로 본다.
 * 가득 차지 않았는데 서버 값이 낮은 것은 교체가 아니라 화면 값의 오차다.
 */
function isReplaced(shown: OrderCard, server: OrderCard): boolean {
  return shown.id !== server.id || (server.progress < shown.progress && shown.progress >= shown.target)
}

/** 화면 값과 서버 값이 어긋난 칸. 같은 칸의 같은 카드만 비교한다(교체된 카드는 대상이 아니다). */
export function findMismatches(shown: readonly OrderCard[], server: readonly OrderCard[]): OrderMismatch[] {
  const out: OrderMismatch[] = []
  shown.forEach((card, slot) => {
    const other = server[slot]
    if (other !== undefined && !isReplaced(card, other) && other.progress !== card.progress) {
      out.push({ slot, id: card.id, shown: card.progress, server: other.progress })
    }
  })
  return out
}

/** 서버가 새로 준 카드 중 이전 칸과 다른 칸(교체=완료 후 새로 깔림, 또는 새로 깔림). 칸 번호를 돌려준다. */
export function replacedSlots(prev: readonly OrderCard[], next: readonly OrderCard[]): number[] {
  const out: number[] = []
  const len = Math.max(prev.length, next.length)
  for (let slot = 0; slot < len; slot++) {
    const a = prev[slot]
    const b = next[slot]
    if (a === undefined || b === undefined) {
      if (a !== b) out.push(slot)
    } else if (isReplaced(a, b)) {
      out.push(slot)
    }
  }
  return out
}

export interface CompletedOrder {
  id: string
  kind: OrderCard['kind']
  symbol?: string
  target: number
  /** 지급 코인. */
  prize: number
}

/** 이번 응답의 `orderComplete` 피처를 `math.orderRound.pool`에서 카드 정보와 묶는다. */
export function completedOrders(math: GameMath | null, features: readonly FeatureTrigger[]): CompletedOrder[] {
  const out: CompletedOrder[] = []
  for (const feature of features) {
    if (feature.type !== 'orderComplete') continue
    const entry = math?.orderRound?.pool.find((p) => p.id === feature.id)
    out.push({
      id: feature.id,
      kind: entry?.kind ?? 'popSymbol',
      ...(entry?.symbol !== undefined ? { symbol: entry.symbol } : {}),
      target: entry?.target ?? 0,
      prize: feature.prize,
    })
  }
  return out
}

type OrderLabelKey = 'orderCardPop' | 'orderCardCluster' | 'orderCardChain'

type Translate = (key: OrderLabelKey | 'orderCardPopNamed', vars?: Record<string, string | number>) => string

/** 카드 문구. 좁은 카드용은 짧게(`named: false`), WinStrip 한 줄은 심볼 이름을 붙인다. */
export function orderCardText(
  card: Pick<OrderCard, 'kind' | 'symbol' | 'target'>,
  math: GameMath | null,
  locale: Locale,
  t: Translate,
  named = false,
): string {
  if (card.kind === 'popSymbol') {
    if (named && card.symbol !== undefined && math) {
      return t('orderCardPopNamed', { name: symbolLabel(math, card.symbol, locale), n: card.target })
    }
    return t('orderCardPop', { n: card.target })
  }
  if (card.kind === 'clusterSize') return t('orderCardCluster', { n: card.target })
  return t('orderCardChain', { n: card.target })
}
