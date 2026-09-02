/**
 * 검수(audit) 리포트의 자료 구조. CLI와 시뮬레이터 GUI가 같은 타입을 공유한다.
 * 이 폴더의 모든 모듈은 브라우저에서도 돌아야 하므로 node:* 를 쓰지 않는다.
 */
import type { GameMath, GridPosition, RtpBreakdown, SymbolId, WinLine } from '@tgslot/slot-engine'

/** 심볼 또는 그룹 하나가 RTP에 기여하는 몫. */
export interface ContributionRow {
  /** 심볼 id 또는 그룹 id. */
  key: string
  /** 표시용 이름 (ko 우선). */
  label: string
  /** 전수 조사 전체에서 이 키가 지급한 코인 총합. */
  win: number
  /** 이 키가 만든 RTP (win / (조합 수 x 총 베팅액)). */
  rtp: number
  /** 전체 RTP 대비 비중 (0~1). */
  share: number
  /** 이 키로 지급된 승리 라인 개수. */
  hits: number
}

/** 페이라인 하나의 RTP 기여. */
export interface LineContributionRow {
  line: number
  /** 릴별 행 인덱스. 예: [1,1,1]. */
  pattern: number[]
  win: number
  rtp: number
  share: number
  hits: number
}

/** 매치 개수(2/3-of-a-kind)별 RTP 기여. */
export interface CountContributionRow {
  count: number
  win: number
  rtp: number
  share: number
  hits: number
}

/** ways 지급 1건이 몇 개의 경로로 지급됐는지의 분포. 라인 게임에는 없다. */
export interface WaysContributionRow {
  /** 이 지급이 커버한 경로 수 (`WinLine.ways`). */
  ways: number
  /** 방향별로 나눠 본다. bothWays가 아니면 전부 ltr이다. */
  direction: 'ltr' | 'rtl'
  win: number
  rtp: number
  share: number
  hits: number
}

/** 뮤테이션 1종이 표본에서 얼마나 자주 발동했고 얼마를 만들었는지. */
export interface MutationStatRow {
  /** 엔진의 `MutationEvent.type`. mystery / expandWild / upgrade / randomWild. */
  type: string
  /** 이 뮤테이션이 실제로 무언가를 바꾼 스핀 수 (프리스핀 포함). */
  spins: number
  /** 관측 스핀 대비 발동 빈도. */
  frequency: number
  /** 바꾼 칸 수 합계. */
  cellsChanged: number
  /**
   * 이 뮤테이션이 발동한 스핀들이 지급한 코인의, 유료 스핀당 기대 배수.
   * 한 스핀에 여러 뮤테이션이 겹칠 수 있으므로 종류별 값의 합은 전체 RTP를 넘을 수 있다.
   */
  rtp: number
  /** 전체 RTP 대비. 위와 같은 이유로 합이 1을 넘을 수 있다. */
  share: number
}

/** 배수 분포 히스토그램의 한 칸. */
export interface HistogramRow {
  key: string
  label: string
  combos: number
  probability: number
  /** 이 구간이 RTP에 기여하는 몫. 전체 합 = rtp. */
  rtpShare: number
}

/**
 * 분포를 얻은 방법. 엔진의 `ExactRtpReport.method`와 같은 값이다.
 *
 * - `enumerate` — 모든 정지 조합을 계산. RTP가 정확값이다.
 * - `analytic` — 닫힌 식. RTP는 정확값이고 분포만 표본이다.
 * - `monte-carlo` — RTP까지 표본이다. 뮤테이션·캐스케이드처럼 릴 독립이 깨져
 *   닫힌 식이 없는 모델이 여기로 온다. 이때는 정밀도(`precision`)가 게이트의 일부다.
 */
export type DistributionMethod = 'enumerate' | 'analytic' | 'monte-carlo'

/**
 * 표본으로 낸 RTP의 정밀도. `monte-carlo` 방법일 때만 채워진다.
 * 감사 리포트는 이 넷(spins·seed·stdErr·ci95)을 반드시 기록해야 한다.
 */
export interface RtpPrecision {
  /** 유료 스핀 수. */
  spins: number
  seed: string
  /** 표준오차 = 라운드 배수의 표본표준편차 / sqrt(n). */
  stdErr: number
  /** 95% 신뢰구간 반폭 = 1.96 x stdErr. */
  ci95HalfWidth: number
  ci95Low: number
  ci95High: number
}

/** 프리스핀·스캐터 요약. 두 기능이 다 없는 게임은 null이다. */
export interface FeatureReport {
  scatterSymbol: string | null
  /** 유료 스핀 1회가 프리스핀을 열 확률. */
  triggerProbability: number
  /** 트리거 1회가 낳는 기대 프리스핀 수 (리트리거 포함). */
  spinsPerTrigger: number
  /** 프리스핀 동안 승리에 곱해지는 배수. */
  multiplier: number
  retrigger: boolean
  /** 프리스핀이 전체 RTP에서 차지하는 몫 (0~1). */
  freeSpinsShare: number
  /** 스캐터 배당이 전체 RTP에서 차지하는 몫 (0~1). */
  scatterShare: number
  /** 표본에서 관측된 트리거 비율. 표본을 돌리지 않았으면 null. */
  observedTriggerRate: number | null
  /** 유료 스핀 1회당 실제로 돌아간 프리스핀 수. 표본이 없으면 null. */
  observedFreeSpinsPerPaidSpin: number | null
}

/**
 * RTP와 그 분해. 전수 조사(작은 모델)와 해석적 계산 + 표본(큰 모델) 양쪽이 같은 모양을 낸다.
 * `estimated`가 true면 `rtp`만 정확값이고 나머지 분포·기여도는 고정 시드 표본 추정이다.
 */
export interface DistributionReport {
  method: DistributionMethod
  estimated: boolean
  totalBet: number
  betPerLine: number
  /** 이론상 정지 조합 수. 해석 모드에서도 채운다. */
  combos: number
  /** 분포를 만든 관측 수. 전수면 조합 수, 표본이면 유료 스핀 수. */
  observations: number
  /** 표본 모드에서 쓴 시드. 전수면 null. */
  sampleSeed: string | null
  /** 프리스핀 기여까지 포함한 정확한 RTP. */
  rtp: number
  breakdown: RtpBreakdown
  /** 기여도 행들의 합. 전수 모드면 rtp와 같고, 표본 모드면 표본 추정값이다. */
  contributionTotal: number
  /** 유료 스핀이 무언가를 지급할 확률. */
  hitRate: number
  /** 관측된 최대 라운드 배수 (프리스핀 누적 포함). */
  maxWinMultiplier: number
  /** 승리가 있었던 관측 수. */
  winObservations: number
  symbols: ContributionRow[]
  /** 그룹 배당(`WinLine.group`)으로 지급된 몫. 그룹이 없는 게임은 빈 배열. */
  groups: ContributionRow[]
  lines: LineContributionRow[]
  /** ways 게임의 경로 수 분포. 라인 게임은 빈 배열. */
  ways: WaysContributionRow[]
  /** 이 게임이 ways 모델인가. 표를 라인 대신 웨이즈로 그릴지 정한다. */
  isWays: boolean
  counts: CountContributionRow[]
  histogram: HistogramRow[]
  /** 뮤테이션 종류별 발동 통계. 표본 모드에서만 채워진다. */
  mutations: MutationStatRow[]
  /** 표본에서 실제로 관측한 프리스핀 통계. 전수 모드에서는 null. */
  observedFeatures: ObservedFeatures | null
  /** RTP가 표본에서 나왔을 때의 정밀도. enumerate/analytic이면 null. */
  precision: RtpPrecision | null
}

/** 샘플 스핀에 붙는 뮤테이션 요약. 엔진 `MutationEvent`를 화면용으로 줄인 것. */
export interface SampleMutation {
  type: string
  symbol?: string
  reels?: number[]
  /** 바뀐 칸 좌표 (`reel,row`). 전/후 격자 비교 하이라이트용. */
  cells: string[]
}

export interface ObservedFeatures {
  /** 프리스핀을 연 유료 스핀 수. */
  triggers: number
  /** 실제로 돌아간 프리스핀 수. */
  freeSpins: number
  /** 관측한 유료 스핀 수. */
  spins: number
}

/** 베팅 레벨별 전수 조사 요약. */
export interface BetLevelRow {
  totalBet: number
  betPerLine: number
  rtp: number
  /** 해석 모드에서는 베팅 레벨마다 표본을 돌리지 않으므로 null이다. */
  hitRate: number | null
  maxWinMultiplier: number | null
  /** 이 행의 RTP를 어떻게 냈는지. */
  method: DistributionMethod
  /** 표본으로 낸 행이면 95% 신뢰구간 반폭. 아니면 null. */
  ci95HalfWidth: number | null
  /** 목표 RTP와의 차이 (%p 아님, 소수). */
  delta: number
  pass: boolean
}

/** 몬테카를로 누적 지표. `simulate()` 결과를 청크 단위로 합친 것. */
export interface McAggregate {
  /** 유료 스핀 수. 프리스핀은 세지 않는다. */
  spins: number
  rtp: number
  hitRate: number
  /** 라운드 승리 배수의 표준편차. */
  stdDev: number
  maxWin: number
  /** 실제로 돌아간 프리스핀 수. */
  freeSpinsPlayed: number
  /** 유료 스핀이 프리스핀을 연 비율. */
  triggerRate: number
}

export interface ConvergencePoint {
  spins: number
  rtp: number
}

export interface MonteCarloResult extends McAggregate {
  seed: string
  totalBet: number
  elapsedMs: number
  /** 진행률 1%마다 기록한 누적 RTP. 수렴 곡선용. */
  convergence: ConvergencePoint[]
}

/** 몬테카를로와 전수 조사의 일치 판정. */
export interface AgreementVerdict {
  /** MC RTP - 전수 조사 RTP (소수). */
  diff: number
  /** 표준오차 = stdDev / sqrt(n). */
  standardError: number
  /** 95% 신뢰구간 반폭 = 1.96 x SE. */
  halfWidth95: number
  ciLow: number
  ciHigh: number
  /** 판정 임계값 = 3 x SE. */
  threshold: number
  pass: boolean
}

export interface RuinReport {
  trials: number
  spins: number
  /** 시작 잔액 = 이 값 x 총 베팅액. */
  startBalanceMultiple: number
  ruined: number
  ruinRate: number
  /** 살아남은 판의 중앙값 잔액 (총 베팅액 배수). */
  medianEndMultiple: number
  /** 파산한 판의 평균 생존 스핀 수. 파산이 없으면 null. */
  meanSpinsToRuin: number | null
}

/** manifest.json에서 스키마 밖의 선택 필드를 defensive하게 읽은 값. */
export interface ManifestExtras {
  jackpotContribution?: number
  rtpTotalTarget?: number
  /** 이 게임에 요구할 최대 배수 하한. 없으면 릴 수로 정한다. */
  maxWinTarget?: number
  nameKo?: string
  nameEn?: string
  version?: string
  status?: string
  features?: string[]
}

export interface JackpotAccounting {
  baseRtp: number
  contribution: number
  totalRtp: number
  target: number | null
  delta: number | null
  pass: boolean | null
}

export interface GateRow {
  label: string
  pass: boolean
  detail: string
}

export interface GameSummaryInfo {
  id: string
  nameKo: string | null
  nameEn: string | null
  reels: number
  rows: number
  lines: number
  betLevels: number[]
  stripLengths: number[]
  symbolCount: number
  rtpTarget: number
  volatility: string
  /** math.json에 그룹이 정의돼 있으면 그 목록. 없으면 빈 배열. */
  groups: GroupInfo[]
}

export interface GroupInfo {
  id: string
  label: string
  symbols: string[]
}

/** 샘플 스핀 1회. GUI의 "샘플 스핀" 탭이 쓴다. */
export interface SampleSpin {
  index: number
  /** 이 스핀이 속한 라운드 번호. 프리스핀은 자기를 연 유료 스핀과 같은 번호를 쓴다. */
  round: number
  stops: number[]
  /** grid[row][reel]. */
  grid: SymbolId[][]
  wins: WinLine[]
  totalWin: number
  /** 총 베팅액 대비 배수. */
  multiplier: number
  /** 프리스핀이면 true. */
  isFreeSpin: boolean
  /** 뮤테이션 적용 **전** 격자. 없으면 grid와 같다. */
  gridBefore: SymbolId[][]
  /** 이 스핀에서 발동한 뮤테이션. */
  mutations: SampleMutation[]
  /** 이 스핀에 곱해진 프리스핀 배수. 유료 스핀은 1. */
  winMultiplier: number
  /** 화면에 보인 스캐터 개수. */
  scatterCount: number
  /** 스캐터 배당 코인 (배수 적용 후). */
  scatterWin: number
  /** 이 스핀이 프리스핀을 열었으면 부여된 횟수. 아니면 0. */
  freeSpinsAwarded: number
  /** 승리에 쓰인 칸 좌표 (`reel,row` 문자열 집합). 하이라이트용. */
  winningCells: string[]
}

export type { GameMath, GridPosition, RtpBreakdown, SymbolId, WinLine }

/** 검수 실행 옵션. */
export interface AuditOptions {
  /** 주 리포트를 만들 총 베팅액. */
  totalBet: number
  spins: number
  seed: string
  ruinTrials?: number
  ruinSpins?: number
  ruinStartMultiple?: number
  /** 해석 모드에서 분포·기여도를 추정할 유료 스핀 수. */
  sampleSpins?: number
  /** 전수 조사를 시도할 조합 수 상한. 기본은 엔진의 MAX_ENUMERATION_COMBOS. */
  maxCombos?: number
  /** 산출 방법을 직접 지정한다. 지정하지 않으면 모델에서 판단한다. */
  forceMethod?: DistributionMethod
  /** 몬테카를로 모델에서 베팅 레벨마다 돌릴 스핀 수. */
  betLevelSpins?: number
  /** 리포트에 찍을 생성 시각. 테스트 결정성을 위해 주입 가능. */
  generatedAt?: Date
  /** 0~1 진행률. 무거운 단계 사이에 호출된다. */
  onProgress?: (phase: string, ratio: number) => void
}

export interface AuditResult {
  generatedAt: string
  game: GameSummaryInfo
  manifest: ManifestExtras | null
  options: { totalBet: number; spins: number; seed: string }
  distribution: DistributionReport
  /** 프리스핀·스캐터 요약. 두 기능이 다 없으면 null. */
  features: FeatureReport | null
  betLevels: BetLevelRow[]
  mc: MonteCarloResult
  agreement: AgreementVerdict
  ruin: RuinReport
  jackpot: JackpotAccounting | null
  gates: GateRow[]
}
