/** 심볼 식별자. math.json의 `symbols[].id`와 `strips` 항목이 이 값을 공유한다. */
export type SymbolId = string

export interface Bet {
  totalBet: number
}

/** [reel, row] 좌표. */
export type GridPosition = [number, number]

export interface WinLine {
  /** `math.paylines`의 인덱스. */
  line: number
  symbol: SymbolId
  count: number
  /** betPerLine 배수. */
  multiplier: number
  /** 실제 지급 코인 (정수). */
  win: number
  positions: GridPosition[]
}

export interface FeatureTrigger {
  type: string
  symbol?: SymbolId
  count?: number
}

/**
 * 다음 스핀으로 넘길 라운드 상태. 프리스핀 잔여 횟수나 누적 배수 같은 것들.
 * Phase 1 엔진은 만들지 않지만 서버가 라운드를 이어 붙일 자리를 미리 비워 둔다.
 * 시드와 시드 해시는 여기 넣지 않는다. 그것은 API의 라운드 레코드가 소유한다.
 */
export type RoundState = { freeSpinsLeft?: number; multiplier?: number } & Record<string, unknown>

export interface SpinResult {
  /** 릴별 정지 위치 (스트립 인덱스). */
  stops: number[]
  /** 화면에 보이는 심볼. `grid[row][reel]` 순서다. */
  grid: SymbolId[][]
  wins: WinLine[]
  totalWin: number
  features: FeatureTrigger[]
  /** 프리스핀 등 다음 상태가 있을 때만 채워진다. */
  nextState?: RoundState
}

export interface EvaluateResult {
  wins: WinLine[]
  totalWin: number
}

/** 결정론 시드 RNG와 crypto RNG가 공유하는 최소 인터페이스. */
export interface Rng {
  /** 0 이상 maxExclusive 미만의 정수를 균등하게 반환한다. */
  nextInt(maxExclusive: number): number
}
