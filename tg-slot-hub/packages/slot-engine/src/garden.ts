import { evaluateClusters } from './cluster.js'
import { payoutForCount } from './evaluate.js'
import { pickWeighted } from './random.js'
import type { GameMath } from './schema.js'
import type { GardenSeedEntry, GrowBoardConfig } from './gardenSchema.js'
import type {
  GardenBounds,
  GardenCarry,
  GardenGrow,
  GardenRoundStats,
  GardenSeed,
  GardenStep,
  GardenSun,
  GardenTrigger,
} from './gardenTypes.js'
import type { FeatureTrigger, GridPosition, RoundState, Rng, SpinResult, SymbolId, WinLine } from './types.js'

/**
 * 자라는 정원(growBoard) 엔진. 기획서 `docs/PLAN_greenhouse-garden.md` §2~§4.
 *
 * RNG 소비 계약(시드 공개 재생과 감사가 이 순서에 기대므로 바꾸지 말 것):
 * 1. 릴 정지 8회(열 0→7, `spinUnchecked`가 기본 스트립 길이로 뽑는다)
 * 2. 단계 루프(평가·팝·중력·리필 0회) — 성장할 때마다 새 칸마다 씨앗 추첨 1회(행 오름차순, 같은 행은 열 오름차순)
 * 3. 스캐터 판정 0회
 * 4. [프리스핀] 햇살마다 심을 자리 추첨 `sunPlant`회(씨앗 없는 활성 칸 목록에서 `nextInt(남은 수)`)
 * 5. [API] 잭팟 판정 1회
 * 프리스핀 시작 때 판을 `minStartSize`로 올리는 것은 범위만 바꾸고 RNG를 쓰지 않는다.
 */

/** 성장 단계 → 활성 범위. ㄱ자 겹을 오른쪽 위·왼쪽 아래에 번갈아 붙여 판이 한쪽으로 쏠리지 않는다(§2-1). */
const STAGES: readonly GardenBounds[] = [
  { x: 2, y: 2, size: 4 },
  { x: 2, y: 1, size: 5 },
  { x: 1, y: 1, size: 6 },
  { x: 1, y: 0, size: 7 },
  { x: 0, y: 0, size: 8 },
]

/** 마지막 성장 단계(8×8). */
export const GARDEN_MAX_STAGE = STAGES.length - 1

/** 단계(0~4)의 활성 범위. 복사본을 준다. */
export function gardenBoundsFor(stage: number): GardenBounds {
  const bounds = STAGES[stage]
  if (bounds === undefined) throw new RangeError(`정원 단계 ${stage}는 0..${GARDEN_MAX_STAGE} 밖이다`)
  return { ...bounds }
}

/** 한 변(4~8) → 단계. */
export function gardenStageForSize(size: number): number {
  const stage = STAGES.findIndex((bounds) => bounds.size === size)
  if (stage < 0) throw new RangeError(`정원 판 한 변 ${size}는 4..8 밖이다`)
  return stage
}

export function inGardenBounds(bounds: GardenBounds, reel: number, row: number): boolean {
  return reel >= bounds.x && reel < bounds.x + bounds.size && row >= bounds.y && row < bounds.y + bounds.size
}

/** `from`에서 `to`로 자랄 때 새로 열리는 칸. 씨앗 추첨 순서와 같다(행 오름차순, 같은 행은 열 오름차순). */
export function gardenNewCells(from: GardenBounds, to: GardenBounds): GridPosition[] {
  const cells: GridPosition[] = []
  for (let row = to.y; row < to.y + to.size; row += 1) {
    for (let reel = to.x; reel < to.x + to.size; reel += 1) {
      if (!inGardenBounds(from, reel, row)) cells.push([reel, row])
    }
  }
  return cells
}

function sortSeeds(seeds: GardenSeed[]): GardenSeed[] {
  return seeds.sort((a, b) => a.row - b.row || a.reel - b.reel)
}

function cloneSeeds(seeds: readonly GardenSeed[]): GardenSeed[] {
  return seeds.map((seed) => ({ reel: seed.reel, row: seed.row, tier: seed.tier }))
}

function sameBounds(a: GardenBounds, b: GardenBounds): boolean {
  return a.x === b.x && a.y === b.y && a.size === b.size
}

/**
 * 정원 1단계의 «팝 → 활성 범위 안 중력 → 리필»을 입힌다. `grid[row][reel]`. 입력은 건드리지 않는다.
 * `bounds`는 **이 단계 시작** 활성 범위다(성장은 중력 뒤에 일어난다). 범위 밖 칸(덮인 화분)은 그대로 둔다.
 * 엔진·API·렌더러가 모두 이 함수로 다음 판을 만든다. 어긋난 단계는 조용히 넘기지 않고 던진다.
 */
export function applyGardenStep(
  grid: readonly (readonly SymbolId[])[],
  bounds: GardenBounds,
  step: Pick<GardenStep, 'index' | 'removed' | 'refill'>,
): SymbolId[][] {
  const next = grid.map((row) => [...row])
  if (step.removed.length === 0) {
    if (step.refill.some((column) => column.length > 0)) {
      throw new RangeError(`정원 단계 ${step.index}: 지운 칸이 없는데 refill이 있다`)
    }
    return next
  }
  const { x, y, size } = bounds
  const gone = new Set<number>()
  for (const [reel, row] of step.removed) {
    if (!inGardenBounds(bounds, reel, row)) {
      throw new RangeError(`정원 단계 ${step.index}: 지울 칸 [${reel}, ${row}]이 활성 범위 밖이다`)
    }
    gone.add(row * 64 + reel)
  }
  if (step.refill.length !== size) {
    throw new RangeError(`정원 단계 ${step.index}: refill 열 수(${step.refill.length})가 활성 한 변(${size})과 다르다`)
  }
  for (let column = 0; column < size; column += 1) {
    const reel = x + column
    const kept: SymbolId[] = []
    for (let row = y; row < y + size; row += 1) {
      if (!gone.has(row * 64 + reel)) kept.push(grid[row]?.[reel] as SymbolId)
    }
    const refill = step.refill[column] ?? []
    if (refill.length !== size - kept.length) {
      throw new RangeError(
        `정원 단계 ${step.index}: 열 ${reel} refill(${refill.length})이 지워진 칸 수(${size - kept.length})와 다르다`,
      )
    }
    const filled = [...refill, ...kept]
    for (let k = 0; k < size; k += 1) (next[y + k] as SymbolId[])[reel] = filled[k] as SymbolId
  }
  return next
}

/** 씨앗 등급을 한 단계씩 올린다(최고 등급에서 멈춤). 실제로 오른 수를 준다. */
function growSeeds(seeds: GardenSeed[], maxTier: number): number {
  let grown = 0
  for (const seed of seeds) {
    if (seed.tier < maxTier) {
      seed.tier += 1
      grown += 1
    }
  }
  return grown
}

export interface GardenFold {
  grid: SymbolId[][]
  bounds: GardenBounds
  seeds: GardenSeed[]
}

/**
 * 단계를 순서대로 접는다. 결과 `grid`는 엔진의 `finalGrid`, `seeds`는 햇살 전 씨앗과 같아야 한다.
 * 렌더러가 단계마다 판·범위·씨앗을 되살리는 데도 쓴다. `maxTier`는 `seedTiers.length - 1`.
 */
export function foldGarden(
  grid: readonly (readonly SymbolId[])[],
  start: GardenBounds,
  steps: readonly GardenStep[],
  startSeeds: readonly GardenSeed[] = [],
  maxTier = Number.POSITIVE_INFINITY,
): GardenFold {
  let current = grid.map((row) => [...row])
  let bounds = { ...start }
  let seeds = cloneSeeds(startSeeds)
  for (const step of steps) {
    current = applyGardenStep(current, bounds, step)
    if (step.bloomed.length > 0) {
      const used = new Set(step.bloomed.map(([reel, row]) => row * 64 + reel))
      seeds = seeds.filter((seed) => !used.has(seed.row * 64 + seed.reel))
    }
    const grow = step.grow
    if (grow !== undefined) {
      if (!sameBounds(grow.from, bounds)) {
        throw new RangeError(`정원 단계 ${step.index}: 성장 시작 범위가 현재 범위와 다르다`)
      }
      growSeeds(seeds, maxTier)
      seeds.push(...cloneSeeds(grow.seeds))
      sortSeeds(seeds)
      bounds = { ...grow.to }
    }
  }
  return { grid: current, bounds, seeds }
}

/** 활성 n×n을 잘라 낸 부분 격자. */
function subGrid(grid: readonly (readonly SymbolId[])[], bounds: GardenBounds): SymbolId[][] {
  const out: SymbolId[][] = []
  for (let row = 0; row < bounds.size; row += 1) {
    const line = grid[bounds.y + row] as readonly SymbolId[]
    out.push(line.slice(bounds.x, bounds.x + bounds.size))
  }
  return out
}

/** `evaluateClusters`에 넘길 n×n 수학 모델. `cluster.ts`는 그대로 두고 크기만 바꿔 부른다(이웃표가 크기별로 캐시된다). */
const subMathCache = new WeakMap<GameMath, GameMath[]>()
function subMath(math: GameMath, size: number): GameMath {
  let bySize = subMathCache.get(math)
  if (bySize === undefined) {
    bySize = []
    subMathCache.set(math, bySize)
  }
  let cached = bySize[size]
  if (cached === undefined) {
    cached = { ...math, reels: size, rows: size }
    bySize[size] = cached
  }
  return cached
}

function seedWeights(table: readonly GardenSeedEntry[]): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const row of table) weights[String(row.tier)] = row.weight
  return weights
}

export interface GardenRunStart {
  stage: number
  popped: number
  seeds: readonly GardenSeed[]
}

export interface GardenRunOutcome {
  steps: GardenStep[]
  finalGrid: SymbolId[][]
  stage: number
  popped: number
  /** 단계가 끝난 뒤 씨앗(햇살 전). */
  seeds: GardenSeed[]
  win: number
  /** 캡이 없었다면 줬을 클러스터 지급(캡에 걸린 단계까지). */
  requested: number
  /** 이 스핀 동안 판 위에 있었던 가장 큰 씨앗 등급(없으면 -1). */
  peakTier: number
  capped: boolean
  hitMaxCascades: boolean
}

/**
 * 정원 단계 루프. 착지한 8×8 `grid`에서 시작해 «평가 → 씨앗 배정 → 팝 → 중력 → 리필 → 성장»을
 * 당첨도 성장도 없을 때까지 반복한다. RNG는 성장 때 씨앗 추첨에만 쓴다.
 *
 * - 리필은 스트립 끌어오기다. 열마다 포인터를 `stops[reel] - 1`에서 시작해 위로 순환하며 읽는다.
 *   스트립이 `maxSize + maxCascades × maxSize` 이상이라 리필이 창(덮인 화분 포함)과 겹치지 않는다(스키마가 강제).
 * - 성장은 한 단계에 한 겹. 문턱을 둘 넘었으면 다음 단계에서 또 자란다(당첨이 없어도 «성장 전용 단계»).
 * - 팝 단계는 `maxCascades`까지. 그 뒤 남은 클러스터는 지급하지 않는다.
 * - 캡(`capRemaining`)에 닿은 단계는 지급을 잘라 마지막 단계로 삼고 성장하지 않는다.
 */
export function runGarden(
  math: GameMath,
  grid: readonly (readonly SymbolId[])[],
  stops: readonly number[],
  strips: readonly (readonly SymbolId[])[],
  totalBet: number,
  start: GardenRunStart,
  thresholds: readonly number[],
  seedTable: readonly GardenSeedEntry[],
  capRemaining: number,
  rng: Rng,
): GardenRunOutcome {
  const config = requireGrowBoard(math)
  const maxTier = config.seedTiers.length - 1
  const weights = seedWeights(seedTable)
  const pointers = stops.map((stop, reel) => {
    const length = strips[reel]?.length ?? 1
    return (((stop - 1) % length) + length) % length
  })

  let current: SymbolId[][] = grid.map((row) => [...row])
  let stage = start.stage
  let popped = start.popped
  const seeds = sortSeeds(cloneSeeds(start.seeds))
  let peakTier = seeds.reduce((best, seed) => Math.max(best, seed.tier), -1)
  const steps: GardenStep[] = []
  let popSteps = 0
  let win = 0
  let requested = 0
  let capped = false
  let hitMaxCascades = false

  for (;;) {
    const bounds = STAGES[stage] as GardenBounds
    const evaluated = evaluateClusters(subGrid(current, bounds), subMath(math, bounds.size), totalBet, 1)
    let pops = evaluated.wins.length > 0
    if (pops && popSteps >= config.maxCascades) {
      hitMaxCascades = true
      pops = false
    }
    const growDue = (): boolean => stage < GARDEN_MAX_STAGE && popped >= (thresholds[stage] as number)
    if (!pops && !growDue()) break

    const index = steps.length
    let stepWins: WinLine[] = []
    let stepRemoved: GridPosition[] = []
    let stepRefill: SymbolId[][] = []
    let stepBloomed: GridPosition[] = []
    let stepWinTotal = 0
    let grow: GardenGrow | undefined

    if (pops) {
      const wins: WinLine[] = evaluated.wins.map((line) => ({
        line: line.line,
        symbol: line.symbol,
        count: line.count,
        multiplier: line.multiplier,
        win: line.win,
        positions: line.positions.map(([reel, row]) => [reel + bounds.x, row + bounds.y] as GridPosition),
        payKind: 'cluster' as const,
        cascade: index,
      }))
      const removed = evaluated.removed.map(([reel, row]) => [reel + bounds.x, row + bounds.y] as GridPosition)

      // 씨앗 배정: 씨앗 칸이 낀 클러스터 중 기본 배수가 가장 큰 쪽 하나(같으면 앞선 쪽 = 심볼 선언 순서).
      const seedSums = new Array<number>(wins.length).fill(0)
      const memberOf = new Map<number, number[]>()
      wins.forEach((line, w) => {
        for (const [reel, row] of line.positions) {
          const key = row * 64 + reel
          const list = memberOf.get(key)
          if (list === undefined) memberOf.set(key, [w])
          else list.push(w)
        }
      })
      const bloomedKeys = new Set<number>()
      for (const seed of seeds) {
        const key = seed.row * 64 + seed.reel
        const owners = memberOf.get(key)
        if (owners === undefined) continue
        let best = owners[0] as number
        for (const w of owners) if ((wins[w] as WinLine).multiplier > (wins[best] as WinLine).multiplier) best = w
        seedSums[best] = (seedSums[best] ?? 0) + (config.seedTiers[seed.tier] as number)
        bloomedKeys.add(key)
      }

      let stepWin = 0
      wins.forEach((line, w) => {
        const sum = seedSums[w] ?? 0
        if (sum > 0) {
          const applied = Math.min(sum, config.clusterSeedCap)
          line.seed = applied
          line.win = Math.round(line.multiplier * totalBet * applied)
        } else {
          line.win = Math.round(line.multiplier * totalBet)
        }
        stepWin += line.win
      })
      requested += stepWin
      const room = capRemaining - win
      if (stepWin > room) {
        capped = true
        let left = Math.max(0, room)
        for (const line of wins) {
          line.win = Math.min(line.win, left)
          left -= line.win
        }
        stepWin = Math.max(0, room)
      }

      const bloomed: GridPosition[] = []
      for (let i = seeds.length - 1; i >= 0; i -= 1) {
        const seed = seeds[i] as GardenSeed
        if (bloomedKeys.has(seed.row * 64 + seed.reel)) {
          bloomed.unshift([seed.reel, seed.row])
          seeds.splice(i, 1)
        }
      }

      const perColumn = new Array<number>(bounds.size).fill(0)
      for (const [reel] of removed) perColumn[reel - bounds.x] = (perColumn[reel - bounds.x] ?? 0) + 1
      const refill: SymbolId[][] = []
      for (let column = 0; column < bounds.size; column += 1) {
        const reel = bounds.x + column
        const strip = strips[reel] as readonly SymbolId[]
        const pulled: SymbolId[] = []
        for (let n = 0; n < (perColumn[column] ?? 0); n += 1) {
          pulled.push(strip[pointers[reel] as number] as SymbolId)
          pointers[reel] = ((pointers[reel] as number) - 1 + strip.length) % strip.length
        }
        refill.push(pulled.reverse())
      }

      stepWins = wins
      stepRemoved = removed
      stepRefill = refill
      stepBloomed = bloomed
      stepWinTotal = stepWin
      current = applyGardenStep(current, bounds, { index, removed, refill })
      popped += removed.length
      popSteps += 1
      win += stepWin
    }

    if (!capped && growDue()) {
      const from = STAGES[stage] as GardenBounds
      const to = STAGES[stage + 1] as GardenBounds
      const grown = growSeeds(seeds, maxTier)
      const cells = gardenNewCells(from, to)
      const fresh: GardenSeed[] = []
      for (const [reel, row] of cells) {
        const picked = pickWeighted(weights, rng)
        const tier = picked === undefined ? -1 : Number(picked)
        if (tier >= 0 && seeds.length + fresh.length < config.maxSeeds) fresh.push({ reel, row, tier })
      }
      seeds.push(...fresh)
      sortSeeds(seeds)
      stage += 1
      grow = { from: { ...from }, to: { ...to }, cells, seeds: cloneSeeds(fresh), grown }
      for (const seed of seeds) if (seed.tier > peakTier) peakTier = seed.tier
    }

    // 키 순서는 shared `GardenStepSchema`와 같다(응답 파싱·재생 비교가 바이트로 맞는다).
    steps.push({
      index,
      wins: stepWins,
      removed: stepRemoved,
      refill: stepRefill,
      bloomed: stepBloomed,
      ...(grow === undefined ? {} : { grow }),
      popped,
      stepWin: stepWinTotal,
    })
    if (capped) break
  }

  return { steps, finalGrid: current, stage, popped, seeds, win, requested, peakTier, capped, hitMaxCascades }
}

/** 활성 범위 안 스캐터 칸(행 오름차순, 같은 행은 열 오름차순). */
export function gardenScatterPositions(
  grid: readonly (readonly SymbolId[])[],
  bounds: GardenBounds,
  scatter: SymbolId,
): GridPosition[] {
  const positions: GridPosition[] = []
  for (let row = bounds.y; row < bounds.y + bounds.size; row += 1) {
    for (let reel = bounds.x; reel < bounds.x + bounds.size; reel += 1) {
      if (grid[row]?.[reel] === scatter) positions.push([reel, row])
    }
  }
  return positions
}

/**
 * 햇살(프리스핀 8×8 전용). 씨앗 전부 +1등급 → 씨앗 없는 활성 칸 목록(행·열 오름차순)에서 `sunPlant`번 자리를 뽑아
 * 가장 작은 등급 씨앗을 심는다. 최대 씨앗 수에 걸려도 추첨은 그대로 하고 결과만 버린다(RNG 호출 수 고정).
 * `seeds`를 제자리에서 바꾼다.
 */
export function applyGardenSun(
  config: GrowBoardConfig,
  seeds: GardenSeed[],
  bounds: GardenBounds,
  rng: Rng,
): GardenSun {
  const grown = growSeeds(seeds, config.seedTiers.length - 1)
  const planted: GardenSeed[] = []
  for (let k = 0; k < config.bonus.sunPlant; k += 1) {
    const taken = new Set(seeds.map((seed) => seed.row * 64 + seed.reel))
    const empties: GridPosition[] = []
    for (let row = bounds.y; row < bounds.y + bounds.size; row += 1) {
      for (let reel = bounds.x; reel < bounds.x + bounds.size; reel += 1) {
        if (!taken.has(row * 64 + reel)) empties.push([reel, row])
      }
    }
    if (empties.length === 0) break
    const [reel, row] = empties[rng.nextInt(empties.length)] as GridPosition
    if (seeds.length < config.maxSeeds) {
      const seed = { reel, row, tier: 0 }
      seeds.push(seed)
      planted.push({ ...seed })
      sortSeeds(seeds)
    }
  }
  return { grown, planted, seeds: cloneSeeds(seeds) }
}

function requireGrowBoard(math: GameMath): GrowBoardConfig {
  const config = math.growBoard
  if (config === undefined) throw new RangeError('growBoard 설정이 없는 게임에 정원 엔진을 호출했다')
  return config
}

/** 8×8 착지 창. `grid[row][reel] = strip[reel][(stop + row) % len]`. */
export function buildGardenGrid(strips: readonly (readonly SymbolId[])[], stops: readonly number[], size: number): SymbolId[][] {
  const grid: SymbolId[][] = []
  for (let row = 0; row < size; row += 1) {
    const line: SymbolId[] = []
    for (let reel = 0; reel < size; reel += 1) {
      const strip = strips[reel]
      const stop = stops[reel]
      if (strip === undefined || stop === undefined) throw new RangeError(`릴 ${reel}의 스트립 또는 정지 위치가 없다`)
      line.push(strip[(stop + row) % strip.length] as SymbolId)
    }
    grid.push(line)
  }
  return grid
}

/** 스캐터 개수 → 정원 프리스핀 수(개수 이하 최대 키). 트리거 미만이면 0. */
export function gardenSpinsFor(config: GrowBoardConfig, count: number): number {
  if (count < config.bonus.trigger) return 0
  let spins = 0
  let bestKey = 0
  for (const [raw, value] of Object.entries(config.bonus.spinsByCount)) {
    const key = Number(raw)
    if (key <= count && key > bestKey) {
      bestKey = key
      spins = value
    }
  }
  return spins
}

/** 프리스핀 문턱(없으면 기본 문턱). */
export function gardenBonusThresholds(config: GrowBoardConfig): readonly number[] {
  return config.bonus.thresholds ?? config.thresholds
}

/**
 * 정원 팩의 정산(유료 스핀·정원 프리스핀). `resolveSpin`이 맨 앞에서 위임한다.
 *
 * - 유료 스핀은 4×4·씨앗 없음·막대 0에서 시작하고 `nextState`가 없으면 아무것도 이월하지 않는다.
 * - 스캐터는 **스핀이 끝난 활성 범위**에서 센다. `bonus.trigger`개 이상이면 정원 프리스핀 진입.
 * - 프리스핀은 `state.carry.garden`의 크기·막대·씨앗에서 이어 가고, 스트립·문턱·씨앗 표는 bonus 쪽을 쓴다.
 * - 라운드(진입 스핀 + 프리스핀) 지급 상한 `round.maxWinCap x totalBet`. 닿으면 그 자리에서 라운드가 끝난다.
 */
export function resolveGardenSpin(
  math: GameMath,
  stops: number[],
  totalBet: number,
  state: RoundState | undefined,
  rng: Rng | undefined,
): SpinResult {
  const config = requireGrowBoard(math)
  if (rng === undefined) throw new RangeError('정원 씨앗 추첨에는 rng가 필요하다')
  const carry = state?.carry?.garden
  const isFree = state !== undefined
  if (isFree && carry === undefined) throw new RangeError('정원 프리스핀에는 carry.garden이 필요하다')

  const strips = isFree ? (config.bonus.strips ?? math.strips) : math.strips
  const grid = buildGardenGrid(strips, stops, config.maxSize)
  const thresholds = isFree ? gardenBonusThresholds(config) : config.thresholds
  const seedTable = isFree ? config.bonus.seedTable : config.seedTable
  const capTotal = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)
  const roundBefore = carry?.roundWin ?? 0
  const start: GardenRunStart = carry === undefined ? { stage: 0, popped: 0, seeds: [] } : carry
  const startBounds = gardenBoundsFor(start.stage)

  const outcome = runGarden(math, grid, stops, strips, totalBet, start, thresholds, seedTable, capTotal - roundBefore, rng)
  const finalBounds = gardenBoundsFor(outcome.stage)
  const features: FeatureTrigger[] = []

  let spinWin = outcome.win
  let requested = outcome.requested
  let capped = outcome.capped
  const scatterSymbol = math.scatter?.symbol ?? ''
  const scatterPositions = gardenScatterPositions(outcome.finalGrid, finalBounds, scatterSymbol)
  const scatterCount = scatterPositions.length
  const scatterPay = Math.round(payoutForCount(math.scatter?.pays, scatterCount) * totalBet)
  const scatterGranted = Math.max(0, Math.min(scatterPay, capTotal - roundBefore - spinWin))
  if (scatterGranted < scatterPay) capped = true
  requested += scatterPay
  spinWin += scatterGranted

  // 햇살: 프리스핀에서 8×8에 닿은 뒤 막대가 문턱 + sunEvery·k를 넘을 때마다(한 스핀 최대 maxSunsPerSpin회).
  const seeds = cloneSeeds(outcome.seeds)
  let peakTier = Math.max(outcome.peakTier, carry?.bestTier ?? -1)
  let suns = carry?.suns ?? 0
  const sunEvents: GardenSun[] = []
  if (isFree && !capped && outcome.stage === GARDEN_MAX_STAGE) {
    const base = thresholds[GARDEN_MAX_STAGE - 1] as number
    const due = Math.floor(Math.max(0, outcome.popped - base) / config.bonus.sunEvery) - suns
    const count = Math.min(Math.max(0, due), config.bonus.maxSunsPerSpin)
    for (let k = 0; k < count; k += 1) {
      const sun = applyGardenSun(config, seeds, finalBounds, rng)
      sunEvents.push(sun)
      for (const seed of seeds) if (seed.tier > peakTier) peakTier = seed.tier
    }
    suns += count
  }

  let nextState: RoundState | undefined
  let stats: GardenRoundStats | undefined
  const tail: FeatureTrigger[] = []

  if (!isFree) {
    const spins = capped ? 0 : gardenSpinsFor(config, scatterCount)
    if (spins > 0) {
      const minStage = gardenStageForSize(config.bonus.minStartSize)
      const stage = Math.max(outcome.stage, minStage)
      const bonusThresholds = gardenBonusThresholds(config)
      const popped = stage > 0 ? (bonusThresholds[stage - 1] as number) : 0
      tail.push({ type: 'freeSpins', spins, multiplier: 1, retrigger: false })
      const nextCarry: GardenCarry = {
        stage,
        popped,
        seeds: cloneSeeds(seeds),
        retriggers: 0,
        suns: 0,
        roundWin: spinWin,
        freeWin: 0,
        maxStage: stage,
        bestTier: peakTier,
        bestSpinWin: 0,
      }
      nextState = { freeSpinsLeft: spins, freeSpinsTotal: spins, multiplier: 1, carry: { garden: nextCarry } }
    }
  } else if (state !== undefined && carry !== undefined) {
    let left = Math.max(0, state.freeSpinsLeft - 1)
    let total = state.freeSpinsTotal
    let retriggers = carry.retriggers
    if (!capped && scatterCount >= config.bonus.trigger && retriggers < config.bonus.maxRetriggers) {
      const extra = config.bonus.retriggerSpins
      tail.push({ type: 'freeSpins', spins: extra, multiplier: 1, retrigger: true })
      left += extra
      total += extra
      retriggers += 1
    }
    const roundCapped = capped || roundBefore + spinWin >= capTotal
    const last = left === 0 || roundCapped
    let topUp = 0
    if (last && !roundCapped) {
      const target = Math.round(config.bonus.minRoundPay * totalBet)
      const freeSoFar = carry.freeWin + spinWin
      if (freeSoFar < target) {
        topUp = Math.max(0, Math.min(target - freeSoFar, capTotal - roundBefore - spinWin))
        if (topUp > 0) {
          tail.push({ type: 'gardenTopUp', amount: topUp })
          spinWin += topUp
          requested += topUp
        }
      }
    }
    const maxStage = Math.max(carry.maxStage, outcome.stage)
    // 최저 보장으로 채운 금액은 «최고 한 판»이 아니다 — 그 스핀이 실제로 맞힌 금액만 견준다.
    const bestSpinWin = Math.max(carry.bestSpinWin, spinWin - topUp)
    const freeWin = carry.freeWin + spinWin
    stats = {
      maxSize: gardenBoundsFor(maxStage).size,
      bestSeed: peakTier >= 0 ? (config.seedTiers[peakTier] as number) : 0,
      bestSpinWin,
      freeWin,
      topUp,
    }
    if (!last) {
      const nextCarry: GardenCarry = {
        stage: outcome.stage,
        popped: outcome.popped,
        seeds: cloneSeeds(seeds),
        retriggers,
        suns,
        roundWin: roundBefore + spinWin,
        freeWin,
        maxStage,
        bestTier: peakTier,
        bestSpinWin,
      }
      nextState = { freeSpinsLeft: left, freeSpinsTotal: total, multiplier: 1, carry: { garden: nextCarry } }
    }
  }
  // 키 순서는 shared `GardenFeatureSchema`와 같다(응답 파싱·재생 비교가 바이트로 맞는다).
  const garden: GardenTrigger = {
    type: 'garden',
    start: startBounds,
    startSeeds: cloneSeeds(start.seeds),
    startPopped: start.popped,
    steps: outcome.steps,
    finalGrid: outcome.finalGrid,
    final: finalBounds,
    seeds: cloneSeeds(seeds),
    ...(sunEvents.length > 0 ? { sun: sunEvents } : {}),
    ...(stats === undefined ? {} : { round: stats }),
    capped,
    hitMaxCascades: outcome.hitMaxCascades,
  }
  features.push(garden)
  if (scatterPay > 0) {
    features.push({ type: 'scatterWin', symbol: scatterSymbol, count: scatterCount, win: scatterGranted, positions: scatterPositions })
  }
  features.push(...tail)

  if (capped && Number.isFinite(capTotal)) {
    features.push({ type: 'winCapped', requested: Math.max(requested, spinWin), granted: spinWin, cap: capTotal })
  }

  const wins = outcome.steps.flatMap((step) => step.wins)
  const result: SpinResult = {
    stops,
    gridBefore: grid,
    grid,
    mutations: [],
    wins,
    lineWin: outcome.win,
    scatterWin: scatterGranted,
    totalWin: spinWin,
    features,
  }
  if (nextState !== undefined) result.nextState = nextState
  return result
}
