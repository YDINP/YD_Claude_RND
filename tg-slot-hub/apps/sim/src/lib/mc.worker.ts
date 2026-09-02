/// <reference lib="webworker" />
/**
 * 무거운 계산 전용 워커. 두 가지 일을 한다.
 *
 * - `montecarlo`: 몬테카를로 + 파산 시뮬
 * - `distribution`: 전수 조사가 불가능한 모델의 표본 분포 (5릴 등)
 *
 * 둘 다 100만 스핀 단위라 메인 스레드에서 돌리면 UI가 통째로 멎는다.
 */
import { parseGameMath } from '@tgslot/slot-engine'
import { auditBetLevels, runMonteCarlo, sampleDistribution, simulateRuin } from '@tgslot/rtp-sim/audit'
import type { WorkerRequest, WorkerResponse } from './mcTypes.js'

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: WorkerResponse): void {
  scope.postMessage(message)
}

scope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data
  try {
    const math = parseGameMath(request.mathJson)

    if (request.kind === 'distribution') {
      const distribution = sampleDistribution(math, request.totalBet, {
        spins: request.sampleSpins,
        seed: request.seed,
        onProgress: (ratio) => post({ type: 'progress', phase: '표본 분포', ratio, rtp: 0 }),
      })
      const betLevels = auditBetLevels(math)
      post({ type: 'done', kind: 'distribution', distribution, betLevels })
      return
    }

    const mc = runMonteCarlo(math, request.totalBet, request.spins, request.seed, {
      onProgress: (ratio, running) => post({ type: 'progress', phase: '몬테카를로', ratio, rtp: running.rtp }),
    })
    post({ type: 'progress', phase: '파산 확률 시뮬', ratio: 1, rtp: mc.rtp })
    const ruin = simulateRuin(math, request.totalBet, request.seed, {
      trials: request.ruinTrials,
      spins: request.ruinSpins,
    })
    post({ type: 'done', kind: 'montecarlo', mc, ruin })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
