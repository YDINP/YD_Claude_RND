import { basename, join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { findWorkspaceRoot, gamesDir, listGameDirs, readJson, resolveMathPath } from './paths.js'

/** listGameDirs의 필터링 규칙만 검증하는 가짜 games 폴더. 저장소를 건드리지 않는다. */
const fakeGames = mkdtempSync(join(tmpdir(), 'rtp-sim-games-'))
mkdirSync(join(fakeGames, 'alpha')) // math.json 없음 — 그래도 목록에 들어가야 한다
mkdirSync(join(fakeGames, 'beta'))
writeFileSync(join(fakeGames, 'beta', 'math.json'), '{}')
mkdirSync(join(fakeGames, '_template'))
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
    expect(listGameDirs(fakeGames).map((dir) => basename(dir))).toEqual(['alpha', 'beta'])
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
