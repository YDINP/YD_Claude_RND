import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(process.cwd(), 'src')

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(dir, entry.name))
}

/** 브라우저 전용 라이브러리. src 루트에서는 정적 import가 금지다. */
const BROWSER_ONLY = ["'pixi.js'", "'gsap'"]

describe('브라우저 전용 코드 격리', () => {
  const rootFiles = listTsFiles(srcDir)

  it('src 루트에 파일이 있다', () => {
    expect(rootFiles.length).toBeGreaterThan(5)
  })

  it('src 루트 모듈은 pixi.js와 gsap을 정적으로 import하지 않는다', () => {
    const offenders: string[] = []
    for (const file of rootFiles) {
      const source = readFileSync(file, 'utf8')
      for (const marker of BROWSER_ONLY) {
        if (source.includes(`from ${marker}`)) offenders.push(`${file} -> ${marker}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('slot-engine은 타입으로만 가져온다', () => {
    const offenders: string[] = []
    for (const file of rootFiles) {
      if (file.endsWith('.test.ts') || file.endsWith('testSupport.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const line of source.split('\n')) {
        if (!line.includes("from '@tgslot/slot-engine'")) continue
        if (!line.trimStart().startsWith('import type')) offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('pixi 진입점은 동적 import로만 연결된다', () => {
    const facade = readFileSync(join(srcDir, 'createRenderer.ts'), 'utf8')
    expect(facade).toContain("await import('./pixi/pixiRenderer.js')")
    expect(facade).not.toContain("from './pixi/")
  })

  it('해제할 때 직접 만든 텍스처를 정리한다', () => {
    // 캔버스로 만든 텍스처는 아무도 소유하지 않아 이 호출이 빠지면 GPU에 그대로 쌓인다.
    const entry = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(entry).toContain('this.ownedTextures.destroyAll()')
  })

  it('동적 import가 가리키는 파일이 실제로 있다', () => {
    // jsdom에는 캔버스가 없어 이 모듈을 실행해 볼 수 없다. 경로만이라도 붙잡아 둔다.
    expect(existsSync(join(srcDir, 'pixi', 'pixiRenderer.ts'))).toBe(true)
    const entry = readFileSync(join(srcDir, 'pixi', 'pixiRenderer.ts'), 'utf8')
    expect(entry).toContain('export async function createPixiRendererCore')
  })
})
