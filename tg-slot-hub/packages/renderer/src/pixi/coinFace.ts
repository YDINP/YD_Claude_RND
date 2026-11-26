import { CanvasSource, Texture } from 'pixi.js'
import type { TreasureTier } from '@tgslot/slot-engine'
import { RESPIN_FACE_CACHE_MAX } from '../respinConstants.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { createCanvasTexture } from './textures.js'

/**
 * 코인 금액 얼굴. 금화 그림 위에 금액 글자를 얹은 정사각 텍스처 한 장이다.
 *
 * 금액은 서버가 정한다. 여기서는 받은 글자(`label`)를 찍을 뿐이고, 같은 모양(종류·단계·글자)은 한 장을 돌려 쓴다.
 * 릴 심볼 스프라이트와 리스핀 칸 스프라이트가 같은 텍스처를 쓰므로, 릴이 서는 순간 칸 안에서 «글자가 바뀌어 보이는» 일이 없다.
 * 라벨 문자열 키 LRU 캐시(상한 `RESPIN_FACE_CACHE_MAX`)이고, 렌더러가 내려갈 때 전부 해제된다(`TextureRegistry`가 소유).
 */

export interface CoinFaceSpec {
  kind: 'bet' | 'treasure'
  tier?: TreasureTier | undefined
  /** 찍을 글자. 비면 글자 없는 코인이다(배지·도움말 그림). */
  label: string
}

/** 보물 코인 그림이 없을 때 금화 위에 입히는 색. 단계마다 한눈에 구별된다. */
export const TREASURE_TINT: Record<TreasureTier, string> = {
  small: '#2ec4d6',
  medium: '#ffc83d',
  large: '#7b5cff',
}

/** 글자 색. 숫자 코인은 크림색, 보물은 같은 크림에 단계 색 테두리가 아닌 짙은 남색 외곽선을 쓴다. */
const LABEL_FILL = '#fff6d6'
const LABEL_STROKE = '#10285a'
/** 얼굴 한 장의 한 변(px). 390px 화면 DPR 2에서 칸(71px → 142px)보다 크다. */
const FACE_SIZE = 160
/** 글자가 차지할 수 있는 폭(얼굴 폭 대비). 금화 가운데 빈 면 안에 든다. */
const LABEL_MAX_WIDTH = 0.74
/** 글자 크기 상한·하한(얼굴 한 변 대비). */
const LABEL_MAX_FONT = 0.36
const LABEL_MIN_FONT = 0.2
/** 글자의 세로 중심(얼굴 한 변 대비). 금화 그림은 가운데가 비어 있다. */
const LABEL_CENTER_Y = 0.53
const FONT_STACK = '"Jua", "Baloo 2", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif'

type Drawable = CanvasImageSource & { width: number; height: number }

function asDrawable(resource: unknown): Drawable | null {
  if (typeof HTMLImageElement !== 'undefined' && resource instanceof HTMLImageElement) return resource
  if (typeof HTMLCanvasElement !== 'undefined' && resource instanceof HTMLCanvasElement) return resource
  if (typeof ImageBitmap !== 'undefined' && resource instanceof ImageBitmap) return resource
  return null
}

export interface CoinFaceArt {
  /** 숫자 코인 바탕이 되는 금화 그림(`coin` 심볼). */
  coin: Texture
  /** 보물 단계별 그림(`props`). 없으면 금화에 단계 색을 입힌다. */
  treasure: Partial<Record<TreasureTier, Texture>>
}

/** 캐시 키. 종류·단계·글자가 같으면 같은 얼굴이다. */
export function coinFaceKey(spec: CoinFaceSpec): string {
  return `${spec.kind}|${spec.tier ?? '-'}|${spec.label}`
}

export class CoinFaceCache {
  /** 삽입 순서가 곧 최근 사용 순서다(맨 뒤가 가장 최근). */
  private readonly faces = new Map<string, Texture>()
  private created = 0
  private evicted = 0

  constructor(
    private readonly art: CoinFaceArt,
    private readonly registry: TextureRegistry,
    private readonly max: number = RESPIN_FACE_CACHE_MAX,
  ) {}

  /** 얼굴 하나. 없으면 그려서 캐시한다. 쓸 때마다 «최근»으로 올린다. */
  get(spec: CoinFaceSpec): Texture {
    const key = coinFaceKey(spec)
    const cached = this.faces.get(key)
    if (cached !== undefined) {
      this.faces.delete(key)
      this.faces.set(key, cached)
      return cached
    }
    const texture = this.draw(spec)
    this.faces.set(key, texture)
    this.created += 1
    this.evictOverflow()
    return texture
  }

  /** 지금 캐시에 든 장수. */
  get size(): number {
    return this.faces.size
  }

  get stats(): { size: number; created: number; evicted: number; max: number } {
    return { size: this.faces.size, created: this.created, evicted: this.evicted, max: this.max }
  }

  /** 전부 해제한다. 렌더러가 내려갈 때 `TextureRegistry.destroyAll()`이 어차피 지우지만 장부를 비워 둔다. */
  clear(): void {
    for (const texture of this.faces.values()) this.registry.release(texture)
    this.faces.clear()
  }

  private evictOverflow(): void {
    while (this.faces.size > this.max) {
      const oldest = this.faces.keys().next()
      if (oldest.done === true) return
      const texture = this.faces.get(oldest.value)
      this.faces.delete(oldest.value)
      if (texture !== undefined) this.registry.release(texture)
      this.evicted += 1
    }
  }

  private baseFor(spec: CoinFaceSpec): { texture: Texture; tint: string | null } {
    if (spec.kind === 'treasure' && spec.tier !== undefined) {
      const art = this.art.treasure[spec.tier]
      if (art !== undefined) return { texture: art, tint: null }
      return { texture: this.art.coin, tint: TREASURE_TINT[spec.tier] }
    }
    return { texture: this.art.coin, tint: null }
  }

  private draw(spec: CoinFaceSpec): Texture {
    const canvas = document.createElement('canvas')
    canvas.width = FACE_SIZE
    canvas.height = FACE_SIZE
    const ctx = canvas.getContext('2d')
    if (ctx === null) return Texture.EMPTY

    const base = this.baseFor(spec)
    const drawable = asDrawable((base.texture.source as { resource?: unknown }).resource)
    if (drawable === null || drawable.width <= 0 || drawable.height <= 0) {
      paintFallbackCoin(ctx, FACE_SIZE, base.tint ?? '#ffc83d')
    } else {
      // 금화 그림을 정사각 한 장에 맞춰 그린다. 프레임(texture.frame)을 쓰는 아틀라스 조각은 쓰지 않는 약속이다.
      ctx.drawImage(drawable, 0, 0, FACE_SIZE, FACE_SIZE)
      if (base.tint !== null) tintOpaque(ctx, FACE_SIZE, base.tint)
    }
    if (spec.label !== '') paintLabel(ctx, FACE_SIZE, spec.label)

    const texture = new Texture({ source: new CanvasSource({ resource: canvas }) })
    return this.registry.own(texture)
  }
}

/** 이미 그려진 픽셀 위에만 색을 입힌다(투명 배경은 그대로). */
function tintOpaque(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = 0.5
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}

/** 그림이 없을 때의 금화. 테두리·가운데 빈 면만 있고 글자 자리는 비워 둔다. */
function paintFallbackCoin(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const c = size / 2
  const rim = ctx.createRadialGradient(size * 0.36, size * 0.3, size * 0.05, c, c, c)
  rim.addColorStop(0, '#fff3c4')
  rim.addColorStop(0.5, color)
  rim.addColorStop(1, '#8a6316')
  ctx.beginPath()
  ctx.arc(c, c, c - 3, 0, Math.PI * 2)
  ctx.fillStyle = rim
  ctx.fill()
  ctx.lineWidth = size * 0.035
  ctx.strokeStyle = '#7a5410'
  ctx.stroke()
  // 가운데 평평한 면(글자 자리).
  ctx.beginPath()
  ctx.arc(c, c, c * 0.68, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 244, 196, 0.35)'
  ctx.fill()
  ctx.lineWidth = size * 0.02
  ctx.strokeStyle = 'rgba(122, 84, 16, 0.55)'
  ctx.stroke()
}

/** 글자: 굵은 둥근 글꼴 + 짙은 외곽선. 폭이 넘치면 글자 크기를 줄여 한 줄에 넣는다. */
function paintLabel(ctx: CanvasRenderingContext2D, size: number, label: string): void {
  const maxWidth = size * LABEL_MAX_WIDTH
  let font = Math.round(size * LABEL_MAX_FONT)
  const min = Math.round(size * LABEL_MIN_FONT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (; font > min; font -= 2) {
    ctx.font = `900 ${font}px ${FONT_STACK}`
    if (ctx.measureText(label).width <= maxWidth) break
  }
  ctx.font = `900 ${font}px ${FONT_STACK}`
  const y = size * LABEL_CENTER_Y
  ctx.lineWidth = Math.max(3, font * 0.24)
  ctx.strokeStyle = LABEL_STROKE
  ctx.strokeText(label, size / 2, y, maxWidth * 1.06)
  ctx.fillStyle = LABEL_FILL
  ctx.fillText(label, size / 2, y, maxWidth * 1.06)
}

/**
 * 촉수 감기 배지(«×2»). 둥근 알약에 굵은 글자 한 장이고, 한 번 그려 돌려 쓴다.
 * 소유권은 레지스트리에 있어 렌더러가 내려갈 때 함께 해제된다.
 */
export function createBadgeTexture(label: string, registry: TextureRegistry): Texture {
  const width = 128
  const height = 80
  return createCanvasTexture(
    width,
    height,
    (ctx) => {
      ctx.clearRect(0, 0, width, height)
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#9b83ff')
      gradient.addColorStop(1, '#5b3fd0')
      ctx.beginPath()
      ctx.roundRect(6, 6, width - 12, height - 12, 30)
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.lineWidth = 6
      ctx.strokeStyle = '#fff6d6'
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `900 44px ${FONT_STACK}`
      ctx.lineJoin = 'round'
      ctx.lineWidth = 8
      ctx.strokeStyle = '#2a1a78'
      ctx.strokeText(label, width / 2, height / 2 + 2)
      ctx.fillStyle = '#fff6d6'
      ctx.fillText(label, width / 2, height / 2 + 2)
    },
    registry,
  )
}
