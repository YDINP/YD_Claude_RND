import { Container, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { COIN_FALL_MS, MAX_COIN_PARTICLES } from '../constants.js'
import type { Layout } from '../layout.js'

const COIN_MIN_SCALE = 0.28
const COIN_MAX_SCALE = 0.62
const COIN_SPAWN_SPREAD_MS = 700
const COIN_SPIN_TURNS = 2

/** 코인 1개의 무작위 파라미터. 시드 없이 Math.random을 써도 되는 유일한 곳(연출 전용). */
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * 빅윈 코인 샤워. 스프라이트 개수를 상한으로 묶고, 끝나면 스스로 정리한다.
 * @returns 중단 함수
 */
export function burstCoins(layer: Container, texture: Texture, layout: Layout, count = MAX_COIN_PARTICLES): () => void {
  const total = Math.max(0, Math.min(MAX_COIN_PARTICLES, Math.floor(count)))
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []

  for (let i = 0; i < total; i += 1) {
    const coin = new Sprite(texture)
    coin.anchor.set(0.5)
    const scale = randomBetween(COIN_MIN_SCALE, COIN_MAX_SCALE) * (layout.symbolSize / 64)
    coin.scale.set(scale)
    coin.x = randomBetween(layout.frame.x, layout.frame.x + layout.frame.width)
    coin.y = layout.frame.y - layout.symbolSize * randomBetween(0.2, 1.4)
    layer.addChild(coin)
    sprites.push(coin)

    tweens.push(
      gsap.to(coin, {
        y: layout.frame.y + layout.frame.height + layout.symbolSize,
        rotation: randomBetween(-1, 1) * Math.PI * COIN_SPIN_TURNS,
        duration: COIN_FALL_MS / 1000,
        delay: randomBetween(0, COIN_SPAWN_SPREAD_MS / 1000),
        ease: 'sine.in',
      }),
    )
    tweens.push(
      gsap.to(coin, {
        alpha: 0,
        duration: (COIN_FALL_MS / 1000) * 0.3,
        delay: (COIN_FALL_MS / 1000) * 0.75,
      }),
    )
  }

  let stopped = false
  const stop = (): void => {
    if (stopped) return
    stopped = true
    for (const tween of tweens) tween.kill()
    for (const coin of sprites) coin.destroy()
    layer.removeChildren()
  }

  gsap.delayedCall((COIN_FALL_MS + COIN_SPAWN_SPREAD_MS) / 1000, stop)
  return stop
}
