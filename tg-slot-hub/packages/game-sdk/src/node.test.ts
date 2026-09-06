import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { PACK_FILES } from './pack.js'
import {
  checkGamePackDir,
  createDirSource,
  listGamePackDirs,
  listTrackedFiles,
  loadGamePack,
  resolveGamesDir,
} from './node.js'
import {
  FIXTURE_ID,
  fixtureArtFx,
  fixtureManifest,
  fixtureMath,
  fixturePrompts,
  fixtureTheme,
} from './testSupport.js'

/** 메모리 픽스처와 같은 팩을 디스크에 깐다. 실제 `games/*`는 건드리지 않는다. */
function writePack(root: string, id: string): string {
  const dir = join(root, id)
  const files: Record<string, string> = {
    [PACK_FILES.manifest]: JSON.stringify({ ...fixtureManifest, id, thumbnail: `/games/${id}/thumb.webp` }),
    [PACK_FILES.math]: JSON.stringify({ ...fixtureMath, id }),
    [PACK_FILES.theme]: JSON.stringify(fixtureTheme),
    [PACK_FILES.prompts]: JSON.stringify({ ...fixturePrompts, game: id }),
    [PACK_FILES.fx]: JSON.stringify(fixtureArtFx),
    'theme/symbols/wild.webp': '',
    'theme/symbols/wild@128.webp': '',
    'theme/symbols/cherry.webp': '',
    'theme/symbols/cherry@128.webp': '',
    'theme/bg.webp': '',
    'thumb.webp': '',
  }
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, ...path.split('/'))
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return dir
}

const root = mkdtempSync(join(tmpdir(), 'tgslot-pack-'))
const packDir = writePack(root, FIXTURE_ID)
writePack(root, '_scaffold')

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createDirSource', () => {
  it('팩 폴더 기준 상대 경로로 읽는다 (Windows에서도 `/` 구분자)', () => {
    const source = createDirSource(packDir)
    expect(source.readText(PACK_FILES.manifest)).toContain(FIXTURE_ID)
    expect(source.readText('theme/symbols/wild.webp')).toBe('')
  })

  it('없는 파일은 undefined다', () => {
    expect(createDirSource(packDir).readText('nope.json')).toBeUndefined()
  })

  it('하위 폴더까지 재귀로 나열한다', () => {
    const listed = createDirSource(packDir).list()
    expect(listed).toContain('theme/symbols/wild.webp')
    expect(listed).toContain('art/prompts.json')
  })
})

describe('loadGamePack', () => {
  it('디스크에서 읽어 검증까지 끝낸 팩을 준다', () => {
    const pack = loadGamePack(packDir)
    expect(pack.id).toBe(FIXTURE_ID)
    expect(pack.manifest.name.en).toBe('Demo Slot')
    expect(pack.math.symbols.map((symbol) => symbol.id)).toEqual(['wild', 'cherry'])
    expect(pack.theme.symbols.wild).toBe('symbols/wild.webp')
  })

  it('폴더 이름과 manifest.id가 다르면 던진다', () => {
    // 목록 테스트에 섞이지 않도록 별도 루트에 만든다.
    const renamed = join(mkdtempSync(join(tmpdir(), 'tgslot-pack-')), 'renamed')
    mkdirSync(renamed, { recursive: true })
    writeFileSync(join(renamed, PACK_FILES.manifest), JSON.stringify(fixtureManifest), 'utf8')
    writeFileSync(join(renamed, PACK_FILES.math), JSON.stringify(fixtureMath), 'utf8')
    expect(() => loadGamePack(renamed)).toThrow(/폴더 이름/)
  })

  it('prompts.json이 math와 안 맞는 WIP 팩은 기본(authoring)으로는 던지지만 stage: serving으로는 뜬다', () => {
    // astral-clocktower가 실제로 겪은 사고 재현: manifest+math는 멀쩡한데 아트 프롬프트가 아직 안 맞는다.
    const wipRoot = mkdtempSync(join(tmpdir(), 'tgslot-pack-'))
    const wipDir = writePack(wipRoot, 'wip-slot')
    const brokenPrompts = { ...fixturePrompts, game: 'wip-slot', assets: [{ ...fixturePrompts.assets[0], id: 'ghost' }, ...fixturePrompts.assets.slice(1)] }
    writeFileSync(join(wipDir, PACK_FILES.prompts), JSON.stringify(brokenPrompts), 'utf8')

    expect(() => loadGamePack(wipDir)).toThrow(/게임 팩 검증 실패/)
    expect(loadGamePack(wipDir, { stage: 'serving' }).id).toBe('wip-slot')
  })
})

describe('checkGamePackDir', () => {
  it('멀쩡한 팩은 문제를 내지 않는다', () => {
    expect(checkGamePackDir(packDir)).toEqual([])
  })
})

describe('listGamePackDirs', () => {
  it('`_`로 시작하는 스캐폴드는 제외한다', () => {
    expect(listGamePackDirs(root)).toEqual([packDir])
  })

  it('없는 폴더면 빈 목록이다', () => {
    expect(listGamePackDirs(join(root, 'nope'))).toEqual([])
  })
})

describe('resolveGamesDir', () => {
  it('GAMES_DIR가 있으면 그것을 쓴다', () => {
    expect(resolveGamesDir({ GAMES_DIR: root })).toBe(root)
  })

  it('없으면 워크스페이스 루트의 games/를 찾는다', () => {
    expect(resolveGamesDir({}).replace(/\\/g, '/')).toMatch(/\/games$/)
  })
})

/** 이 환경에서 git을 쓸 수 있는지. 없으면 아래 통합 테스트를 건너뛴다. */
function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('listTrackedFiles', () => {
  it('git 저장소가 아니면 undefined다 (검사기가 추적 검사를 건너뛴다)', () => {
    expect(listTrackedFiles(packDir)).toBeUndefined()
    expect(createDirSource(packDir).listTracked?.()).toBeUndefined()
  })

  it('없는 폴더도 undefined다', () => {
    expect(listTrackedFiles(join(root, 'nope'))).toBeUndefined()
  })

  it.skipIf(!gitAvailable())('저장소 안에서는 추적 중인 파일만 돌려준다', () => {
    const repo = mkdtempSync(join(tmpdir(), 'tgslot-git-'))
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' })
    const dir = writePack(repo, FIXTURE_ID)
    // 전환 클립을 추가하되 git에는 올리지 않는다 — 실제로 물릴 뻔한 사고와 같은 상태.
    writeFileSync(join(dir, 'theme', 'theme.json'), JSON.stringify({ ...fixtureTheme, transitions: { freeSpinsEnter: 'transitions/fs-enter.webm' } }), 'utf8')
    mkdirSync(join(dir, 'theme', 'transitions'), { recursive: true })
    writeFileSync(join(dir, 'theme', 'transitions', 'fs-enter.webm'), '', 'utf8')

    execFileSync('git', ['add', '--', '.'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['rm', '--cached', '-q', '--', 'theme/transitions/fs-enter.webm'], { cwd: dir, stdio: 'ignore' })

    const tracked = listTrackedFiles(dir)
    expect(tracked).toContain('theme/symbols/wild.webp')
    expect(tracked).not.toContain('theme/transitions/fs-enter.webm')

    // 어댑터를 그대로 태우면 untracked 클립이 오류로 잡힌다.
    const problems = checkGamePackDir(dir)
    const untracked = problems.find((problem) => problem.message.includes('git에 추적되지 않는다'))
    expect(untracked?.level).toBe('error')
    expect(untracked?.message).toContain('theme/transitions/fs-enter.webm')

    rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
})
