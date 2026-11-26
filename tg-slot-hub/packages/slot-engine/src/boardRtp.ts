import { computeAnalyticRtp } from './analytic.js'
import { boardExpectation } from './boardExact.js'
import type { BoardExpectation } from './boardExact.js'
import type { GameMath } from './schema.js'

/** 말판 팩의 정확 RTP 분해. 라인·스캐터는 해석식, 말판은 DP다. 캡에 닿지 않는 설정에서 정확하다. */
export interface BoardRtpReport {
  rtp: number
  lines: number
  scatter: number
  board: number
  /** 유료 스핀이 말판을 열 확률. */
  triggerProbability: number
  expectation: BoardExpectation
}

/**
 * 말판 팩의 RTP를 몬테카를로 없이 구한다(튜닝용). 정식 감사는 여전히 몬테카를로다.
 * 말판 몫 = P(스캐터 >= trigger) x E[말판 지급]. 말판 지급이 라운드 캡(`round.maxWinCap`)에 닿을 수 있는 설정이면
 * 이 값은 상한이다(감사가 실제 값을 잰다).
 */
export function computeBoardRtp(math: GameMath, totalBet: number): BoardRtpReport {
  const config = math.boardBonus
  if (config === undefined) throw new RangeError('boardBonus 설정이 없다')
  const base = computeAnalyticRtp({ ...math, boardBonus: undefined } as GameMath, totalBet)
  let triggerProbability = 0
  base.scatterDistribution.forEach((p, count) => {
    if (count >= config.trigger) triggerProbability += p
  })
  const exact = boardExpectation(config)
  const board = triggerProbability * exact.mean
  return {
    rtp: base.breakdown.lines + base.breakdown.scatter + board,
    lines: base.breakdown.lines,
    scatter: base.breakdown.scatter,
    board,
    triggerProbability,
    expectation: exact,
  }
}
