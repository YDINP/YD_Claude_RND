/**
 * 메인 스레드와 몬테카를로 워커가 주고받는 메시지 규약.
 * 워커 모듈을 import하지 않고도 타입을 쓸 수 있게 따로 뒀다 (테스트에서 워커를 목으로 바꾼다).
 */
import type { MonteCarloResult, RuinReport } from '@tgslot/rtp-sim/audit'

export interface McRequest {
  /** math.json 원본. 워커 안에서 다시 parseGameMath로 검증한다. */
  mathJson: unknown
  totalBet: number
  spins: number
  seed: string
  ruinTrials?: number
  ruinSpins?: number
}

export interface McDone {
  mc: MonteCarloResult
  ruin: RuinReport
}

export type McResponse =
  | { type: 'progress'; phase: string; ratio: number; rtp: number }
  | ({ type: 'done' } & McDone)
  | { type: 'error'; message: string }
