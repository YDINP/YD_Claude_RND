/**
 * 워커 생성과 메시지 처리를 한 곳에 가둔다.
 * 테스트는 이 모듈만 목으로 바꾸면 되고 컴포넌트는 Worker를 몰라도 된다.
 */
import type {
  DistributionDone,
  DistributionRequest,
  McDone,
  McRequest,
  WorkerDone,
  WorkerRequest,
  WorkerResponse,
} from './mcTypes.js'

export interface McProgress {
  phase: string
  ratio: number
  rtp: number
}

export interface WorkerHandle<T> {
  promise: Promise<T>
  /** 진행 중인 워커를 즉시 죽인다. 결과 프로미스는 거부된다. */
  cancel: () => void
}

export type McHandle = WorkerHandle<McDone>
export type DistributionHandle = WorkerHandle<DistributionDone>

export const CANCELLED = '시뮬레이션이 취소되었다'

/** 워커를 만드는 함수. 테스트가 가짜 워커를 끼워 넣을 수 있게 분리했다. */
export type WorkerFactory = () => Worker

/**
 * Vite가 워커 청크를 뽑아내려면 `new Worker(new URL('...', import.meta.url), ...)` 형태가
 * 소스에 그대로 있어야 한다. 그래서 이 한 줄은 절대 변수로 빼지 않는다.
 */
export const createMcWorker: WorkerFactory = () =>
  new Worker(new URL('./mc.worker.ts', import.meta.url), { type: 'module' })

/**
 * 워커에 일을 하나 맡긴다. 진행률은 콜백으로, 결과는 프로미스로 온다.
 *
 * 워커는 **메시지를 받아야** 일을 시작한다. 만들어 놓고 postMessage를 빼먹으면
 * 아무 에러 없이 0%에 멈춘 것처럼 보인다 (실제로 그 버그를 냈다).
 */
export function runWorkerJob<T extends WorkerDone>(
  request: WorkerRequest,
  onProgress?: (progress: McProgress) => void,
  createWorker: WorkerFactory = createMcWorker,
): WorkerHandle<T> {
  const worker = createWorker()
  let settled = false
  let abort: (reason: Error) => void = () => {}

  const fail = (message: string, reject: (reason: Error) => void): void => {
    settled = true
    worker.terminate()
    // 워커 안의 실패는 UI가 삼키기 쉬우므로 콘솔에도 남긴다.
    console.error('[sim] 몬테카를로 워커 실패:', message)
    reject(new Error(message))
  }

  const promise = new Promise<T>((resolve, reject) => {
    abort = reject
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.({ phase: message.phase, ratio: message.ratio, rtp: message.rtp })
        return
      }
      if (message.type === 'error') {
        fail(message.message, reject)
        return
      }
      settled = true
      worker.terminate()
      const { type: _type, kind: _kind, ...payload } = message
      resolve(payload as unknown as T)
    }
    worker.onerror = (event: ErrorEvent) => {
      // 워커 모듈 자체가 로드/실행에 실패한 경우다. 파일명과 줄까지 붙여야 원인을 찾을 수 있다.
      const where = event.filename === undefined || event.filename === '' ? '' : ` (${event.filename}:${event.lineno})`
      fail(`워커 로드 실패${where}: ${event.message || '알 수 없는 오류'}`, reject)
    }
    worker.onmessageerror = () => {
      // 구조화 복제에 실패한 값이 오갔다는 뜻이다. math.json이 평범한 JSON이 아니면 여기로 온다.
      fail('워커 메시지를 복제하지 못했다 (structured clone 실패)', reject)
    }
  })

  // 핸들러를 모두 붙인 다음에 보낸다.
  try {
    worker.postMessage(request)
  } catch (error) {
    // postMessage 자체가 던지는 경우(복제 불가한 값)도 프로미스로 흘려보낸다.
    const message = error instanceof Error ? error.message : String(error)
    fail(`요청을 워커로 보내지 못했다: ${message}`, abort)
  }

  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      worker.terminate()
      abort(new Error(CANCELLED))
    },
  }
}

/** 몬테카를로 + 파산 시뮬을 워커에서 돌린다. */
export function runMcInWorker(
  request: Omit<McRequest, 'kind'>,
  onProgress?: (progress: McProgress) => void,
  createWorker: WorkerFactory = createMcWorker,
): McHandle {
  return runWorkerJob<McDone>({ ...request, kind: 'montecarlo' }, onProgress, createWorker)
}

/**
 * 표본 분포를 워커에서 돌린다.
 * 전수 조사가 가능한 모델은 메인 스레드가 직접 하므로 이 경로를 타지 않는다.
 */
export function runDistributionInWorker(
  request: Omit<DistributionRequest, 'kind'>,
  onProgress?: (progress: McProgress) => void,
  createWorker: WorkerFactory = createMcWorker,
): DistributionHandle {
  return runWorkerJob<DistributionDone>({ ...request, kind: 'distribution' }, onProgress, createWorker)
}
