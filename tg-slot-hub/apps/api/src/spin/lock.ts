/** 락 보유 시간 상한 기본값 (ms). DB 왕복 한 번보다 넉넉하되 유저를 무한정 묶어두진 않는 값. */
export const DEFAULT_SPIN_LOCK_TIMEOUT_MS = 15_000

/** 같은 유저의 다른 스핀이 이미 진행 중일 때. 라우트가 409로 번역한다. */
export class SpinInProgressError extends Error {
  constructor() {
    super('Another spin is already in progress for this user')
    this.name = 'SpinInProgressError'
  }
}

/** 락을 쥔 작업이 제한 시간 안에 끝나지 않았을 때. 라우트가 503으로 번역한다. */
export class SpinTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Spin did not finish within ${timeoutMs}ms`)
    this.name = 'SpinTimeoutError'
  }
}

interface Held {
  idempotencyKey: string
  /** 락이 풀릴 때 resolve된다. 절대 reject하지 않는다. */
  settled: Promise<void>
}

/**
 * `promise`가 `timeoutMs` 안에 끝나지 않으면 `SpinTimeoutError`로 거절한다.
 * `Promise.race`가 원본에도 핸들러를 붙이므로 뒤늦게 원본이 실패해도 unhandled rejection은 없다.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise

  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new SpinTimeoutError(timeoutMs)), timeoutMs)
    // 타이머 하나 때문에 프로세스가 살아 있지 않도록. 환경에 따라 unref가 없을 수 있다.
    if (typeof timer?.unref === 'function') timer.unref()
  })

  return Promise.race([promise, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

/**
 * 유저별 인프로세스 스핀 락.
 *
 * - **같은 idempotencyKey**로 겹쳐 들어오면 앞선 요청이 끝날 때까지 기다렸다가 실행한다.
 *   그 시점엔 라운드가 이미 저장돼 있으므로 레포의 멱등 경로를 타고 같은 결과가 나온다 (네트워크 재전송).
 * - **다른 key**로 겹쳐 들어오면 즉시 `SpinInProgressError`. 연타·자동 클릭러를 여기서 잘라낸다.
 * - 어떤 경우든 `timeoutMs`가 지나면 락을 놓는다. DB 질의 하나가 멈춰 서더라도
 *   그 유저의 Map 항목이 프로세스가 죽을 때까지 남아 이후 스핀이 전부 409가 되는 일은 없다.
 *   시간이 지난 작업 자체는 백그라운드에서 계속 진행될 수 있지만, 트랜잭션이 원자적이고
 *   `(user_id, idempotency_key)`가 유니크라 유저가 같은 키로 재시도해도 이중 차감은 생기지 않는다.
 *
 * 이 락은 **프로세스 안에서만** 유효하다. API 인스턴스를 여러 개 띄우면 서로의 락을 보지 못하므로
 * 이중 차감 방어는 DB의 `(user_id, idempotency_key)` 유니크와 지갑 row lock이 맡는다.
 * 인스턴스 간 직렬화가 필요해지면 Phase 3에서 Redis 락으로 올린다.
 */
export class SpinLock {
  private readonly held = new Map<string, Held>()

  constructor(private readonly timeoutMs: number = DEFAULT_SPIN_LOCK_TIMEOUT_MS) {}

  async run<T>(userId: string, idempotencyKey: string, fn: () => Promise<T>): Promise<T> {
    for (;;) {
      const current = this.held.get(userId)
      if (current === undefined) break
      if (current.idempotencyKey !== idempotencyKey) throw new SpinInProgressError()
      // 깨어난 뒤 다시 확인한다. 같은 키를 기다리던 요청이 여럿이면 한 번에 하나씩만 통과한다.
      await current.settled
    }

    // 여기서부터 `held.set`까지 await이 없으므로 다른 요청이 끼어들 수 없다.
    let release: () => void = () => {}
    const settled = new Promise<void>((resolve) => {
      release = resolve
    })
    this.held.set(userId, { idempotencyKey, settled })

    try {
      return await withTimeout(fn(), this.timeoutMs)
    } finally {
      this.held.delete(userId)
      release()
    }
  }

  /** 테스트/진단용. 현재 락을 쥐고 있는 유저 수. */
  get size(): number {
    return this.held.size
  }
}
