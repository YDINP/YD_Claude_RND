import { Container, Sprite, Texture } from 'pixi.js'
import { ObjectPool, type PoolStats } from '../pool.js'

/** 스프라이트 하나를 새것과 구별되지 않는 상태로 되돌린다. 풀에서 꺼낼 때마다 지나는 문. */
function freshen(sprite: Sprite, texture: Texture): void {
  sprite.texture = texture
  sprite.anchor.set(0.5)
  // 크기를 width/height로 정하는 쪽이 있어 배율을 반드시 먼저 되돌린다.
  sprite.scale.set(1)
  sprite.rotation = 0
  sprite.alpha = 1
  sprite.tint = 0xffffff
  sprite.blendMode = 'normal'
  sprite.position.set(0, 0)
  sprite.visible = true
}

/**
 * 층 하나에 붙어 사는 스프라이트 풀.
 *
 * 연출 파티클은 전부 같은 모양의 물건이다 — 층의 자식으로 앉아, 텍스처와 위치만 바꿔 가며
 * 잠깐 보였다 사라진다. 그래서 만들고 버리는 대신 **감춰 두었다가 다시 꺼내 쓴다.**
 *
 * 꺼낼 때 지난번 상태를 전부 되돌리는 것이 이 풀의 계약이다. 호출 측이 "지난번에 무엇을
 * 건드렸는지" 기억하지 않아도 되게 하려는 것이고, 그래야 새로 만든 것과 구별되지 않는다.
 * 텍스처는 `TextureRegistry`가 소유하므로 여기서 파괴하는 것은 스프라이트뿐이다.
 */
export class LayerSpritePool {
  private readonly pool: ObjectPool<Sprite>

  constructor(
    private readonly layer: Container,
    maxRetained: number,
  ) {
    this.pool = new ObjectPool<Sprite>({
      create: () => layer.addChild(new Sprite()),
      // 감춰 두는 것이 되돌리는 전부다. 나머지 상태는 꺼낼 때 어차피 다시 정한다.
      reset: (sprite) => {
        sprite.visible = false
      },
      dispose: (sprite) => {
        sprite.removeFromParent()
        sprite.destroy()
      },
      maxRetained,
    })
  }

  /** 쓸 수 있는 스프라이트 하나. 지난번 상태는 전부 지우고 준다. */
  acquire(texture: Texture): Sprite {
    const sprite = this.pool.acquire()
    if (sprite.parent === null) this.layer.addChild(sprite)
    freshen(sprite, texture)
    return sprite
  }

  /** 다 쓴 스프라이트를 감춰 두고 다음 차례를 기다린다. 두 번 돌려줘도 한 번만 받는다. */
  release(sprite: Sprite): void {
    this.pool.release(sprite)
  }

  /** 보관분을 전부 파괴한다. 아직 나가 있는 것은 층과 함께 정리된다. */
  clear(): void {
    this.pool.clear()
  }

  /** 지금 감춰 둔 스프라이트 수. 풀이 늘기만 하는지 보려고 열어 둔다. */
  get size(): number {
    return this.pool.size
  }

  /** 지금 화면에 나가 있는 수. */
  get live(): number {
    return this.pool.live
  }

  get stats(): PoolStats {
    return this.pool.stats
  }
}

/**
 * 셀에 붙였다 떼는 스프라이트 풀.
 *
 * `LayerSpritePool`과 다른 점은 **부모가 매번 바뀐다**는 것이다. 심볼 연출은 이긴 칸의
 * 컨테이너 안에 덧그림을 얹으므로, 다음에 꺼낼 때는 다른 칸에 붙는다. 그래서 돌려받을 때
 * 부모에서 떼어 두고, 붙이는 일은 꺼내 쓰는 쪽에 맡긴다 — 어디에 붙일지는 그쪽만 안다.
 */
export class CellSpritePool {
  private readonly pool: ObjectPool<Sprite>

  constructor(maxRetained: number) {
    this.pool = new ObjectPool<Sprite>({
      create: () => new Sprite(),
      reset: (sprite) => {
        sprite.removeFromParent()
        sprite.visible = false
      },
      dispose: (sprite) => {
        sprite.removeFromParent()
        sprite.destroy()
      },
      maxRetained,
    })
  }

  /** 부모 없는 스프라이트 하나. 붙이는 것은 부르는 쪽 몫이다. */
  acquire(texture: Texture): Sprite {
    const sprite = this.pool.acquire()
    freshen(sprite, texture)
    return sprite
  }

  release(sprite: Sprite): void {
    this.pool.release(sprite)
  }

  clear(): void {
    this.pool.clear()
  }

  get stats(): PoolStats {
    return this.pool.stats
  }
}

/**
 * 덧그림 한 쌍 — 띠와 그 띠를 가리는 마스크.
 *
 * **쌍이 갈라지지 않는 것이 불변식이다.** 마스크만 먼저 반납되면 띠가 살아 있는 채로 남의
 * 마스크를 물게 되고, 띠만 먼저 반납되면 마스크가 주인 없이 셀에 남는다. 그래서 둘을 한
 * 단위로만 빌리고 한 단위로만 돌려준다.
 */
export interface OverlayPair<M extends Container> {
  band: Sprite
  mask: M
}

export interface OverlayPairPoolOptions<M extends Container> {
  /** 마스크를 만든다. 사각형을 그릴 `Graphics`일 수도, 심볼 모양을 쓸 `Sprite`일 수도 있다. */
  createMask: () => M
  /** 마스크를 새것과 구별되지 않는 상태로 되돌린다. 그림·배율이 남아 있으면 다음 쌍이 물려받는다. */
  resetMask: (mask: M) => void
  maxRetained: number
}

/**
 * 띠+마스크 쌍 풀. 마스크의 종류만 다를 뿐 수명 규칙은 하나다.
 *
 * 반납할 때 **가장 먼저 `band.mask = null`로 연결을 끊는다.** 이 순서를 지키지 않으면
 * 다음 쌍이 꺼내 갈 때까지 pixi가 죽은 마스크를 붙들고 있다.
 */
export class OverlayPairPool<M extends Container> {
  private readonly pool: ObjectPool<OverlayPair<M>>

  constructor(options: OverlayPairPoolOptions<M>) {
    this.pool = new ObjectPool<OverlayPair<M>>({
      create: () => ({ band: new Sprite(), mask: options.createMask() }),
      reset: (pair) => {
        pair.band.mask = null
        pair.band.removeFromParent()
        pair.band.visible = false
        pair.mask.removeFromParent()
        options.resetMask(pair.mask)
      },
      dispose: (pair) => {
        pair.band.mask = null
        pair.band.removeFromParent()
        pair.band.destroy()
        pair.mask.removeFromParent()
        pair.mask.destroy()
      },
      maxRetained: options.maxRetained,
    })
  }

  /** 띠와 마스크를 함께 꺼낸다. 마스크의 모양은 부르는 쪽이 정한다. */
  acquire(bandTexture: Texture): OverlayPair<M> {
    const pair = this.pool.acquire()
    freshen(pair.band, bandTexture)
    return pair
  }

  /** 쌍을 통째로 돌려준다. 마스크 연결은 여기서 끊긴다. */
  release(pair: OverlayPair<M>): void {
    this.pool.release(pair)
  }

  clear(): void {
    this.pool.clear()
  }

  get stats(): PoolStats {
    return this.pool.stats
  }
}

/** 마스크로 쓰는 스프라이트를 빈 상태로 되돌린다. 텍스처를 물고 있으면 그만큼 GPU가 묶인다. */
export function resetMaskSprite(mask: Sprite): void {
  mask.texture = Texture.EMPTY
  mask.anchor.set(0.5)
  mask.scale.set(1)
  mask.rotation = 0
  mask.position.set(0, 0)
}
