import { Assets, CanvasSource, Texture } from 'pixi.js'
import type { SymbolId } from '@tgslot/slot-engine'
import { keyOutGreen } from '../chromaKey.js'
import { FALLBACK_TEXTURE_SIZE } from '../constants.js'
import { resolveSymbolSource } from '../theme.js'
import type { TextureRegistry } from '../textureRegistry.js'
import type { Theme } from '../types.js'

/** 폴백 텍스처를 그릴 때 쓰는 비율. 캔버스 한 변 기준. */
const FALLBACK_PADDING_RATIO = 0.08
const FALLBACK_RADIUS_RATIO = 0.14
const FALLBACK_FONT_RATIO = 0.2
/** 금화 파티클 텍스처 한 변(px). */
const COIN_TEXTURE_SIZE = 64

export type CanvasPainter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

/**
 * 캔버스에 직접 그려 만든 텍스처. 전역 에셋 캐시가 소유하지 않으므로
 * `registry`에 등록해 렌더러 해제 때 함께 파괴한다.
 * 2D 컨텍스트를 못 얻는 환경에서는 Pixi 공유 싱글턴을 돌려주고 등록하지 않는다.
 */
export function createCanvasTexture(
  width: number,
  height: number,
  paint: CanvasPainter,
  registry?: TextureRegistry,
): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) return Texture.EMPTY

  paint(ctx, width, height)

  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) })
  return registry === undefined ? texture : registry.own(texture)
}

/**
 * 이미지가 없을 때 심볼 id를 글자로 찍은 대체 텍스처.
 * 렌더러가 에셋 하나 때문에 멈추지 않게 하는 안전망이다.
 */
export function createFallbackTexture(label: string, theme: Theme, registry?: TextureRegistry): Texture {
  const size = FALLBACK_TEXTURE_SIZE
  return createCanvasTexture(
    size,
    size,
    (ctx) => {
      const pad = size * FALLBACK_PADDING_RATIO
      const radius = size * FALLBACK_RADIUS_RATIO
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = theme.palette.reelBg
      ctx.strokeStyle = theme.palette.frame
      ctx.lineWidth = Math.max(2, size * 0.02)
      ctx.beginPath()
      ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = theme.palette.text
      ctx.font = `600 ${Math.round(size * FALLBACK_FONT_RATIO)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label.slice(0, 8), size / 2, size / 2)
    },
    registry,
  )
}

/** 금화 파티클용 원형 텍스처. 이미지 에셋 없이 그린다. 소유권은 렌더러에 있다. */
export function createCoinTexture(theme: Theme, registry?: TextureRegistry): Texture {
  const size = COIN_TEXTURE_SIZE
  return createCanvasTexture(
    size,
    size,
    (ctx) => {
      const gradient = ctx.createRadialGradient(size * 0.36, size * 0.32, size * 0.06, size / 2, size / 2, size / 2)
      gradient.addColorStop(0, '#fff3c4')
      gradient.addColorStop(0.55, theme.palette.frame)
      gradient.addColorStop(1, '#8a6316')
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
    },
    registry,
  )
}

/** 흰 사각형 1장. tint로 색을 입혀 색종이·섬광·틴트로 쓴다. */
export function createSolidTexture(registry?: TextureRegistry): Texture {
  return createCanvasTexture(
    8,
    8,
    (ctx, width, height) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    },
    registry,
  )
}

/**
 * 테마의 심볼 이미지를 모두 불러온다. 개별 실패는 폴백 텍스처로 대체하고 전체는 절대 실패하지 않는다.
 * `Assets.load`로 받은 것은 전역 캐시 소유라 `registry`에 넣지 않는다. 폴백만 등록한다.
 * @param symbolIds math.json이 선언한 심볼 id 전부
 */
export async function loadSymbolTextures(
  theme: Theme,
  symbolIds: readonly SymbolId[],
  registry?: TextureRegistry,
): Promise<Map<SymbolId, Texture>> {
  const entries = await Promise.all(
    symbolIds.map(async (id): Promise<[SymbolId, Texture]> => {
      const source = resolveSymbolSource(theme, id)
      if (source.kind === 'fallback') return [id, createFallbackTexture(source.label, theme, registry)]
      try {
        const texture = await Assets.load<Texture>(source.url)
        return [id, texture]
      } catch {
        return [id, createFallbackTexture(id, theme, registry)]
      }
    }),
  )
  return new Map(entries)
}

/**
 * 선택적 이미지 1장. URL이 없거나 로딩이 실패하면 null이다.
 * 배경과 프레임처럼 "있으면 좋고 없으면 그만"인 에셋에 쓴다.
 */
export async function loadImageTexture(url: string | undefined): Promise<Texture | null> {
  if (url === undefined || url.trim() === '') return null
  try {
    return await Assets.load<Texture>(url)
  } catch {
    return null
  }
}

/** 배경 이미지. 없거나 실패하면 null이고 호출 측이 팔레트 색으로 대신한다. */
export async function loadBackgroundTexture(theme: Theme): Promise<Texture | null> {
  return loadImageTexture(theme.background)
}

/** 캔버스에 그릴 수 있는 이미지 원본. Pixi가 무엇을 물고 있든 이 셋 중 하나다. */
type Drawable = CanvasImageSource & { width: number; height: number }

function asDrawable(resource: unknown): Drawable | null {
  if (typeof HTMLImageElement !== 'undefined' && resource instanceof HTMLImageElement) return resource
  if (typeof HTMLCanvasElement !== 'undefined' && resource instanceof HTMLCanvasElement) return resource
  if (typeof ImageBitmap !== 'undefined' && resource instanceof ImageBitmap) return resource
  return null
}

/**
 * 프레임 텍스처에서 잔여 크로마키 초록을 지운 새 텍스처.
 * 지울 초록이 없거나 픽셀을 읽을 수 없으면 null이고, 호출 측이 원본을 그대로 쓴다.
 * (크로스오리진 이미지는 캔버스를 오염시켜 `getImageData`가 던진다.)
 */
export function keyFrameTexture(texture: Texture, registry: TextureRegistry): Texture | null {
  const drawable = asDrawable((texture.source as { resource?: unknown }).resource)
  if (drawable === null) return null

  const width = Math.round(drawable.width)
  const height = Math.round(drawable.height)
  if (width <= 0 || height <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return null

  try {
    ctx.drawImage(drawable, 0, 0, width, height)
    const image = ctx.getImageData(0, 0, width, height)
    // 지울 초록이 없으면 텍스처를 새로 만들지 않는다. GPU 메모리를 한 장 아낀다.
    if (keyOutGreen(image.data) === 0) return null
    ctx.putImageData(image, 0, 0)
    return registry.own(new Texture({ source: new CanvasSource({ resource: canvas }) }))
  } catch {
    return null
  }
}

/**
 * 베젤 아트. 아트 파이프라인이 놓친 초록 테두리가 있으면 여기서 한 번 더 지운다.
 * 키잉에 실패해도 원본 텍스처를 그대로 쓰므로 프레임이 사라지는 일은 없다.
 */
export async function loadFrameTexture(
  url: string | undefined,
  registry: TextureRegistry,
): Promise<Texture | null> {
  const loaded = await loadImageTexture(url)
  if (loaded === null) return null
  return keyFrameTexture(loaded, registry) ?? loaded
}
