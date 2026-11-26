import type { CoinCell, ColumnWrap, GridPosition, SymbolId, TreasureTier } from '@tgslot/slot-engine'
import {
  RESPIN_COLLECT_MS,
  RESPIN_MAX_STAGGER_PORTION,
  RESPIN_PULSE_GAP_MS,
  RESPIN_PULSE_MAX_MS,
  RESPIN_SKIP_BUDGET_MS,
  RESPIN_SKIP_COLLECT_MS,
  RESPIN_SKIP_MAX_MS,
  RESPIN_SKIP_MIN_MS,
  RESPIN_SKIP_PIN_PORTION,
  RESPIN_SKIP_SPIN_PORTION,
  RESPIN_SKIP_WRAP_MIN_MS,
  RESPIN_SKIP_WRAP_MS,
  RESPIN_STAGGER_MS,
  RESPIN_STEP_MS,
  RESPIN_FULL_HOLD_MS,
  RESPIN_WRAP_MS,
  type RespinSpeedRow,
} from './respinConstants.js'
import type { SpinSpeed } from './timing.js'

/**
 * 코인 리스핀 재생 계획. **순수 모듈이다** — pixi도 gsap도 타이머도 없다(`purity.test.ts`가 막는다).
 *
 * 서버가 준 라운드(`coinRespin` 피처)를 화면이 «재생만» 할 수 있게 풀어 둔다. 리스핀마다 어느 칸이 도는지,
 * 어느 칸에 무엇이 서는지, 새 코인·촉수 감기·판 위 합계가 어떻게 변하는지, 단계 길이가 얼마인지가 여기서 정해진다.
 * 이 계획을 끝까지 접은 판은 서버의 `final`과 같아야 하고, 다르면 `mismatch`다(화면은 서버 값을 따른다).
 */

export type { RespinSpeedRow }

/** 코인 판(판 위 코인 보기). `board[reel][row]`, 빈 칸은 null. */
export type CoinBoardView = (CoinCell | null)[][]

/** 서버 피처에서 재생에 필요한 부분만. 허브가 `coinRespin` 피처를 그대로 넘겨도 들어맞는다. */
export interface RespinInput {
  entry: readonly CoinCell[]
  entryWraps: readonly ColumnWrap[]
  steps: readonly RespinStepInput[]
  final: readonly CoinCell[]
  full: boolean
  coinWin: number
  topWin: number
  win: number
  capped?: boolean
}

export interface RespinStepInput {
  index: number
  /** `grid[row][reel]`. 고정된 칸은 코인 심볼이다. */
  grid: readonly (readonly SymbolId[])[]
  newCoins: readonly CoinCell[]
  wraps: readonly ColumnWrap[]
  left: number
}

export function respinSpeedRow(speed?: SpinSpeed, reducedMotion = false): RespinSpeedRow {
  if (reducedMotion) return 'reduced'
  return speed ?? 'normal'
}

// ------------------------------------------------------------------ 판 접기

export function emptyCoinBoard(reels: number, rows: number): CoinBoardView {
  return Array.from({ length: reels }, () => new Array<CoinCell | null>(rows).fill(null))
}

function cloneCell(cell: CoinCell): CoinCell {
  const copy: CoinCell = { pos: [cell.pos[0], cell.pos[1]], kind: cell.kind, value: cell.value, amount: cell.amount }
  if (cell.tier !== undefined) copy.tier = cell.tier
  return copy
}

export function placeCoin(board: CoinBoardView, cell: CoinCell): void {
  const column = board[cell.pos[0]]
  if (column === undefined || cell.pos[1] < 0 || cell.pos[1] >= column.length) {
    throw new RangeError(`코인 좌표가 판 밖이다: [${cell.pos[0]}, ${cell.pos[1]}]`)
  }
  column[cell.pos[1]] = cloneCell(cell)
}

/** 촉수 감기를 판에 입힌다. 엔진 `foldRespin`과 한 글자도 다르지 않아야 한다(테스트가 비교한다). */
export function applyWrapsToBoard(board: CoinBoardView, wraps: readonly ColumnWrap[]): void {
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

/** 판 → 코인 목록(릴 → 행 순서). */
export function coinBoardCells(board: CoinBoardView): CoinCell[] {
  const cells: CoinCell[] = []
  for (const column of board) for (const cell of column) if (cell !== null) cells.push(cloneCell(cell))
  return cells
}

export function coinBoardTotal(board: CoinBoardView): number {
  let total = 0
  for (const column of board) for (const cell of column) if (cell !== null) total += cell.amount
  return total
}

export function coinBoardCount(board: CoinBoardView): number {
  let count = 0
  for (const column of board) for (const cell of column) if (cell !== null) count += 1
  return count
}

function boardFrom(reels: number, rows: number, cells: readonly CoinCell[]): CoinBoardView {
  const board = emptyCoinBoard(reels, rows)
  for (const cell of cells) placeCoin(board, cell)
  return board
}

/** 진입 판에서 시작해 단계를 접은 끝난 판의 코인(릴 → 행). 엔진 `foldRespin`과 같다. */
export function foldRespinBoard(reels: number, rows: number, input: Pick<RespinInput, 'entry' | 'entryWraps' | 'steps'>): CoinCell[] {
  const board = boardFrom(reels, rows, input.entry)
  applyWrapsToBoard(board, input.entryWraps)
  for (const step of input.steps) {
    for (const cell of step.newCoins) placeCoin(board, cell)
    applyWrapsToBoard(board, step.wraps)
  }
  return coinBoardCells(board)
}

function sameCoins(a: readonly CoinCell[], b: readonly CoinCell[]): boolean {
  if (a.length !== b.length) return false
  return a.every((cell, i) => {
    const other = b[i]
    return (
      other !== undefined &&
      cell.pos[0] === other.pos[0] &&
      cell.pos[1] === other.pos[1] &&
      cell.kind === other.kind &&
      cell.amount === other.amount &&
      (cell.tier ?? null) === (other.tier ?? null)
    )
  })
}

// ------------------------------------------------------------------ 시간표

export interface RespinStepDurations {
  /** 칸 회전. 마지막 칸이 서는 시각이다. */
  spinMs: number
  /** 새 코인이 붙을 때의 고정 연출(툭 → 멈춤 → 빛). 새 코인이 없으면 0. */
  pinMs: number
  /** 착지 뒤 읽는 시간. */
  settleMs: number
  /** 회전 안에서 칸마다 늦게 서는 간격. */
  staggerMs: number
  totalMs: number
}

function staggerFor(spinMs: number, spinningCells: number): number {
  if (spinningCells <= 1) return 0
  return Math.min(RESPIN_STAGGER_MS, Math.floor((spinMs * RESPIN_MAX_STAGGER_PORTION) / (spinningCells - 1)))
}

/** 리스핀 1회의 길이. `last`는 «1회 남음» 리스핀(칸 회전이 느려진다). */
export function respinStepDurations(
  row: RespinSpeedRow,
  options: { newCoins: boolean; last: boolean; spinningCells?: number },
): RespinStepDurations {
  const base = RESPIN_STEP_MS[row]
  const spinMs = options.last ? base.lastSpinMs : base.spinMs
  const pinMs = options.newCoins ? base.pinMs : 0
  const settleMs = base.settleMs
  return {
    spinMs,
    pinMs,
    settleMs,
    staggerMs: staggerFor(spinMs, options.spinningCells ?? 9),
    totalMs: spinMs + pinMs + settleMs,
  }
}

/** STOP 뒤 리스핀 1회의 길이. 남은 횟수로 나눠 [90, 220]ms로 묶는다. */
export function respinSkipStepMs(remaining: number): number {
  const count = Math.max(1, remaining)
  return Math.max(RESPIN_SKIP_MIN_MS, Math.min(RESPIN_SKIP_MAX_MS, RESPIN_SKIP_BUDGET_MS / count))
}

/** STOP 뒤 촉수 점멸 1줄. 남은 줄이 300ms를 나눠 쓰되 줄마다 90ms는 보인다(5줄이면 450ms). */
export function respinSkipWrapMs(remainingWraps: number): number {
  const count = Math.max(1, remainingWraps)
  return Math.max(RESPIN_SKIP_WRAP_MIN_MS, Math.round(RESPIN_SKIP_WRAP_MS / count))
}

/**
 * STOP 뒤 리스핀 1회를 `stepMs`에 맞춘다. 칸 회전은 압축해도 위치 트윈이다 —
 * 착지한 판에서 심볼이 제자리에서 바뀌어 보이는 일이 없다.
 */
export function compressRespinStep(stepMs: number, options: { newCoins: boolean; spinningCells?: number }): RespinStepDurations {
  const total = Math.round(stepMs)
  const spinMs = Math.max(1, Math.round(total * RESPIN_SKIP_SPIN_PORTION))
  const pinMs = options.newCoins ? Math.min(total - spinMs, Math.round(total * RESPIN_SKIP_PIN_PORTION)) : 0
  const settleMs = Math.max(0, total - spinMs - pinMs)
  return { spinMs, pinMs, settleMs, staggerMs: staggerFor(spinMs, options.spinningCells ?? 9), totalMs: total }
}

export interface RespinCompression {
  /** 남은 리스핀 1회의 길이. */
  stepMs: number
  /** 촉수 감기 1줄의 점멸. */
  wrapMs: number
  /** 정산 전체. */
  collectMs: number
}

/** STOP 순간 남은 리스핀 수로 정하는 압축 길이표. 단계마다 다시 나누지 않는다 — 합이 예산을 넘는다. */
export function compressRespin(remainingSteps: number): RespinCompression {
  return {
    stepMs: respinSkipStepMs(remainingSteps),
    wrapMs: RESPIN_SKIP_WRAP_MS,
    collectMs: RESPIN_SKIP_COLLECT_MS,
  }
}

export interface RespinWrapDurations {
  riseMs: number
  coilMs: number
  countMs: number
  totalMs: number
}

export function respinWrapDurations(row: RespinSpeedRow): RespinWrapDurations {
  const base = RESPIN_WRAP_MS[row]
  return { ...base, totalMs: base.riseMs + base.coilMs + base.countMs }
}

export interface RespinCollectDurations {
  /** 코인 하나가 합계로 날아가는 간격. */
  gapMs: number
  /** 날아가는 데 걸리는 시간. */
  flyMs: number
  /** 보물 코인이 더 머무는 시간. */
  treasureHoldMs: number
  /** 최고 보물 연출. 15칸일 때만 쓴다. */
  topMs: number
}

export function respinCollectDurations(row: RespinSpeedRow): RespinCollectDurations {
  return { ...RESPIN_COLLECT_MS[row] }
}

/** 정산 전체 길이(ms). 코인 하나씩 날리고, 보물 코인은 더 머물고, 15칸이면 최고 보물이 붙는다. */
export function respinCollectTotalMs(row: RespinSpeedRow, coins: readonly CoinCell[], full: boolean): number {
  const d = RESPIN_COLLECT_MS[row]
  const treasures = coins.filter((cell) => cell.kind === 'treasure').length
  return coins.length * d.gapMs + treasures * d.treasureHoldMs + d.flyMs + (full ? d.topMs : 0)
}

/** 진입 펄스의 코인 하나당 간격. 코인이 많으면 전체가 상한을 넘지 않게 줄인다. */
export function respinPulseGapMs(coins: number): number {
  if (coins <= 1) return RESPIN_PULSE_GAP_MS
  return Math.min(RESPIN_PULSE_GAP_MS, Math.floor(RESPIN_PULSE_MAX_MS / coins))
}

// ------------------------------------------------------------------ 계획

export interface RespinLanding {
  pos: GridPosition
  /** 이 리스핀이 칸에 세운 심볼. 코인이 붙는 칸이면 코인 심볼이다. */
  symbol: SymbolId
  /** 새 코인이 붙은 칸이면 그 코인(감기 전 금액). 아니면 null. */
  coin: CoinCell | null
  /** 이 칸이 몇 번째로 서는지(0부터). 스태거 순서다. */
  order: number
}

/** 감긴 줄의 칸 하나. 감기 전·후 금액과 종류. */
export interface RespinWrapCell {
  row: number
  kind: 'bet' | 'treasure'
  tier?: TreasureTier
  before: number
  after: number
}

export interface RespinWrapPlan {
  reel: number
  cells: RespinWrapCell[]
  /** 감기로 불어난 숫자 코인이 하나라도 있는가. 보물만 있는 줄은 숫자가 그대로다. */
  changed: boolean
}

export interface RespinPlanStep {
  index: number
  /** 이 리스핀을 시작할 때 남은 횟수. 첫 리스핀은 `respins`다. */
  leftBefore: number
  /** 1회 남음 리스핀인가. 칸 회전이 느려지고 HUD가 «마지막!»을 띄운다. */
  last: boolean
  /** 도는 칸(릴 → 행 순서). */
  spinning: GridPosition[]
  landings: RespinLanding[]
  newCoins: CoinCell[]
  wraps: RespinWrapPlan[]
  /** 이 리스핀 뒤 남은 횟수(새 코인이 있으면 리셋). */
  left: number
  /** 이 리스핀 뒤 비어 있는 칸. */
  empty: number
  /** 판 위 코인 금액 합: 이 리스핀 전 / 새 코인을 얹은 뒤(감기 전) / 감기까지 반영한 뒤. */
  coinTotalBefore: number
  coinTotalLanded: number
  coinTotal: number
  /** 이 리스핀 뒤까지 판에 나온 보물 단계(오름차순). */
  treasures: TreasureTier[]
  durations: RespinStepDurations
}

export interface RespinCollectItem {
  cell: CoinCell
  /** 이 코인까지 센 누적 금액(상한을 넘지 않는다). */
  running: number
}

export interface RespinPlan {
  reels: number
  rows: number
  /** 시작 횟수(`math.coinRespin.respins`). */
  respins: number
  speedRow: RespinSpeedRow
  entry: CoinCell[]
  entryWraps: RespinWrapPlan[]
  /** 진입 판 금액 합: 감기 전 / 감기 뒤. */
  entryTotalBefore: number
  entryTotal: number
  entryEmpty: number
  entryTreasures: TreasureTier[]
  steps: RespinPlanStep[]
  final: CoinCell[]
  full: boolean
  coinWin: number
  topWin: number
  win: number
  collect: RespinCollectItem[]
  /** 계획을 끝까지 접은 판이 서버 `final`과 다르면 true. 화면은 서버 값을 따른다. */
  mismatch: boolean
  /** 감기가 한 번이라도 있었나(진입 포함). */
  wrapCount: number
}

export interface RespinPlanOptions {
  speed?: SpinSpeed
  reducedMotion?: boolean
  /** 시작 횟수. 기본 3. */
  respins?: number
}

function wrapPlansFor(board: CoinBoardView, wraps: readonly ColumnWrap[]): RespinWrapPlan[] {
  return wraps.map((wrap) => {
    const column = board[wrap.reel] ?? []
    const cells = column.map((cell, row): RespinWrapCell => {
      const before = wrap.before[row] ?? cell?.amount ?? 0
      const after = wrap.after[row] ?? before
      const result: RespinWrapCell = { row, kind: cell?.kind ?? 'bet', before, after }
      if (cell?.tier !== undefined) result.tier = cell.tier
      return result
    })
    return { reel: wrap.reel, cells, changed: cells.some((cell) => cell.after !== cell.before) }
  })
}

function tiersOf(board: CoinBoardView): TreasureTier[] {
  const order: TreasureTier[] = ['small', 'medium', 'large']
  const seen = new Set<TreasureTier>()
  for (const column of board) for (const cell of column) if (cell?.tier !== undefined) seen.add(cell.tier)
  return order.filter((tier) => seen.has(tier))
}

/**
 * 서버가 준 라운드를 재생 계획으로 푼다. 어긋난 좌표는 던진다 — 호출 측이 연출을 버리고 판만 확정한다.
 * 순수 함수라 타이머 없이 순서·길이·합계를 그대로 검증할 수 있다.
 */
export function buildRespinPlan(reels: number, rows: number, input: RespinInput, options: RespinPlanOptions = {}): RespinPlan {
  const row = respinSpeedRow(options.speed, options.reducedMotion === true)
  const respins = options.respins ?? 3
  const cells = reels * rows

  const board = boardFrom(reels, rows, input.entry)
  const entryTotalBefore = coinBoardTotal(board)
  const entryWraps = wrapPlansFor(board, input.entryWraps)
  applyWrapsToBoard(board, input.entryWraps)
  const entryTotal = coinBoardTotal(board)
  const entryEmpty = cells - coinBoardCount(board)
  const entryTreasures = tiersOf(board)

  const steps: RespinPlanStep[] = []
  let leftBefore = respins
  input.steps.forEach((step, index) => {
    const coinTotalBefore = coinBoardTotal(board)
    const spinning: GridPosition[] = []
    for (let reel = 0; reel < reels; reel += 1) {
      for (let r = 0; r < rows; r += 1) if (board[reel]?.[r] === null) spinning.push([reel, r])
    }
    const coinAt = new Map(step.newCoins.map((coin) => [`${coin.pos[0]}:${coin.pos[1]}`, coin]))
    const landings = spinning.map(([reel, r], order): RespinLanding => {
      const symbol = step.grid[r]?.[reel]
      if (symbol === undefined) throw new RangeError(`리스핀 ${index}: 칸 [${reel}, ${r}]의 심볼이 없다`)
      return { pos: [reel, r], symbol, coin: coinAt.get(`${reel}:${r}`) ?? null, order }
    })
    for (const coin of step.newCoins) {
      if (board[coin.pos[0]]?.[coin.pos[1]] !== null) {
        throw new RangeError(`리스핀 ${index}: 새 코인 [${coin.pos[0]}, ${coin.pos[1]}]이 이미 찬 칸이다`)
      }
      placeCoin(board, coin)
    }
    const coinTotalLanded = coinBoardTotal(board)
    const wraps = wrapPlansFor(board, step.wraps)
    applyWrapsToBoard(board, step.wraps)
    const newCoins = step.newCoins.map(cloneCell)
    steps.push({
      index,
      leftBefore,
      last: leftBefore === 1,
      spinning,
      landings,
      newCoins,
      wraps,
      left: step.left,
      empty: cells - coinBoardCount(board),
      coinTotalBefore,
      coinTotalLanded,
      coinTotal: coinBoardTotal(board),
      treasures: tiersOf(board),
      durations: respinStepDurations(row, {
        newCoins: newCoins.length > 0,
        last: leftBefore === 1,
        spinningCells: spinning.length,
      }),
    })
    leftBefore = step.left
  })

  const folded = coinBoardCells(board)
  const final = input.final.map(cloneCell)

  // 정산: 릴 → 행 순서로 하나씩 센다. 지급 상한에 잘렸으면 누적이 `coinWin`을 넘지 않는다.
  const collect: RespinCollectItem[] = []
  let cumulative = 0
  for (const cell of final) {
    cumulative += cell.amount
    collect.push({ cell, running: Math.min(cumulative, input.coinWin) })
  }

  return {
    reels,
    rows,
    respins,
    speedRow: row,
    entry: input.entry.map(cloneCell),
    entryWraps,
    entryTotalBefore,
    entryTotal,
    entryEmpty,
    entryTreasures,
    steps,
    final,
    full: input.full,
    coinWin: input.coinWin,
    topWin: input.topWin,
    win: input.win,
    collect,
    mismatch: !sameCoins(folded, final),
    wrapCount: input.entryWraps.length + input.steps.reduce((sum, step) => sum + step.wraps.length, 0),
  }
}

// ------------------------------------------------------------------ 시간 예산

export interface RespinBudgetOptions {
  /** 진입·복귀 전환 클립 길이(ms)의 합. 기본 6,000(클립 2편). */
  clipMs?: number
  /** 클립 밖의 진입 연출: 코인 펄스 + 마퀴 흔들림. 기본은 계획의 진입 코인 수로 계산한다. */
  introMs?: number
}

/**
 * 라운드 전체 길이 추정(ms). 진입 펄스·흔들림 → 클립 → 리스핀·촉수 → 정산 → 클립.
 * 빅윈 셀레브레이션은 예산 밖이다(candy R2처럼 기존 스킵 핸들로 줄인다). 시간 예산 게이트 테스트가 쓴다.
 */
export function respinRoundMs(plan: RespinPlan, options: RespinBudgetOptions = {}): number {
  const row = plan.speedRow
  const clipMs = options.clipMs ?? 6000
  const pulse = plan.entry.length * respinPulseGapMs(plan.entry.length)
  const shake = row === 'reduced' ? 0 : 400
  const intro = options.introMs ?? pulse + shake
  const wrap = respinWrapDurations(row).totalMs
  const stepsMs = plan.steps.reduce((sum, step) => sum + step.durations.totalMs + step.wraps.length * wrap, 0)
  const entryWrapMs = plan.entryWraps.length * wrap
  const fullHold = plan.full && row !== 'reduced' ? RESPIN_FULL_HOLD_MS : 0
  return intro + clipMs + entryWrapMs + stepsMs + fullHold + respinCollectTotalMs(row, plan.final, plan.full)
}
