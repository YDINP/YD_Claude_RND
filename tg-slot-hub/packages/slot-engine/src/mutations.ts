import type { GameMath, Mutation } from './schema.js'
import { evaluate, evaluateScatter } from './evaluate.js'
import { evaluateWays } from './ways.js'
import type { GridPosition, MutationEvent, Rng, SymbolId } from './types.js'

/** 가중치를 정수 눈금으로 환산할 때 쓰는 배율. 정수 가중치면 쓰지 않는다. */
const WEIGHT_SCALE = 1_000_000

/**
 * 가중 추첨. 키 순서가 결과를 좌우하므로 정렬해 결정론을 보장한다.
 *
 * `nextInt`는 정수만 주므로 가중치를 정수 눈금으로 바꿔 쓴다.
 * **가중치가 전부 정수면 그대로 쓰므로 추첨 확률이 해석식과 정확히 같다.**
 * 소수 가중치가 섞이면 100만 눈금으로 반올림하며, 이때 확률 오차는 항목당 1e-6 이하다.
 * 해석적 RTP는 원래 가중치를 그대로 쓰므로, 소수 가중치를 쓰면 그만큼 어긋난다.
 * 게임 팩이 정수 가중치를 쓰는 이유가 이것이다.
 */
function pickWeighted<T extends string | number>(weights: Record<T, number>, rng: Rng): T | undefined {
  const entries = (Object.entries(weights) as [string, number][])
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0)
  if (total <= 0) return undefined

  const exact = entries.every(([, weight]) => Number.isInteger(weight))
  const ticks = exact
    ? entries.map(([key, weight]) => [key, weight] as const)
    : entries.map(
        ([key, weight]) => [key, Math.max(1, Math.round((weight / total) * WEIGHT_SCALE))] as const,
      )
  const ceiling = ticks.reduce((acc, [, tick]) => acc + tick, 0)
  let roll = rng.nextInt(ceiling)
  for (const [key, tick] of ticks) {
    if (roll < tick) return key as T
    roll -= tick
  }
  return ticks[ticks.length - 1]?.[0] as T | undefined
}

/** 확률 p가 맞았는지. 정수 RNG만 쓰므로 100만 눈금으로 환산한다 (오차 5e-7 이하). */
function rollChance(chance: number, rng: Rng): boolean {
  return rng.nextInt(WEIGHT_SCALE) < Math.round(chance * WEIGHT_SCALE)
}

function cloneGrid(grid: SymbolId[][]): SymbolId[][] {
  return grid.map((row) => [...row])
}

function symbolAt(grid: SymbolId[][], reel: number, row: number): SymbolId | undefined {
  return grid[row]?.[reel]
}

function setSymbol(grid: SymbolId[][], reel: number, row: number, symbol: SymbolId): void {
  const line = grid[row]
  if (line !== undefined) line[reel] = symbol
}

function targetReels(math: GameMath, reels: number[] | undefined): number[] {
  if (reels === undefined) return Array.from({ length: math.reels }, (_, index) => index)
  return reels.filter((reel) => reel >= 0 && reel < math.reels)
}

interface Change {
  position: GridPosition
  from: SymbolId
  to: SymbolId
}

function applyMystery(
  math: GameMath,
  grid: SymbolId[][],
  mutation: Extract<Mutation, { type: 'mystery' }>,
  rng: Rng,
): MutationEvent | undefined {
  const cells: GridPosition[] = []
  for (let row = 0; row < math.rows; row += 1) {
    for (let reel = 0; reel < math.reels; reel += 1) {
      if (symbolAt(grid, reel, row) === mutation.symbol) cells.push([reel, row])
    }
  }
  if (cells.length === 0) return undefined

  // 스핀당 1회만 뽑는다. 칸마다 따로 뽑으면 상관이 사라져 해석식이 깨진다.
  const revealed = pickWeighted(mutation.weights, rng)
  if (revealed === undefined) return undefined

  const changes: Change[] = cells.map((position) => {
    setSymbol(grid, position[0], position[1], revealed)
    return { position, from: mutation.symbol, to: revealed }
  })
  return { type: 'mystery', symbol: revealed, cells: changes }
}

/**
 * 지급액 비교용 척도. 라운딩이 승패 판정을 뒤집지 않도록 충분히 크게 잡는다.
 * 배당 단위 1이면 배수 0.4짜리 승리가 0으로 반올림돼 "승리 없음"으로 오판된다.
 */
const WIN_PROBE_UNIT = 1_000_000

/**
 * 그리드가 지금 얼마를 지급하는지 재는 척도값. 절대 금액이 아니라 **비교용**이다.
 * 라인(또는 ways) 배당과 스캐터 배당의 상대 크기가 실제 베팅과 같도록 단위를 맞춘다.
 */
function probeWin(math: GameMath, grid: SymbolId[][]): number {
  const divisor = math.payModel === 'ways' ? (math.ways?.betDivisor ?? 25) : math.paylines.length
  const totalBet = WIN_PROBE_UNIT * Math.max(1, divisor)
  const { totalWin } =
    math.payModel === 'ways'
      ? evaluateWays(grid, math, WIN_PROBE_UNIT)
      : evaluate(grid, math, WIN_PROBE_UNIT)
  return totalWin + evaluateScatter(grid, math, totalBet).win
}

function applyExpandWild(
  math: GameMath,
  grid: SymbolId[][],
  mutation: Extract<Mutation, { type: 'expandWild' }>,
): MutationEvent | undefined {
  const scatter = math.scatter?.symbol
  const expanded: number[] = []
  const changes: Change[] = []
  // 되돌릴 수 있으려면 확장 **전** 지급액을 먼저 재야 한다. RNG는 쓰지 않는다.
  const before = mutation.onlyIfWin ? probeWin(math, grid) : 0

  for (const reel of targetReels(math, mutation.reels)) {
    let seen = 0
    for (let row = 0; row < math.rows; row += 1) {
      if (symbolAt(grid, reel, row) === mutation.symbol) seen += 1
    }
    if (seen < mutation.minCount) continue

    for (let row = 0; row < math.rows; row += 1) {
      const current = symbolAt(grid, reel, row)
      if (current === undefined || current === mutation.symbol) continue
      // 스캐터를 덮으면 프리스핀 트리거 확률이 흔들린다. 기본은 비켜 간다.
      if (!mutation.coverScatter && scatter !== undefined && current === scatter) continue
      setSymbol(grid, reel, row, mutation.symbol)
      changes.push({ position: [reel, row], from: current, to: mutation.symbol })
    }
    // 조건을 채운 릴은 이미 와일드로 가득 차 바뀐 칸이 없더라도 확장된 릴이다.
    expanded.push(reel)
  }

  if (changes.length === 0) return undefined

  // onlyIfWin: 확장이 **지급을 늘리지 못했으면** 없던 일로 되돌린다.
  // 확장 전에 이미 있던 승리는 확장의 성과가 아니므로 증가분으로 판정한다.
  // (확장 전 지급이 0이면 "확장 후 승리가 없으면 되돌린다"와 같은 규칙이 된다.)
  if (mutation.onlyIfWin && probeWin(math, grid) <= before) {
    for (const change of changes) setSymbol(grid, change.position[0], change.position[1], change.from)
    return undefined
  }

  return { type: 'expandWild', symbol: mutation.symbol, reels: expanded, cells: changes }
}

function applyUpgrade(
  math: GameMath,
  grid: SymbolId[][],
  mutation: Extract<Mutation, { type: 'upgrade' }>,
  rng: Rng,
): MutationEvent | undefined {
  const cells: GridPosition[] = []
  for (let row = 0; row < math.rows; row += 1) {
    for (let reel = 0; reel < math.reels; reel += 1) {
      if (symbolAt(grid, reel, row) === mutation.from) cells.push([reel, row])
    }
  }
  if (cells.length < mutation.minCount) return undefined
  // 확률형이면 조건을 채운 뒤에 한 번 굴린다. RNG 소비 순서를 고정하기 위해서다.
  if (mutation.chance !== undefined && !rollChance(mutation.chance, rng)) return undefined

  const changes: Change[] = cells.map((position) => {
    setSymbol(grid, position[0], position[1], mutation.to)
    return { position, from: mutation.from, to: mutation.to }
  })
  return { type: 'upgrade', symbol: mutation.to, cells: changes }
}

function applyRandomWild(
  math: GameMath,
  grid: SymbolId[][],
  mutation: Extract<Mutation, { type: 'randomWild' }>,
  rng: Rng,
): MutationEvent | undefined {
  // 확률 판정을 먼저 하고, 맞았을 때만 개수를 뽑는다.
  if (!rollChance(mutation.chance, rng)) return undefined
  const wanted = pickWeighted(mutation.countWeights, rng)
  if (wanted === undefined) return undefined
  const count = Number(wanted)
  if (!Number.isFinite(count) || count < 1) return undefined

  const scatter = math.scatter?.symbol
  const candidates: GridPosition[] = []
  for (const reel of targetReels(math, mutation.reels)) {
    for (let row = 0; row < math.rows; row += 1) {
      const current = symbolAt(grid, reel, row)
      if (current === undefined || current === mutation.symbol) continue
      if (!mutation.coverScatter && scatter !== undefined && current === scatter) continue
      candidates.push([reel, row])
    }
  }
  if (candidates.length === 0) return undefined

  // 후보가 요구 개수보다 적으면 가능한 만큼만 놓는다. 예외가 아니다.
  const drops = Math.min(count, candidates.length)
  const changes: Change[] = []
  for (let i = 0; i < drops; i += 1) {
    const index = rng.nextInt(candidates.length)
    const position = candidates[index]
    if (position === undefined) break
    candidates.splice(index, 1)
    const from = symbolAt(grid, position[0], position[1])
    if (from === undefined) continue
    setSymbol(grid, position[0], position[1], mutation.symbol)
    changes.push({ position, from, to: mutation.symbol })
  }

  if (changes.length === 0) return undefined
  return { type: 'randomWild', symbol: mutation.symbol, cells: changes }
}

export interface MutationOutcome {
  /** 변형이 끝난 그리드. 변형이 없으면 입력과 같은 내용이다. */
  grid: SymbolId[][]
  events: MutationEvent[]
}

/**
 * 정지 그리드를 평가 직전에 변형한다. 선언된 순서대로 적용하고,
 * 각 단계는 앞 단계의 결과 위에서 동작한다.
 *
 * **RNG 소비 순서는 계약이다.** 릴 정지를 모두 뽑은 뒤에 뮤테이션이 순서대로 뽑는다.
 * 같은 시드로 재생하면 정지 위치도 변형도 그대로 재현되므로 provably fair 검증이 성립한다.
 */
export function applyMutations(math: GameMath, grid: SymbolId[][], rng: Rng): MutationOutcome {
  const mutations = math.mutations
  if (mutations === undefined || mutations.length === 0) return { grid, events: [] }

  const next = cloneGrid(grid)
  const events: MutationEvent[] = []
  for (const mutation of mutations) {
    let event: MutationEvent | undefined
    switch (mutation.type) {
      case 'mystery':
        event = applyMystery(math, next, mutation, rng)
        break
      case 'expandWild':
        event = applyExpandWild(math, next, mutation)
        break
      case 'upgrade':
        event = applyUpgrade(math, next, mutation, rng)
        break
      case 'randomWild':
        event = applyRandomWild(math, next, mutation, rng)
        break
    }
    if (event !== undefined) events.push(event)
  }
  return { grid: next, events }
}

/** 뮤테이션이 RNG를 쓰는지. 해석적 RTP를 쓸 수 있는지 판단하는 데 쓴다. */
export function isProbabilistic(mutation: Mutation): boolean {
  switch (mutation.type) {
    case 'mystery':
      return true
    case 'upgrade':
      return mutation.chance !== undefined
    case 'randomWild':
      return true
    case 'expandWild':
      return false
  }
}
