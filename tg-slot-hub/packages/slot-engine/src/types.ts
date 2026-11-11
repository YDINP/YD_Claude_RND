/** 심볼 식별자. math.json의 `symbols[].id`와 `strips` 항목이 이 값을 공유한다. */
export type SymbolId = string

/**
 * 심볼 묶음 식별자. "아무 BAR"처럼 여러 심볼이 섞여도 지급하는 배당을 만들 때 쓴다.
 * 페이테이블에서 심볼 id와 같은 자리에 쓰이므로 둘은 이름이 겹칠 수 없다.
 */
export type GroupId = string

export interface Bet {
  totalBet: number
}

/** [reel, row] 좌표. */
export type GridPosition = [number, number]

export interface WinLine {
  /** `math.paylines`의 인덱스. */
  line: number
  /** 심볼 지급이면 심볼 id, 그룹 지급이면 그룹 id. */
  symbol: SymbolId | GroupId
  /** 그룹 배당으로 지급된 경우에만 채워진다. 클라이언트가 "Any BAR"로 표기할 때 쓴다. */
  group?: GroupId
  count: number
  /** ways 지급일 때 경로 수. 라인 지급이면 없다. */
  ways?: number
  /** ways 지급 방향. `bothWays` 게임에서 어느 쪽으로 읽었는지. */
  direction?: 'ltr' | 'rtl'
  /** 라인 게임은 betPerLine 배수, ways 게임은 웨이당 베팅액 배수, 클러스터는 총 베팅액 배수. */
  multiplier: number
  /** 실제 지급 코인 (정수). 연쇄 게임은 사다리 배수까지 곱한 값이다. */
  win: number
  positions: GridPosition[]
  /** 지급 종류. 없으면 `line === -1`이면 ways, 아니면 line이다 (기존 팩은 싣지 않는다). */
  payKind?: 'line' | 'ways' | 'cluster'
  /** 연쇄 단계 인덱스 (0부터). 연쇄 게임만. */
  cascade?: number
  /** 이 승리에 곱해진 사다리 배수. 연쇄 게임만. */
  ladder?: number
}

/** 주문 카드 종류. popSymbol은 스핀 사이 누적, 나머지 둘은 한 스핀 안에서 판정한다. */
export type OrderKind = 'popSymbol' | 'clusterSize' | 'chainLength'

/**
 * 주문 카드 라운드에 깔린 카드 1장. 값은 `math.orderRound.pool`의 항목에서 온다.
 *
 * `progress`는 0..target으로 묶인다. popSymbol은 터진 개수의 누적,
 * clusterSize/chainLength는 라운드 중 가장 좋았던 한 스핀의 값이다.
 */
export interface OrderCard {
  id: string
  kind: OrderKind
  /** popSymbol 전용. 와일드와 스캐터는 올 수 없다. */
  symbol?: SymbolId
  target: number
  progress: number
  /** 상품. **총 베팅액 배수**다 (코인 아님). */
  prize: number
}

/** 주문 카드 라운드의 스핀 간 상태. */
export interface OrderRoundCarry {
  /** 왼쪽 칸부터. 더 뽑을 카드가 없으면 칸이 비어 짧아진다. */
  cards: OrderCard[]
  /** 라운드에서 지금까지 뽑은 카드 수 (진입 때 slots장 포함). */
  drawn: number
  /** 상품을 인정받은 완료 장수. `maxOrders`를 넘지 않는다. */
  completed: number
  /** 지금까지 지급한 상품 합계 코인. */
  prizeTotal: number
}

/** 스핀 사이에 이월되는 피처 상태. 게임마다 필드를 더한다. 없으면 이월할 것이 없다. */
export interface RoundCarry {
  orders?: OrderRoundCarry
}

/**
 * 프리스핀 라운드 상태. 서버가 라운드를 이어 붙일 때 `spin`의 4번째 인자로 되돌려 준다.
 * shared의 `FreeSpinsState`와 1:1로 대응한다 (left / total / multiplier).
 * 시드와 시드 해시는 여기 넣지 않는다. 그것은 API의 라운드 레코드가 소유한다.
 */
export interface RoundState {
  /** 이 스핀을 **시작하기 전** 남은 프리스핀 횟수. */
  freeSpinsLeft: number
  /** 리트리거로 늘어난 것까지 포함한 누적 총 부여 횟수. */
  freeSpinsTotal: number
  /** 프리스핀 동안 승리에 곱해지는 배수. */
  multiplier: number
  /** 스핀 간 이월 상태. 쓰는 피처가 없는 팩은 키 자체가 없다. */
  carry?: RoundCarry
}

/** 프리스핀 진입 또는 리트리거. */
export interface FreeSpinsTrigger {
  type: 'freeSpins'
  /** 이번에 새로 부여된 횟수. */
  spins: number
  multiplier: number
  /** 이미 프리스핀 중이었다면 true (리트리거). */
  retrigger: boolean
}

/** 스캐터 배당. 라인과 무관하게 화면 어디에 있든 센다. */
export interface ScatterWinTrigger {
  type: 'scatterWin'
  symbol: SymbolId
  count: number
  /** 프리스핀 배수를 **곱하기 전** 코인. `SpinResult.totalWin`이 배수를 적용한다. */
  win: number
  positions: GridPosition[]
}

/**
 * 리트리거가 라운드 상한에 걸려 잘렸다는 기록.
 * 엔진은 예외를 던지지 않고 잘라내되, 무슨 일이 있었는지는 반드시 남긴다.
 */
export interface FreeSpinsCappedTrigger {
  type: 'freeSpinsCapped'
  /** 규칙대로면 부여됐어야 할 횟수. */
  requested: number
  /** 상한에 걸려 실제로 부여된 횟수. 0일 수 있다. */
  granted: number
  /** 라운드당 프리스핀 상한 (`MAX_FREE_SPINS_PER_ROUND`). */
  cap: number
}

/** 주문 카드 라운드 진입. 처음 깔리는 카드를 왼쪽 칸부터 싣는다. */
export interface OrderRoundTrigger {
  type: 'orderRound'
  cards: OrderCard[]
}

/** 주문 카드 1장 완료. 카드마다 하나씩 남는다. */
export interface OrderCompleteTrigger {
  type: 'orderComplete'
  id: string
  /** 실제 지급한 상품 **코인** (캡에 깎였으면 깎인 값). */
  prize: number
}

/** 라운드 지급 상한(`round.maxWinCap`)에 걸려 지급이 잘렸다는 기록. 값은 전부 코인이다. */
export interface WinCappedTrigger {
  type: 'winCapped'
  /** 규칙대로면 지급됐어야 할 코인. */
  requested: number
  /** 실제로 지급한 코인. */
  granted: number
  /** 라운드 상한 코인 (`maxWinCap x totalBet`). */
  cap: number
}

export type FeatureTrigger =
  | FreeSpinsTrigger
  | ScatterWinTrigger
  | FreeSpinsCappedTrigger
  | OrderRoundTrigger
  | OrderCompleteTrigger
  | WinCappedTrigger

/** 뮤테이션이 바꾼 칸 하나. */
export interface MutationCellChange {
  position: GridPosition
  from: SymbolId
  to: SymbolId
}

/** 뮤테이션 1단계가 실제로 무엇을 바꿨는지. 렌더러가 이걸 보고 연출한다. */
export interface MutationEvent {
  type: 'mystery' | 'expandWild' | 'upgrade' | 'randomWild'
  /** mystery면 공개된 심볼, upgrade면 승급 결과, 와일드 계열이면 와일드 id. */
  symbol?: SymbolId
  /** expandWild가 덮은 릴 인덱스. */
  reels?: number[]
  cells: MutationCellChange[]
}

export interface SpinResult {
  /** 릴별 정지 위치 (스트립 인덱스). */
  stops: number[]
  /** 뮤테이션을 적용하기 **전**, 릴이 그대로 멈춘 그리드. 리빌·확장 연출의 시작 프레임이다. */
  gridBefore: SymbolId[][]
  /** 평가에 실제로 쓰인 그리드. 뮤테이션이 없으면 `gridBefore`와 같다. */
  grid: SymbolId[][]
  /** 적용된 뮤테이션. 선언 순서대로, 실제로 무언가 바꾼 것만 담긴다. */
  mutations: MutationEvent[]
  /** 각 항목의 `win`은 프리스핀 배수를 곱하기 전 값이다. */
  wins: WinLine[]
  /** 페이라인 승리 합계. 배수 적용 전. */
  lineWin: number
  /** 스캐터 승리. 배수 적용 전. */
  scatterWin: number
  /** 실제 지급 코인. `(lineWin + scatterWin) x multiplier`. */
  totalWin: number
  features: FeatureTrigger[]
  /** 프리스핀이 남아 있을 때만 채워진다. 0이 되면 undefined. */
  nextState?: RoundState
  /** 연쇄 단계. 연쇄 팩만 싣는다. `grid`(첫 평가 그리드)에서 시작해 접는다. */
  cascades?: CascadeStep[]
  /** 연쇄가 끝난 판. `foldCascades(grid, cascades)`와 같다. 연쇄 팩만. */
  finalGrid?: SymbolId[][]
  /** 주문 카드 상품 합계 코인. `totalWin`에 이미 들어 있다. 주문 라운드 스핀만. */
  orderWin?: number
}

/**
 * 연쇄 1단계. 이 단계 시작 그리드에서 승리를 평가하고, 이긴 칸을 지운 뒤 중력으로 채운다.
 *
 * `refill[reel]`은 그 릴 위에서 새로 떨어지는 심볼을 **위에서 아래 순서로** 담는다.
 * 길이는 그 릴에서 지워진 칸 수와 같다. 다음 그리드의 그 릴은 `[...refill[reel], ...남은 칸(위→아래)]`이다.
 */
export interface CascadeStep {
  /** 0부터. */
  index: number
  /** 이 단계의 승리. `win`은 사다리 배수 적용 후 값이다. */
  wins: WinLine[]
  /** 지워진 칸 [reel, row]. 중복 없이 reel, row 오름차순. */
  removed: GridPosition[]
  refill: SymbolId[][]
  /** 이 단계의 사다리 배수. */
  multiplier: number
  /** 이 단계 지급 코인 합계 (캡 적용 후). */
  stepWin: number
}

/** 스핀 하나의 연쇄 전체 결과. 주문 집계(`tallyOrders`)의 유일한 입력이다. */
export interface CascadeOutcome {
  steps: CascadeStep[]
  finalGrid: SymbolId[][]
  /** 연쇄 지급 합계 코인. */
  win: number
  /** 지워진 칸 중 와일드가 아닌 심볼별 개수. */
  removedBySymbol: Record<SymbolId, number>
  /** 이번 스핀에서 지급된 가장 큰 그룹 크기 (와일드 포함). 승리가 없으면 0. */
  maxClusterSize: number
  /** 지급 상한에 걸려 잘렸는지. */
  capped: boolean
  /** `maxCascades`에 닿아 멈췄는지. */
  hitMaxCascades: boolean
}

export interface EvaluateResult {
  wins: WinLine[]
  totalWin: number
}

/** 화면 전체에서 센 스캐터. */
export interface ScatterResult {
  count: number
  positions: GridPosition[]
  /** 총 베팅액 배수. */
  multiplier: number
  /** 프리스핀 배수를 곱하기 전 코인. */
  win: number
}

/** 결정론 시드 RNG와 crypto RNG가 공유하는 최소 인터페이스. */
export interface Rng {
  /** 0 이상 maxExclusive 미만의 정수를 균등하게 반환한다. */
  nextInt(maxExclusive: number): number
}
