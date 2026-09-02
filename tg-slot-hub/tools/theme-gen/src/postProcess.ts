import sharp from 'sharp'
import { chromaKey } from './chromaKey.js'
import { SYMBOL_MARGIN_RATIO, SYMBOL_THUMB_SIZE, WEBP_QUALITY } from './constants.js'
import { detectFrameWindow, punchWindowAlpha, type FrameWindowFraction } from './frameWindow.js'

export interface ProcessedSymbol {
  full: Buffer
  thumb: Buffer
}

/** trim()이 완전 단색/빈 이미지에서 던지는 경우가 있어 실패하면 원본을 그대로 쓴다. */
async function trimSafely(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input).trim().toBuffer()
  } catch {
    return input
  }
}

/**
 * 심볼 에셋 후처리.
 * 1) 투명 여백 트림  2) `SYMBOL_MARGIN_RATIO`만큼 여백을 둔 정사각 캔버스에 중앙 배치
 * 3) `outSize` 정사각으로 리사이즈해 webp로 인코딩  4) 128px 썸네일도 함께 만든다.
 */
export async function processSymbol(input: Buffer, outSize: number): Promise<ProcessedSymbol> {
  const trimmed = await trimSafely(input)
  const meta = await sharp(trimmed).metadata()
  const width = meta.width ?? outSize
  const height = meta.height ?? outSize

  const marginFactor = 1 - SYMBOL_MARGIN_RATIO * 2
  const canvasSize = Math.max(1, Math.round(Math.max(width, height) / marginFactor))

  const squared = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmed, gravity: 'center' }])
    .png()
    .toBuffer()

  const full = await sharp(squared).resize(outSize, outSize).webp({ quality: WEBP_QUALITY }).toBuffer()
  const thumb = await sharp(squared)
    .resize(SYMBOL_THUMB_SIZE, SYMBOL_THUMB_SIZE)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  return { full, thumb }
}

/** frame/bg/thumb 에셋 후처리. 트림 없이 폭 기준으로 리사이즈해 webp로 인코딩한다. */
export async function processFlat(input: Buffer, outSize: number): Promise<Buffer> {
  return sharp(input).resize({ width: outSize }).webp({ quality: WEBP_QUALITY }).toBuffer()
}

export interface ProcessedFrame {
  buffer: Buffer
  /** 릴 창 자리를 찾아 뚫었으면 그 좌표(이미지 크기 대비 분수). 못 찾았으면 undefined. */
  window: FrameWindowFraction | undefined
}

/**
 * `kind: "frame"` 에셋 전용 후처리.
 * 1) 중앙 영역에서 초록/흰색 placeholder 릴 창을 찾아 알파 0으로 뚫는다(둥근 모서리 + 페더링).
 * 2) 남은 초록 테두리 번짐을 잡기 위해 이미지 전체에 크로마키를 한 번 더 돌린다.
 * 3) 폭 기준으로 `outSize`에 맞춰 리사이즈해 webp로 인코딩한다.
 * 창을 못 찾아도 실패하지 않는다 — 그냥 window 없이 리사이즈만 하고 호출부가 경고를 남기면 된다.
 */
export async function processFrame(input: Buffer, outSize: number): Promise<ProcessedFrame> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw = { data, width: info.width, height: info.height, channels: 4 as const }

  const window = detectFrameWindow(raw) ?? undefined
  const punched = window !== undefined ? punchWindowAlpha(raw, window) : raw
  const keyed = chromaKey(punched)

  const png = await sharp(keyed.data, { raw: { width: keyed.width, height: keyed.height, channels: 4 } })
    .png()
    .toBuffer()
  const buffer = await sharp(png).resize({ width: outSize }).webp({ quality: WEBP_QUALITY }).toBuffer()

  return { buffer, window }
}
