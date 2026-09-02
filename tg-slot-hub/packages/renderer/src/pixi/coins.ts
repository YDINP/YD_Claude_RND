import { Container, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import {
  COIN_COUNT_BY_TIER,
  COIN_FALL_MS,
  CONFETTI_COLORS,
  CONFETTI_COUNT,
  CONFETTI_FALL_MS,
  MAX_COIN_PARTICLES,
} from '../constants.js'
import type { WinTier } from '../wins.js'
import type { Layout } from '../layout.js'

const COIN_MIN_SCALE = 0.28
const COIN_MAX_SCALE = 0.62
const COIN_SPAWN_SPREAD_MS = 700
const COIN_SPIN_TURNS = 2

/** 코인 1개의 무작위 파라미터. 시드 없이 Math.random을 써도 되는 유일한 곳(연출 전용). */
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** 등급에 맞는 코인 개수. 등급이 오를수록 많이 쏟아진다. */
export function coinCountForTier(tier: WinTier): number {
  return COIN_COUNT_BY_TIER[tier]
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

/**
 * 최고 등급에서만 뿌리는 색종이. 코인과 달리 회전하며 팔랑팔랑 떨어진다.
 * 텍스처 없이 사각형 스프라이트를 흰 텍스처에 tint만 입혀 쓴다.
 * @returns 중단 함수
 */
export function burstConfetti(layer: Container, texture: Texture, layout: Layout): () => void {
  const tweens: gsap.core.Tween[] = []
  const sprites: Sprite[] = []

  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const piece = new Sprite(texture)
    piece.anchor.set(0.5)
    piece.tint = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#f4d98a'
    piece.width = layout.symbolSize * randomBetween(0.06, 0.13)
    piece.height = layout.symbolSize * randomBetween(0.14, 0.24)
    piece.x = randomBetween(layout.frame.x, layout.frame.x + layout.frame.width)
    piece.y = layout.frame.y - layout.symbolSize * randomBetween(0.2, 1.6)
    piece.rotation = randomBetween(0, Math.PI)
    layer.addChild(piece)
    sprites.push(piece)

    const drift = randomBetween(-1, 1) * layout.symbolSize * 0.8
    tweens.push(
      gsap.to(piece, {
        y: layout.frame.y + layout.frame.height + layout.symbolSize,
        x: piece.x + drift,
        rotation: piece.rotation + randomBetween(-6, 6),
        duration: CONFETTI_FALL_MS / 1000,
        delay: randomBetween(0, 0.6),
        ease: 'none',
      }),
    )
    // 팔랑거림. 가로 폭을 줄였다 늘려 종이가 뒤집히는 것처럼 보이게 한다.
    tweens.push(
      gsap.to(piece.scale, {
        x: piece.scale.x * 0.2,
        duration: randomBetween(0.25, 0.5),
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      }),
    )
  }

  let stopped = false
  const stop = (): void => {
    if (stopped) return
    stopped = true
    for (const tween of tweens) tween.kill()
    for (const piece of sprites) piece.destroy()
  }

  gsap.delayedCall((CONFETTI_FALL_MS + 600) / 1000, stop)
  return stop
}
