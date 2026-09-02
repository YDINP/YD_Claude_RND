/// <reference lib="webworker" />
/**
 * 몬테카를로 + 파산 시뮬 전용 워커.
 * 100만 스핀은 메인 스레드에서 돌리면 UI가 통째로 멎으므로 여기서 돌리고 진행률만 흘려보낸다.
 */
import { parseGameMath } from '@tgslot/slot-engine'
import { runMonteCarlo, simulateRuin } from '@tgslot/rtp-sim/audit'
import type { McRequest, McResponse } from './mcTypes.js'

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: McResponse): void {
  scope.postMessage(message)
}

scope.onmessage = (event: MessageEvent<McRequest>): void => {
  const request = event.data
  try {
    const math = parseGameMath(request.mathJson)
    const mc = runMonteCarlo(math, request.totalBet, request.spins, request.seed, {
      onProgress: (ratio, running) => post({ type: 'progress', phase: '몬테카를로', ratio, rtp: running.rtp }),
    })
    post({ type: 'progress', phase: '파산 확률 시뮬', ratio: 1, rtp: mc.rtp })
    const ruin = simulateRuin(math, request.totalBet, request.seed, {
      trials: request.ruinTrials,
      spins: request.ruinSpins,
    })
    post({ type: 'done', mc, ruin })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
