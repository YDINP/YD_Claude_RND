import { Assets, CanvasSource, Texture } from 'pixi.js'
import type { SymbolId } from '@tgslot/slot-engine'
import { FALLBACK_TEXTURE_SIZE } from '../constants.js'
import { resolveSymbolSource } from '../theme.js'
import type { TextureRegistry } from '../textureRegistry.js'
import type { Theme } from '../types.js'

/** 폴백 텍스처를 그릴 때 쓰는 비율. 캔버스 한 변 기준. */
const FALLBACK_PADDING_RATIO = 0.08
const FALLBACK_RADIUS_RATIO = 0.14
const FALLBACK_FONT_RATIO = 0.2

/**
 * 이미지가 없을 때 심볼 id를 글자로 찍은 대체 텍스처.
 * 렌더러가 에셋 하나 때문에 멈추지 않게 하는 안전망이다.
 *
 * 캔버스로 직접 만든 텍스처라 전역 에셋 캐시가 소유하지 않는다.
 * `registry`를 주면 렌더러 해제 시 함께 파괴된다.
 */
export function createFallbackTexture(label: string, theme: Theme, registry?: TextureRegistry): Texture {
  const size = FALLBACK_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) return Texture.EMPTY

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

  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) })
  return registry === undefined ? texture : registry.own(texture)
}

/** 금화 파티클용 원형 텍스처. 이미지 에셋 없이 그린다. 소유권은 렌더러에 있다. */
export function createCoinTexture(theme: Theme, registry?: TextureRegistry): Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) return Texture.EMPTY

  const gradient = ctx.createRadialGradient(size * 0.36, size * 0.32, size * 0.06, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, '#fff3c4')
  gradient.addColorStop(0.55, theme.palette.frame)
  gradient.addColorStop(1, '#8a6316')
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()

  const texture = new Texture({ source: new CanvasSource({ resource: canvas }) })
  return registry === undefined ? texture : registry.own(texture)
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
