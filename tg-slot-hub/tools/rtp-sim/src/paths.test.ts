import { basename, join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import {
  findWorkspaceRoot,
  gamesDir,
  hasManifest,
  listArtOnlyDirs,
  listGameDirs,
  listGamePackDirs,
  readJson,
  resolveMathPath,
} from './paths.js'

/** 폴더 분류 규칙만 검증하는 가짜 games 폴더. 저장소를 건드리지 않는다. */
const fakeGames = mkdtempSync(join(tmpdir(), 'rtp-sim-games-'))

// alpha — 아트만 있는 폴더. manifest가 없으므로 게이트가 건너뛴다.
mkdirSync(join(fakeGames, 'alpha'))
mkdirSync(join(fakeGames, 'alpha', 'art'))
writeFileSync(join(fakeGames, 'alpha', 'art', 'prompts.json'), '{}')

// beta — 완성된 팩.
mkdirSync(join(fakeGames, 'beta'))
writeFileSync(join(fakeGames, 'beta', 'manifest.json'), '{}')
writeFileSync(join(fakeGames, 'beta', 'math.json'), '{}')

// gamma — manifest는 있는데 math.json이 없다. 건너뛰면 안 되고 실패해야 한다.
mkdirSync(join(fakeGames, 'gamma'))
writeFileSync(join(fakeGames, 'gamma', 'manifest.json'), '{}')

mkdirSync(join(fakeGames, '_template'))
writeFileSync(join(fakeGames, '_template', 'manifest.json'), '{}')
writeFileSync(join(fakeGames, 'stray.json'), '{}')

afterAll(() => {
  rmSync(fakeGames, { recursive: true, force: true })
})

describe('paths', () => {
  it('pnpm-workspace.yaml이 있는 폴더를 루트로 찾는다', () => {
    expect(existsSync(join(findWorkspaceRoot(), 'pnpm-workspace.yaml'))).toBe(true)
  })

  it('games 폴더를 찾는다', () => {
    expect(existsSync(gamesDir())).toBe(true)
  })

  it('게임 id만 줘도 math.json을 찾는다', () => {
    expect(basename(resolveMathPath('classic-777'))).toBe('math.json')
  })

  it('워크스페이스 루트 기준 경로도 받는다', () => {
    expect(existsSync(resolveMathPath('games/classic-777'))).toBe(true)
  })

  it('math.json 파일 경로를 직접 줘도 된다', () => {
    expect(existsSync(resolveMathPath('games/classic-777/math.json'))).toBe(true)
  })

  it('없는 게임은 예외', () => {
    expect(() => resolveMathPath('nope-does-not-exist')).toThrow()
  })

  it('_로 시작하는 폴더는 게임 목록에서 뺀다', () => {
    expect(listGameDirs().map((dir) => basename(dir))).not.toContain('_template')
  })

  it('math.json이 없는 폴더도 목록에 넣는다', () => {
    // 파일이 빠진 팩은 조용히 건너뛰면 안 되고 게이트 테스트에서 실패해야 한다.
    expect(listGameDirs(fakeGames).map((dir) => basename(dir))).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('폴더가 아닌 파일은 목록에 넣지 않는다', () => {
    expect(listGameDirs(fakeGames).map((dir) => basename(dir))).not.toContain('stray.json')
  })

  it('없는 폴더를 주면 빈 목록', () => {
    expect(listGameDirs(join(fakeGames, 'nope'))).toEqual([])
  })

  it('JSON을 읽는다', () => {
    const math = readJson(resolveMathPath('classic-777')) as { id: string }
    expect(math.id).toBe('classic-777')
  })
})

describe('아트만 있는 폴더와 게임 팩 구분', () => {
  it('manifest.json이 있는지로 가른다', () => {
    expect(hasManifest(join(fakeGames, 'beta'))).toBe(true)
    expect(hasManifest(join(fakeGames, 'gamma'))).toBe(true)
    expect(hasManifest(join(fakeGames, 'alpha'))).toBe(false)
  })

  it('아트만 있는 폴더는 검사 대상에서 빠진다', () => {
    // 아트 파이프라인이 수학 팩보다 먼저 폴더를 만들어도 CI가 막히면 안 된다.
    expect(listGamePackDirs(fakeGames).map((dir) => basename(dir))).toEqual(['beta', 'gamma'])
    expect(listArtOnlyDirs(fakeGames).map((dir) => basename(dir))).toEqual(['alpha'])
  })

  it('manifest는 있는데 math.json이 없는 폴더는 건너뛰지 않는다', () => {
    // 만들다 만 팩을 조용히 빠뜨리는 것이 실패로 세우는 것보다 위험하다.
    const packs = listGamePackDirs(fakeGames).map((dir) => basename(dir))
    expect(packs).toContain('gamma')
    expect(existsSync(join(fakeGames, 'gamma', 'math.json'))).toBe(false)
  })

  it('두 목록을 합치면 전체 폴더 목록이 된다', () => {
    const all = listGameDirs(fakeGames).sort()
    const split = [...listGamePackDirs(fakeGames), ...listArtOnlyDirs(fakeGames)].sort()
    expect(split).toEqual(all)
  })

  it('_로 시작하는 폴더는 manifest가 있어도 대상이 아니다', () => {
    expect(listGamePackDirs(fakeGames).map((dir) => basename(dir))).not.toContain('_template')
  })

  it('없는 폴더를 주면 빈 목록이다', () => {
    expect(listGamePackDirs(join(fakeGames, 'nope'))).toEqual([])
    expect(listArtOnlyDirs(join(fakeGames, 'nope'))).toEqual([])
  })
})
