import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { gsap } from 'gsap'
import {
  fxAmplitude,
  fxPulseScale,
  fxSegmentDelayMs,
  fxStaggerDelayMs,
  type ResolvedFxEffect,
} from '../fx.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { FX_OVERLAY_POOL_MAX, FX_SPRITE_POOL_MAX } from '../constants.js'
import type { PoolStats } from '../pool.js'
import {
  CellSpritePool,
  OverlayPairPool,
  resetMaskSprite,
  type OverlayPair,
} from './spritePool.js'
import { createCanvasTexture } from './textures.js'

/** 빛줄기 텍스처 크기(px). 심볼 위를 지나가므로 가로로 길게 늘여 쓴다. */
const SHINE_TEXTURE_SIZE = 64
/** 광채 텍스처 크기(px). */
const GLOW_TEXTURE_SIZE = 96
/** 파티클 텍스처 크기(px). */
const SPARK_TEXTURE_SIZE = 32

/** 광채 스프라이트가 심볼보다 커지는 배수. */
const GLOW_SCALE = 1.45
/** 빛줄기 띠 폭 = 심볼 한 변 x 이 값. */
const SHINE_BAND_RATIO = 0.35
/** 파티클이 날아가는 거리 = 심볼 한 변 x 이 값. */
const BURST_DISTANCE_RATIO = 0.9
/** flash가 떨어지는 최저 불투명도. */
const FLASH_MIN_ALPHA = 0.35

/**
 * 심볼 연출이 쓰는 덧그림 공급처.
 *
 * 승리 순환은 다음 스핀까지 A -> B -> A로 계속 돈다. 광채·빛줄기·파티클은 그때마다 다시
 * 걸리므로, 만들고 버리는 방식이면 "판당 몇 개"가 아니라 "초당 몇 개"가 된다.
 * 시트가 있는 게임은 시트 경로가 이걸 대신하지만, 시트 없는 심볼은 이 길로만 간다.
 *
 * 상한(`maxRetained`)이 0이면 보관하지 않고 곧장 버린다 — 그것이 풀을 끼우기 전의 동작이라,
 * 널 오브젝트를 따로 만들지 않고 상한 0짜리 풀 하나로 같은 자리를 채운다.
 */
export class SymbolFxPool {
  /** 광채와 파티클. 마스크가 없는 홑겹 덧그림이다. */
  private readonly sprites: CellSpritePool
  /** 빛줄기. 심볼 모양(스프라이트)으로 오려낸다. */
  private readonly shine: OverlayPairPool<Sprite>
  /** 분할 flash. 가로 띠(사각형)로 오려낸다. */
  private readonly bands: OverlayPairPool<Graphics>

  constructor(spriteMax: number = FX_SPRITE_POOL_MAX, overlayMax: number = FX_OVERLAY_POOL_MAX) {
    this.sprites = new CellSpritePool(spriteMax)
    this.shine = new OverlayPairPool<Sprite>({
      createMask: () => new Sprite(),
      resetMask: resetMaskSprite,
      maxRetained: overlayMax,
    })
    this.bands = new OverlayPairPool<Graphics>({
      createMask: () => new Graphics(),
      // 지난번 띠가 남아 있으면 다음 구획이 그 위에 겹쳐 그려 마스크가 넓어진다.
      resetMask: (mask) => mask.clear(),
      maxRetained: overlayMax,
    })
  }

  acquireSprite(texture: Texture): Sprite {
    return this.sprites.acquire(texture)
  }

  releaseSprite(sprite: Sprite): void {
    this.sprites.release(sprite)
  }

  acquireShine(texture: Texture): OverlayPair<Sprite> {
    return this.shine.acquire(texture)
  }

  releaseShine(pair: OverlayPair<Sprite>): void {
    this.shine.release(pair)
  }

  acquireBand(texture: Texture): OverlayPair<Graphics> {
    return this.bands.acquire(texture)
  }

  releaseBand(pair: OverlayPair<Graphics>): void {
    this.bands.release(pair)
  }

  /** 보관분을 전부 파괴한다. 렌더러가 내려갈 때 한 번 부른다. */
  clear(): void {
    this.sprites.clear()
    this.shine.clear()
    this.bands.clear()
  }

  /** 세 갈래를 하나로 합친 통계. 비율은 합계에서 다시 계산한다. */
  get stats(): PoolStats {
    const parts = [this.sprites.stats, this.shine.stats, this.bands.stats]
    const total = parts.reduce(
      (sum, part) => ({
        free: sum.free + part.free,
        live: sum.live + part.live,
        created: sum.created + part.created,
        acquired: sum.acquired + part.acquired,
        reused: sum.reused + part.reused,
        discarded: sum.discarded + part.discarded,
        hitRate: 0,
      }),
      { free: 0, live: 0, created: 0, acquired: 0, reused: 0, discarded: 0, hitRate: 0 },
    )
    return { ...total, hitRate: total.acquired === 0 ? 0 : total.reused / total.acquired }
  }
}

/**
 * 풀이 없는 자리에서 쓰는 상한 0짜리 풀. 매번 만들고 매번 버린다.
 * 아무것도 보관하지 않으므로 여러 곳이 같이 써도 상태가 섞이지 않는다.
 */
export const UNPOOLED_SYMBOL_FX = new SymbolFxPool(0, 0)

/** 심볼 하나에 걸린 연출을 되돌리는 손잡이. */
export interface SymbolFxHandle {
  stop(): void
}

/**
 * 한 번만 되돌리는 손잡이.
 *
 * 손잡이는 셀별 목록과 전체 목록 두 곳에 걸려 있어 `stop()`이 두 번 불린다. 풀에 돌려준
 * 뒤의 두 번째 호출은 **이미 다른 칸이 꺼내 간** 덧그림을 회수해 버린다.
 */
function onceStopped(stop: () => void): SymbolFxHandle {
  let stopped = false
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      stop()
    },
  }
}

/** 연출이 붙는 대상. 셀 컨테이너와 그 안의 심볼 스프라이트다. */
export interface FxTarget {
  /** 셀 컨테이너. 원점이 심볼 중심이다. */
  view: Container
  sprite: Sprite
  /** 심볼 한 변(px). 이동량과 파티클 거리의 기준. */
  symbolSize: number
  /** 승리 라인 안에서의 순서. `stagger`가 쓴다. */
  index: number
}

export interface FxTextures {
  shine: Texture
  glow: Texture
  spark: Texture
}

/** 대각선 빛줄기. 가운데가 밝고 양끝이 투명한 띠다. */
function createShineTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(
    SHINE_TEXTURE_SIZE,
    SHINE_TEXTURE_SIZE,
    (ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, 0)
      gradient.addColorStop(0, 'rgba(255,255,255,0)')
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.9)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, size, size)
    },
    registry,
  )
}

/** 바깥으로 흐려지는 원형 광채. 색은 스프라이트 tint로 입힌다. */
function createGlowTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(
    GLOW_TEXTURE_SIZE,
    GLOW_TEXTURE_SIZE,
    (ctx, size) => {
      const center = size / 2
      const gradient = ctx.createRadialGradient(center, center, center * 0.22, center, center, center)
      gradient.addColorStop(0, 'rgba(255,255,255,0.85)')
      gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(center, center, center, 0, Math.PI * 2)
      ctx.fill()
    },
    registry,
  )
}

/** 파티클 알갱이. */
function createSparkTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(
    SPARK_TEXTURE_SIZE,
    SPARK_TEXTURE_SIZE,
    (ctx, size) => {
      const center = size / 2
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.4, 'rgba(255,231,163,0.9)')
      gradient.addColorStop(1, 'rgba(244,217,138,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(center, center, center, 0, Math.PI * 2)
      ctx.fill()
    },
    registry,
  )
}

/** 연출에 쓰는 텍스처를 한 번에 만들어 레지스트리에 넘긴다. */
export function createFxTextures(registry: TextureRegistry): FxTextures {
  return {
    shine: createShineTexture(registry),
    glow: createGlowTexture(registry),
    spark: createSparkTexture(registry),
  }
}

/**
 * gsap 반복 설정.
 * `repeat`를 명시했으면 그 횟수만 돌고 멈춘다(그 뒤로는 원래 상태로 고정).
 * 없으면 `loop`를 따라 무한이거나 1회다.
 */
function repeatOf(effect: ResolvedFxEffect): number {
  if (effect.repeat !== null) return effect.repeat
  return effect.loop ? -1 : 0
}

function playPulse(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  const scale = fxPulseScale(effect)
  const tween = gsap.to(target.view.scale, {
    x: scale,
    y: scale,
    duration: effect.durationMs / 2000,
    delay: fxStaggerDelayMs(effect, target.index) / 1000,
    yoyo: true,
    repeat: repeatOf(effect),
    ease: 'sine.inOut',
  })
  return {
    stop: () => {
      tween.kill()
      target.view.scale.set(1)
    },
  }
}

function playWobble(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  const radians = (fxAmplitude(effect.degrees, effect.intensity) * Math.PI) / 180
  const tween = gsap.fromTo(
    target.view,
    { rotation: -radians },
    {
      rotation: radians,
      duration: effect.durationMs / 2000,
      delay: fxStaggerDelayMs(effect, target.index) / 1000,
      yoyo: true,
      repeat: repeatOf(effect),
      ease: 'sine.inOut',
    },
  )
  return {
    stop: () => {
      tween.kill()
      target.view.rotation = 0
    },
  }
}

function playBounce(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  const distance = fxAmplitude(effect.px, effect.intensity) * target.symbolSize
  const baseY = target.sprite.y
  const tween = gsap.to(target.sprite, {
    y: baseY - distance,
    duration: effect.durationMs / 2000,
    delay: fxStaggerDelayMs(effect, target.index) / 1000,
    yoyo: true,
    repeat: repeatOf(effect),
    ease: 'sine.inOut',
  })
  return {
    stop: () => {
      tween.kill()
      target.sprite.y = baseY
    },
  }
}

function playFlash(target: FxTarget, effect: ResolvedFxEffect, pool: SymbolFxPool): SymbolFxHandle {
  if (effect.segments > 1) return playSegmentedFlash(target, effect, pool)

  const low = 1 - (1 - FLASH_MIN_ALPHA) * effect.intensity
  const tween = gsap.to(target.sprite, {
    alpha: low,
    duration: effect.durationMs / 2000,
    delay: fxStaggerDelayMs(effect, target.index) / 1000,
    yoyo: true,
    repeat: repeatOf(effect),
    ease: 'power1.inOut',
  })
  return {
    stop: () => {
      tween.kill()
      target.sprite.alpha = 1
    },
  }
}

/**
 * 심볼을 가로 띠 N개로 나눠 위에서 아래로 차례로 번쩍인다.
 * 3단 BAR가 한 칸씩 불이 들어오는 연출이 이것이다.
 *
 * 원본 스프라이트를 건드리지 않고, 같은 텍스처를 가산 합성으로 덧대 밝기만 올린다.
 * 띠마다 사각형 마스크를 씌워 그 구간만 보이게 한다.
 */
function playSegmentedFlash(target: FxTarget, effect: ResolvedFxEffect, pool: SymbolFxPool): SymbolFxHandle {
  const width = target.sprite.width
  const height = target.sprite.height
  const bandHeight = height / effect.segments
  const peak = fxAmplitude(0.8, effect.intensity)

  const tweens: gsap.core.Tween[] = []
  const pairs: OverlayPair<Graphics>[] = []

  for (let segment = 0; segment < effect.segments; segment += 1) {
    const pair = pool.acquireBand(target.sprite.texture)
    const { band, mask } = pair
    band.width = width
    band.height = height
    band.blendMode = 'add'
    band.alpha = 0

    // 심볼 중심이 원점이라 위쪽 끝은 -height / 2다.
    mask.rect(-width / 2, -height / 2 + segment * bandHeight, width, bandHeight).fill({ color: 0xffffff })
    band.mask = mask

    target.view.addChild(mask, band)
    pairs.push(pair)

    tweens.push(
      gsap.to(band, {
        alpha: peak,
        duration: effect.durationMs / 2000,
        delay:
          (fxStaggerDelayMs(effect, target.index) + fxSegmentDelayMs(effect, segment)) / 1000,
        yoyo: true,
        repeat: repeatOf(effect),
        repeatDelay: (fxSegmentDelayMs(effect, effect.segments) / 1000) * 0.5,
        ease: 'power1.inOut',
      }),
    )
  }

  return onceStopped(() => {
    for (const tween of tweens) tween.kill()
    // 쌍째로 돌려준다. 마스크 연결을 끊는 것은 풀의 몫이다.
    for (const pair of pairs) pool.releaseBand(pair)
  })
}

function playSpin(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  const tween = gsap.fromTo(
    target.view.scale,
    { x: 1 },
    {
      x: -1,
      duration: effect.durationMs / 2000,
      delay: fxStaggerDelayMs(effect, target.index) / 1000,
      yoyo: true,
      repeat: repeatOf(effect),
      ease: 'power1.inOut',
    },
  )
  return {
    stop: () => {
      tween.kill()
      target.view.scale.x = 1
    },
  }
}

function playGlow(
  target: FxTarget,
  effect: ResolvedFxEffect,
  textures: FxTextures,
  pool: SymbolFxPool,
): SymbolFxHandle {
  const glow = pool.acquireSprite(textures.glow)
  glow.tint = effect.color
  glow.blendMode = 'add'
  glow.alpha = 0
  glow.width = target.symbolSize * GLOW_SCALE
  glow.height = target.symbolSize * GLOW_SCALE
  // 심볼 뒤에 깔아야 테두리를 감싸는 것처럼 보인다.
  target.view.addChildAt(glow, 0)

  const tween = gsap.to(glow, {
    alpha: fxAmplitude(0.9, effect.intensity),
    duration: effect.durationMs / 2000,
    delay: fxStaggerDelayMs(effect, target.index) / 1000,
    yoyo: true,
    repeat: repeatOf(effect),
    ease: 'sine.inOut',
  })
  return onceStopped(() => {
    tween.kill()
    pool.releaseSprite(glow)
  })
}

function playShine(
  target: FxTarget,
  effect: ResolvedFxEffect,
  textures: FxTextures,
  pool: SymbolFxPool,
): SymbolFxHandle {
  const size = target.symbolSize
  const pair = pool.acquireShine(textures.shine)
  const { band, mask } = pair
  band.blendMode = 'add'
  band.alpha = fxAmplitude(0.75, effect.intensity)
  band.width = size * SHINE_BAND_RATIO
  // 기울여도 심볼을 가로지르도록 대각선보다 길게 잡는다.
  band.height = size * 1.6
  band.rotation = (effect.angle * Math.PI) / 180
  band.y = 0

  // 심볼 모양대로만 빛나도록 심볼 스프라이트 자체를 마스크로 쓴다.
  mask.texture = target.sprite.texture
  mask.width = target.sprite.width
  mask.height = target.sprite.height
  band.mask = mask

  target.view.addChild(mask, band)

  const travel = size * 0.9
  const tween = gsap.fromTo(
    band,
    { x: -travel },
    {
      x: travel,
      duration: effect.durationMs / 1000,
      delay: fxStaggerDelayMs(effect, target.index) / 1000,
      repeat: repeatOf(effect),
      repeatDelay: effect.loop ? effect.durationMs / 1000 : 0,
      ease: 'sine.inOut',
    },
  )
  return onceStopped(() => {
    tween.kill()
    pool.releaseShine(pair)
  })
}

function playBurst(
  target: FxTarget,
  effect: ResolvedFxEffect,
  textures: FxTextures,
  pool: SymbolFxPool,
): SymbolFxHandle {
  const distance = target.symbolSize * BURST_DISTANCE_RATIO * effect.intensity
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []

  for (let i = 0; i < effect.particles; i += 1) {
    const angle = (Math.PI * 2 * i) / effect.particles
    const spark = pool.acquireSprite(textures.spark)
    spark.blendMode = 'add'
    spark.scale.set((target.symbolSize / SPARK_TEXTURE_SIZE) * 0.35)
    target.view.addChild(spark)
    sprites.push(spark)

    tweens.push(
      gsap.fromTo(
        spark,
        { x: 0, y: 0, alpha: 1 },
        {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          alpha: 0,
          duration: effect.durationMs / 1000,
          delay: fxStaggerDelayMs(effect, target.index) / 1000,
          repeat: repeatOf(effect),
          ease: 'power2.out',
        },
      ),
    )
  }

  return onceStopped(() => {
    for (const tween of tweens) tween.kill()
    for (const spark of sprites) pool.releaseSprite(spark)
  })
}

/**
 * 효과 1개를 심볼에 건다. 알 수 없는 타입은 조용히 무시한다
 * (스키마가 막지만, 새 타입이 생겨도 옛 렌더러가 깨지지 않게 한다).
 */
export function playSymbolFx(
  target: FxTarget,
  effect: ResolvedFxEffect,
  textures: FxTextures,
  pool: SymbolFxPool = UNPOOLED_SYMBOL_FX,
): SymbolFxHandle | null {
  switch (effect.type) {
    case 'pulse':
      return playPulse(target, effect)
    case 'wobble':
      return playWobble(target, effect)
    case 'bounce':
      return playBounce(target, effect)
    case 'flash':
      return playFlash(target, effect, pool)
    case 'spin':
      return playSpin(target, effect)
    case 'glow':
      return playGlow(target, effect, textures, pool)
    case 'shine':
      return playShine(target, effect, textures, pool)
    case 'burst':
      return playBurst(target, effect, textures, pool)
    default:
      return null
  }
}

/** 효과 여러 개를 한꺼번에 걸고 하나의 손잡이로 묶는다. */
export function playSymbolFxSet(
  target: FxTarget,
  effects: readonly ResolvedFxEffect[],
  textures: FxTextures,
  pool: SymbolFxPool = UNPOOLED_SYMBOL_FX,
): SymbolFxHandle {
  const handles = effects
    .map((effect) => playSymbolFx(target, effect, textures, pool))
    .filter((handle): handle is SymbolFxHandle => handle !== null)
  return onceStopped(() => {
    for (const handle of handles) handle.stop()
  })
}
