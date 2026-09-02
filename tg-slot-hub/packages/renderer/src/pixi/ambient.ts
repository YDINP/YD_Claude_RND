import { Container, Sprite, Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { planLightSweep, planSparkles } from '../ambient.js'
import {
  SPARKLE_FADE_MS,
  SPARKLE_MAX_COUNT,
  SWEEP_ALPHA,
  SWEEP_CYCLE_MS,
  SWEEP_TRAVEL_MS,
} from '../constants.js'
import type { Rect } from '../layout.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { createCanvasTexture } from './textures.js'

/** 빛 띠 텍스처 한 변(px). 가로로 늘려 쓰므로 작아도 된다. */
const SHINE_TEXTURE_WIDTH = 64
const SHINE_TEXTURE_HEIGHT = 8
/** 반짝임 텍스처 한 변(px). */
const SPARKLE_TEXTURE_SIZE = 64

/** 가운데가 희고 양끝이 투명한 가로 그라디언트 띠. 기울여 쓸어 준다. */
export function createShineTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(SHINE_TEXTURE_WIDTH, SHINE_TEXTURE_HEIGHT, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, width, 0)
    gradient.addColorStop(0, 'rgba(255,255,255,0)')
    gradient.addColorStop(0.45, 'rgba(255,248,222,0.55)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.55, 'rgba(255,248,222,0.55)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }, registry)
}

/** 가운데가 흰 금빛 점. 네 방향으로 살짝 뻗어 반짝임처럼 보이게 한다. */
export function createSparkleTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(SPARKLE_TEXTURE_SIZE, SPARKLE_TEXTURE_SIZE, (ctx, size) => {
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
  }, registry)
}

/** 시작한 연출을 되돌리는 손잡이. */
export interface AmbientEffect {
  stop(): void
}

const NOOP_EFFECT: AmbientEffect = { stop: () => undefined }

/**
 * 프레임 위를 대각선으로 훑고 지나가는 빛. 주기마다 한 번씩 지나간다.
 * 프레임 아트가 있을 때만 부른다. 벡터 베젤에는 훑을 표면이 없다.
 */
export function startLightSweep(layer: Container, texture: Texture, area: Rect): AmbientEffect {
  if (area.width <= 0 || area.height <= 0) return NOOP_EFFECT
  const plan = planLightSweep(area, SWEEP_TRAVEL_MS)

  const sweep = new Sprite(texture)
  sweep.anchor.set(0.5)
  sweep.width = plan.width
  sweep.height = plan.height
  sweep.rotation = plan.rotation
  sweep.alpha = SWEEP_ALPHA
  sweep.blendMode = 'add'
  sweep.x = plan.fromX
  sweep.y = plan.y
  layer.addChild(sweep)

  const tween = gsap.fromTo(
    sweep,
    { x: plan.fromX },
    {
      x: plan.toX,
      duration: plan.travelMs / 1000,
      ease: 'sine.inOut',
      repeat: -1,
      repeatDelay: Math.max(0, (SWEEP_CYCLE_MS - plan.travelMs) / 1000),
    },
  )

  return {
    stop: () => {
      tween.kill()
      sweep.destroy()
    },
  }
}

/**
 * 배경에 흩뿌린 반짝임. 각자 다른 시점에 켜졌다 꺼진다.
 * 텍스처는 공유하고 스프라이트만 개수만큼 만든다.
 */
export function startSparkles(
  layer: Container,
  texture: Texture,
  area: Rect,
  count = SPARKLE_MAX_COUNT,
  random: () => number = Math.random,
): AmbientEffect {
  if (area.width <= 0 || area.height <= 0) return NOOP_EFFECT
  const placements = planSparkles(area, count, random)
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
        alpha: 1,
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
