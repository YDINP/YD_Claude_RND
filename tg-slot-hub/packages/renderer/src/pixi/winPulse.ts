import { Container, Sprite, Texture } from 'pixi.js'
import { gsap } from 'gsap'
import { PULSE_HOLD_MS, PULSE_SIZE_RATIO, PULSE_TRAIL_COUNT } from '../constants.js'
import type { PulsePath } from '../pulse.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { createCanvasTexture } from './textures.js'

/** 빛 텍스처 한 변(px). */
const PULSE_TEXTURE_SIZE = 96

/** 가운데가 하얗고 밖으로 갈수록 금빛으로 사라지는 둥근 빛. */
export function createPulseTexture(registry: TextureRegistry): Texture {
  return createCanvasTexture(
    PULSE_TEXTURE_SIZE,
    PULSE_TEXTURE_SIZE,
    (ctx, size) => {
      const center = size / 2
      const glow = ctx.createRadialGradient(center, center, 0, center, center, center)
      glow.addColorStop(0, 'rgba(255,255,255,1)')
      glow.addColorStop(0.3, 'rgba(255,240,190,0.75)')
      glow.addColorStop(0.6, 'rgba(216,169,74,0.28)')
      glow.addColorStop(1, 'rgba(216,169,74,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(center, center, center, 0, Math.PI * 2)
      ctx.fill()
    },
    registry,
  )
}

export interface WinPulseHandle {
  stop(): void
}

export interface WinPulseOptions {
  /** 빛이 심볼에 닿는 순간 불린다. 그 심볼의 fx를 한 번 터뜨리라는 신호다. */
  onArrive?: (index: number) => void
  /** 한 바퀴가 끝났을 때. `loop`가 켜져 있으면 다시 시작한다. */
  onComplete?: () => void
  symbolSize: number
  loop?: boolean
  /** 잔상 개수. 등급이 높을수록 길게 끈다. */
  trailCount?: number
}

/**
 * 당첨 심볼을 왼쪽부터 훑고 지나가는 빛.
 *
 * 페이라인을 선으로 긋지 않는다. 선은 심볼 위를 덮어 그림을 가리는데,
 * 빛 한 점은 같은 순서를 말하면서도 지나간 자리를 비워 준다.
 * 뒤에 짧은 잔상을 남겨 이동 방향이 읽히게 한다.
 */
export function playWinPulse(
  layer: Container,
  texture: Texture,
  path: PulsePath,
  options: WinPulseOptions,
): WinPulseHandle {
  const first = path.waypoints[0]
  if (first === undefined) return { stop: () => undefined }

  const size = options.symbolSize * PULSE_SIZE_RATIO
  const trailCount = Math.max(0, Math.floor(options.trailCount ?? PULSE_TRAIL_COUNT))
  const sprites: Sprite[] = []

  const makeSprite = (alpha: number): Sprite => {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.width = size
    sprite.height = size
    sprite.blendMode = 'add'
    sprite.alpha = alpha
    sprite.x = first.point.x
    sprite.y = first.point.y
    layer.addChild(sprite)
    sprites.push(sprite)
    return sprite
  }

  // 잔상은 본체보다 흐리고 작게. 뒤로 갈수록 더 옅어진다.
  const trail: Sprite[] = []
  for (let i = 0; i < trailCount; i += 1) {
    const ghost = makeSprite(0)
    const shrink = 1 - (i + 1) / (trailCount + 2)
    ghost.width = size * shrink
    ghost.height = size * shrink
    trail.push(ghost)
  }
  const head = makeSprite(1)

  const state = { index: 0 }
  let arrived = -1
  const timeline = gsap.timeline({
    repeat: options.loop === true ? -1 : 0,
    // 마지막 심볼에 닿은 채로 잠시 머문 뒤에 다시 훑는다. 곧바로 되감으면 읽을 틈이 없다.
    repeatDelay: PULSE_HOLD_MS / 1000,
    onRepeat: () => {
      arrived = -1
    },
    ...(options.onComplete === undefined ? {} : { onComplete: options.onComplete }),
  })

  // 경로 인덱스를 0 -> n-1로 흘리면서 좌표를 보간한다.
  // 지점에 닿을 때마다 그 심볼에 신호를 보낸다.
  timeline.to(state, {
    index: path.waypoints.length - 1,
    duration: Math.max(0.001, path.travelMs / 1000),
    ease: 'none',
    onUpdate: () => {
      const exact = state.index
      const lower = Math.floor(exact)
      const upper = Math.min(path.waypoints.length - 1, lower + 1)
      const from = path.waypoints[lower]
      const to = path.waypoints[upper]
      if (from === undefined || to === undefined) return

      const ratio = exact - lower
      head.x = from.point.x + (to.point.x - from.point.x) * ratio
      head.y = from.point.y + (to.point.y - from.point.y) * ratio

      // 반올림하면 절반만 지나도 도착으로 쳐서 한 칸 이르게 터진다.
      // 실제로 그 자리에 닿았을 때만 알린다. 부동소수 오차만 살짝 봐준다.
      const reached = Math.floor(exact + 1e-6)
      if (reached > arrived) {
        arrived = reached
        options.onArrive?.(reached)
      }
    },
  })

  // 잔상은 매 프레임 본체를 뒤따른다.
  // 트윈으로 만들면 본체와 주기를 맞춰야 하는데, ticker에 걸면 그 문제가 아예 없어진다.
  const follow = (): void => {
    let previous = head
    for (const ghost of trail) {
      ghost.x += (previous.x - ghost.x) * 0.45
      ghost.y += (previous.y - ghost.y) * 0.45
      ghost.alpha = previous.alpha * 0.62
      previous = ghost
    }
  }
  gsap.ticker.add(follow)

  return {
    stop: () => {
      timeline.kill()
      gsap.ticker.remove(follow)
      for (const sprite of sprites) sprite.destroy()
    },
  }
}
