import type { GameMath } from './schema.js'
import type { CoinRespinConfig } from './coinRespinSchema.js'
import { evaluate, evaluateScatter } from './evaluate.js'
import { evaluateWays } from './ways.js'
import { pickWeighted } from './random.js'
import type {
  CoinCell,
  ColumnWrap,
  FeatureTrigger,
  GridPosition,
  MutationEvent,
  RespinOutcome,
  RespinStep,
  Rng,
  SpinResult,
  SymbolId,
  TreasureTier,
} from './types.js'

/** 판 위 코인. `board[reel][row]`, 빈 칸은 null. */
export type CoinBoard = (CoinCell | null)[][]

function requireConfig(math: GameMath): CoinRespinConfig {
  const config = math.coinRespin
  if (config === undefined) throw new RangeError('coinRespin 설정이 없는 게임이다')
  return config
}

/** 금액표 키. pickWeighted가 키를 문자열로 정렬하므로 자릿수를 맞춰 금액표 순서를 그대로 지킨다. */
function entryKey(index: number): string {
  return String(index).padStart(3, '0')
}

function cloneCell(cell: CoinCell): CoinCell {
  const copy: CoinCell = { pos: [cell.pos[0], cell.pos[1]], kind: cell.kind, value: cell.value, amount: cell.amount }
  if (cell.tier !== undefined) copy.tier = cell.tier
  return copy
}

/**
 * 코인 1개의 금액을 뽑는다. **RNG 1회.** 판에 이미 있는 보물 단계는 후보에서 뺀다(다시 뽑기 없음).
 * 숫자 코인이 금액표에 반드시 있으므로(스키마) 후보가 비는 일은 없다.
 */
export function drawCoin(
  config: CoinRespinConfig,
  pos: GridPosition,
  onBoard: ReadonlySet<TreasureTier>,
  totalBet: number,
  rng: Rng,
): CoinCell {
  const weights: Record<string, number> = {}
  config.values.forEach((entry, index) => {
    if (entry.kind === 'treasure' && onBoard.has(entry.tier)) return
    weights[entryKey(index)] = entry.weight
  })
  const key = pickWeighted(weights, rng)
  const entry = key === undefined ? undefined : config.values[Number(key)]
  if (entry === undefined) throw new RangeError('코인 금액 후보가 비었다')
  if (entry.kind === 'bet') {
    return { pos: [pos[0], pos[1]], kind: 'bet', value: entry.value, amount: Math.round(entry.value * totalBet) }
  }
  const value = config.treasures[entry.tier]
  return { pos: [pos[0], pos[1]], kind: 'treasure', value, tier: entry.tier, amount: Math.round(value * totalBet) }
}

/**
 * 기본 판의 코인 금액. 코인 칸마다 RNG 1회, 순서는 **릴 0→끝, 각 릴 안에서 행 0→끝**이다.
 * @param grid `grid[row][reel]`
 */
export function assignCoinValues(math: GameMath, grid: SymbolId[][], totalBet: number, rng: Rng): CoinCell[] {
  const config = requireConfig(math)
  const cells: CoinCell[] = []
  const tiers = new Set<TreasureTier>()
  for (let reel = 0; reel < math.reels; reel += 1) {
    for (let row = 0; row < math.rows; row += 1) {
      if (grid[row]?.[reel] !== config.symbol) continue
      const cell = drawCoin(config, [reel, row], tiers, totalBet, rng)
      if (cell.tier !== undefined) tiers.add(cell.tier)
      cells.push(cell)
    }
  }
  return cells
}

/** 코인 목록 → 판. */
export function toCoinBoard(math: Pick<GameMath, 'reels' | 'rows'>, cells: readonly CoinCell[]): CoinBoard {
  const board: CoinBoard = []
  for (let reel = 0; reel < math.reels; reel += 1) board.push(new Array<CoinCell | null>(math.rows).fill(null))
  for (const cell of cells) {
    const column = board[cell.pos[0]]
    if (column === undefined || cell.pos[1] < 0 || cell.pos[1] >= column.length) {
      throw new RangeError(`코인 좌표가 판 밖이다: [${cell.pos[0]}, ${cell.pos[1]}]`)
    }
    column[cell.pos[1]] = cloneCell(cell)
  }
  return board
}

/** 판 → 코인 목록(릴 → 행 순서). */
export function boardCells(board: CoinBoard): CoinCell[] {
  const cells: CoinCell[] = []
  for (const column of board) for (const cell of column) if (cell !== null) cells.push(cloneCell(cell))
  return cells
}

/**
 * 촉수 감기. 코인으로 다 찬 세로줄 중 아직 안 감긴 줄을 **왼쪽부터** 감아 숫자 코인 금액에 배수를 곱한다.
 * 보물 코인은 그대로다. 줄마다 라운드당 1회(`wrapped`). RNG를 쓰지 않는 순수 함수이며 입력을 바꾸지 않는다.
 */
export function applyColumnWraps(
  board: CoinBoard,
  wrapped: readonly boolean[],
  multiplier: number,
  totalBet: number,
): { board: CoinBoard; wrapped: boolean[]; wraps: ColumnWrap[] } {
  const next: CoinBoard = board.map((column) => column.map((cell) => (cell === null ? null : cloneCell(cell))))
  const done = board.map((_, reel) => wrapped[reel] === true)
  const wraps: ColumnWrap[] = []
  next.forEach((column, reel) => {
    if (done[reel] || column.length === 0 || column.some((cell) => cell === null)) return
    const cells = column as CoinCell[]
    const before = cells.map((cell) => cell.amount)
    for (const cell of cells) {
      if (cell.kind !== 'bet') continue
      cell.value *= multiplier
      cell.amount = Math.round(cell.value * totalBet)
    }
    done[reel] = true
    wraps.push({ reel, before, after: cells.map((cell) => cell.amount) })
  })
  return { board: next, wrapped: done, wraps }
}

function treasureTiers(board: CoinBoard): Set<TreasureTier> {
  const tiers = new Set<TreasureTier>()
  for (const column of board) for (const cell of column) if (cell?.tier !== undefined) tiers.add(cell.tier)
  return tiers
}

function countCoins(board: CoinBoard): number {
  let count = 0
  for (const column of board) for (const cell of column) if (cell !== null) count += 1
  return count
}

/**
 * 코인 리스핀 라운드 전체. 진입 판(`entry`)에서 시작해 끝날 때까지 돌린다.
 *
 * RNG 소비: 리스핀마다 고정 안 된 칸을 **릴 0→끝, 행 0→끝** 순서로 훑으며 칸마다 `nextInt(칸 스트립 길이)` 1회,
 * 뽑힌 칸이 코인이면 금액 1회. 촉수 감기·종료 판정·정산은 RNG를 쓰지 않는다.
 *
 * 종료: 척도 `M = respins x 빈칸 + left`가 리스핀마다 1 이상 줄어든다(새 코인 k ≥ 1이면
 * `ΔM = -respins·k + (respins - left) ≤ -1`, 없으면 -1). 시작값 ≤ `respins x (칸 수 - trigger) + respins`이고
 * 스키마가 hardCap을 그 이상으로 강제하므로 하드캡은 안전망일 뿐이다.
 *
 * @param capRoom 이 라운드가 더 지급할 수 있는 코인(지급 상한 − 이미 지급한 라인 당첨). 상한이 없으면 Infinity.
 */
export function runCoinRespin(
  math: GameMath,
  entry: readonly CoinCell[],
  totalBet: number,
  capRoom: number,
  rng: Rng,
): RespinOutcome {
  const config = requireConfig(math)
  const cells = math.reels * math.rows
  const multiplier = config.columnBonus.multiplier

  const entryWrapped = applyColumnWraps(toCoinBoard(math, entry), [], multiplier, totalBet)
  let board = entryWrapped.board
  let wrapped = entryWrapped.wrapped
  let filled = countCoins(board)
  let left = config.respins
  const steps: RespinStep[] = []

  while (left > 0 && filled < cells && steps.length < config.hardCap) {
    const tiers = treasureTiers(board)
    const grid: SymbolId[][] = []
    for (let row = 0; row < math.rows; row += 1) grid.push(new Array<SymbolId>(math.reels).fill(config.symbol))
    const newCoins: CoinCell[] = []
    const landed: CoinBoard = board.map((column) => [...column])
    for (let reel = 0; reel < math.reels; reel += 1) {
      const strip = config.respinStrips[reel]
      const column = landed[reel]
      if (strip === undefined || column === undefined) throw new RangeError(`릴 ${reel}의 리스핀 칸 스트립이 없다`)
      for (let row = 0; row < math.rows; row += 1) {
        if (column[row] !== null) continue
        const symbol = strip[rng.nextInt(strip.length)]
        if (symbol === undefined) throw new RangeError(`릴 ${reel} 리스핀 칸 스트립이 비었다`)
        const line = grid[row]
        if (line !== undefined) line[reel] = symbol
        if (symbol !== config.symbol) continue
        const cell = drawCoin(config, [reel, row], tiers, totalBet, rng)
        if (cell.tier !== undefined) tiers.add(cell.tier)
        column[row] = cell
        newCoins.push(cloneCell(cell))
      }
    }
    filled += newCoins.length
    left = newCoins.length > 0 ? config.respins : left - 1
    const step = applyColumnWraps(landed, wrapped, multiplier, totalBet)
    board = step.board
    wrapped = step.wrapped
    steps.push({ index: steps.length, grid, newCoins, wraps: step.wraps, left })
  }

  const final = boardCells(board)
  const full = filled >= cells
  let numeric = 0
  let treasure = 0
  for (const cell of final) {
    if (cell.kind === 'bet') numeric += cell.amount
    else treasure += cell.amount
  }
  const top = full ? Math.round(config.treasures.top * totalBet) : 0

  // 상한은 숫자 코인 → 보물 코인 → 최고 보물 순으로 채운다(라인 당첨은 호출부가 먼저 뺐다).
  let room = Math.max(0, capRoom)
  const numericGranted = Math.min(numeric, room)
  room -= numericGranted
  const treasureGranted = Math.min(treasure, room)
  room -= treasureGranted
  const topGranted = Math.min(top, room)
  const coinWin = numericGranted + treasureGranted

  return {
    entry: entry.map(cloneCell),
    entryWraps: entryWrapped.wraps,
    steps,
    final,
    full,
    coinWin,
    topWin: topGranted,
    win: coinWin + topGranted,
    capped: coinWin + topGranted < numeric + treasure + top,
    hitHardCap: steps.length >= config.hardCap && left > 0 && !full,
  }
}

/**
 * 저장된 리스핀 기록만으로 끝난 판을 되살린다. 엔진을 다시 돌리지 않는 순수 함수다.
 * `foldRespin(outcome)`은 `outcome.final`과 같아야 한다(테스트가 고정한다). 허브 재생·검증에 쓴다.
 */
export function foldRespin(
  math: Pick<GameMath, 'reels' | 'rows'>,
  outcome: Pick<RespinOutcome, 'entry' | 'entryWraps' | 'steps'>,
): CoinCell[] {
  const board = toCoinBoard(math, outcome.entry)
  const applyWraps = (wraps: readonly ColumnWrap[]): void => {
    for (const wrap of wraps) {
      const column = board[wrap.reel]
      if (column === undefined) throw new RangeError(`감기 릴이 판 밖이다: ${wrap.reel}`)
      column.forEach((cell, row) => {
        if (cell === null) throw new RangeError(`감긴 줄 ${wrap.reel}에 빈 칸이 있다`)
        const before = wrap.before[row] ?? cell.amount
        const after = wrap.after[row] ?? cell.amount
        if (before > 0 && after !== before) cell.value = cell.value * (after / before)
        cell.amount = after
      })
    }
  }
  applyWraps(outcome.entryWraps)
  for (const step of outcome.steps) {
    for (const cell of step.newCoins) {
      const column = board[cell.pos[0]]
      if (column === undefined) throw new RangeError(`코인 좌표가 판 밖이다: [${cell.pos[0]}, ${cell.pos[1]}]`)
      column[cell.pos[1]] = cloneCell(cell)
    }
    applyWraps(step.wraps)
  }
  return boardCells(board)
}

/**
 * 코인 리스핀 팩의 정산. 라인(또는 ways)·스캐터 배당 → 기본 판 코인 금액 → (진입이면) 리스핀 라운드.
 *
 * 리스핀은 추가 베팅이 없고 트리거 스핀 응답 하나에서 다 끝난다. 그래서 `nextState`를 만들지 않는다.
 * 지급 상한(`round.maxWinCap x totalBet`)은 스핀(=라운드) 단위로 건다. 라인 당첨을 먼저 채우고 남은 몫으로 리스핀을 준다.
 */
export function resolveCoinRespinSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  betUnit: number,
  gridBefore: SymbolId[][],
  mutations: MutationEvent[],
  rng: Rng | undefined,
): SpinResult {
  const config = requireConfig(math)
  if (rng === undefined) throw new RangeError('코인 금액 추첨에는 rng가 필요하다')
  const { wins, totalWin: lineWin } =
    math.payModel === 'ways' ? evaluateWays(grid, math, betUnit) : evaluate(grid, math, betUnit)
  const scatter = evaluateScatter(grid, math, totalBet)
  const coins = assignCoinValues(math, grid, totalBet, rng)

  const features: FeatureTrigger[] = []
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatter.win,
      positions: scatter.positions,
    })
  }
  if (coins.length > 0) features.push({ type: 'coinBoard', cells: coins.map(cloneCell) })

  const cap = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)
  let respinWin: number | undefined
  if (coins.length >= config.trigger) {
    const outcome = runCoinRespin(math, coins, totalBet, cap - lineWin - scatter.win, rng)
    features.push({ type: 'coinRespin', ...outcome })
    respinWin = outcome.win
    if (outcome.capped) {
      const requested = lineWin + scatter.win + outcomeRequested(config, outcome, totalBet)
      features.push({ type: 'winCapped', requested, granted: lineWin + scatter.win + outcome.win, cap })
    }
  }

  const result: SpinResult = {
    stops,
    gridBefore,
    grid,
    mutations,
    wins,
    lineWin,
    scatterWin: scatter.win,
    totalWin: lineWin + scatter.win + (respinWin ?? 0),
    features,
  }
  if (respinWin !== undefined) result.respinWin = respinWin
  return result
}

/** 상한이 없었다면 줬을 리스핀 지급 코인. */
function outcomeRequested(config: CoinRespinConfig, outcome: RespinOutcome, totalBet: number): number {
  const coins = outcome.final.reduce((sum, cell) => sum + cell.amount, 0)
  return coins + (outcome.full ? Math.round(config.treasures.top * totalBet) : 0)
}
