import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { logError } from './log.js'
import { promptsJsonPath, readJson, resolveGameDir, writeBuffer } from './paths.js'
import { parsePromptsFile } from './schema.js'

const USAGE = `사용법: pnpm --filter @tgslot/theme-gen contact <게임 폴더>

모든 심볼을 512 / 58 / 28px 타일로 id 라벨과 함께 art/contact.png 에 그린다.
dHash 해밍 거리가 8 미만인 쌍이 있으면 실패한다(codex 회수가 엉뚱한 이미지를 집은 경우).`

export const CONTACT_MIN_HAMMING = 8
const TILE_BG = { r: 58, g: 52, b: 72, alpha: 1 }
const CELL_W = 620
const CELL_H = 560
const COLS = 4

export interface SymbolTile {
  id: string
  file: string
}

/** 9x8 그레이스케일에서 가로 인접 밝기 비교로 만든 64비트 해시. */
export async function dHash(file: string): Promise<bigint> {
  const flat = await sharp(file).flatten({ background: { r: 128, g: 128, b: 128 } }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let hash = 0n
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | ((flat[y * 9 + x] ?? 0) > (flat[y * 9 + x + 1] ?? 0) ? 1n : 0n)
    }
  }
  return hash
}

export function hamming(a: bigint, b: bigint): number {
  let diff = a ^ b
  let count = 0
  while (diff > 0n) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

export interface HashPair {
  a: string
  b: string
  distance: number
}

export function closePairs(hashes: Map<string, bigint>, min: number = CONTACT_MIN_HAMMING): HashPair[] {
  const ids = [...hashes.keys()]
  const bad: HashPair[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i] as string
      const b = ids[j] as string
      const distance = hamming(hashes.get(a) as bigint, hashes.get(b) as bigint)
      if (distance < min) bad.push({ a, b, distance })
    }
  }
  return bad
}

function label(text: string, width: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24"><text x="4" y="18" font-family="Arial, sans-serif" font-size="18" fill="#ffffff">${text}</text></svg>`
  return Buffer.from(svg)
}

async function tile(file: string, size: number): Promise<Buffer> {
  return sharp(file).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

export async function buildContactSheet(tiles: SymbolTile[]): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / COLS)
  const stripY = rows * CELL_H + 10
  const width = COLS * CELL_W
  const height = stripY + 58 + 28 + 40
  const layers: sharp.OverlayOptions[] = []

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i] as SymbolTile
    const ox = (i % COLS) * CELL_W
    const oy = Math.floor(i / COLS) * CELL_H
    layers.push({ input: label(`${t.id}  512 / 58 / 28`, CELL_W), left: ox, top: oy })
    layers.push({ input: await tile(t.file, 512), left: ox, top: oy + 24 })
    layers.push({ input: await tile(t.file, 58), left: ox + 530, top: oy + 24 })
    layers.push({ input: await tile(t.file, 28), left: ox + 540, top: oy + 100 })
  }
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i] as SymbolTile
    layers.push({ input: await tile(t.file, 58), left: 10 + i * 66, top: stripY })
    layers.push({ input: await tile(t.file, 28), left: 10 + i * 66 + 15, top: stripY + 66 })
  }

  return sharp({ create: { width, height, channels: 4, background: TILE_BG } }).composite(layers).png().toBuffer()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE)
    return
  }
  const target = args.find((a) => !a.startsWith('-'))
  if (target === undefined) throw new Error(`대상 게임 폴더를 지정할 것\n\n${USAGE}`)
  const gameDir = resolveGameDir(target)
  const promptsPath = promptsJsonPath(gameDir)
  if (!existsSync(promptsPath)) throw new Error(`prompts.json을 찾지 못했다: ${promptsPath}`)

  const file = parsePromptsFile(readJson(promptsPath))
  const tiles: SymbolTile[] = []
  for (const asset of file.assets) {
    if (asset.kind !== 'symbol') continue
    const path = join(gameDir, asset.out)
    if (!existsSync(path)) throw new Error(`심볼 파일이 없다: ${path}`)
    tiles.push({ id: asset.id, file: path })
  }
  if (tiles.length === 0) throw new Error('심볼 에셋이 없다')

  const hashes = new Map<string, bigint>()
  for (const t of tiles) hashes.set(t.id, await dHash(t.file))

  const outPath = join(gameDir, 'art', 'contact.png')
  writeBuffer(outPath, await buildContactSheet(tiles))
  console.log(`contact sheet: ${outPath} (${tiles.length}개)`)

  const bad = closePairs(hashes)
  if (bad.length > 0) {
    for (const p of bad) console.error(`  [중복 의심] ${p.a} ↔ ${p.b} 해밍 거리 ${p.distance} < ${CONTACT_MIN_HAMMING}`)
    process.exit(1)
  }
  console.log('  모든 쌍의 dHash 해밍 거리 >= 8')
}

if (process.argv[1]?.endsWith('contactSheetCli.ts')) {
  main().catch((error: unknown) => {
    logError(error)
    process.exit(1)
  })
}
