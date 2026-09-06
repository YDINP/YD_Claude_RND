import { describe, expect, it } from 'vitest'
import { PACK_FILES, formatProblem, hasErrors, inspectGamePack } from './pack.js'
import { FIXTURE_ID, clone, createFixtureSource, fixtureMath, fixtureTheme } from './testSupport.js'

const inspect = (source = createFixtureSource()) => inspectGamePack(source, FIXTURE_ID)

describe('inspectGamePack', () => {
  it('멀쩡한 팩은 문제 없이 조립된다', () => {
    const result = inspect()
    expect(result.problems).toEqual([])
    expect(result.pack?.manifest.id).toBe(FIXTURE_ID)
    expect(result.pack?.math.symbols).toHaveLength(2)
    expect(result.pack?.hasTheme).toBe(true)
    expect(result.pack?.hasFxSource).toBe(true)
  })

  it('manifest.json이 없으면 오류로 기록하고 팩을 만들지 않는다', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.manifest]: null } }))
    expect(result.pack).toBeNull()
    expect(result.problems).toContainEqual({ level: 'error', file: PACK_FILES.manifest, field: '', message: '파일이 없다' })
  })

  it('math.json이 없으면 오류로 기록한다', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.math]: null } }))
    expect(result.pack).toBeNull()
    expect(result.problems).toContainEqual({ level: 'error', file: PACK_FILES.math, field: '', message: '파일이 없다' })
  })

  it('JSON이 깨졌으면 파일을 짚어 오류로 기록한다', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.theme]: '{ not json' } }))
    expect(result.pack).toBeNull()
    const problem = result.problems.find((found) => found.file === PACK_FILES.theme)
    expect(problem?.message).toMatch(/JSON 파싱 실패/)
  })

  it('스키마 위반은 필드 경로까지 짚는다', () => {
    const broken = clone(fixtureMath) as { paytable: Record<string, Record<string, number>> }
    broken.paytable = { wild: { '2': 10 }, ghost: { '2': 4 } }
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.math]: JSON.stringify(broken) } }))
    expect(result.pack).toBeNull()
    expect(result.problems.some((found) => found.file === PACK_FILES.math && found.field.startsWith('paytable'))).toBe(true)
  })

  it('theme이 없으면 빈 테마로 채우고 hasTheme를 false로 둔다', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.theme]: null } }))
    expect(result.pack?.hasTheme).toBe(false)
    expect(result.pack?.theme.symbols).toEqual({})
  })

  it('art/fx.json이 없으면 theme.json의 fx를 원본으로 삼는다', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.fx]: null } }))
    expect(result.pack?.hasFxSource).toBe(false)
    expect(result.pack?.fx).toEqual(fixtureTheme.fx)
  })

  it('fx도 theme도 없으면 빈 맵이다 (널 오브젝트)', () => {
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.fx]: null, [PACK_FILES.theme]: null } }))
    expect(result.pack?.fx).toEqual({})
  })

  it('rawFx는 스키마가 버린 필드까지 보존한다', () => {
    const withUnknown = { fx: { default: { win: [{ type: 'flash', fromAlpha: 0.4 }] } } }
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.fx]: JSON.stringify(withUnknown) } }))
    expect(JSON.stringify(result.pack?.rawFx)).toContain('fromAlpha')
    expect(JSON.stringify(result.pack?.fx)).not.toContain('fromAlpha')
  })

  it('prompts.json의 asset id가 중복되면 오류다', () => {
    const prompts = {
      game: FIXTURE_ID,
      concept: 'c',
      stylePrefix: 's',
      negative: 'n',
      assets: [
        { id: 'wild', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'theme/symbols/wild.webp', outSize: 512 },
        { id: 'wild', kind: 'symbol', prompt: 'p', size: '1024x1024', out: 'theme/symbols/wild2.webp', outSize: 512 },
      ],
    }
    const result = inspect(createFixtureSource({ files: { [PACK_FILES.prompts]: JSON.stringify(prompts) } }))
    expect(result.problems.some((found) => found.message.includes('asset id가 중복된다'))).toBe(true)
  })
})

describe('formatProblem', () => {
  it('파일과 필드를 한 줄로 붙인다', () => {
    const line = formatProblem('demo', { level: 'error', file: 'theme/theme.json', field: 'symbols.wild', message: '없다' })
    expect(line).toBe('ERROR demo theme/theme.json symbols.wild — 없다')
  })

  it('필드가 없으면 그 자리를 비운다', () => {
    const line = formatProblem('demo', { level: 'warn', file: 'art/fx.json', field: '', message: '없다' })
    expect(line).toBe('WARN  demo art/fx.json — 없다')
  })
})

describe('hasErrors', () => {
  it('경고만 있으면 실패가 아니다', () => {
    expect(hasErrors([{ level: 'warn', file: '', field: '', message: 'x' }])).toBe(false)
    expect(hasErrors([{ level: 'error', file: '', field: '', message: 'x' }])).toBe(true)
  })
})
