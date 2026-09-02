import { Container, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import {
  MUTATION_BURST_PARTICLES,
  MUTATION_COLUMN_ALPHA,
  MUTATION_COLUMN_WIDTH_SCALE,
  MUTATION_DROP_HEIGHT_SYMBOLS,
  MUTATION_DUST_PARTICLES,
  MUTATION_PARTICLE_DISTANCE_RATIO,
} from '../constants.js'
import { mutationCellDelayMs, type MutationStep } from '../mutations.js'
import type { Point, Rect } from '../layout.js'
import type { FxTextures } from './symbolFx.js'

/**
 * 변형 파티클 스프라이트 풀.
 *
 * 리빌 한 번에 칸마다 파티클이 십여 개씩 난다. 매번 만들고 버리면 스핀마다 수백 개가
 * GC로 흘러가 저사양 기기에서 끊긴다. 다 쓴 스프라이트는 감춰 두었다가 다시 꺼내 쓴다.
 *
 * 스프라이트는 계속 `layer`의 자식으로 남는다. 층 자체는 앱이 내려갈 때 함께 해제되고,
 * 텍스처는 `TextureRegistry`가 따로 소유하므로 여기서는 아무것도 파괴하지 않는다.
 */
export class MutationSpritePool {
  private readonly free: Sprite[] = []

  constructor(private readonly layer: Container) {}

  /** 쓸 수 있는 스프라이트 하나. 지난번 상태는 전부 지우고 준다. */
  acquire(texture: Texture): Sprite {
    const sprite = this.free.pop() ?? new Sprite()
    if (sprite.parent === null) this.layer.addChild(sprite)
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
    return sprite
  }

  /** 다 쓴 스프라이트를 감춰 두고 다음 차례를 기다린다. */
  release(sprite: Sprite): void {
    sprite.visible = false
    if (!this.free.includes(sprite)) this.free.push(sprite)
  }

  /** 지금 감춰 둔 스프라이트 수. 풀이 늘기만 하는지 보려고 열어 둔다. */
  get size(): number {
    return this.free.length
  }
}

/** 변형 연출 하나를 되돌리는 손잡이. */
export interface MutationFxHandle {
  stop(): void
}

/** 연출이 붙는 칸 하나. `symbolFx`의 대상과 같은 채널만 건드린다. */
export interface MutationCellTarget {
  /** 셀 컨테이너. 뒤집기는 이쪽 scale을 쓴다. */
  view: Container
  /** 심볼 스프라이트. 크로스페이드와 낙하는 이쪽 alpha/y를 쓴다. */
  sprite: Sprite
  /** 심볼 중심의 콘텐츠 좌표. 파티클을 여기에 뿌린다. */
  center: Point
}

export interface MutationFxContext {
  /** 파티클과 기둥이 사는 층. 릴 마스크 밖이라 잘리지 않는다. */
  layer: Container
  /** 스프라이트 풀. 연출이 끝나면 쓰던 것을 여기에 돌려준다. */
  pool: MutationSpritePool
  textures: FxTextures
  /** 브라스 색. 파티클과 기둥에 tint로 입힌다. */
  color: string
  symbolSize: number
  /** 확장 와일드가 덮는 릴의 사각형(콘텐츠 좌표). 다른 종류에서는 빈 배열이다. */
  columns: readonly Rect[]
  reducedMotion: boolean
}

export interface MutationFxCallbacks {
  /** 텍스처를 최종 심볼로 갈아 끼운다. 정확히 한 번만 불린다. */
  onCommit: () => void
  /** 연출이 스스로 끝났다. 중간에 `stop()`으로 끊긴 경우에는 불리지 않는다. */
  onComplete: () => void
}

/** 파티클 한 무리. 손잡이가 정리할 수 있도록 스프라이트를 모아 둔다. */
interface Particles {
  tweens: gsap.core.Tween[]
  sprites: Sprite[]
}

/**
 * 중심에서 사방으로 흩어지는 알갱이.
 * 각도를 균등하게 나눠 뿌리므로 난수 없이도 매번 같은 그림이 나온다.
 */
function spawnBurst(
  context: MutationFxContext,
  center: Point,
  options: { count: number; durationMs: number; delayMs: number; spreadY: number },
): Particles {
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []
  const distance = context.symbolSize * MUTATION_PARTICLE_DISTANCE_RATIO

  for (let i = 0; i < options.count; i += 1) {
    const angle = (Math.PI * 2 * i) / options.count
    const spark = context.pool.acquire(context.textures.spark)
    spark.tint = context.color
    spark.position.set(center.x, center.y)
    spark.setSize(context.symbolSize * 0.22)
    sprites.push(spark)

    tweens.push(
      gsap.to(spark, {
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance * options.spreadY,
        alpha: 0,
        duration: options.durationMs / 1000,
        delay: options.delayMs / 1000,
        ease: 'power2.out',
      }),
    )
  }
  return { tweens, sprites }
}

/** 착지 순간 좌우로 퍼지는 먼지. 낙하가 바닥에 닿았다는 신호다. */
function spawnDust(
  context: MutationFxContext,
  center: Point,
  options: { durationMs: number; delayMs: number },
): Particles {
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []
  const half = MUTATION_DUST_PARTICLES / 2
  const bottom = center.y + context.symbolSize * 0.42

  for (let i = 0; i < MUTATION_DUST_PARTICLES; i += 1) {
    const side = i < half ? -1 : 1
    const step = (i % half) / Math.max(1, half - 1)
    const dust = context.pool.acquire(context.textures.spark)
    dust.tint = context.color
    dust.position.set(center.x, bottom)
    dust.setSize(context.symbolSize * 0.18)
    dust.alpha = 0.8
    sprites.push(dust)

    tweens.push(
      gsap.to(dust, {
        x: center.x + side * context.symbolSize * (0.25 + step * 0.35),
        y: bottom - context.symbolSize * 0.12 * (1 - step),
        alpha: 0,
        duration: options.durationMs / 1000,
        delay: options.delayMs / 1000,
        ease: 'power2.out',
      }),
    )
  }
  return { tweens, sprites }
}

/**
 * 변형 한 단계를 화면에 올린다. 종류마다 다른 그림이지만 계약은 하나다:
 * `onCommit`이 정확히 한 번 불리고, 그 뒤로 화면의 심볼은 최종 그리드와 같다.
 *
 * 모션 축소에서는 아무것도 움직이지 않고 곧장 갈아 끼운다. 반복 애니메이션도 모션이다.
 */
export function playMutationFx(
  step: MutationStep,
  targets: readonly MutationCellTarget[],
  context: MutationFxContext,
  callbacks: MutationFxCallbacks,
): MutationFxHandle {
  if (context.reducedMotion || targets.length === 0) {
    callbacks.onCommit()
    return { stop: () => undefined }
  }

  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []
  const collect = (particles: Particles): void => {
    tweens.push(...particles.tweens)
    sprites.push(...particles.sprites)
  }

  const { durationMs, commitMs } = step
  const tail = Math.max(1, durationMs - commitMs)
  const timeline = gsap.timeline({ onComplete: callbacks.onComplete })
  // 텍스처 교체는 타임라인 위의 한 점이다. 종류가 무엇이든 여기 한 번만 걸린다.
  // 0ms면 타임라인에 걸지 않고 지금 바꾼다. 첫 프레임에 옛 심볼이 스치는 것을 막는다.
  if (commitMs <= 0) callbacks.onCommit()
  else timeline.call(callbacks.onCommit, undefined, commitMs / 1000)

  if (step.type === 'mystery' || step.type === 'upgrade') {
    targets.forEach((target) => {
      if (step.type === 'mystery') {
        // 카드 뒤집기. 가로로 납작해졌다가 되돌아오는 사이에 얼굴이 바뀐다.
        timeline.to(target.view.scale, { x: 0, duration: commitMs / 1000, ease: 'power2.in' }, 0)
        timeline.to(target.view.scale, { x: 1, duration: tail / 1000, ease: 'back.out(1.6)' }, commitMs / 1000)
      } else {
        // 승급은 얼굴이 녹아 다른 얼굴로 바뀌는 크로스페이드다.
        timeline.to(target.sprite, { alpha: 0, duration: commitMs / 1000, ease: 'sine.in' }, 0)
        timeline.to(target.sprite, { alpha: 1, duration: tail / 1000, ease: 'sine.out' }, commitMs / 1000)
      }
      collect(
        spawnBurst(context, target.center, {
          count: MUTATION_BURST_PARTICLES,
          durationMs: tail,
          delayMs: commitMs,
          spreadY: 1,
        }),
      )
    })
    return makeHandle(context.pool, timeline, tweens, sprites, targets)
  }

  if (step.type === 'expandWild') {
    for (const column of context.columns) {
      // 브라스 기둥이 릴 한가운데에서 위아래로 자란다.
      const bar = context.pool.acquire(context.textures.glow)
      bar.tint = context.color
      bar.blendMode = 'add'
      bar.position.set(column.x + column.width / 2, column.y + column.height / 2)
      bar.width = column.width * MUTATION_COLUMN_WIDTH_SCALE
      bar.height = column.height
      // height는 텍스처 크기 대비 배율로 저장된다. 1이 아니므로 목표 배율을 먼저 붙잡아 둔다.
      const fullScaleY = bar.scale.y
      bar.scale.y = fullScaleY * 0.02
      bar.alpha = 0
      sprites.push(bar)

      timeline.to(bar, { alpha: MUTATION_COLUMN_ALPHA, duration: commitMs / 1000, ease: 'sine.out' }, 0)
      timeline.to(bar.scale, { y: fullScaleY, duration: commitMs / 1000, ease: 'power2.out' }, 0)
      timeline.to(bar, { alpha: 0, duration: tail / 1000, ease: 'sine.in' }, commitMs / 1000)

      // 기둥을 타고 내려가는 빛줄기. 확장이 "쓸고 갔다"로 읽히게 한다.
      const sweep = context.pool.acquire(context.textures.shine)
      sweep.tint = context.color
      sweep.blendMode = 'add'
      sweep.width = column.width * MUTATION_COLUMN_WIDTH_SCALE
      sweep.height = context.symbolSize * 0.5
      sweep.position.set(column.x + column.width / 2, column.y)
      sweep.alpha = 0.9
      sprites.push(sweep)

      timeline.to(
        sweep,
        { y: column.y + column.height, alpha: 0, duration: durationMs / 1000, ease: 'sine.inOut' },
        0,
      )
    }

    // 덮인 칸은 기둥이 지나간 뒤 한 번 튀어오른다.
    targets.forEach((target) => {
      timeline.fromTo(
        target.view.scale,
        { x: 0.82, y: 0.82 },
        // immediateRender를 끄지 않으면 gsap이 시작 값을 첫 프레임에 바로 찍는다.
        // 기둥이 자라기도 전에 칸이 먼저 쪼그라들어 순서가 거꾸로 읽힌다.
        { x: 1, y: 1, duration: tail / 1000, ease: 'back.out(2)', immediateRender: false },
        commitMs / 1000,
      )
    })
    return makeHandle(context.pool, timeline, tweens, sprites, targets)
  }

  // randomWild: 위에서 떨어져 튕긴 뒤 먼지를 남긴다. 떨어지는 것 자체가 이미 와일드다.
  const dropHeight = context.symbolSize * MUTATION_DROP_HEIGHT_SYMBOLS
  targets.forEach((target, index) => {
    const delayMs = mutationCellDelayMs(step.type, index, durationMs)
    const fallMs = Math.max(1, durationMs - delayMs)
    timeline.fromTo(
      target.sprite,
      { y: -dropHeight, alpha: 0.15 },
      { y: 0, alpha: 1, duration: fallMs / 1000, ease: 'bounce.out', immediateRender: true },
      delayMs / 1000,
    )
    collect(spawnDust(context, target.center, { durationMs: fallMs * 0.5, delayMs: delayMs + fallMs * 0.45 }))
  })

  return makeHandle(context.pool, timeline, tweens, sprites, targets)
}

/**
 * 손잡이를 만든다. `stop()`은 쓰던 스프라이트를 풀에 돌려주고 심볼을 원래 상태로 되돌린다.
 * 되돌리지 않으면 뒤집다 만 심볼이 납작한 채로 화면에 남는다.
 */
function makeHandle(
  pool: MutationSpritePool,
  timeline: gsap.core.Timeline,
  tweens: readonly gsap.core.Tween[],
  sprites: readonly Sprite[],
  targets: readonly MutationCellTarget[],
): MutationFxHandle {
  return {
    stop: () => {
      timeline.kill()
      for (const tween of tweens) tween.kill()
      // 파괴하지 않고 풀에 돌려준다. 다음 변형이 그대로 다시 꺼내 쓴다.
      for (const sprite of sprites) pool.release(sprite)
      for (const target of targets) {
        target.view.scale.set(1)
        target.sprite.alpha = 1
        target.sprite.y = 0
      }
    },
  }
}
