import type { GameMath } from './schema.js'
import type { FrostRespinConfig } from './frostSchema.js'
import { evaluate, evaluateScatter, getBetPerLine, getWildIds } from './evaluate.js'
import { evaluateWays, getBetPerWay } from './ways.js'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
import { VOID_CELL, reelHeight, shapeCells } from './shape.js'
import type {
  FeatureTrigger,
  FrostCarry,
  FrostOutcome,
  FrostStep,
  FrostTier,
  GridPosition,
  Rng,
  RoundState,
  SpinResult,
  SymbolId,
  WinLine,
} from './types.js'

function requireConfig(math: GameMath): FrostRespinConfig {
  const config = math.frostRespin
  if (config === undefined) throw new RangeError('frostRespin 설정이 없는 게임이다')
  return config
}

/** 라운드 시작(진입 판) 때의 이월 상태. */
export function initialFrostCarry(): FrostCarry {
  return { level: 0, paid: 0, bestCount: 0, bonusTotal: 0 }
}

/** 이 판이 멈출 릴 스트립. 프리스핀이면 `frostRespin.freeStrips`, 아니면 기본 `strips`. */
export function frostReelStrips(math: GameMath, isFreeSpin: boolean): readonly (readonly SymbolId[])[] {
  return isFreeSpin && math.frostRespin !== undefined ? math.frostRespin.freeStrips : math.strips
}

const freeMathCache = new WeakMap<GameMath, GameMath>()

/**
 * 렌더러·허브용. 프리스핀 판의 `stops`는 `freeStrips` 인덱스라 `math.strips`로 짚으면 다른 그림이 나온다.
 * 프리스핀 동안 이 함수가 돌려준 math(스트립만 `freeStrips`로 바꾼 사본, 캐시)를 렌더러에 넘기면 된다.
 * 얼림 팩이 아니거나 유료 판이면 받은 math를 그대로 돌려준다.
 */
export function frostSpinMath(math: GameMath, isFreeSpin: boolean): GameMath {
  if (!isFreeSpin || math.frostRespin === undefined) return math
  const cached = freeMathCache.get(math)
  if (cached !== undefined) return cached
  const copy: GameMath = { ...math, strips: math.frostRespin.freeStrips }
  freeMathCache.set(math, copy)
  return copy
}

/** 정지 위치 → 판. 판 밖 칸은 `VOID_CELL`. `grid[row][reel]`. */
export function buildShapeGrid(math: GameMath, strips: readonly (readonly SymbolId[])[], stops: readonly number[]): SymbolId[][] {
  const grid: SymbolId[][] = []
  for (let row = 0; row < math.rows; row += 1) {
    const line: SymbolId[] = []
    for (let reel = 0; reel < math.reels; reel += 1) {
      if (row >= reelHeight(math, reel)) {
        line.push(VOID_CELL)
        continue
      }
      const strip = strips[reel]
      const stop = stops[reel]
      if (strip === undefined || stop === undefined) throw new RangeError(`릴 ${reel}의 스트립 또는 정지 위치가 없다`)
      const symbol = strip[(stop + row) % strip.length]
      if (symbol === undefined) throw new RangeError(`릴 ${reel} 스트립이 비었다`)
      line.push(symbol)
    }
    grid.push(line)
  }
  return grid
}

/** 그림의 보너스 등급. 등급이 없는 심볼(와일드·스캐터)이면 undefined. */
export function frostTierOf(config: FrostRespinConfig, symbol: SymbolId): FrostTier | undefined {
  if (config.tiers.high.includes(symbol)) return 'high'
  if (config.tiers.mid.includes(symbol)) return 'mid'
  if (config.tiers.low.includes(symbol)) return 'low'
  return undefined
}

/** 얼린 칸 수 → 보너스표 값(총 베팅액 배수, 오로라 곱하기 전). 첫 눈금 미만이면 0. */
export function frostBonusMultiple(config: FrostRespinConfig, tier: FrostTier, count: number): number {
  const table = config.bonus[tier]
  let value = 0
  config.thresholds.forEach((threshold, index) => {
    if (count >= threshold) value = table[index] ?? value
  })
  return value
}

/** 스캐터 개수 → 프리스핀 횟수. 표보다 많으면 표의 가장 큰 개수, trigger 미만이면 0. */
export function frostSpinsFor(config: FrostRespinConfig, scatterCount: number): number {
  let spins = 0
  let best = -1
  for (const [raw, value] of Object.entries(config.freeSpins.counts)) {
    const count = Number(raw)
    if (count <= scatterCount && count > best) {
      best = count
      spins = value
    }
  }
  return scatterCount >= config.freeSpins.trigger ? spins : 0
}

/**
 * 얼릴 그림. 당첨 중 금액이 가장 큰 그림이고, 같으면 `math.symbols` 선언 순서가 앞인 그림(배당표 위쪽).
 * 와일드만으로 된 길은 평가기가 이미 와일드 챔피언 이름으로 지급하므로 그대로 따라간다.
 * 등급이 없는 심볼(와일드 자체 배당·그룹)은 고르지 않는다.
 */
export function pickFrostTarget(math: GameMath, wins: readonly WinLine[]): SymbolId | undefined {
  const config = requireConfig(math)
  const totals = new Map<SymbolId, number>()
  for (const win of wins) {
    if (frostTierOf(config, win.symbol) === undefined) continue
    totals.set(win.symbol, (totals.get(win.symbol) ?? 0) + win.win)
  }
  let best: SymbolId | undefined
  let bestWin = 0
  for (const symbol of math.symbols) {
    const total = totals.get(symbol.id)
    if (total === undefined || total <= bestWin) continue
    best = symbol.id
    bestWin = total
  }
  return best
}

/** 얼림 루프의 결과(보너스·오로라 계산 전). */
export interface FrostChainRun {
  startFrozen: GridPosition[]
  steps: FrostStep[]
  finalGrid: SymbolId[][]
  count: number
  hitHardCap: boolean
}

/**
 * 얼림 루프. 착지 판의 `target`·와일드 칸을 전부 얼리고, 얼지 않은 칸만 다시 뽑기를 반복한다.
 *
 * RNG 소비: 단계마다 얼지 않은 칸을 **릴 0→끝, 각 릴 안에서 행 0→h_r−1** 순서로 훑으며 칸마다
 * `nextInt(respinStrips[reel].length)` 1회. 새로 언 칸은 그 단계 추첨이 다 끝난 뒤 한꺼번에 얼린다.
 *
 * 종료: 척도 = 얼지 않은 칸 수 U. 계속하는 조건이 «새로 언 칸 ≥ 1»이라 U가 매 단계 1 이상 준다.
 * 판이 다 차면 바로 끝나므로 단계 수 ≤ U₀ + 1 ≤ 칸 수 − 최소 얼림 + 1 ≤ hardCap(스키마). 하드캡은 안전망일 뿐이다.
 */
export function runFrostChain(math: GameMath, grid: readonly SymbolId[][], target: SymbolId, rng: Rng): FrostChainRun {
  const config = requireConfig(math)
  const cells = shapeCells(math)
  const wildIds = getWildIds(math)
  const current = grid.map((line) => [...line])
  const frozen = grid.map((line) => line.map(() => false))
  const freezes = (symbol: SymbolId): boolean => symbol === target || wildIds.has(symbol)

  const startFrozen: GridPosition[] = []
  for (const [reel, row] of cells) {
    const symbol = current[row]?.[reel]
    if (symbol === undefined || !freezes(symbol)) continue
    const line = frozen[row]
    if (line !== undefined) line[reel] = true
    startFrozen.push([reel, row])
  }

  let count = startFrozen.length
  const steps: FrostStep[] = []
  let lastNew = 1
  while (count < cells.length && steps.length < config.hardCap) {
    const drawn: SymbolId[] = []
    const newly: GridPosition[] = []
    for (const [reel, row] of cells) {
      if (frozen[row]?.[reel] === true) continue
      const strip = config.respinStrips[reel]
      if (strip === undefined) throw new RangeError(`릴 ${reel}의 다시 돌리기 칸 스트립이 없다`)
      const symbol = strip[rng.nextInt(strip.length)]
      if (symbol === undefined) throw new RangeError(`릴 ${reel} 다시 돌리기 칸 스트립이 비었다`)
      const line = current[row]
      if (line !== undefined) line[reel] = symbol
      drawn.push(symbol)
      if (freezes(symbol)) newly.push([reel, row])
    }
    for (const [reel, row] of newly) {
      const line = frozen[row]
      if (line !== undefined) line[reel] = true
    }
    count += newly.length
    steps.push({ cells: drawn, frozen: newly })
    lastNew = newly.length
    if (newly.length === 0) break
  }

  return {
    startFrozen,
    steps,
    finalGrid: current,
    count,
    hitHardCap: steps.length >= config.hardCap && count < cells.length && lastNew > 0,
  }
}

/**
 * 저장된 얼림 기록만으로 끝난 판을 되살린다. 엔진을 다시 돌리지 않는 순수 함수다(math 없이 판의 `VOID_CELL`로 모양을 안다).
 * `foldFrost(grid, outcome)`은 `outcome.finalGrid`와 같아야 한다(테스트가 고정한다). 허브 재생·검증에 쓴다.
 */
export function foldFrost(grid: readonly SymbolId[][], outcome: Pick<FrostOutcome, 'startFrozen' | 'steps'>): SymbolId[][] {
  const current = grid.map((line) => [...line])
  const rows = current.length
  const reels = current[0]?.length ?? 0
  const frozen = new Set<number>(outcome.startFrozen.map(([reel, row]) => reel * rows + row))
  for (const step of outcome.steps) {
    let index = 0
    for (let reel = 0; reel < reels; reel += 1) {
      for (let row = 0; row < rows; row += 1) {
        const line = current[row]
        if (line === undefined || line[reel] === VOID_CELL || frozen.has(reel * rows + row)) continue
        const symbol = step.cells[index]
        if (symbol === undefined) throw new RangeError('얼림 기록의 칸 수가 판과 맞지 않는다')
        line[reel] = symbol
        index += 1
      }
    }
    if (index !== step.cells.length) throw new RangeError('얼림 기록의 칸 수가 판과 맞지 않는다')
    for (const [reel, row] of step.frozen) frozen.add(reel * rows + row)
  }
  return current
}

function betUnitOf(math: GameMath, totalBet: number): number {
  return math.payModel === 'ways' ? getBetPerWay(math, totalBet) : getBetPerLine(math, totalBet)
}

/**
 * 얼림 팩의 스핀 1회. RNG 계약:
 * `[유료] 릴 정지 nextInt(strips_r.length) x 릴 수` /
 * `[프리스핀] 릴 정지 nextInt(freeStrips_r.length) x 릴 수 → (당첨 있으면) 얼림 단계마다 얼지 않은 칸 수만큼`.
 * 뮤테이션은 없다(스키마). 잭팟 판정은 API가 이 뒤에 1회 뽑는다.
 */
export function spinFrost(math: GameMath, totalBet: number, rng: Rng, state?: RoundState): SpinResult {
  const strips = frostReelStrips(math, state !== undefined)
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  const grid = buildShapeGrid(math, strips, stops)
  return resolveFrostSpin(math, grid, stops, totalBet, betUnitOf(math, totalBet), state, rng)
}

/**
 * 얼림 팩의 정산. 유료 판은 길·스캐터 지급과 진입만, 프리스핀 판은 길·스캐터 지급 → 얼림 → 얼음 보너스 → 리트리거.
 *
 * 지급 상한(`round.maxWinCap x totalBet`): 유료 판(진입 판 포함)은 **판 단위**, 프리스핀은 진입 판을 뺀
 * **프리스핀 합 누적**(`carry.frost.paid`). 평소 지급 → 스캐터 → 얼음 보너스 순으로 채우고 넘치는 몫은 잘라
 * `winCapped`를 남긴다. 프리스핀 누적이 상한에 닿으면 남은 횟수와 상관없이 라운드를 끝낸다(`nextState` 없음).
 * 오로라 배수는 얼음 보너스에만 곱한다. 길·스캐터 지급에는 곱하지 않는다.
 */
export function resolveFrostSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  betUnit: number,
  state: RoundState | undefined,
  rng: Rng | undefined,
): SpinResult {
  const config = requireConfig(math)
  const { wins, totalWin: rawLine } = math.payModel === 'ways' ? evaluateWays(grid, math, betUnit) : evaluate(grid, math, betUnit)
  const scatter = evaluateScatter(grid, math, totalBet)
  const cap = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)
  const carry = state === undefined ? undefined : (state.carry?.frost ?? initialFrostCarry())

  let room = Math.max(0, cap - (carry?.paid ?? 0))
  const lineWin = Math.min(rawLine, room)
  room -= lineWin
  const scatterWin = Math.min(scatter.win, room)
  room -= scatterWin
  let requested = rawLine + scatter.win

  const features: FeatureTrigger[] = []
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatterWin,
      positions: scatter.positions,
    })
  }

  let frostWin: number | undefined
  let frostCount = 0
  let level = carry?.level ?? 0
  if (state !== undefined && wins.length > 0) {
    const target = pickFrostTarget(math, wins)
    const tier = target === undefined ? undefined : frostTierOf(config, target)
    if (target !== undefined && tier !== undefined) {
      if (rng === undefined) throw new RangeError('얼림 다시 돌리기에는 rng가 필요하다')
      const run = runFrostChain(math, grid, target, rng)
      const ladder = config.aurora.ladder
      const auroraBefore = level
      const auroraAfter = run.count >= config.aurora.threshold ? Math.min(level + 1, ladder.length - 1) : level
      const auroraMultiplier = ladder[auroraAfter] ?? 1
      const bonusMultiple = frostBonusMultiple(config, tier, run.count)
      const bonusRequested = Math.round(bonusMultiple * auroraMultiplier * totalBet)
      const bonus = Math.min(bonusRequested, room)
      room -= bonus
      requested += bonusRequested
      features.push({
        type: 'frostChain',
        target,
        tier,
        startFrozen: run.startFrozen,
        steps: run.steps,
        finalGrid: run.finalGrid,
        count: run.count,
        bonusMultiple,
        auroraBefore,
        auroraAfter,
        auroraMultiplier,
        bonus,
        hitHardCap: run.hitHardCap,
      })
      level = auroraAfter
      frostWin = bonus
      frostCount = run.count
    }
  }

  const fs = config.freeSpins
  let nextState: RoundState | undefined
  if (state === undefined) {
    const spins = frostSpinsFor(config, scatter.count)
    if (spins > 0) {
      const granted = Math.min(spins, fs.maxTotal, MAX_FREE_SPINS_PER_ROUND)
      features.push({ type: 'freeSpins', spins: granted, multiplier: 1, retrigger: false })
      nextState = { freeSpinsLeft: granted, freeSpinsTotal: granted, multiplier: 1, carry: { frost: initialFrostCarry() } }
      if (granted < spins) features.push({ type: 'freeSpinsCapped', requested: spins, granted, cap: fs.maxTotal })
    }
  } else {
    let left = Math.max(0, state.freeSpinsLeft - 1)
    let total = state.freeSpinsTotal
    if (fs.retrigger > 0 && scatter.count >= fs.trigger) {
      const spare = Math.max(0, fs.maxTotal - total)
      const granted = Math.min(fs.retrigger, spare)
      if (granted > 0) {
        features.push({ type: 'freeSpins', spins: granted, multiplier: state.multiplier, retrigger: true })
        left += granted
        total += granted
      }
      if (granted < fs.retrigger) features.push({ type: 'freeSpinsCapped', requested: fs.retrigger, granted, cap: fs.maxTotal })
    }
    const previous = carry ?? initialFrostCarry()
    const paid = previous.paid + lineWin + scatterWin + (frostWin ?? 0)
    if (left > 0 && paid < cap) {
      nextState = {
        freeSpinsLeft: left,
        freeSpinsTotal: total,
        multiplier: state.multiplier,
        carry: {
          frost: {
            level,
            paid,
            bestCount: Math.max(previous.bestCount, frostCount),
            bonusTotal: previous.bonusTotal + (frostWin ?? 0),
          },
        },
      }
    }
  }

  const granted = lineWin + scatterWin + (frostWin ?? 0)
  if (Number.isFinite(cap) && granted < requested) {
    features.push({ type: 'winCapped', requested, granted, cap })
  }

  const result: SpinResult = {
    stops,
    gridBefore: grid,
    grid,
    mutations: [],
    wins,
    lineWin,
    scatterWin,
    totalWin: granted,
    features,
  }
  if (nextState !== undefined) result.nextState = nextState
  if (frostWin !== undefined) result.frostWin = frostWin
  return result
}
