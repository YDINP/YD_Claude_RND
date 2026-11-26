import { z } from 'zod'
import { boardExpectation } from './boardExact.js'

/** 말판 칸 1개. 값의 단위는 칸 종류마다 다르다 (코인·결승 = 총 베팅 배수, 배수 = 더하는 배수, 앞으로 = 칸 수). */
export const BoardNodeSchema = z.object({
  kind: z.enum(['start', 'coin', 'mult', 'forward', 'again', 'trap', 'goal']),
  value: z.number().int().min(0).optional(),
})
export type BoardNode = z.infer<typeof BoardNodeSchema>

/** 윷 던지기 결과 1종. 가중치는 정수라 추첨 확률이 DP와 정확히 같다. */
export const BoardThrowEntrySchema = z.object({
  steps: z.number().int().min(1).max(5),
  weight: z.number().int().positive(),
  /** 이 결과가 나오면 기회 +1 (윷·모). 상한 안에서만. */
  extraThrow: z.boolean().optional(),
})
export type BoardThrowEntry = z.infer<typeof BoardThrowEntrySchema>

/** 말판 던지기 하드캡의 절대 상한. 응답 크기(던지기당 약 130B)와 종료 보장을 함께 묶는다. */
export const BOARD_MAX_THROWS_LIMIT = 20

/**
 * 말판 보너스. 스캐터 `trigger`개가 유료 스핀에 뜨면 같은 스핀 안에서 말판을 끝까지 돈다.
 * 다른 보너스(프리스핀·주문 카드·연쇄·더블업)와 함께 둘 수 없다.
 */
export const BoardBonusConfigSchema = z.object({
  /** 진입 스캐터 개수. */
  trigger: z.number().int().min(1),
  /** 처음 주는 기회. */
  throws: z.number().int().min(1),
  /** 던지기 하드캡. 불변식 `던진 수 + 기회 <= maxThrows`로 지킨다. */
  maxThrows: z.number().int().min(1).max(BOARD_MAX_THROWS_LIMIT),
  /** 함정을 이만큼 밟으면 즉시 끝. */
  trapLimit: z.number().int().min(1),
  /** 배수 상한 (×1에서 시작). */
  maxMultiplier: z.number().int().min(1),
  /** 최소 지급. 총 베팅 배수. */
  minPayout: z.number().int().min(0),
  /** 말판 최대 지급(총 베팅 배수). DP가 구한 구조상 최대가 이 값을 넘으면 스키마 오류다. */
  maxWin: z.number().int().positive(),
  throwTable: z.array(BoardThrowEntrySchema).min(1),
  /** 화면 좌표표 이름. 수학은 쓰지 않는다 (허브가 노드 좌표를 갖는다). */
  layout: z.string().min(1),
  nodes: z.record(z.string().min(1), BoardNodeSchema),
  /** 길 id -> 노드 id 배열. 출발 칸으로 시작하는 길이 정확히 하나, 모든 길은 결승으로 끝난다. */
  routes: z.record(z.string().min(1), z.array(z.string().min(1)).min(2)),
  /** 갈림길 노드 id -> 그 칸에 멈추면 다음부터 탈 길 id. 길의 첫 칸이 그 노드여야 한다. */
  forks: z.record(z.string().min(1), z.string().min(1)).default({}),
})
export type BoardBonusConfig = z.infer<typeof BoardBonusConfigSchema>

/** 값이 반드시 있어야 하는 칸 종류와 최솟값. */
const VALUE_RULES: Partial<Record<BoardNode['kind'], number>> = { coin: 1, mult: 1, forward: 1, goal: 0 }

/** `checkBoardConfig`가 읽는 게임 수학의 일부. 순환 import를 피하려고 구조로만 받는다. */
export interface BoardHostMath {
  rows: number
  strips: readonly (readonly string[])[]
  boardBonus?: BoardBonusConfig
  scatter?: { symbol: string; freeSpins?: unknown }
  cascade?: unknown
  orderRound?: unknown
  gamble?: unknown
}

type Issue = (message: string, path: (string | number)[]) => void

/**
 * 말판 설정의 정적 검사. 종료 보장(GAME_CATALOG §4 규칙 1~3)과 다른 보너스와의 공존 금지를 본다.
 * 구조 검사가 전부 통과해야만 DP로 구조상 최대 지급을 구해 `maxWin`과 비교한다.
 */
export function checkBoardConfig(math: BoardHostMath, issue: Issue): void {
  const board = math.boardBonus
  if (board === undefined) return
  const at = (...path: (string | number)[]): (string | number)[] => ['boardBonus', ...path]
  const before = { count: 0 }
  const report: Issue = (message, path) => {
    before.count += 1
    issue(message, path)
  }

  if (math.scatter === undefined) report('말판 보너스는 스캐터로 열린다. scatter 설정이 필요하다', at())
  if (math.scatter?.freeSpins !== undefined) report('boardBonus와 scatter.freeSpins는 함께 둘 수 없다', at())
  if (math.orderRound !== undefined) report('boardBonus와 orderRound는 함께 둘 수 없다', at())
  if (math.cascade !== undefined) report('boardBonus와 cascade는 함께 둘 수 없다', at())
  // 더블업은 착지 순간 `pendingWin`으로 말판 몫을 드러낸다(결과 누설).
  if (math.gamble !== undefined) report('boardBonus와 gamble은 함께 둘 수 없다', at())
  if (math.scatter !== undefined) {
    const symbol = math.scatter.symbol
    const reelsWithScatter = math.strips.filter((strip) => strip.includes(symbol)).length
    if (board.trigger > reelsWithScatter * math.rows) {
      report(`트리거 ${board.trigger}개가 스캐터가 놓일 수 있는 칸 수(${reelsWithScatter * math.rows})보다 많다`, at('trigger'))
    }
  }
  if (board.throws > board.maxThrows) {
    report(`처음 기회(${board.throws})가 maxThrows(${board.maxThrows})보다 많다`, at('throws'))
  }

  const steps = new Set<number>()
  board.throwTable.forEach((entry, index) => {
    if (steps.has(entry.steps)) report(`중복 윷 결과: ${entry.steps}칸`, at('throwTable', index, 'steps'))
    steps.add(entry.steps)
  })

  const nodes = board.nodes
  const ids = Object.keys(nodes)
  const starts = ids.filter((id) => nodes[id]?.kind === 'start')
  const goals = ids.filter((id) => nodes[id]?.kind === 'goal')
  if (starts.length !== 1) report(`출발 칸은 정확히 1개여야 한다 (지금 ${starts.length}개)`, at('nodes'))
  if (goals.length !== 1) report(`결승 칸은 정확히 1개여야 한다 (지금 ${goals.length}개)`, at('nodes'))
  for (const id of ids) {
    const node = nodes[id]
    if (node === undefined) continue
    const min = VALUE_RULES[node.kind]
    if (min !== undefined && (node.value === undefined || node.value < min)) {
      report(`${node.kind} 칸 ${id}에는 ${min} 이상의 정수 value가 필요하다`, at('nodes', id, 'value'))
    }
    if (min === undefined && node.value !== undefined) {
      report(`${node.kind} 칸 ${id}는 value를 두지 않는다`, at('nodes', id, 'value'))
    }
  }
  const start = starts[0]
  const goal = goals[0]

  const routes = board.routes
  const routeIds = Object.keys(routes)
  const onRoute = new Set<string>()
  let startRoutes = 0
  for (const routeId of routeIds) {
    const route = routes[routeId] ?? []
    const seen = new Set<string>()
    route.forEach((id, index) => {
      if (nodes[id] === undefined) report(`선언되지 않은 칸: ${id}`, at('routes', routeId, index))
      if (seen.has(id)) report(`길 ${routeId}에 칸 ${id}가 두 번 나온다 (순환)`, at('routes', routeId, index))
      seen.add(id)
      onRoute.add(id)
      if (id === goal && index !== route.length - 1) {
        report(`결승 칸은 길의 끝에만 올 수 있다: ${routeId}`, at('routes', routeId, index))
      }
      if (id === start && index !== 0) report(`출발 칸은 길의 처음에만 올 수 있다: ${routeId}`, at('routes', routeId, index))
    })
    if (route[route.length - 1] !== goal) report(`길 ${routeId}가 결승으로 끝나지 않는다`, at('routes', routeId))
    if (route[0] === start) startRoutes += 1
  }
  if (startRoutes !== 1) report(`출발 칸으로 시작하는 길은 정확히 1개여야 한다 (지금 ${startRoutes}개)`, at('routes'))
  for (const id of ids) {
    if (!onRoute.has(id)) report(`어느 길에도 없는 칸: ${id}`, at('nodes', id))
  }

  const forked = new Set<string>()
  for (const [nodeId, routeId] of Object.entries(board.forks)) {
    const route = routes[routeId]
    if (route === undefined) {
      report(`갈림길 ${nodeId}가 없는 길 ${routeId}을 가리킨다`, at('forks', nodeId))
      continue
    }
    forked.add(routeId)
    if (route[0] !== nodeId) report(`길 ${routeId}의 첫 칸이 갈림길 ${nodeId}가 아니다`, at('forks', nodeId))
    const kind = nodes[nodeId]?.kind
    if (kind === undefined) report(`선언되지 않은 갈림길 칸: ${nodeId}`, at('forks', nodeId))
    else if (kind === 'goal' || kind === 'start' || kind === 'forward') {
      report(`${kind} 칸은 갈림길이 될 수 없다: ${nodeId}`, at('forks', nodeId))
    }
    // 단조 감소 척도: 지름길로 갈아타도 결승까지 남은 걸음이 늘면 안 된다.
    const shortcutLeft = route.length - 1
    for (const otherId of routeIds) {
      if (otherId === routeId) continue
      const other = routes[otherId] ?? []
      const index = other.indexOf(nodeId)
      if (index < 0) continue
      const left = other.length - 1 - index
      if (shortcutLeft > left) {
        report(
          `갈림길 ${nodeId}: 지름길 ${routeId}의 남은 걸음(${shortcutLeft})이 길 ${otherId}의 남은 걸음(${left})보다 길다`,
          at('forks', nodeId),
        )
      }
    }
  }
  for (const routeId of routeIds) {
    const route = routes[routeId] ?? []
    if (route[0] !== start && !forked.has(routeId)) {
      report(`어느 갈림길도 가리키지 않는 길: ${routeId}`, at('routes', routeId))
    }
  }

  // 앞으로 칸이 다시 앞으로 칸에 내려 주면 안 된다 (연쇄 없음 규칙).
  for (const [id, node] of Object.entries(nodes)) {
    if (node.kind !== 'forward') continue
    for (const routeId of routeIds) {
      const route = routes[routeId] ?? []
      const index = route.indexOf(id)
      if (index < 0) continue
      const landing = route[Math.min(route.length - 1, index + (node.value ?? 0))]
      if (landing !== undefined && nodes[landing]?.kind === 'forward') {
        report(`앞으로 칸 ${id}가 길 ${routeId}에서 또 앞으로 칸(${landing})에 내려 준다`, at('nodes', id))
      }
    }
  }

  if (before.count > 0) return
  const exact = boardExpectation(board)
  if (exact.max > board.maxWin) {
    report(`말판 구조상 최대 지급 ${exact.max}배가 maxWin(${board.maxWin})을 넘는다`, at('maxWin'))
  }
}
