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
  /** 라인 게임은 betPerLine 배수, ways 게임은 웨이당 베팅액 배수. */
  multiplier: number
  /** 실제 지급 코인 (정수). */
  win: number
  positions: GridPosition[]
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

export type FeatureTrigger = FreeSpinsTrigger | ScatterWinTrigger

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
