import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { parseGameMath } from '@tgslot/slot-engine'
import { loadGamePacks, resolveGamesDir } from './packs.js'
import { createGameRegistry, loadGameRegistry } from './registry.js'

describe('resolveGamesDir', () => {
  it('finds the workspace games directory from the module location', () => {
    expect(resolveGamesDir()).toMatch(/games$/)
  })

  it('honours the GAMES_DIR override', () => {
    const dir = resolveGamesDir({ GAMES_DIR: 'some/other/games' } as NodeJS.ProcessEnv)
    expect(dir.endsWith('games')).toBe(true)
    expect(dir).toContain('other')
  })
})

describe('loadGamePacks', () => {
  const packs = loadGamePacks()

  it('loads at least one pack from disk', () => {
    expect(packs.length).toBeGreaterThan(0)
  })

  it('includes classic-777 and excludes the _template scaffold', () => {
    const ids = packs.map((pack) => pack.id)
    expect(ids).toContain('classic-777')
    expect(ids).not.toContain('_template')
  })

  it('keeps manifest.id, math.id and the directory name in sync', () => {
    for (const pack of packs) {
      expect(pack.manifest.id).toBe(pack.id)
      expect(pack.math.id).toBe(pack.id)
    }
  })

  it('derives the lobby summary from the manifest bet levels', () => {
    const classic = packs.find((pack) => pack.id === 'classic-777')
    expect(classic).toBeDefined()
    expect(classic?.summary.minBet).toBe(Math.min(...(classic?.manifest.betLevels ?? [0])))
    expect(classic?.summary.maxBet).toBe(Math.max(...(classic?.manifest.betLevels ?? [0])))
  })

  it('re-parses every rawMath payload it exposes', () => {
    for (const pack of packs) {
      expect(() => parseGameMath(pack.rawMath)).not.toThrow()
    }
  })
})

describe('createGameRegistry', () => {
  const packs = loadGamePacks()

  it('hides hidden packs from the lobby list and from getVisible', () => {
    const classic = packs.find((pack) => pack.id === 'classic-777')
    if (!classic) throw new Error('classic-777 pack missing')
    const hidden = {
      ...classic,
      id: 'secret-lab',
      manifest: { ...classic.manifest, id: 'secret-lab', status: 'hidden' as const },
      summary: { ...classic.summary, id: 'secret-lab', status: 'hidden' as const },
    }

    const registry = createGameRegistry([classic, hidden])

    expect(registry.list().map((game) => game.id)).toEqual(['classic-777'])
    expect(registry.getVisible('secret-lab')).toBeUndefined()
    expect(registry.get('secret-lab')).toBeDefined()
  })

  it('rejects duplicate game ids', () => {
    const classic = packs.find((pack) => pack.id === 'classic-777')
    if (!classic) throw new Error('classic-777 pack missing')
    expect(() => createGameRegistry([classic, classic])).toThrow(/중복/)
  })

  it('sorts the lobby list by sort ascending', () => {
    const registry = loadGameRegistry()
    const sorts = registry.list().map((game) => game.sort)
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts)
  })
})

describe('loadGamePacks: 미완성 폴더 처리', () => {
  const roots: string[] = []

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  /** 임시 games 디렉터리. 실제 classic-777을 복사해 "정상 팩 1개"를 깔아 둔다. */
  function makeGamesDir(): string {
    const root = mkdtempSync(join(tmpdir(), 'tgslot-packs-'))
    roots.push(root)
    cpSync(join(resolveGamesDir(), 'classic-777'), join(root, 'classic-777'), { recursive: true })
    return root
  }

  it('manifest.json이 없는 폴더는 경고만 남기고 건너뛴다', () => {
    const gamesDir = makeGamesDir()
    // 아트 파이프라인이 먼저 만드는 모양 그대로: art/와 theme/만 있는 폴더.
    mkdirSync(join(gamesDir, 'shiba-shrine', 'art'), { recursive: true })
    mkdirSync(join(gamesDir, 'shiba-shrine', 'theme'), { recursive: true })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const packs = loadGamePacks(gamesDir)

      expect(packs.map((pack) => pack.id)).toEqual(['classic-777'])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith('[games] skipping incomplete pack shiba-shrine')
    } finally {
      warn.mockRestore()
    }
  })

  it('manifest.json은 있는데 math.json이 없으면 던진다', () => {
    const gamesDir = makeGamesDir()
    const dir = join(gamesDir, 'half-built')
    mkdirSync(dir, { recursive: true })
    cpSync(join(gamesDir, 'classic-777', 'manifest.json'), join(dir, 'manifest.json'))

    // 만들다 만 팩을 조용히 빠뜨리면 로비에서 게임이 사라진 이유를 아무도 모른다.
    expect(() => loadGamePacks(gamesDir)).toThrow(/half-built: math\.json이 없다/)
  })

  it('manifest.json은 있는데 math.json이 깨졌으면 던진다', () => {
    const gamesDir = makeGamesDir()
    const dir = join(gamesDir, 'broken-math')
    mkdirSync(dir, { recursive: true })
    cpSync(join(gamesDir, 'classic-777', 'manifest.json'), join(dir, 'manifest.json'))
    writeFileSync(join(dir, 'math.json'), JSON.stringify({ id: 'broken-math', reels: 'not-a-number' }))

    expect(() => loadGamePacks(gamesDir)).toThrow()
  })

  it('_로 시작하는 폴더는 경고 없이 건너뛴다', () => {
    const gamesDir = makeGamesDir()
    mkdirSync(join(gamesDir, '_template', 'art'), { recursive: true })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(loadGamePacks(gamesDir).map((pack) => pack.id)).toEqual(['classic-777'])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
