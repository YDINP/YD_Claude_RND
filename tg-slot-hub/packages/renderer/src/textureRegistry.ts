/**
 * 텍스처 수명 장부.
 *
 * **소유권 규칙: 수명은 "지금도 누가 쓰는가"를 따른다. "누가 만들었는가"가 아니다.**
 * 만든 쪽이 사라져도 쓰는 쪽이 남아 있으면 텍스처는 산다. 반대로 만든 쪽이 살아 있어도
 * 아무도 안 쓰면 상한을 넘는 순간 밀려난다.
 *
 * 여기에 들어오는 텍스처는 두 종류다.
 *
 * - **상주(`own`)**: 이 인스턴스가 캔버스로 직접 그린 것. 폴백·코인·연출 텍스처가 여기다.
 *   사용자가 하나뿐이라 `destroyAll`이나 `release` 한 번으로 끝나고, 중간에 밀려나지 않는다.
 * - **캐시(`retain`/`release`)**: 여러 화면이 나눠 쓰는 무거운 것. 시트 아틀라스가 여기다.
 *   참조 수를 세고, 참조가 끊긴 것 중 **가장 먼저 놓인 것부터** 상한을 넘는 만큼 밀어낸다.
 *
 * `Assets.load`가 준 텍스처는 전역 캐시가 소유하므로 여기에 그대로 넣지 않는다. 그것까지
 * 파괴하면 다음 게임 진입에서 캐시 히트가 죽은 텍스처를 돌려준다. 아틀라스처럼 되돌려줘야
 * 하는 것은 `destroy()`가 `Assets.unload`까지 책임지는 래퍼로 감싸서 넣는다.
 */
export interface DestroyableTexture {
  /** Pixi `Texture.destroy(destroySource)`. true면 GPU 리소스까지 함께 해제한다. */
  destroy(destroyTextureSource?: boolean): void
}

export interface TextureRegistryOptions {
  /**
   * 캐시 텍스처 상한(장). 상주 텍스처는 세지 않는다.
   * 넘으면 참조가 끊긴 것부터 밀어낸다. 전부 참조 중이면 아무것도 밀어내지 않는다 —
   * 쓰고 있는 것을 파괴하느니 잠시 상한을 넘는 쪽이 낫다.
   */
  cacheCapacity?: number
}

/** 진단 패널이 그대로 실을 수 있는 읽기 전용 스냅샷. */
export interface TextureRegistrySnapshot {
  /** 소유한 텍스처 총수(상주 + 캐시). */
  owned: number
  /** 캐시로 관리 중인 텍스처 수. */
  cached: number
  /** 그중 아직 참조가 남아 있는 수. */
  live: number
  /** 참조가 끊겨 언제든 밀려날 수 있는 수. */
  idle: number
  /** 지금까지 밀어낸 누적 수. */
  evicted: number
  /** 캐시 상한. 무제한이면 `Infinity`. */
  capacity: number
}

export class TextureRegistry {
  private readonly owned = new Set<DestroyableTexture>()
  /** 캐시 텍스처의 참조 수. 여기 없는 것은 상주 텍스처다. */
  private readonly refCounts = new Map<DestroyableTexture, number>()
  /** 참조가 0인 캐시 텍스처. **삽입 순서가 곧 놓인 순서**라 맨 앞이 가장 오래된 후보다. */
  private readonly idle = new Set<DestroyableTexture>()
  private readonly capacity: number
  private evictedCount = 0

  constructor(options: TextureRegistryOptions = {}) {
    this.capacity = Math.max(0, options.cacheCapacity ?? Number.POSITIVE_INFINITY)
  }

  /** 상주 소유권을 등록하고 그대로 돌려준다. 같은 텍스처를 두 번 넣어도 한 번만 센다. */
  own<T extends DestroyableTexture>(texture: T): T {
    this.owned.add(texture)
    return texture
  }

  /**
   * 캐시 텍스처를 하나 붙잡는다. 처음 보는 것은 소유권까지 함께 가져온다.
   * 붙잡고 있는 동안에는 절대 밀려나지 않는다.
   */
  retain<T extends DestroyableTexture>(texture: T): T {
    this.owned.add(texture)
    const count = this.refCounts.get(texture)
    if (count === undefined) {
      this.refCounts.set(texture, 1)
    } else {
      this.refCounts.set(texture, count + 1)
      this.idle.delete(texture)
    }
    this.evictOverflow()
    return texture
  }

  /**
   * "나는 더는 이 텍스처를 쓰지 않는다."
   *
   * 무슨 일이 일어나는지는 **다른 사용자가 남았는지**가 정한다.
   * - 상주 텍스처(`own`)는 사용자가 하나뿐이다. 그 자리에서 파괴하고 장부에서 뺀다.
   *   전환 클립처럼 렌더러보다 먼저 끝나는 텍스처가 이 길로 간다.
   * - 캐시 텍스처(`retain`)는 참조를 하나 깎는다. 0이 되어도 파괴하지 않고 축출 후보로
   *   물러날 뿐이다 — 곧 다시 쓸 수도 있으므로 상한을 넘길 때까지는 그대로 둔다.
   *
   * @returns 장부에 있던 텍스처였으면 true. 모르는 텍스처는 건드리지 않고 false.
   */
  release(texture: DestroyableTexture): boolean {
    const count = this.refCounts.get(texture)
    if (count === undefined) {
      if (!this.owned.delete(texture)) return false
      destroyQuietly(texture)
      return true
    }
    if (count > 1) {
      this.refCounts.set(texture, count - 1)
      return true
    }
    this.refCounts.set(texture, 0)
    // 다시 넣어 순서를 맨 뒤로 민다. 방금 놓은 것이 가장 늦게 밀려난다.
    this.idle.delete(texture)
    this.idle.add(texture)
    this.evictOverflow()
    return true
  }

  /** 지금 붙잡고 있는 참조 수. 붙잡은 적 없으면 0이다. */
  refCountOf(texture: DestroyableTexture): number {
    return this.refCounts.get(texture) ?? 0
  }

  has(texture: DestroyableTexture): boolean {
    return this.owned.has(texture)
  }

  get size(): number {
    return this.owned.size
  }

  /** 참조가 남아 있는 캐시 텍스처 수. */
  get liveCount(): number {
    let live = 0
    for (const count of this.refCounts.values()) if (count > 0) live += 1
    return live
  }

  get snapshot(): TextureRegistrySnapshot {
    return {
      owned: this.owned.size,
      cached: this.refCounts.size,
      live: this.liveCount,
      idle: this.idle.size,
      evicted: this.evictedCount,
      capacity: this.capacity,
    }
  }

  /**
   * 등록된 텍스처를 모두 GPU 리소스까지 해제한다.
   * 한 번 호출하면 목록이 비므로 다시 불러도 안전하다(destroy가 두 번 불리지 않는다).
   * 하나가 실패해도 나머지는 계속 해제한다. 정리 도중의 예외로 누수를 키우지 않기 위해서다.
   */
  destroyAll(): void {
    const textures = [...this.owned]
    this.owned.clear()
    this.refCounts.clear()
    this.idle.clear()
    for (const texture of textures) destroyQuietly(texture)
  }

  /** 상한을 넘긴 만큼, 참조가 끊긴 것 중 가장 오래 놓여 있던 것부터 밀어낸다. */
  private evictOverflow(): void {
    while (this.refCounts.size > this.capacity) {
      const oldest = firstOf(this.idle)
      // 전부 누군가 쓰는 중이다. 쓰는 것을 파괴하지 않는다는 규칙이 상한보다 우선한다.
      if (oldest === null) return
      this.idle.delete(oldest)
      this.refCounts.delete(oldest)
      this.owned.delete(oldest)
      this.evictedCount += 1
      destroyQuietly(oldest)
    }
  }
}

function firstOf(set: ReadonlySet<DestroyableTexture>): DestroyableTexture | null {
  for (const item of set) return item
  return null
}

function destroyQuietly(texture: DestroyableTexture): void {
  try {
    texture.destroy(true)
  } catch {
    // 이미 파괴된 텍스처 등. 나머지 정리를 막지 않는다.
  }
}
