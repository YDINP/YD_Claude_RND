import { CHROMA_KEY_COLOR, CHROMA_KEY_FEATHER_PX, CHROMA_KEY_MIN_SATURATION, CHROMA_KEY_TOLERANCE_DEG } from './constants.js'

export interface RawImage {
  data: Buffer
  width: number
  height: number
  channels: 3 | 4
}

export interface ChromaKeyOptions {
  keyColor?: { r: number; g: number; b: number }
  /** 이 색상 거리(도) 안쪽이면 배경으로 간주한다. */
  toleranceDeg?: number
  /** 채도가 이보다 낮은 픽셀(회색조)은 초록에 가까워도 키잉하지 않는다. */
  minSaturation?: number
  /** 알파 경계를 부드럽게 하는 박스 블러 반경(px). 0이면 이진 마스크 그대로. */
  featherPx?: number
}

function rgbToHueSat(r: number, g: number, b: number): { h: number; s: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }
  if (h < 0) h += 360

  const s = max === 0 ? 0 : delta / max
  return { h, s }
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/** 3채널(RGB) 입력을 alpha=255로 채운 4채널(RGBA) 버퍼로 만든다. 이미 4채널이면 복사만 한다. */
export function toRgbaBuffer(image: RawImage): Buffer {
  if (image.channels === 4) return Buffer.from(image.data)

  const { data, width, height, channels } = image
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels
    const dst = i * 4
    rgba[dst] = data[src] ?? 0
    rgba[dst + 1] = data[src + 1] ?? 0
    rgba[dst + 2] = data[src + 2] ?? 0
    rgba[dst + 3] = 255
  }
  return rgba
}

/** 알파 채널만 대상으로 하는 박스 블러. 경계 밖은 무시(clamp)한다. frameWindow의 창 경계 페더링에도 재사용한다. */
export function featherAlpha(rgba: Buffer, width: number, height: number, radius: number): Buffer {
  const out = Buffer.from(rgba)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      let count = 0
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          sum += rgba[(ny * width + nx) * 4 + 3] ?? 0
          count += 1
        }
      }
      out[(y * width + x) * 4 + 3] = count > 0 ? Math.round(sum / count) : 0
    }
  }
  return out
}

/**
 * 순수 색상 기반 크로마키. 파일 I/O나 sharp에 의존하지 않아 합성 픽셀 버퍼로 단위 테스트할 수 있다.
 * 항상 4채널(RGBA) 결과를 반환한다. 입력이 3채널이면 alpha=255로 간주하고 처리한다.
 * hue가 기준색과 가깝고(±toleranceDeg) 채도가 충분히 높은(>=minSaturation) 픽셀만 투명 처리한다.
 * 채도 하한을 두는 이유: 흰색/회색 하이라이트가 초록과 같은 hue로 오판되어 뚫리는 것을 막기 위해서다.
 */
export function chromaKey(image: RawImage, options: ChromaKeyOptions = {}): RawImage {
  const keyColor = options.keyColor ?? CHROMA_KEY_COLOR
  const toleranceDeg = options.toleranceDeg ?? CHROMA_KEY_TOLERANCE_DEG
  const minSaturation = options.minSaturation ?? CHROMA_KEY_MIN_SATURATION
  const featherPx = options.featherPx ?? CHROMA_KEY_FEATHER_PX
  const { h: keyHue } = rgbToHueSat(keyColor.r, keyColor.g, keyColor.b)

  const { width, height, channels } = image
  const pixelCount = width * height
  const rgba = Buffer.alloc(pixelCount * 4)

  for (let i = 0; i < pixelCount; i += 1) {
    const srcOffset = i * channels
    const r = image.data[srcOffset] ?? 0
    const g = image.data[srcOffset + 1] ?? 0
    const b = image.data[srcOffset + 2] ?? 0
    const a = channels === 4 ? (image.data[srcOffset + 3] ?? 255) : 255

    const { h, s } = rgbToHueSat(r, g, b)
    const isBackground = s >= minSaturation && hueDistance(h, keyHue) <= toleranceDeg

    const dstOffset = i * 4
    rgba[dstOffset] = r
    rgba[dstOffset + 1] = g
    rgba[dstOffset + 2] = b
    rgba[dstOffset + 3] = isBackground ? 0 : a
  }

  const data = featherPx > 0 ? featherAlpha(rgba, width, height, featherPx) : rgba
  return { data, width, height, channels: 4 }
}
