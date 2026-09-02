import sharp from 'sharp'
import { SHEET_CONTENT_ALPHA_THRESHOLD, WEBP_QUALITY } from './constants.js'

export interface SheetFrameRect {
  x: number
  y: number
  w: number
  h: number
}

/** TexturePacker류 미니멀 아틀라스 JSON. `<gameDir>/<out과 같은 폴더>/<id>.json`으로 쓴다. */
export interface SheetAtlasJson {
  frameW: number
  frameH: number
  cols: number
  rows: number
  count: number
  fps: number
  frames: SheetFrameRect[]
  symbol: string
}

export interface ProcessSheetOptions {
  cols: number
  rows: number
  fps: number
  symbol: string
  /** 최종 아틀라스 폭(px). frame 크기와 프레임 좌표도 같은 비율로 스케일한다. */
  outSize: number
}

export interface ProcessedSheet {
  atlas: Buffer
  json: SheetAtlasJson
}

interface ContentBbox {
  x: number
  y: number
  w: number
  h: number
}

/** 셀 로컬 좌표계에서 alpha가 임계값보다 큰 픽셀들의 바운딩 박스. 없으면 null. */
function computeContentBbox(data: Buffer, width: number, height: number, alphaThreshold: number): ContentBbox | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0
      if (alpha <= alphaThreshold) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 여러 셀의 바운딩 박스를 하나로 합친다(전부 포함하는 최소 사각형). 전부 비어 있으면 셀 전체 크기로 대체한다. */
function unionBboxes(bboxes: (ContentBbox | null)[], fallbackW: number, fallbackH: number): ContentBbox {
  const present = bboxes.filter((box): box is ContentBbox => box !== null)
  if (present.length === 0) return { x: 0, y: 0, w: fallbackW, h: fallbackH }

  const minX = Math.min(...present.map((box) => box.x))
  const minY = Math.min(...present.map((box) => box.y))
  const maxX = Math.max(...present.map((box) => box.x + box.w))
  const maxY = Math.max(...present.map((box) => box.y + box.h))

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** src의 (left,top)-(left+w,top+h) 영역을 셀 로컬 좌표(0,0)-(w,h) 버퍼로 잘라낸다. */
function extractRegion(src: Buffer, srcWidth: number, left: number, top: number, w: number, h: number): Buffer {
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    const srcOffset = ((top + y) * srcWidth + left) * 4
    src.copy(out, y * w * 4, srcOffset, srcOffset + w * 4)
  }
  return out
}

/** src의 (srcX,srcY)-(w,h) 영역을 dst의 (dstX,dstY)에 그대로 복사한다(합성 없이 픽셀 복사). */
function copyRegionInto(
  src: Buffer,
  srcWidth: number,
  dst: Buffer,
  dstWidth: number,
  srcX: number,
  srcY: number,
  w: number,
  h: number,
  dstX: number,
  dstY: number,
): void {
  for (let y = 0; y < h; y += 1) {
    const srcOffset = ((srcY + y) * srcWidth + srcX) * 4
    const dstOffset = ((dstY + y) * dstWidth + dstX) * 4
    src.copy(dst, dstOffset, srcOffset, srcOffset + w * 4)
  }
}

/**
 * 콘택트시트 1장을 `cols x rows` 프레임으로 슬라이싱해 타이트한 아틀라스로 재조립한다.
 * 1) 이미지를 `cols x rows` 셀로 등분한다(칸당 크기는 `floor(width/cols) x floor(height/rows)`,
 *    나머지 픽셀은 버린다 — 프롬프트가 "equal cells"를 지시했으니 정상적이면 거의 안 남는다).
 * 2) 각 셀의 콘텐츠(alpha > 임계값) 바운딩 박스를 셀 로컬 좌표로 구하고, 전부 합쳐 **하나의**
 *    바운딩 박스로 만든다. 프레임마다 따로 트림하면 애니메이션 중 물체가 흔들려 보이므로,
 *    모든 프레임을 반드시 같은 박스로 자른다.
 * 3) 그 박스만큼만 각 셀에서 잘라 여백 없는 `frameW x frameH` 격자로 다시 합성한다.
 * 4) `outSize` 폭에 맞춰 리사이즈하고, 프레임 크기/좌표도 같은 비율로 스케일한다.
 */
export async function processSheet(input: Buffer, options: ProcessSheetOptions): Promise<ProcessedSheet> {
  const { cols, rows, fps, symbol, outSize } = options
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info

  const cellW = Math.max(1, Math.floor(width / cols))
  const cellH = Math.max(1, Math.floor(height / rows))

  const cellBboxes: (ContentBbox | null)[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = extractRegion(data, width, c * cellW, r * cellH, cellW, cellH)
      cellBboxes.push(computeContentBbox(cell, cellW, cellH, SHEET_CONTENT_ALPHA_THRESHOLD))
    }
  }

  const unionBbox = unionBboxes(cellBboxes, cellW, cellH)
  const frameW = unionBbox.w
  const frameH = unionBbox.h
  const count = cols * rows

  const nativeAtlasWidth = frameW * cols
  const nativeAtlasHeight = frameH * rows
  const atlasRaw = Buffer.alloc(nativeAtlasWidth * nativeAtlasHeight * 4)

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const srcX = c * cellW + unionBbox.x
      const srcY = r * cellH + unionBbox.y
      copyRegionInto(data, width, atlasRaw, nativeAtlasWidth, srcX, srcY, frameW, frameH, c * frameW, r * frameH)
    }
  }

  const scale = outSize / nativeAtlasWidth
  const scaledFrameW = Math.max(1, Math.round(frameW * scale))
  const scaledFrameH = Math.max(1, Math.round(frameH * scale))

  // 폭/높이를 sharp가 종횡비로 각자 알아서 반올림하게 두면(resize({width: outSize})) JSON의
  // frameH*rows와 실제 픽셀 높이가 어긋날 수 있다(예: frameH 61, rows 2, outSize 248이면
  // JSON은 606인데 이미지는 605가 되는 식). 그래서 최종 픽셀 크기를 JSON과 똑같이
  // scaledFrameW*cols x scaledFrameH*rows로 못박아 리사이즈한다. fit:'fill'로 폭/높이를
  // 각각 독립적으로 맞춘다 — 어차피 scale은 폭 기준으로 균일하게 구했으니 종횡비 왜곡은
  // 반올림 오차(최대 1px) 수준이라 무시할 만하다.
  const atlas = await sharp(atlasRaw, { raw: { width: nativeAtlasWidth, height: nativeAtlasHeight, channels: 4 } })
    .resize({ width: scaledFrameW * cols, height: scaledFrameH * rows, fit: 'fill' })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  const frames: SheetFrameRect[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      frames.push({ x: c * scaledFrameW, y: r * scaledFrameH, w: scaledFrameW, h: scaledFrameH })
    }
  }

  const json: SheetAtlasJson = {
    frameW: scaledFrameW,
    frameH: scaledFrameH,
    cols,
    rows,
    count,
    fps,
    frames,
    symbol,
  }

  return { atlas, json }
}
