/**
 * 재사용 풀. **순수 모듈이다** — pixi도 gsap도 여기 들어오지 않는다(`purity.test.ts`가 막는다).
 *
 * 연출은 매 판 같은 모양의 물건을 만들고 버린다. 승리 순환은 다음 스핀까지 계속 돌기 때문에
 * "한 판에 몇 개"가 아니라 "초당 몇 개"가 된다. 만든 것을 도로 받아 두면 상주 메모리가
 * 예측 가능해진다 — 최대치가 풀 상한이고, 그 위로는 늘지 않는다.
 *
 * 여기 있는 것은 세는 일과 고르는 일뿐이다. 실제로 무엇을 만들고 어떻게 되돌리는지는
 * 주입한 `create`/`reset`/`dispose`가 정한다. 덕분에 pixi 없이도 전부 시험할 수 있다.
 */

/** 풀 하나의 상태. 읽기 전용 스냅샷이라 그대로 진단 패널에 실어도 된다. */
export interface PoolStats {
  /** 지금 보관 중인(꺼내 쓸 수 있는) 개수. */
  free: number
  /** 꺼내 갔고 아직 안 돌아온 개수. */
  live: number
  /** 지금까지 `create`가 불린 횟수. 이 수가 곧 최대 상주량이다. */
  created: number
  /** 지금까지 `acquire` 횟수. */
  acquired: number
  /** 그중 보관분을 다시 쓴 횟수. */
  reused: number
  /** 상한을 넘겨 `dispose`로 버린 횟수. */
  discarded: number
  /** `reused / acquired`. 한 번도 안 꺼냈으면 0. */
  hitRate: number
}

export interface ObjectPoolHooks<T> {
  /** 보관분이 없을 때 새로 만든다. */
  create: () => T
  /** 보관하기 직전에 상태를 지운다. 상한을 넘겨 버려지는 것은 여기를 지나지 않는다. */
  reset?: (item: T) => void
  /** 상한을 넘겨 버릴 때와 `clear()`에서 불린다. 진짜 해제는 여기서 한다. */
  dispose?: (item: T) => void
  /**
   * 보관 상한. 이보다 많이 돌아오면 남는 것은 `dispose`로 버린다.
   * 기본값은 무제한이다 — 상한이 필요한 쪽이 자기 최대 동시 사용량을 알고 정한다.
   */
  maxRetained?: number
}

/**
 * 같은 종류의 물건 하나를 돌려 쓰는 풀.
 *
 * `release`는 멱등이다 — 같은 것을 두 번 돌려줘도 보관 목록에 두 번 들어가지 않는다.
 * 연출 손잡이의 `stop()`이 두 번 불리는 경로가 실제로 있어서, 이것을 호출 측에 맡기면
 * 같은 스프라이트를 두 곳이 동시에 꺼내 쓰는 사고가 난다.
 */
export class ObjectPool<T> {
  private readonly free: T[] = []
  private readonly retained = new Set<T>()
  private readonly maxRetained: number
  private liveCount = 0
  private createdCount = 0
  private acquiredCount = 0
  private reusedCount = 0
  private discardedCount = 0

  constructor(private readonly hooks: ObjectPoolHooks<T>) {
    this.maxRetained = Math.max(0, hooks.maxRetained ?? Number.POSITIVE_INFINITY)
  }

  /** 쓸 것 하나. 보관분이 있으면 그것을, 없으면 새로 만들어 준다. */
  acquire(): T {
    this.acquiredCount += 1
    this.liveCount += 1

    const pooled = this.free.pop()
    if (pooled !== undefined) {
      this.retained.delete(pooled)
      this.reusedCount += 1
      return pooled
    }

    this.createdCount += 1
    return this.hooks.create()
  }

  /** 다 쓴 것을 돌려준다. 상한을 넘으면 보관하지 않고 버린다. */
  release(item: T): void {
    if (this.retained.has(item)) return
    if (this.liveCount > 0) this.liveCount -= 1

    if (this.free.length >= this.maxRetained) {
      this.discardedCount += 1
      this.hooks.dispose?.(item)
      return
    }

    this.hooks.reset?.(item)
    this.retained.add(item)
    this.free.push(item)
  }

  /** 보관분을 전부 버린다. 아직 나가 있는 것은 건드리지 않는다(그쪽 주인이 돌려줄 몫이다). */
  clear(): void {
    const items = [...this.free]
    this.free.length = 0
    this.retained.clear()
    for (const item of items) this.hooks.dispose?.(item)
  }

  /** 지금 보관 중인 개수. */
  get size(): number {
    return this.free.length
  }

  /** 꺼내 갔고 아직 안 돌아온 개수. */
  get live(): number {
    return this.liveCount
  }

  /** 누적 통계는 `clear()`로 지워지지 않는다. 수명 전체의 할당량을 보기 위해서다. */
  get stats(): PoolStats {
    return {
      free: this.free.length,
      live: this.liveCount,
      created: this.createdCount,
      acquired: this.acquiredCount,
      reused: this.reusedCount,
      discarded: this.discardedCount,
      hitRate: this.acquiredCount === 0 ? 0 : this.reusedCount / this.acquiredCount,
    }
  }
}

export interface KeyedObjectPoolHooks<K, T> {
  /** 키마다 다른 물건을 만든다(시트 프레임 묶음처럼 키가 곧 정체성인 경우). */
  create: (key: K) => T
  reset?: (item: T) => void
  dispose?: (item: T) => void
  /** 키 하나가 보관할 수 있는 상한. 총량이 아니라 키별이다. */
  maxRetainedPerKey?: number
}

/**
 * 정체성이 다른 물건을 키별로 나눠 담는 풀.
 *
 * 시트 애니메이션이 이렇다 — 프레임 묶음이 다르면 서로 바꿔 쓸 수 없으므로 하나의 풀로
 * 묶으면 매번 헛돈다. 키별로 나누면 같은 심볼의 승리 연출이 몇 바퀴를 돌든 스프라이트는
 * 그 심볼 몫 하나뿐이다.
 */
export class KeyedObjectPool<K, T> {
  private readonly pools = new Map<K, ObjectPool<T>>()

  constructor(private readonly hooks: KeyedObjectPoolHooks<K, T>) {}

  acquire(key: K): T {
    return this.poolFor(key).acquire()
  }

  /** 꺼낸 키와 같은 키로 돌려줘야 한다. 키를 기억하는 일은 꺼낸 쪽 몫이다. */
  release(key: K, item: T): void {
    this.poolFor(key).release(item)
  }

  /** 모든 키의 보관분을 버리고 키 목록까지 비운다. */
  clear(): void {
    for (const pool of this.pools.values()) pool.clear()
    this.pools.clear()
  }

  /** 지금 살아 있는 키 수. 시트 종류가 몇 개나 상주하는지 보는 값이다. */
  get keyCount(): number {
    return this.pools.size
  }

  /** 키별 통계를 하나로 합친 값. 비율은 합계에서 다시 계산한다. */
  get stats(): PoolStats {
    const total: PoolStats = {
      free: 0,
      live: 0,
      created: 0,
      acquired: 0,
      reused: 0,
      discarded: 0,
      hitRate: 0,
    }
    for (const pool of this.pools.values()) {
      const stats = pool.stats
      total.free += stats.free
      total.live += stats.live
      total.created += stats.created
      total.acquired += stats.acquired
      total.reused += stats.reused
      total.discarded += stats.discarded
    }
    total.hitRate = total.acquired === 0 ? 0 : total.reused / total.acquired
    return total
  }

  private poolFor(key: K): ObjectPool<T> {
    const existing = this.pools.get(key)
    if (existing !== undefined) return existing
    const created = new ObjectPool<T>({
      create: () => this.hooks.create(key),
      reset: this.hooks.reset,
      dispose: this.hooks.dispose,
      maxRetained: this.hooks.maxRetainedPerKey,
    })
    this.pools.set(key, created)
    return created
  }
}

/** 예산 상태. */
export interface ParticleBudgetSnapshot {
  inUse: number
  capacity: number
  free: number
}

/**
 * 동시에 살아 있는 파티클 총량.
 *
 * 풀은 "몇 개를 새로 만드는가"를 줄이고, 예산은 "한꺼번에 몇 개가 화면에 있는가"를 묶는다.
 * 코인 샤워·색종이·스캐터 흡입이 겹치면 각자의 상한은 지켜도 합계는 상한이 없었다.
 * 예산을 넘겨 요청한 몫은 조용히 깎인다 — 연출은 개수가 줄 뿐 끊기지 않는다.
 */
export class ParticleBudget {
  private used = 0

  constructor(readonly capacity: number) {}

  /** 요청한 만큼, 남은 여유 안에서만 내준다. 실제로 허락된 수를 돌려준다. */
  take(requested: number): number {
    if (requested <= 0) return 0
    const granted = Math.min(Math.floor(requested), this.capacity - this.used)
    if (granted <= 0) return 0
    this.used += granted
    return granted
  }

  /** 쓰던 몫을 반납한다. 빌린 것보다 많이 돌려줘도 0 아래로는 내려가지 않는다. */
  give(count: number): void {
    if (count <= 0) return
    this.used = Math.max(0, this.used - Math.floor(count))
  }

  get inUse(): number {
    return this.used
  }

  get free(): number {
    return Math.max(0, this.capacity - this.used)
  }

  get snapshot(): ParticleBudgetSnapshot {
    return { inUse: this.used, capacity: this.capacity, free: this.free }
  }
}
