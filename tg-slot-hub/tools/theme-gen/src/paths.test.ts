import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ensureDir,
  findWorkspaceRoot,
  promptsJsonPath,
  rawAssetDir,
  readJson,
  readJsonOptional,
  resolveGameDir,
  themeJsonPath,
  writeBuffer,
  writeJson,
} from './paths.js'

const tmpRoot = mkdtempSync(join(tmpdir(), 'theme-gen-paths-'))

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('findWorkspaceRoot', () => {
  it('pnpm-workspace.yaml이 있는 폴더를 찾는다', () => {
    expect(existsSync(join(findWorkspaceRoot(), 'pnpm-workspace.yaml'))).toBe(true)
  })
})

describe('resolveGameDir', () => {
  it('절대 경로를 그대로 받는다', () => {
    expect(resolveGameDir(tmpRoot)).toBe(tmpRoot)
  })

  it('워크스페이스 루트 기준 상대 경로도 받는다', () => {
    expect(existsSync(resolveGameDir('games/classic-777'))).toBe(true)
  })

  it('없는 폴더는 예외를 던진다', () => {
    expect(() => resolveGameDir('games/nope-does-not-exist')).toThrow()
  })
})

describe('경로 헬퍼', () => {
  it('art/prompts.json, theme/theme.json, art/raw를 게임 폴더 기준으로 만든다', () => {
    expect(promptsJsonPath('/g')).toBe(join('/g', 'art', 'prompts.json'))
    expect(themeJsonPath('/g')).toBe(join('/g', 'theme', 'theme.json'))
    expect(rawAssetDir('/g')).toBe(join('/g', 'art', 'raw'))
  })
})

describe('읽기/쓰기', () => {
  it('writeJson으로 쓰고 readJson으로 그대로 읽는다', () => {
    const path = join(tmpRoot, 'nested', 'theme.json')
    writeJson(path, { a: 1, b: [1, 2, 3] })
    expect(readJson(path)).toEqual({ a: 1, b: [1, 2, 3] })
  })

  it('readJsonOptional은 없는 파일이면 undefined다', () => {
    expect(readJsonOptional(join(tmpRoot, 'nope.json'))).toBeUndefined()
  })

  it('writeBuffer는 폴더가 없어도 만들어서 쓴다', () => {
    const path = join(tmpRoot, 'deep', 'nested', 'symbol.webp')
    writeBuffer(path, Buffer.from('fake-webp'))
    expect(existsSync(path)).toBe(true)
  })

  it('ensureDir은 이미 있는 폴더에도 안전하다', () => {
    expect(() => ensureDir(tmpRoot)).not.toThrow()
  })
})
