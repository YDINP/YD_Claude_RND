import type { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { SymbolId } from '@tgslot/slot-engine'
import {
  CASCADE_DEBRIS_PER_CELL,
  CASCADE_HIGHLIGHT_SCALE,
  MUTATION_PARTICLE_DISTANCE_RATIO,
  SYMBOL_FILL_RATIO,
} from '../constants.js'
import type { CascadePlanStep, CascadeStepDurations } from '../cascade.js'
import { symbolCenter, type Layout } from '../layout.js'
import { drawClusterOutlines } from './clusterOutline.js'
import { LayerSpritePool } from './spritePool.js'

/** 연쇄 심볼 스프라이트 풀. 30칸 판 + 리필 30개가 한 단계 최악이다. */
export class CascadeSpritePool extends LayerSpritePool {}

export interface CascadeFxContext {
  /** 릴 마스크 안의 층. 창 위에서 떨어지는 리필이 여기서 잘린다. */
  symbols: CascadeSpritePool
  /** 파편 풀. 마스크 밖 층이라 창 가장자리에서 잘리지 않는다. */
  debris: LayerSpritePool
  outline: Graphics
  textures: ReadonlyMap<SymbolId, Texture>
  spark: Texture
  layout: Layout
  color: string
  reducedMotion: boolean
}

export interface CascadeFxHandle {
  /** 남은 재생을 `ms` 안에 끝내도록 빨리 돌린다. 이미 그보다 짧으면 그대로 둔다. 두 번 불러도 같다. */
  compress(ms: number): void
  /** 타임라인을 끊고 꺼낸 스프라이트를 전부 돌려준다. 완료 콜백은 부르지 않는다. */
  release(): void
}

/**
 * 연쇄 1단계: 강조 → 팝 → 낙하. 모든 움직임은 타임라인 하나에 있어 STOP 압축은 배속 하나로 끝난다.
 * 텍스처는 단계 시작에 한 번 정하고 바꾸지 않는다. 낙하는 언제나 위치 트윈이다.
 * 끝나면 `onComplete`가 불리고, 호출 측이 같은 tick에 판을 확정하고 `release`한다.
 */
export function playCascadeFx(
  step: CascadePlanStep,
  durations: CascadeStepDurations,
  context: CascadeFxContext,
  onComplete: () => void,
): CascadeFxHandle {
  const { layout } = context
  const size = layout.symbolSize * SYMBOL_FILL_RATIO
  const symbols: Sprite[] = []
  const debris: Sprite[] = []
  const byCell = new Map<string, Sprite>()

  const place = (symbol: SymbolId, reel: number, row: number): Sprite | null => {
    const texture = context.textures.get(symbol)
    if (texture === undefined) return null
    const sprite = context.symbols.acquire(texture)
    sprite.setSize(size)
    const center = symbolCenter(layout, reel, row)
    sprite.position.set(center.x, center.y)
    symbols.push(sprite)
    return sprite
  }

  step.gridBefore.forEach((line, row) => {
    line.forEach((symbol, reel) => {
      const sprite = place(symbol, reel, row)
      if (sprite !== null) byCell.set(`${reel}:${row}`, sprite)
    })
  })

  const s = (ms: number): number => ms / 1000
  const { highlightMs, popMs, dropMs, staggerMs, totalMs } = durations
  const reels = step.gridBefore[0]?.length ?? 0
  const moveMs = Math.max(1, dropMs - staggerMs * Math.max(0, reels - 1))
  const timeline = gsap.timeline({ onComplete })
  // 길이를 계획 그대로 못 박는다. 마지막 트윈이 짧게 끝나도 단계는 계획만큼 간다.
  timeline.to({}, { duration: s(totalMs) }, 0)

  drawClusterOutlines(context.outline, step.groups, layout, context.color)
  context.outline.alpha = 0
  timeline.to(context.outline, { alpha: 1, duration: s(highlightMs * 0.4), ease: 'power1.out' }, 0)
  timeline.to(context.outline, { alpha: 0, duration: s(Math.max(popMs, 1)), ease: 'power1.in' }, s(highlightMs))

  const removed = step.removed
    .map(([reel, row]) => ({ reel, row, sprite: byCell.get(`${reel}:${row}`) }))
    .filter((entry): entry is { reel: number; row: number; sprite: Sprite } => entry.sprite !== undefined)

  for (const { sprite } of removed) {
    const base = sprite.scale.x
    if (highlightMs > 0) {
      timeline.to(
        sprite.scale,
        { x: base * CASCADE_HIGHLIGHT_SCALE, y: base * CASCADE_HIGHLIGHT_SCALE, duration: s(highlightMs / 2), ease: 'sine.inOut', yoyo: true, repeat: 1 },
        0,
      )
    }
    if (popMs > 0) {
      timeline.to(sprite.scale, { x: 0, y: 0, duration: s(popMs), ease: 'back.in(2)' }, s(highlightMs))
      timeline.to(sprite, { alpha: 0, duration: s(popMs), ease: 'power1.in' }, s(highlightMs))
    } else {
      timeline.set(sprite, { visible: false }, s(highlightMs))
    }
  }

  if (!context.reducedMotion && popMs > 0) {
    const distance = layout.symbolSize * MUTATION_PARTICLE_DISTANCE_RATIO
    const lifeMs = popMs + dropMs * 0.5
    for (const { reel, row } of removed) {
      const center = symbolCenter(layout, reel, row)
      for (let i = 0; i < CASCADE_DEBRIS_PER_CELL; i += 1) {
        // 칸마다 각도를 조금 돌려 이웃 칸 파편이 같은 방향으로 겹치지 않게 한다.
        const angle = (Math.PI * 2 * i) / CASCADE_DEBRIS_PER_CELL + (reel * 7 + row * 3) * 0.21
        const spark = context.debris.acquire(context.spark)
        spark.tint = context.color
        spark.position.set(center.x, center.y)
        spark.setSize(layout.symbolSize * (0.14 + (i % 3) * 0.05))
        spark.visible = false
        debris.push(spark)
        timeline.set(spark, { visible: true }, s(highlightMs))
        timeline.to(
          spark,
          {
            x: center.x + Math.cos(angle) * distance,
            y: center.y + Math.sin(angle) * distance + layout.symbolSize * 0.25,
            alpha: 0,
            rotation: angle * 2,
            duration: s(lifeMs),
            ease: 'power2.out',
          },
          s(highlightMs),
        )
      }
    }
  }

  const dropAt = highlightMs + popMs
  for (const move of step.moves) {
    const sprite = move.refill ? place(move.symbol, move.reel, move.fromRow) : byCell.get(`${move.reel}:${move.fromRow}`)
    if (sprite === null || sprite === undefined) continue
    const to = symbolCenter(layout, move.reel, move.toRow)
    timeline.to(sprite, { y: to.y, duration: s(moveMs), ease: 'power2.in' }, s(dropAt + move.reel * staggerMs))
  }

  let released = false
  return {
    compress(ms: number): void {
      if (released) return
      const remaining = (timeline.duration() - timeline.time()) * 1000
      const target = Math.max(1, ms)
      const scale = remaining / target
      if (scale > timeline.timeScale()) timeline.timeScale(scale)
    },
    release(): void {
      if (released) return
      released = true
      timeline.kill()
      context.outline.clear()
      context.outline.alpha = 1
      for (const sprite of symbols) context.symbols.release(sprite)
      for (const sprite of debris) context.debris.release(sprite)
    },
  }
}
