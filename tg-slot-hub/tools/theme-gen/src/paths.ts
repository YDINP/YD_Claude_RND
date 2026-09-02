import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAW_DIR_NAME } from './constants.js'

const WORKSPACE_MARKER = 'pnpm-workspace.yaml'

/** pnpm-workspace.yaml을 찾아 올라가며 모노레포 루트를 정한다. */
export function findWorkspaceRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let current = resolve(startDir)
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`${WORKSPACE_MARKER}를 찾지 못했다: ${startDir}`)
    current = parent
  }
}

/**
 * CLI 인자를 게임 폴더 절대 경로로 해석한다.
 * cwd 기준 상대 경로, 워크스페이스 루트 기준 상대 경로, 절대 경로 모두 받는다.
 */
export function resolveGameDir(input: string): string {
  const candidates = isAbsolute(input) ? [input] : [resolve(process.cwd(), input), resolve(findWorkspaceRoot(), input)]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
  }
  throw new Error(`게임 폴더를 찾지 못했다: ${input}`)
}

export function promptsJsonPath(gameDir: string): string {
  return join(gameDir, 'art', 'prompts.json')
}

export function themeJsonPath(gameDir: string): string {
  return join(gameDir, 'theme', 'theme.json')
}

export function rawAssetDir(gameDir: string): string {
  return join(gameDir, 'art', RAW_DIR_NAME)
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

export function readJsonOptional(path: string): unknown {
  if (!existsSync(path)) return undefined
  return readJson(path)
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function writeBuffer(path: string, data: Buffer): void {
  ensureDir(dirname(path))
  writeFileSync(path, data)
}
