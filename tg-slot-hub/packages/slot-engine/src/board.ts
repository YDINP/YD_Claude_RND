import { pickWeighted } from './random.js'
import type { BoardBonusConfig } from './boardSchema.js'
import type { BoardBonusTrigger, BoardEnd, BoardThrow, FeatureTrigger, Rng, WinCappedTrigger } from './types.js'

/** 출발 칸 id. 스키마 검사를 통과한 설정에서만 부른다. */
export function boardStartNode(config: BoardBonusConfig): string {
  const found = Object.entries(config.nodes).find(([, node]) => node.kind === 'start')
  if (found === undefined) throw new RangeError('말판에 출발 칸이 없다')
  return found[0]
}

/** 출발 길 id (출발 칸으로 시작하는 길). */
export function boardStartRoute(config: BoardBonusConfig): string {
  const start = boardStartNode(config)
  const found = Object.entries(config.routes).find(([, nodes]) => nodes[0] === start)
  if (found === undefined) throw new RangeError('출발 칸으로 시작하는 길이 없다')
  return found[0]
}

/** 말판 진행 상태. 던지기 사이에 바뀌는 값 전부다. */
export interface BoardState {
  at: string
  route: string
  pot: number
  multiplier: number
  traps: number
  throwsLeft: number
  thrown: number
  /** 끝났으면 사유, 진행 중이면 undefined. */
  end?: BoardEnd
}

/** 말판 시작 상태: 출발 칸, 출발 길, 기회 `throws`, 배수 ×1, 바구니 0. */
export function initialBoardState(config: BoardBonusConfig): BoardState {
  return {
    at: boardStartNode(config),
    route: boardStartRoute(config),
    pot: 0,
    multiplier: 1,
    traps: 0,
    throwsLeft: config.throws,
    thrown: 0,
  }
}

/**
 * `route` 길을 따라 `at`에서 `steps`칸 간다. 결승을 넘치면 결승에 선다. **순수 함수**라 허브의
 * 도~모 미리보기도 이걸 쓴다(표시용, 결과가 아니다). 앞으로 칸·갈림길 처리는 하지 않는다.
 * @returns `path`는 지나간 노드(출발 칸 제외, 도착 칸 포함), `at`은 도착 칸.
 */
export function advanceBoard(
  config: BoardBonusConfig,
  at: string,
  route: string,
  steps: number,
): { path: string[]; at: string } {
  const nodes = config.routes[route]
  if (nodes === undefined) throw new RangeError(`없는 길: ${route}`)
  const index = nodes.indexOf(at)
  if (index < 0) throw new RangeError(`칸 ${at}이 길 ${route} 위에 없다`)
  const end = Math.min(nodes.length - 1, index + Math.max(0, steps))
  const path = nodes.slice(index + 1, end + 1)
  return { path, at: nodes[end] ?? at }
}

/**
 * 던지기 1회의 도착 칸 미리보기. 앞으로 칸까지 따라간 최종 칸과, 그 칸이 갈림길인지를 준다.
 * 허브가 «도·개·걸·윷·모 꼬리표»를 붙이는 데 쓴다. 결과를 정하지 않는다.
 */
export function previewBoardLanding(
  config: BoardBonusConfig,
  at: string,
  route: string,
  steps: number,
): { at: string; fork: boolean } {
  let landing = advanceBoard(config, at, route, steps).at
  const node = config.nodes[landing]
  if (node?.kind === 'forward') landing = advanceBoard(config, landing, route, node.value ?? 0).at
  return { at: landing, fork: config.forks[landing] !== undefined }
}

/** 기회를 하나 더 줄 수 있는가. 불변식 `던진 수 + 기회 <= maxThrows`를 지키는 유일한 관문이다. */
function canGrantThrow(config: BoardBonusConfig, state: { thrown: number; throwsLeft: number }): boolean {
  return state.thrown + state.throwsLeft < config.maxThrows
}

/**
 * 던지기 1회 처리. 엔진(`playBoard`)·재생(`replayBoard`)·DP(`boardExpectation`)가 **이 함수 하나**를 공유한다.
 * 순서: 기회 −1·던진 수 +1 → 윷·모면 기회 +1(상한 안) → 길 따라 이동 → 앞으로 칸이면 추가 이동
 * → 도착 칸 효과 → 갈림길에 멈췄으면 길 전환 → 종료 판정.
 */
export function stepBoard(
  config: BoardBonusConfig,
  state: BoardState,
  steps: number,
): { state: BoardState; record: BoardThrow } {
  const entry = config.throwTable.find((row) => row.steps === steps)
  if (entry === undefined) throw new RangeError(`윷 표에 없는 결과: ${steps}칸`)
  if (state.end !== undefined) throw new RangeError('이미 끝난 말판에 던졌다')

  let throwsLeft = state.throwsLeft - 1
  const thrown = state.thrown + 1
  let extraThrow = false
  if (entry.extraThrow === true && canGrantThrow(config, { thrown, throwsLeft })) {
    throwsLeft += 1
    extraThrow = true
  }

  const moved = advanceBoard(config, state.at, state.route, steps)
  let at = moved.at
  let node = config.nodes[at]
  let forward: string[] | undefined
  if (node?.kind === 'forward') {
    const pushed = advanceBoard(config, at, state.route, node.value ?? 0)
    forward = pushed.path
    at = pushed.at
    node = config.nodes[at]
  }
  if (node === undefined) throw new RangeError(`선언되지 않은 칸: ${at}`)

  let pot = state.pot
  let multiplier = state.multiplier
  let traps = state.traps
  let end: BoardEnd | undefined
  switch (node.kind) {
    case 'coin':
      pot += node.value ?? 0
      break
    case 'mult':
      multiplier = Math.min(config.maxMultiplier, multiplier + (node.value ?? 0))
      break
    case 'again':
      if (canGrantThrow(config, { thrown, throwsLeft })) throwsLeft += 1
      break
    case 'trap':
      traps += 1
      if (traps >= config.trapLimit) end = 'traps'
      break
    case 'goal':
      pot += node.value ?? 0
      end = 'goal'
      break
    case 'start':
    case 'forward':
      break
  }
  const route = config.forks[at] ?? state.route
  if (end === undefined && throwsLeft <= 0) end = 'throws'
  // 안전장치. 불변식상 기회 0이 늦어도 maxThrows번째 던지기 뒤에 먼저 온다.
  if (end === undefined && thrown >= config.maxThrows) end = 'throws'

  const record: BoardThrow = {
    steps,
    extraThrow,
    path: moved.path,
    ...(forward === undefined ? {} : { forward }),
    at,
    route,
    tile: node.kind,
    ...(node.value === undefined ? {} : { value: node.value }),
    pot,
    multiplier,
    traps,
    throwsLeft,
  }
  const next: BoardState = { at, route, pot, multiplier, traps, throwsLeft, thrown }
  if (end !== undefined) next.end = end
  return { state: next, record }
}

/** 지급 배수 `max(minPayout, pot x multiplier)` (총 베팅 배수). */
export function boardPayout(config: BoardBonusConfig, pot: number, multiplier: number): number {
  return Math.max(config.minPayout, pot * multiplier)
}

/** 윷 결과 추첨표. 키는 칸 수, 값은 정수 가중치. */
function throwWeights(config: BoardBonusConfig): Record<number, number> {
  const weights: Record<number, number> = {}
  for (const row of config.throwTable) weights[row.steps] = row.weight
  return weights
}

function finish(
  config: BoardBonusConfig,
  state: BoardState,
  throws: BoardThrow[],
  totalBet: number,
  capCoins: number,
): BoardBonusTrigger {
  const payout = boardPayout(config, state.pot, state.multiplier)
  const requested = Math.round(payout * totalBet)
  const win = Math.max(0, Math.min(requested, Math.floor(capCoins)))
  return {
    type: 'boardBonus',
    throws,
    end: state.end ?? 'throws',
    pot: state.pot,
    multiplier: state.multiplier,
    payout,
    win,
  }
}

/**
 * 말판을 끝까지 돈다. 던질 때마다 `pickWeighted` 1회(= `nextInt` 1회)를 쓴다.
 * @param capCoins 말판이 줄 수 있는 최대 코인 (라운드 캡 − 같은 스핀의 라인·스캐터 지급). 캡이 없으면 Infinity.
 */
export function playBoard(config: BoardBonusConfig, totalBet: number, rng: Rng, capCoins: number): BoardBonusTrigger {
  const weights = throwWeights(config)
  let state = initialBoardState(config)
  const throws: BoardThrow[] = []
  while (state.end === undefined && state.thrown < config.maxThrows) {
    const steps = pickWeighted(weights, rng)
    if (steps === undefined) throw new RangeError('윷 표가 비었다')
    const stepped = stepBoard(config, state, Number(steps))
    state = stepped.state
    throws.push(stepped.record)
  }
  return finish(config, state, throws, totalBet, capCoins)
}

/**
 * 저장된 윷 결과(칸 수 목록)로 말판을 다시 계산한다. RNG를 쓰지 않는다.
 * 허브 복원 스냅숏 검증과 테스트(`replayBoard === playBoard`)가 쓴다.
 */
export function replayBoard(
  config: BoardBonusConfig,
  steps: readonly number[],
  totalBet: number,
  capCoins: number,
): BoardBonusTrigger {
  let state = initialBoardState(config)
  const throws: BoardThrow[] = []
  for (const value of steps) {
    if (state.end !== undefined) throw new RangeError('말판이 끝난 뒤에도 던지기가 남았다')
    const stepped = stepBoard(config, state, value)
    state = stepped.state
    throws.push(stepped.record)
  }
  if (state.end === undefined) throw new RangeError('던지기가 모자라 말판이 끝나지 않았다')
  return finish(config, state, throws, totalBet, capCoins)
}

/**
 * 스핀 정산용. 말판을 돌리고 피처 목록(말판 + 필요하면 winCapped)과 지급 코인을 돌려준다.
 * @param capCoins 라운드 캡 코인. Infinity면 캡 없음.
 * @param baseWin 같은 스핀에서 이미 지급한 라인·스캐터 코인. 말판 몫만 `capCoins − baseWin` 안에서 자른다.
 */
export function applyBoardBonus(
  config: BoardBonusConfig,
  totalBet: number,
  rng: Rng,
  capCoins: number,
  baseWin: number,
): { features: FeatureTrigger[]; win: number } {
  const room = Math.max(0, capCoins - baseWin)
  const board = playBoard(config, totalBet, rng, room)
  const features: FeatureTrigger[] = [board]
  const requested = Math.round(board.payout * totalBet)
  if (board.win < requested) {
    const capped: WinCappedTrigger = {
      type: 'winCapped',
      requested: baseWin + requested,
      granted: baseWin + board.win,
      cap: capCoins,
    }
    features.push(capped)
  }
  return { features, win: board.win }
}
