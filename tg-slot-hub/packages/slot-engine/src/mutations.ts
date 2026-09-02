import type { GameMath, Mutation } from './schema.js'
import type { GridPosition, MutationEvent, Rng, SymbolId } from './types.js'

/** 가중 추첨. 키 순서가 결과를 좌우하므로 정렬해 결정론을 보장한다. */
function pickWeighted<T extends string | number>(weights: Record<T, number>, rng: Rng): T | undefined {
  const entries = (Object.entries(weights) as [string, number][])
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0)
  if (total <= 0) return undefined

  // nextInt는 정수만 주므로 가중치를 정수 눈금으로 환산해 쓴다.
  const scale = 1_000_000
  const ticks = entries.map(([key, weight]) => [key, Math.max(1, Math.round((weight / total) * scale))] as const)
  const ceiling = ticks.reduce((acc, [, tick]) => acc + tick, 0)
  let roll = rng.nextInt(ceiling)
  for (const [key, tick] of ticks) {
    if (roll < tick) return key as T
    roll -= tick
  }
  return ticks[ticks.length - 1]?.[0] as T | undefined
}

/** 확률 p가 맞았는지. 정수 RNG만 쓰므로 100만 눈금으로 환산한다. */
function rollChance(chance: number, rng: Rng): boolean {
  const scale = 1_000_000
  return rng.nextInt(scale) < Math.round(chance * scale)
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

function applyExpandWild(
  math: GameMath,
  grid: SymbolId[][],
  mutation: Extract<Mutation, { type: 'expandWild' }>,
): MutationEvent | undefined {
  const scatter = math.scatter?.symbol
  const expanded: number[] = []
  const changes: Change[] = []

  for (const reel of targetReels(math, mutation.reels)) {
    let seen = 0
    for (let row = 0; row < math.rows; row += 1) {
      if (symbolAt(grid, reel, row) === mutation.symbol) seen += 1
    }
    if (seen < mutation.minCount) continue

    let touched = false
    for (let row = 0; row < math.rows; row += 1) {
      const current = symbolAt(grid, reel, row)
      if (current === undefined || current === mutation.symbol) continue
      // 스캐터를 덮으면 프리스핀 트리거 확률이 흔들린다. 기본은 비켜 간다.
      if (!mutation.coverScatter && scatter !== undefined && current === scatter) continue
      setSymbol(grid, reel, row, mutation.symbol)
      changes.push({ position: [reel, row], from: current, to: mutation.symbol })
      touched = true
    }
    if (touched || seen >= mutation.minCount) expanded.push(reel)
  }

  if (changes.length === 0) return undefined
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
