/**
 * 검수(audit) 리포트의 자료 구조. CLI와 시뮬레이터 GUI가 같은 타입을 공유한다.
 * 이 폴더의 모든 모듈은 브라우저에서도 돌아야 하므로 node:* 를 쓰지 않는다.
 */
import type { GameMath, GridPosition, SymbolId, WinLine } from '@tgslot/slot-engine'

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

/** 배수 분포 히스토그램의 한 칸. */
export interface HistogramRow {
  key: string
  label: string
  combos: number
  probability: number
  /** 이 구간이 RTP에 기여하는 몫. 전체 합 = rtp. */
  rtpShare: number
}

/** 전수 조사 1회로 얻는 모든 집계. */
export interface EnumerationReport {
  totalBet: number
  betPerLine: number
  combos: number
  rtp: number
  hitRate: number
  /** 총 베팅액 대비 최대 배수. */
  maxWinMultiplier: number
  /** 승리가 발생한 조합 수. */
  winCombos: number
  symbols: ContributionRow[]
  /** 그룹 배당(`WinLine.group`)으로 지급된 몫. 그룹이 없는 게임은 빈 배열. */
  groups: ContributionRow[]
  lines: LineContributionRow[]
  counts: CountContributionRow[]
  histogram: HistogramRow[]
}

/** 베팅 레벨별 전수 조사 요약. */
export interface BetLevelRow {
  totalBet: number
  betPerLine: number
  rtp: number
  hitRate: number
  maxWinMultiplier: number
  /** 목표 RTP와의 차이 (%p 아님, 소수). */
  delta: number
  pass: boolean
}

/** 몬테카를로 누적 지표. `simulate()` 결과를 청크 단위로 합친 것. */
export interface McAggregate {
  spins: number
  rtp: number
  hitRate: number
  /** 스핀당 승리 배수의 표준편차. */
  stdDev: number
  maxWin: number
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
  stops: number[]
  /** grid[row][reel]. */
  grid: SymbolId[][]
  wins: WinLine[]
  totalWin: number
  multiplier: number
  /** 승리에 쓰인 칸 좌표 (`reel,row` 문자열 집합). 하이라이트용. */
  winningCells: string[]
}

export type { GameMath, GridPosition, SymbolId, WinLine }

/** 검수 실행 옵션. */
export interface AuditOptions {
  /** 주 리포트를 만들 총 베팅액. */
  totalBet: number
  spins: number
  seed: string
  ruinTrials?: number
  ruinSpins?: number
  ruinStartMultiple?: number
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
  exact: EnumerationReport
  betLevels: BetLevelRow[]
  mc: MonteCarloResult
  agreement: AgreementVerdict
  ruin: RuinReport
  jackpot: JackpotAccounting | null
  gates: GateRow[]
}
