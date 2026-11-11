import { pickWeighted } from './random.js'
import type { GameMath } from './schema.js'
import type { CascadeOutcome, OrderCard, Rng } from './types.js'

/** 이번 스핀이 카드에 보태는 값. popSymbol은 더하고, 나머지는 한 스핀 기록과 비교한다. */
function spinValue(card: OrderCard, outcome: CascadeOutcome): number {
  switch (card.kind) {
    case 'popSymbol':
      return card.symbol === undefined ? 0 : (outcome.removedBySymbol[card.symbol] ?? 0)
    case 'clusterSize':
      return outcome.maxClusterSize
    case 'chainLength':
      return outcome.steps.length
  }
}

/**
 * 스핀 하나의 연쇄 결과로 주문 진행을 갱신한다. RNG를 쓰지 않는 순수 함수다.
 *
 * - popSymbol: `progress += removedBySymbol[symbol]` (스핀 사이 누적, 와일드는 세지 않음)
 * - clusterSize: `maxClusterSize`가 target 이상이면 완료
 * - chainLength: `steps.length`가 target 이상이면 완료
 *
 * `progress`는 target을 넘지 않는다. clusterSize/chainLength의 progress는 라운드 중 최고 기록이다.
 * `cards`는 입력과 같은 칸 순서이고 완료 카드도 그 자리에 남는다(`progress === target`).
 * 칸 비우기·새 카드 추첨·`maxOrders` 판정은 호출하는 쪽(spin)이 한다.
 * `completed`는 이번 스핀에 새로 완료된 카드를 왼쪽 칸부터 담는다. 이미 완료돼 있던 카드는 다시 넣지 않는다.
 */
export function tallyOrders(
  cards: readonly OrderCard[],
  outcome: CascadeOutcome,
): { cards: OrderCard[]; completed: OrderCard[] } {
  const next: OrderCard[] = []
  const completed: OrderCard[] = []
  for (const card of cards) {
    if (card.progress >= card.target) {
      next.push({ ...card })
      continue
    }
    const value = spinValue(card, outcome)
    const reached = card.kind === 'popSymbol' ? card.progress + value : Math.max(card.progress, value)
    const updated: OrderCard = { ...card, progress: Math.min(card.target, reached) }
    next.push(updated)
    if (updated.progress >= updated.target) completed.push(updated)
  }
  return { cards: next, completed }
}

/**
 * 주문 카드를 `count`장 뽑는다. 장당 `pickWeighted` 1회이고, `active`에 있는 id와 이미 뽑은 id는 제외한다.
 * 후보가 모자라면 뽑을 수 있는 만큼만 돌려준다(RNG 호출도 그만큼). 새 카드의 progress는 0이다.
 */
export function drawOrderCards(
  math: GameMath,
  active: readonly OrderCard[],
  count: number,
  rng: Rng,
): OrderCard[] {
  const config = math.orderRound
  if (config === undefined) throw new RangeError('orderRound 설정이 없는 게임에 drawOrderCards를 호출했다')
  const taken = new Set(active.map((card) => card.id))
  const drawn: OrderCard[] = []
  for (let n = 0; n < count; n += 1) {
    const weights: Record<string, number> = {}
    for (const entry of config.pool) if (!taken.has(entry.id)) weights[entry.id] = entry.weight
    const id = pickWeighted(weights, rng)
    if (id === undefined) break
    const entry = config.pool.find((candidate) => candidate.id === id)
    if (entry === undefined) break
    taken.add(id)
    const card: OrderCard = { id: entry.id, kind: entry.kind, target: entry.target, progress: 0, prize: entry.prize }
    if (entry.symbol !== undefined) card.symbol = entry.symbol
    drawn.push(card)
  }
  return drawn
}
