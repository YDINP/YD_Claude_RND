import { Container, Sprite, Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { planSparkles, type SparklePlanOptions } from '../ambient.js'
import { SPARKLE_ALPHA, SPARKLE_FADE_MS, SPARKLE_MAX_COUNT } from '../constants.js'
import type { Rect } from '../layout.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { createCanvasTexture } from './textures.js'

/** 반짝임 텍스처 한 변(px). */
const SPARKLE_TEXTURE_SIZE = 64

/** 가운데가 흰 금빛 점. 네 방향으로 살짝 뻗어 반짝임처럼 보이게 한다. */
export function createSparkleTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(
    SPARKLE_TEXTURE_SIZE,
    SPARKLE_TEXTURE_SIZE,
    (ctx, size) => {
      const center = size / 2
      const glow = ctx.createRadialGradient(center, center, 0, center, center, center)
      glow.addColorStop(0, 'rgba(255,255,255,1)')
      glow.addColorStop(0.25, 'rgba(255,231,163,0.85)')
      glow.addColorStop(1, 'rgba(216,169,74,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(center, center, center, 0, Math.PI * 2)
      ctx.fill()

      // 십자 빛줄기. 원만 있으면 그냥 흐린 점으로 보인다.
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = Math.max(1, size * 0.03)
      ctx.beginPath()
      ctx.moveTo(center, size * 0.08)
      ctx.lineTo(center, size * 0.92)
      ctx.moveTo(size * 0.08, center)
      ctx.lineTo(size * 0.92, center)
      ctx.stroke()
    },
    registry,
  )
}

/** 시작한 연출을 되돌리는 손잡이. */
export interface AmbientEffect {
  stop(): void
}

const NOOP_EFFECT: AmbientEffect = { stop: () => undefined }

/**
 * 배경에 흩뿌린 반짝임. 각자 다른 시점에 켜졌다 꺼진다.
 * 텍스처는 공유하고 스프라이트만 개수만큼 만든다.
 * `options.exclude`에 릴 창을 넘겨 심볼 위에서 반짝이지 않게 한다.
 */
export function startSparkles(
  layer: Container,
  texture: Texture,
  area: Rect,
  options: SparklePlanOptions & { count?: number; random?: () => number } = {},
): AmbientEffect {
  if (area.width <= 0 || area.height <= 0) return NOOP_EFFECT
  const random = options.random ?? Math.random
  const placements = planSparkles(area, options.count ?? SPARKLE_MAX_COUNT, random, options)
  if (placements.length === 0) return NOOP_EFFECT

  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []

  for (const placement of placements) {
    const sparkle = new Sprite(texture)
    sparkle.anchor.set(0.5)
    sparkle.scale.set(placement.scale)
    sparkle.x = placement.x
    sparkle.y = placement.y
    sparkle.alpha = 0
    sparkle.blendMode = 'add'
    layer.addChild(sparkle)
    sprites.push(sparkle)

    tweens.push(
      gsap.to(sparkle, {
        alpha: SPARKLE_ALPHA,
        duration: SPARKLE_FADE_MS / 2000,
        delay: placement.delayMs / 1000,
        yoyo: true,
        repeat: -1,
        repeatDelay: placement.delayMs / 1000,
        ease: 'sine.inOut',
      }),
    )
  }

  return {
    stop: () => {
      for (const tween of tweens) tween.kill()
      for (const sparkle of sprites) sparkle.destroy()
    },
  }
}
