import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { listGamePackIds, mimeTypeFor, resolveGameAssetPath } from './gamesAssets'

// 실제 games/ 디렉터리 상태(다른 에이전트가 동시에 채우는 중)에 의존하지 않도록
// 고정된 fixture 디렉터리를 만들어 gamesRoot로 주입한다.
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'tgslot-games-'))
mkdirSync(path.join(fixtureRoot, 'demo-game', 'theme', 'symbols'), { recursive: true })
writeFileSync(path.join(fixtureRoot, 'demo-game', 'theme', 'theme.json'), '{}')
writeFileSync(path.join(fixtureRoot, 'demo-game', 'theme', 'symbols', 'seven.svg'), '<svg/>')
writeFileSync(path.join(fixtureRoot, 'demo-game', 'thumb.svg'), '<svg/>')
// _template 같은 스캐폴드 폴더와, 디렉터리가 아닌 항목(README.md 등)이 게임 팩 목록에서 빠지는지 검증하기 위한 fixture.
mkdirSync(path.join(fixtureRoot, '_template'), { recursive: true })
writeFileSync(path.join(fixtureRoot, '_template', 'manifest.json'), '{}')
writeFileSync(path.join(fixtureRoot, 'README.md'), '# not a game')

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true })
})

describe('resolveGameAssetPath', () => {
  it('resolves an existing file under the games root', () => {
    const result = resolveGameAssetPath('/games/demo-game/theme/theme.json', fixtureRoot)
    expect(result).toBe(path.join(fixtureRoot, 'demo-game', 'theme', 'theme.json'))
  })

  it('resolves nested asset paths (symbols)', () => {
    const result = resolveGameAssetPath('/games/demo-game/theme/symbols/seven.svg', fixtureRoot)
    expect(result).toBe(path.join(fixtureRoot, 'demo-game', 'theme', 'symbols', 'seven.svg'))
  })

  it('decodes percent-encoded segments', () => {
    const result = resolveGameAssetPath('/games/demo%2Dgame/thumb.svg', fixtureRoot)
    expect(result).toBe(path.join(fixtureRoot, 'demo-game', 'thumb.svg'))
  })

  it('strips a query string before resolving', () => {
    const result = resolveGameAssetPath('/games/demo-game/thumb.svg?v=2', fixtureRoot)
    expect(result).toBe(path.join(fixtureRoot, 'demo-game', 'thumb.svg'))
  })

  it('returns null for URLs that are not under /games/', () => {
    expect(resolveGameAssetPath('/api/games/demo-game/thumb.svg', fixtureRoot)).toBeNull()
    expect(resolveGameAssetPath('/assets/index.js', fixtureRoot)).toBeNull()
  })

  it('returns null when the file does not exist', () => {
    expect(resolveGameAssetPath('/games/demo-game/theme/theme.missing.json', fixtureRoot)).toBeNull()
    expect(resolveGameAssetPath('/games/unknown-game/thumb.svg', fixtureRoot)).toBeNull()
  })

  it('returns null for a directory path (no implicit index)', () => {
    expect(resolveGameAssetPath('/games/demo-game/theme', fixtureRoot)).toBeNull()
  })

  it('rejects path traversal outside the games root', () => {
    expect(resolveGameAssetPath('/games/../secret.txt', fixtureRoot)).toBeNull()
    expect(resolveGameAssetPath('/games/demo-game/../../secret.txt', fixtureRoot)).toBeNull()
    expect(resolveGameAssetPath('/games/..%2f..%2fsecret.txt', fixtureRoot)).toBeNull()
  })

  it('returns null for an empty relative path', () => {
    expect(resolveGameAssetPath('/games/', fixtureRoot)).toBeNull()
  })
})

describe('listGamePackIds', () => {
  it('lists game pack directories and excludes _-prefixed scaffolds and non-directories', () => {
    const result = listGamePackIds(fixtureRoot)
    expect(result).toContain('demo-game')
    expect(result).not.toContain('_template')
    expect(result).not.toContain('README.md')
  })

  it('returns an empty array when the games root does not exist', () => {
    expect(listGamePackIds(path.join(fixtureRoot, 'does-not-exist'))).toEqual([])
  })
})

describe('mimeTypeFor', () => {
  it('maps known extensions to their content type', () => {
    expect(mimeTypeFor('theme.json')).toBe('application/json')
    expect(mimeTypeFor('symbol.svg')).toBe('image/svg+xml')
    expect(mimeTypeFor('symbol.PNG')).toBe('image/png')
    expect(mimeTypeFor('symbol.webp')).toBe('image/webp')
    expect(mimeTypeFor('bg.jpg')).toBe('image/jpeg')
    expect(mimeTypeFor('bg.jpeg')).toBe('image/jpeg')
    expect(mimeTypeFor('spin.ogg')).toBe('audio/ogg')
    expect(mimeTypeFor('spin.mp3')).toBe('audio/mpeg')
  })

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(mimeTypeFor('archive.zip')).toBe('application/octet-stream')
    expect(mimeTypeFor('noext')).toBe('application/octet-stream')
  })
})
