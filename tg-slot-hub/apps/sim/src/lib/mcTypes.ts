/**
 * 메인 스레드와 계산 워커가 주고받는 메시지 규약.
 * 워커 모듈을 import하지 않고도 타입을 쓸 수 있게 따로 뒀다 (테스트에서 워커를 목으로 바꾼다).
 */
import type { BetLevelRow, DistributionReport, MonteCarloResult, RuinReport } from '@tgslot/rtp-sim/audit'

interface RequestBase {
  /** math.json 원본. 워커 안에서 다시 parseGameMath로 검증한다. */
  mathJson: unknown
  totalBet: number
  seed: string
}

/** 몬테카를로 + 파산 시뮬. */
export interface McRequest extends RequestBase {
  kind: 'montecarlo'
  spins: number
  ruinTrials?: number
  ruinSpins?: number
}

/**
 * 분포 산출. 전수 조사가 가능한 모델은 메인 스레드가 직접 하므로
 * 이 요청은 표본이 필요한 큰 모델(5릴 등)에만 쓴다.
 */
export interface DistributionRequest extends RequestBase {
  kind: 'distribution'
  sampleSpins: number
}

export type WorkerRequest = McRequest | DistributionRequest

export interface McDone {
  mc: MonteCarloResult
  ruin: RuinReport
}

export interface DistributionDone {
  distribution: DistributionReport
  betLevels: BetLevelRow[]
}

export type WorkerDone = McDone | DistributionDone

export type WorkerResponse =
  | { type: 'progress'; phase: string; ratio: number; rtp: number }
  | ({ type: 'done'; kind: 'montecarlo' } & McDone)
  | ({ type: 'done'; kind: 'distribution' } & DistributionDone)
  | { type: 'error'; message: string }
