import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CANCELLED, runMcInWorker } from './mcClient.js'
import type { McRequest, WorkerResponse } from './mcTypes.js'

/**
 * jsdom에는 Worker가 없다. 진짜 워커 대신 메시지 통로만 흉내 내서
 * "요청을 실제로 보내는가"와 "실패를 삼키지 않는가"를 검사한다.
 * 워커를 만들어 놓고 postMessage를 빼먹어 0%에 멈췄던 버그가 이 파일의 이유다.
 */
class FakeWorker implements Pick<Worker, 'postMessage' | 'terminate'> {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  readonly sent: unknown[] = []
  terminated = 0

  postMessage(message: unknown): void {
    this.sent.push(message)
  }

  terminate(): void {
    this.terminated += 1
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>)
  }
}

const request: McRequest = {
  kind: 'montecarlo',
  mathJson: { id: 'fake' },
  totalBet: 100,
  spins: 1000,
  seed: '42',
  ruinTrials: 5,
  ruinSpins: 50,
}

function doneMessage(): WorkerResponse {
  return {
    type: 'done',
    kind: 'montecarlo',
    mc: {
      spins: 1000,
      rtp: 0.94,
      hitRate: 0.4,
      stdDev: 3,
      maxWin: 1000,
      freeSpinsPlayed: 0,
      triggerRate: 0,
      seed: '42',
      totalBet: 100,
      elapsedMs: 12,
      convergence: [{ spins: 1000, rtp: 0.94 }],
    },
    ruin: {
      trials: 5,
      spins: 50,
      startBalanceMultiple: 100,
      ruined: 0,
      ruinRate: 0,
      medianEndMultiple: 90,
      meanSpinsToRuin: null,
    },
  }
}

const { kind: _kind, ...mcRequest } = request

function start(worker: FakeWorker, onProgress?: Parameters<typeof runMcInWorker>[1]) {
  return runMcInWorker(mcRequest, onProgress, () => worker as unknown as Worker)
}

describe('몬테카를로 워커 클라이언트', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('워커를 만들자마자 요청을 보낸다', () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    expect(worker.sent).toEqual([request])
    handle.promise.catch(() => {})
    handle.cancel()
  })

  it('요청을 보내기 전에 핸들러가 붙어 있다', () => {
    const worker = new FakeWorker()
    // postMessage 시점에 onmessage가 없으면 워커가 곧바로 답해도 놓친다.
    let handlerAtSend: unknown = 'none'
    worker.postMessage = () => {
      handlerAtSend = worker.onmessage
    }
    const handle = start(worker)
    expect(handlerAtSend).toBeTypeOf('function')
    handle.promise.catch(() => {})
    handle.cancel()
  })

  it('진행 메시지를 콜백으로 흘려보낸다', () => {
    const worker = new FakeWorker()
    const onProgress = vi.fn()
    const handle = start(worker, onProgress)
    worker.emit({ type: 'progress', phase: '몬테카를로', ratio: 0.5, rtp: 0.93 })
    expect(onProgress).toHaveBeenCalledWith({ phase: '몬테카를로', ratio: 0.5, rtp: 0.93 })
    handle.promise.catch(() => {})
    handle.cancel()
  })

  it('done 메시지로 결과를 내놓고 워커를 정리한다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    worker.emit(doneMessage())
    const done = await handle.promise
    expect(done.mc.rtp).toBeCloseTo(0.94, 10)
    expect(worker.terminated).toBe(1)
  })

  it('워커가 보낸 오류는 프로미스를 거부하고 콘솔에 남는다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    worker.emit({ type: 'error', message: '스트립이 비었다' })
    await expect(handle.promise).rejects.toThrow('스트립이 비었다')
    expect(console.error).toHaveBeenCalled()
    expect(worker.terminated).toBe(1)
  })

  it('워커 로드 실패(onerror)를 파일명과 함께 surface한다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    worker.onerror?.({
      message: 'Cannot find module',
      filename: '/src/lib/mc.worker.ts',
      lineno: 3,
    } as ErrorEvent)
    await expect(handle.promise).rejects.toThrow(/워커 로드 실패.*mc\.worker\.ts:3.*Cannot find module/)
  })

  it('구조화 복제 실패(onmessageerror)도 오류로 올린다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    worker.onmessageerror?.()
    await expect(handle.promise).rejects.toThrow(/structured clone/)
  })

  it('postMessage가 던지면 그것도 프로미스로 흘러나온다', async () => {
    const worker = new FakeWorker()
    worker.postMessage = () => {
      throw new Error('DataCloneError')
    }
    const handle = start(worker)
    await expect(handle.promise).rejects.toThrow(/DataCloneError/)
  })

  it('중단하면 워커를 죽이고 취소로 거부한다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    handle.cancel()
    await expect(handle.promise).rejects.toThrow(CANCELLED)
    expect(worker.terminated).toBe(1)
  })

  it('이미 끝난 뒤의 중단은 아무것도 하지 않는다', async () => {
    const worker = new FakeWorker()
    const handle = start(worker)
    worker.emit(doneMessage())
    await handle.promise
    handle.cancel()
    expect(worker.terminated).toBe(1)
  })
})
