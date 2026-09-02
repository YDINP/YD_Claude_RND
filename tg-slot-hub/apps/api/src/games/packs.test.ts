import { describe, expect, it } from 'vitest'
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
