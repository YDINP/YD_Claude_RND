import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processFlat, processSymbol } from './postProcess.js'

/** 40x40 투명 캔버스 안에 20x20 불투명 빨간 정사각형을 (10,15)에 둔 합성 PNG. */
async function buildSyntheticSymbolPng(): Promise<Buffer> {
  const square = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } },
  })
    .png()
    .toBuffer()

  return sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: square, left: 10, top: 15 }])
    .png()
    .toBuffer()
}

describe('processSymbol', () => {
  it('outSize 정사각 webp와 128px 썸네일을 만든다', async () => {
    const input = await buildSyntheticSymbolPng()
    const { full, thumb } = await processSymbol(input, 200)

    const fullMeta = await sharp(full).metadata()
    expect(fullMeta.format).toBe('webp')
    expect(fullMeta.width).toBe(200)
    expect(fullMeta.height).toBe(200)

    const thumbMeta = await sharp(thumb).metadata()
    expect(thumbMeta.format).toBe('webp')
    expect(thumbMeta.width).toBe(128)
    expect(thumbMeta.height).toBe(128)
  })

  it('트림 후 8% 마진을 둔 정사각 캔버스에 중앙 배치한다 (중심 픽셀이 불투명)', async () => {
    const input = await buildSyntheticSymbolPng()
    const { full } = await processSymbol(input, 100)

    const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const center = Math.floor(info.width / 2)
    const centerOffset = (center * info.width + center) * 4 + 3
    expect(data[centerOffset]).toBeGreaterThan(200)

    // 마진 8%씩이면 심볼이 캔버스의 약 84%를 차지 → 맨 가장자리(코너)는 여전히 투명해야 한다
    const cornerOffset = 3
    expect(data[cornerOffset]).toBeLessThan(50)
  })

  it('트림이 실패해도(완전 단색 등) 예외 없이 처리한다', async () => {
    const solid = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 255 } } })
      .png()
      .toBuffer()
    await expect(processSymbol(solid, 64)).resolves.toBeDefined()
  })
})

describe('processFlat', () => {
  it('폭을 outSize로 리사이즈한 webp를 만든다', async () => {
    const input = await sharp({ create: { width: 300, height: 150, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 255 } } })
      .png()
      .toBuffer()

    const output = await processFlat(input, 150)
    const meta = await sharp(output).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(150)
    expect(meta.height).toBe(75)
  })
})
