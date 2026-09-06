import { describe, expect, it, vi } from 'vitest'
import { KeyedObjectPool, ObjectPool, ParticleBudget } from './pool.js'

/** 생성 횟수를 세는 가짜 물건. 스프라이트 대신 이것으로 할당량을 잰다. */
interface Fake {
  id: number
  dirty: boolean
}

function countingHooks(): { create: () => Fake; created: () => number } {
  let created = 0
  return {
    create: () => {
      created += 1
      return { id: created, dirty: true }
    },
    created: () => created,
  }
}

describe('ObjectPool', () => {
  it('처음에는 비어 있다', () => {
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 0, dirty: false }) })
    expect(pool.size).toBe(0)
    expect(pool.live).toBe(0)
    expect(pool.stats.hitRate).toBe(0)
  })

  it('보관분이 없으면 새로 만든다', () => {
    const hooks = countingHooks()
    const pool = new ObjectPool<Fake>({ create: hooks.create })

    pool.acquire()
    pool.acquire()

    expect(hooks.created()).toBe(2)
    expect(pool.stats.created).toBe(2)
    expect(pool.stats.reused).toBe(0)
  })

  it('돌려준 것을 다시 꺼내 쓴다', () => {
    const hooks = countingHooks()
    const pool = new ObjectPool<Fake>({ create: hooks.create })

    const first = pool.acquire()
    pool.release(first)
    const second = pool.acquire()

    expect(second).toBe(first)
    expect(hooks.created()).toBe(1)
    expect(pool.stats.reused).toBe(1)
  })

  it('보관 직전에 reset을 부른다', () => {
    const reset = vi.fn((item: Fake) => {
      item.dirty = false
    })
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 1, dirty: true }), reset })

    const item = pool.acquire()
    expect(reset).not.toHaveBeenCalled()

    pool.release(item)
    expect(reset).toHaveBeenCalledWith(item)
    expect(item.dirty).toBe(false)
  })

  it('같은 것을 두 번 돌려줘도 한 번만 보관한다', () => {
    const reset = vi.fn()
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 1, dirty: false }), reset })

    const item = pool.acquire()
    pool.release(item)
    pool.release(item)

    expect(pool.size).toBe(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('두 번 돌려줘도 같은 것이 두 번 나오지 않는다', () => {
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 1, dirty: false }) })
    const item = pool.acquire()
    pool.release(item)
    pool.release(item)

    expect(pool.acquire()).toBe(item)
    expect(pool.acquire()).not.toBe(item)
  })

  it('상한을 넘겨 돌아온 것은 버린다', () => {
    const dispose = vi.fn()
    const reset = vi.fn()
    const pool = new ObjectPool<Fake>({
      create: countingHooks().create,
      reset,
      dispose,
      maxRetained: 2,
    })

    const items = [pool.acquire(), pool.acquire(), pool.acquire()]
    for (const item of items) pool.release(item)

    expect(pool.size).toBe(2)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith(items[2])
    // 버려지는 것은 reset을 지나지 않는다. 지울 상태가 있는 것이 아니라 사라질 물건이다.
    expect(reset).toHaveBeenCalledTimes(2)
    expect(pool.stats.discarded).toBe(1)
  })

  it('상한이 0이면 아무것도 보관하지 않는다', () => {
    const dispose = vi.fn()
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 0, dirty: false }), dispose, maxRetained: 0 })

    pool.release(pool.acquire())

    expect(pool.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('live는 꺼낸 만큼 늘고 돌려준 만큼 준다', () => {
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 0, dirty: false }) })
    const a = pool.acquire()
    const b = pool.acquire()
    expect(pool.live).toBe(2)

    pool.release(a)
    expect(pool.live).toBe(1)
    // 이미 보관된 것을 또 돌려줘도 live가 음수로 내려가지 않는다.
    pool.release(a)
    pool.release(b)
    expect(pool.live).toBe(0)
  })

  it('clear는 보관분만 버린다', () => {
    const dispose = vi.fn()
    // id가 서로 달라야 어느 쪽이 버려졌는지 구분된다(호출 인자 비교는 구조 비교다).
    const pool = new ObjectPool<Fake>({ create: countingHooks().create, dispose })

    const kept = pool.acquire()
    const outside = pool.acquire()
    pool.release(kept)

    pool.clear()

    expect(pool.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith(kept)
    expect(dispose).not.toHaveBeenCalledWith(outside)
  })

  it('clear 뒤에도 계속 쓸 수 있다', () => {
    const hooks = countingHooks()
    const pool = new ObjectPool<Fake>({ create: hooks.create })
    pool.release(pool.acquire())
    pool.clear()

    pool.acquire()
    expect(hooks.created()).toBe(2)
  })

  it('hitRate는 재사용 비율이다', () => {
    const pool = new ObjectPool<Fake>({ create: () => ({ id: 0, dirty: false }) })
    const item = pool.acquire()
    pool.release(item)
    pool.acquire()

    expect(pool.stats.acquired).toBe(2)
    expect(pool.stats.hitRate).toBe(0.5)
  })
})

describe('KeyedObjectPool', () => {
  it('키가 다르면 서로 다른 것을 준다', () => {
    const pool = new KeyedObjectPool<string, Fake>({ create: () => ({ id: 0, dirty: false }) })
    const a = pool.acquire('win')
    pool.release('win', a)

    expect(pool.acquire('win')).toBe(a)
    expect(pool.acquire('idle')).not.toBe(a)
    expect(pool.keyCount).toBe(2)
  })

  it('create에 키를 넘긴다', () => {
    const create = vi.fn((key: string): Fake => ({ id: key.length, dirty: false }))
    const pool = new KeyedObjectPool<string, Fake>({ create })

    pool.acquire('seven')

    expect(create).toHaveBeenCalledWith('seven')
  })

  it('상한은 키마다 따로 센다', () => {
    const dispose = vi.fn()
    const pool = new KeyedObjectPool<string, Fake>({
      create: () => ({ id: 0, dirty: false }),
      dispose,
      maxRetainedPerKey: 1,
    })

    pool.release('a', pool.acquire('a'))
    pool.release('b', pool.acquire('b'))
    expect(dispose).not.toHaveBeenCalled()

    // 같은 키로 두 개가 동시에 나갔다 돌아오면 두 번째는 상한에 걸린다.
    const first = pool.acquire('a')
    const second = pool.acquire('a')
    pool.release('a', first)
    pool.release('a', second)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('통계를 키 전체로 합친다', () => {
    const pool = new KeyedObjectPool<string, Fake>({ create: () => ({ id: 0, dirty: false }) })
    pool.release('a', pool.acquire('a'))
    pool.acquire('a')
    pool.acquire('b')

    const stats = pool.stats
    expect(stats.created).toBe(2)
    expect(stats.acquired).toBe(3)
    expect(stats.reused).toBe(1)
    expect(stats.hitRate).toBeCloseTo(1 / 3)
  })

  it('clear는 키까지 비운다', () => {
    const dispose = vi.fn()
    const pool = new KeyedObjectPool<string, Fake>({ create: () => ({ id: 0, dirty: false }), dispose })
    pool.release('a', pool.acquire('a'))

    pool.clear()

    expect(pool.keyCount).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('ParticleBudget', () => {
  it('여유가 있으면 요청한 만큼 준다', () => {
    const budget = new ParticleBudget(10)
    expect(budget.take(4)).toBe(4)
    expect(budget.inUse).toBe(4)
    expect(budget.free).toBe(6)
  })

  it('남은 여유까지만 깎아서 준다', () => {
    const budget = new ParticleBudget(10)
    budget.take(8)
    expect(budget.take(5)).toBe(2)
    expect(budget.inUse).toBe(10)
  })

  it('여유가 없으면 0이다', () => {
    const budget = new ParticleBudget(3)
    budget.take(3)
    expect(budget.take(1)).toBe(0)
    expect(budget.inUse).toBe(3)
  })

  it('반납하면 다시 쓸 수 있다', () => {
    const budget = new ParticleBudget(5)
    budget.take(5)
    budget.give(2)
    expect(budget.take(3)).toBe(2)
  })

  it('더 많이 반납해도 0 아래로 내려가지 않는다', () => {
    const budget = new ParticleBudget(5)
    budget.take(2)
    budget.give(9)
    expect(budget.inUse).toBe(0)
    expect(budget.snapshot).toEqual({ inUse: 0, capacity: 5, free: 5 })
  })

  it('0 이하 요청은 아무것도 쓰지 않는다', () => {
    const budget = new ParticleBudget(5)
    expect(budget.take(0)).toBe(0)
    expect(budget.take(-3)).toBe(0)
    expect(budget.inUse).toBe(0)
  })
})

describe('메모리 스모크: 승리 순환 20바퀴', () => {
  // 승리 연출은 다음 스핀까지 A -> B -> A로 계속 돈다. 한 바퀴마다 이긴 칸의 시트 스프라이트를
  // 새로 만들면 그 수가 초 단위로 쌓인다. 풀을 끼우면 만들어지는 총량이 "동시 최대치"에서
  // 멈춰야 한다 - 바퀴 수와 무관해야 한다는 것이 이 시험의 요지다.
  const CYCLES = 20
  const SYMBOLS = ['seven', 'bar', 'cherry']
  const CELLS_PER_SYMBOL = 5

  it('바퀴를 돌려도 새로 만드는 수가 동시 최대치를 넘지 않는다', () => {
    const hooks = countingHooks()
    const pool = new KeyedObjectPool<string, Fake>({
      create: hooks.create,
      maxRetainedPerKey: CELLS_PER_SYMBOL,
    })

    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      const inFlight: { key: string; item: Fake }[] = []
      for (const key of SYMBOLS) {
        for (let cell = 0; cell < CELLS_PER_SYMBOL; cell += 1) {
          inFlight.push({ key, item: pool.acquire(key) })
        }
      }
      for (const { key, item } of inFlight) pool.release(key, item)
    }

    const peak = SYMBOLS.length * CELLS_PER_SYMBOL
    expect(hooks.created()).toBe(peak)
    expect(pool.stats.acquired).toBe(CYCLES * peak)
    expect(pool.stats.discarded).toBe(0)
    // 첫 바퀴만 만들고 나머지 19바퀴는 전부 재사용이다.
    expect(pool.stats.hitRate).toBeCloseTo((CYCLES - 1) / CYCLES)
  })

  it('상한을 낮게 잡으면 상주량이 상한에 묶인다', () => {
    const hooks = countingHooks()
    const dispose = vi.fn()
    const cap = 2
    const pool = new KeyedObjectPool<string, Fake>({
      create: hooks.create,
      dispose,
      maxRetainedPerKey: cap,
    })

    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      const inFlight = SYMBOLS.map((key) => ({ key, item: pool.acquire(key) }))
      for (const { key, item } of inFlight) pool.release(key, item)
    }

    // 동시 사용이 키당 1개뿐이라 상한에 닿지 않는다. 버려진 것도 없다.
    expect(hooks.created()).toBe(SYMBOLS.length)
    expect(dispose).not.toHaveBeenCalled()
    expect(pool.stats.free).toBeLessThanOrEqual(SYMBOLS.length * cap)
  })

  it('겹쳐 터지는 파티클은 예산 상한을 넘지 않는다', () => {
    const budget = new ParticleBudget(60)
    let peak = 0

    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      const coins = budget.take(50)
      peak = Math.max(peak, budget.inUse)
      const confetti = budget.take(36)
      peak = Math.max(peak, budget.inUse)
      const scatter = budget.take(24)
      peak = Math.max(peak, budget.inUse)

      expect(coins + confetti + scatter).toBeLessThanOrEqual(60)
      budget.give(coins)
      budget.give(confetti)
      budget.give(scatter)
      expect(budget.inUse).toBe(0)
    }

    expect(peak).toBe(60)
  })
})

describe('쌍 단위 재사용 — 띠와 마스크', () => {
  // 덧그림은 띠와 마스크가 한 몸이다. 풀이 **쌍 하나를 한 물건으로** 다루므로
  // 둘이 갈라질 수 있는 상태가 아예 생기지 않는다 — 그것을 여기서 붙잡는다.
  interface Pair {
    band: { id: number; masked: boolean }
    mask: { id: number; drawn: boolean }
  }

  function pairPool(maxRetained = 4): { pool: ObjectPool<Pair>; created: () => number } {
    let created = 0
    const pool = new ObjectPool<Pair>({
      create: () => {
        created += 1
        return { band: { id: created, masked: false }, mask: { id: created, drawn: false } }
      },
      reset: (pair) => {
        pair.band.masked = false
        pair.mask.drawn = false
      },
      maxRetained,
    })
    return { pool, created: () => created }
  }

  it('빌린 쌍은 언제나 같은 짝이다', () => {
    const { pool } = pairPool()
    const first = pool.acquire()
    first.band.masked = true
    first.mask.drawn = true
    pool.release(first)

    const second = pool.acquire()
    expect(second).toBe(first)
    expect(second.band.id).toBe(second.mask.id)
  })

  it('반납하면 띠와 마스크가 함께 비워진다', () => {
    const { pool } = pairPool()
    const pair = pool.acquire()
    pair.band.masked = true
    pair.mask.drawn = true

    pool.release(pair)

    expect(pair.band.masked).toBe(false)
    expect(pair.mask.drawn).toBe(false)
  })

  it('여러 쌍이 섞여도 짝이 어긋나지 않는다', () => {
    const { pool } = pairPool()
    const held = [pool.acquire(), pool.acquire(), pool.acquire()]
    for (const pair of held) pool.release(pair)

    const again = [pool.acquire(), pool.acquire(), pool.acquire()]
    for (const pair of again) expect(pair.band.id).toBe(pair.mask.id)
    expect(new Set(again.map((pair) => pair.band.id)).size).toBe(3)
  })

  it('상한 0이면 보관하지 않아 풀 이전과 결과가 같다', () => {
    // 풀이 없는 자리는 상한 0짜리 풀로 대신한다. 매번 새로 만들어야 그 동작이다.
    const { pool, created } = pairPool(0)
    for (let i = 0; i < 5; i += 1) pool.release(pool.acquire())

    expect(created()).toBe(5)
    expect(pool.size).toBe(0)
    expect(pool.stats.reused).toBe(0)
  })
})

describe('꽉 찬 격자에서도 풀이 제 일을 한다', () => {
  // astral-clocktower(4릴 x 5행)에서 2백만 스핀 실측 최대 동시 점등이 20칸이었다.
  // 상한이 그보다 작으면 그 판에서만 반납분이 버려져 풀이 없는 것과 같아진다.
  const REELS = 4
  const ROWS = 5
  const PEAK = REELS * ROWS

  function run(maxRetainedPerKey: number): { created: number; discarded: number } {
    let created = 0
    const pool = new KeyedObjectPool<string, { id: number }>({
      create: () => {
        created += 1
        return { id: created }
      },
      maxRetainedPerKey,
    })
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const held = Array.from({ length: PEAK }, () => pool.acquire('gear'))
      for (const item of held) pool.release('gear', item)
    }
    return { created, discarded: pool.stats.discarded }
  }

  it('상한이 격자 칸 수면 버리는 것 없이 계속 재사용한다', () => {
    const { created, discarded } = run(PEAK)
    expect(created).toBe(PEAK)
    expect(discarded).toBe(0)
  })

  it('상한이 모자라면 매 바퀴 새로 만든다', () => {
    // 예전 상한 12. 20칸이 켜지는 판에서는 8개가 매 바퀴 버려지고 다시 만들어졌다.
    const { created, discarded } = run(12)
    expect(discarded).toBe(8 * 20)
    expect(created).toBeGreaterThan(PEAK)
  })

  it('상한이 실제 점등 수보다 커도 그만큼 만들지 않는다', () => {
    // 상주량을 정하는 것은 상한이 아니라 실제 동시 사용량이다.
    const { created, discarded } = run(PEAK * 3)
    expect(created).toBe(PEAK)
    expect(discarded).toBe(0)
  })
})
