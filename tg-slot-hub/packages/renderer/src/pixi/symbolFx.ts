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

/** 심볼 하나에 걸린 연출을 되돌리는 손잡이. */
export interface SymbolFxHandle {
  stop(): void
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

function playFlash(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  if (effect.segments > 1) return playSegmentedFlash(target, effect)

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
function playSegmentedFlash(target: FxTarget, effect: ResolvedFxEffect): SymbolFxHandle {
  const width = target.sprite.width
  const height = target.sprite.height
  const bandHeight = height / effect.segments
  const peak = fxAmplitude(0.8, effect.intensity)

  const tweens: gsap.core.Tween[] = []
  const nodes: Container[] = []

  for (let segment = 0; segment < effect.segments; segment += 1) {
    const band = new Sprite(target.sprite.texture)
    band.anchor.set(0.5)
    band.width = width
    band.height = height
    band.blendMode = 'add'
    band.alpha = 0

    const mask = new Graphics()
    // 심볼 중심이 원점이라 위쪽 끝은 -height / 2다.
    mask.rect(-width / 2, -height / 2 + segment * bandHeight, width, bandHeight).fill({ color: 0xffffff })
    band.mask = mask

    target.view.addChild(mask, band)
    nodes.push(mask, band)

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

  return {
    stop: () => {
      for (const tween of tweens) tween.kill()
      for (const node of nodes) {
        if (node instanceof Sprite) node.mask = null
        node.destroy()
      }
    },
  }
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

function playGlow(target: FxTarget, effect: ResolvedFxEffect, textures: FxTextures): SymbolFxHandle {
  const glow = new Sprite(textures.glow)
  glow.anchor.set(0.5)
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
  return {
    stop: () => {
      tween.kill()
      glow.destroy()
    },
  }
}

function playShine(target: FxTarget, effect: ResolvedFxEffect, textures: FxTextures): SymbolFxHandle {
  const size = target.symbolSize
  const band = new Sprite(textures.shine)
  band.anchor.set(0.5)
  band.blendMode = 'add'
  band.alpha = fxAmplitude(0.75, effect.intensity)
  band.width = size * SHINE_BAND_RATIO
  // 기울여도 심볼을 가로지르도록 대각선보다 길게 잡는다.
  band.height = size * 1.6
  band.rotation = (effect.angle * Math.PI) / 180
  band.y = 0

  // 심볼 모양대로만 빛나도록 심볼 스프라이트 자체를 마스크로 쓴다.
  const mask = new Sprite(target.sprite.texture)
  mask.anchor.set(0.5)
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
  return {
    stop: () => {
      tween.kill()
      band.mask = null
      band.destroy()
      mask.destroy()
    },
  }
}

function playBurst(target: FxTarget, effect: ResolvedFxEffect, textures: FxTextures): SymbolFxHandle {
  const distance = target.symbolSize * BURST_DISTANCE_RATIO * effect.intensity
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []

  for (let i = 0; i < effect.particles; i += 1) {
    const angle = (Math.PI * 2 * i) / effect.particles
    const spark = new Sprite(textures.spark)
    spark.anchor.set(0.5)
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

  return {
    stop: () => {
      for (const tween of tweens) tween.kill()
      for (const spark of sprites) spark.destroy()
    },
  }
}

/**
 * 효과 1개를 심볼에 건다. 알 수 없는 타입은 조용히 무시한다
 * (스키마가 막지만, 새 타입이 생겨도 옛 렌더러가 깨지지 않게 한다).
 */
export function playSymbolFx(
  target: FxTarget,
  effect: ResolvedFxEffect,
  textures: FxTextures,
): SymbolFxHandle | null {
  switch (effect.type) {
    case 'pulse':
      return playPulse(target, effect)
    case 'wobble':
      return playWobble(target, effect)
    case 'bounce':
      return playBounce(target, effect)
    case 'flash':
      return playFlash(target, effect)
    case 'spin':
      return playSpin(target, effect)
    case 'glow':
      return playGlow(target, effect, textures)
    case 'shine':
      return playShine(target, effect, textures)
    case 'burst':
      return playBurst(target, effect, textures)
    default:
      return null
  }
}

/** 효과 여러 개를 한꺼번에 걸고 하나의 손잡이로 묶는다. */
export function playSymbolFxSet(
  target: FxTarget,
  effects: readonly ResolvedFxEffect[],
  textures: FxTextures,
): SymbolFxHandle {
  const handles = effects
    .map((effect) => playSymbolFx(target, effect, textures))
    .filter((handle): handle is SymbolFxHandle => handle !== null)
  return {
    stop: () => {
      for (const handle of handles) handle.stop()
    },
  }
}
