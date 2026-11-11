import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildContactSheet, closePairs, dHash, hamming } from './contactSheetCli.js'

async function shapeFile(dir: string, name: string, svgInner: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${svgInner}</svg>`
  const path = join(dir, `${name}.png`)
  writeFileSync(path, await sharp(Buffer.from(svg)).png().toBuffer())
  return path
}

describe('contact sheet', () => {
  it('hamming은 다른 비트 수를 센다', () => {
    expect(hamming(0b1010n, 0b0110n)).toBe(2)
    expect(hamming(5n, 5n)).toBe(0)
  })

  it('같은 그림은 거리 0으로 잡고 다른 모양은 8 이상이다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contact-'))
    const circle = await shapeFile(dir, 'a', '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><circle cx="64" cy="64" r="50" fill="url(#g)"/>')
    const copy = await shapeFile(dir, 'b', '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><circle cx="64" cy="64" r="50" fill="url(#g)"/>')
    const bars = await shapeFile(dir, 'c', '<rect x="10" y="10" width="30" height="108" fill="#000"/><rect x="70" y="10" width="30" height="40" fill="#fff"/>')
    const hashes = new Map([
      ['a', await dHash(circle)],
      ['b', await dHash(copy)],
      ['c', await dHash(bars)],
    ])
    const bad = closePairs(hashes)
    expect(bad).toEqual([{ a: 'a', b: 'b', distance: 0 }])

    const sheet = await buildContactSheet([
      { id: 'a', file: circle },
      { id: 'c', file: bars },
    ])
    expect((await sharp(sheet).metadata()).width).toBeGreaterThan(1000)
  })
})
