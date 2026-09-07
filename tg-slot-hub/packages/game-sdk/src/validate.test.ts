import { describe, expect, it } from 'vitest'
import { PACK_FILES } from './pack.js'
import type { PackProblem } from './pack.js'
import { checkGamePack, normalizePackPath, parseGamePack, resolveThemePath, thumbnailPackPath } from './validate.js'
import {
  FIXTURE_ID,
  clone,
  createFixtureSource,
  fixtureManifest,
  fixtureMath,
  fixturePrompts,
  fixtureTheme,
} from './testSupport.js'
import type { FixtureOverrides } from './testSupport.js'

function check(overrides: FixtureOverrides = {}): PackProblem[] {
  return checkGamePack(createFixtureSource(overrides), FIXTURE_ID)
}

/** 문제 목록에서 (파일, 필드) 하나를 찾는다. */
function find(problems: PackProblem[], file: string, field: string): PackProblem | undefined {
  return problems.find((problem) => problem.file === file && problem.field === field)
}

const json = (value: unknown): string => JSON.stringify(value)

describe('checkGamePack — 멀쩡한 팩', () => {
  it('문제를 하나도 내지 않는다', () => {
    expect(check()).toEqual([])
  })
})

describe('checkGamePack — 정체성', () => {
  it('manifest.id가 폴더 이름과 다르면 오류다', () => {
    const manifest = { ...fixtureManifest, id: 'other' }
    const problems = check({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'id')?.level).toBe('error')
  })

  it('prompts.game이 폴더 이름과 다르면 오류다', () => {
    const prompts = { ...fixturePrompts, game: 'other' }
    const problems = check({ files: { [PACK_FILES.prompts]: json(prompts) } })
    expect(find(problems, PACK_FILES.prompts, 'game')?.level).toBe('error')
  })
})

describe('checkGamePack — manifest와 math의 합의', () => {
  it('라인 수가 다르면 오류다', () => {
    const manifest = { ...fixtureManifest, lines: 5 }
    const problems = check({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'lines')?.message).toContain('paylines 개수(1)')
  })

  it('betLevels가 다르면 오류다', () => {
    const manifest = { ...fixtureManifest, betLevels: [10, 20] }
    const problems = check({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'betLevels')?.level).toBe('error')
  })

  it('rtpTarget이 다르면 오류다', () => {
    const manifest = { ...fixtureManifest, rtpTarget: 0.9 }
    const math = { ...fixtureMath, rtpTarget: 0.95 }
    const problems = check({ files: { [PACK_FILES.manifest]: json(manifest), [PACK_FILES.math]: json(math) } })
    expect(find(problems, PACK_FILES.manifest, 'rtpTarget')?.level).toBe('error')
  })

  it('rtpTotalTarget이 rtpTarget + jackpotContribution과 안 맞으면 경고다', () => {
    const manifest = { ...fixtureManifest, jackpotContribution: 0.015, rtpTotalTarget: 0.99 }
    const problems = check({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'rtpTotalTarget')?.level).toBe('warn')
  })
})

describe('checkGamePack — 끊어진 자산 참조', () => {
  it('심볼 이미지가 없으면 오류다', () => {
    const problems = check({ removeBinaries: ['theme/symbols/wild.webp'] })
    expect(find(problems, PACK_FILES.theme, 'symbols.wild')?.message).toContain('theme/symbols/wild.webp')
  })

  it('배경 이미지가 없으면 오류다', () => {
    const problems = check({ removeBinaries: ['theme/bg.webp'] })
    expect(find(problems, PACK_FILES.theme, 'background')?.level).toBe('error')
  })

  it('프레임 이미지가 없으면 오류다', () => {
    const theme = { ...fixtureTheme, frame: 'frame.webp' }
    const problems = check({ files: { [PACK_FILES.theme]: json(theme) } })
    expect(find(problems, PACK_FILES.theme, 'frame')?.message).toContain('theme/frame.webp')
  })

  it('시트 사이드카는 있는데 아틀라스 webp가 없으면 오류다', () => {
    const theme = { ...fixtureTheme, sheets: { wild: { win: 'sheets/wild-win.json' } } }
    const problems = check({
      files: { [PACK_FILES.theme]: json(theme) },
      extraBinaries: ['theme/sheets/wild-win.json'],
    })
    const problem = find(problems, PACK_FILES.theme, 'sheets.wild.win')
    expect(problem?.message).toContain('theme/sheets/wild-win.webp')
    expect(problem?.level).toBe('error')
  })

  it('전환 클립이 없으면 오류다', () => {
    const theme = { ...fixtureTheme, transitions: { freeSpinsEnter: { src: 'transitions/fs-enter.webm' } } }
    const problems = check({ files: { [PACK_FILES.theme]: json(theme) } })
    expect(find(problems, PACK_FILES.theme, 'transitions.freeSpinsEnter')?.message).toContain('transitions/fs-enter.webm')
  })

  it('전환 클립이 실제로 있으면 통과하고 고아로도 잡지 않는다', () => {
    const theme = { ...fixtureTheme, transitions: { freeSpinsEnter: { src: 'transitions/fs-enter.webm' } } }
    const problems = check({
      files: { [PACK_FILES.theme]: json(theme) },
      extraBinaries: ['theme/transitions/fs-enter.webm'],
    })
    expect(problems).toEqual([])
  })

  it('썸네일이 없으면 오류다 (prompts에도 없는 경우)', () => {
    const prompts = { ...fixturePrompts, assets: fixturePrompts.assets.filter((asset) => asset.id !== 'thumb') }
    const problems = check({ files: { [PACK_FILES.prompts]: json(prompts) }, removeBinaries: ['thumb.webp'] })
    expect(find(problems, PACK_FILES.manifest, 'thumbnail')?.level).toBe('error')
  })

  it('썸네일이 prompts가 만들 파일이면 아직 없어도 경고다', () => {
    const problems = check({ removeBinaries: ['thumb.webp'] })
    expect(find(problems, PACK_FILES.manifest, 'thumbnail')?.level).toBe('warn')
  })

  it('128px 썸네일이 없으면 경고다', () => {
    const problems = check({ removeBinaries: ['theme/symbols/wild@128.webp'] })
    expect(problems.some((problem) => problem.message.includes('theme/symbols/wild@128.webp'))).toBe(true)
    expect(problems.every((problem) => problem.level === 'warn')).toBe(true)
  })
})

describe('checkGamePack — 심볼 대응', () => {
  it('math에 있는데 theme에 없는 심볼은 오류다', () => {
    const theme = { ...fixtureTheme, symbols: { wild: 'symbols/wild.webp' } }
    const problems = check({ files: { [PACK_FILES.theme]: json(theme) } })
    expect(find(problems, PACK_FILES.theme, 'symbols.cherry')?.level).toBe('error')
  })

  it('theme에만 있는 심볼은 경고다', () => {
    const theme = { ...fixtureTheme, symbols: { ...fixtureTheme.symbols, ghost: 'symbols/ghost.webp' } }
    const problems = check({
      files: { [PACK_FILES.theme]: json(theme) },
      extraBinaries: ['theme/symbols/ghost.webp', 'theme/symbols/ghost@128.webp'],
    })
    expect(find(problems, PACK_FILES.theme, 'symbols.ghost')?.level).toBe('warn')
  })

  it('prompts의 symbol asset id가 math에 없으면 오류다', () => {
    const prompts = clone(fixturePrompts)
    prompts.assets[0] = { ...prompts.assets[0], id: 'ghost', out: 'theme/symbols/ghost.webp' } as never
    const problems = check({ files: { [PACK_FILES.prompts]: json(prompts) } })
    expect(find(problems, PACK_FILES.prompts, 'assets.0(ghost).id')?.level).toBe('error')
  })

  it('prompts의 sheet symbol이 math에 없으면 오류다', () => {
    const prompts = clone(fixturePrompts)
    prompts.assets.push({
      id: 'ghost-win',
      kind: 'sheet',
      symbol: 'ghost',
      grid: { cols: 3, rows: 3 },
      fps: 12,
      prompt: 'p',
      size: '1024x1024',
      out: 'theme/sheets/ghost-win.webp',
      outSize: 768,
    } as never)
    const problems = check({ files: { [PACK_FILES.prompts]: json(prompts) } })
    expect(find(problems, PACK_FILES.prompts, 'assets.4(ghost-win).symbol')?.level).toBe('error')
  })

  it('math 심볼을 그리는 asset이 아예 없으면 경고다', () => {
    const prompts = { ...fixturePrompts, assets: fixturePrompts.assets.filter((asset) => asset.id !== 'cherry') }
    const problems = check({ files: { [PACK_FILES.prompts]: json(prompts) } })
    expect(problems.some((problem) => problem.message.includes('심볼 cherry를 그리는 asset이 없다'))).toBe(true)
  })
})

describe('checkGamePack — 연출 원본', () => {
  it('art/fx.json이 없으면 원본을 옮기라고 경고한다', () => {
    const problems = check({ files: { [PACK_FILES.fx]: null } })
    expect(find(problems, PACK_FILES.fx, '')?.message).toContain('연출 원본이 없다')
  })

  it('원본과 theme.json의 fx가 다르면 경고한다', () => {
    const drifted = { fx: { default: { win: [{ type: 'glow', color: '#ffffff' }] } } }
    const problems = check({ files: { [PACK_FILES.fx]: json(drifted) } })
    expect(find(problems, PACK_FILES.theme, 'fx')?.message).toContain('내용이 다르다')
  })

  it('원본은 있는데 theme.json에 반영되지 않았으면 경고한다', () => {
    const theme = { ...fixtureTheme }
    delete (theme as { fx?: unknown }).fx
    const problems = check({ files: { [PACK_FILES.theme]: json(theme) } })
    expect(find(problems, PACK_FILES.theme, 'fx')?.message).toContain('반영되지 않았다')
  })

  it('스키마가 모르는 fx 필드는 원본 파일을 짚어 경고한다', () => {
    const withUnknown = { fx: { default: { win: [{ type: 'flash', fromAlpha: 0.4 }] } } }
    const problems = check({ files: { [PACK_FILES.fx]: json(withUnknown) } })
    const problem = find(problems, PACK_FILES.fx, 'fx.default.win.0.fromAlpha')
    expect(problem?.message).toContain('조용히 버려진다')
  })

  it('fx 키가 심볼 id도 default도 아니면 경고한다', () => {
    const problems = check({ files: { [PACK_FILES.fx]: json({ fx: { ghost: { win: [{ type: 'pulse' }] } } }) } })
    expect(find(problems, PACK_FILES.fx, 'fx.ghost')?.level).toBe('warn')
  })
})

describe('checkGamePack — 고아 파일', () => {
  it('아무도 참조하지 않는 파일을 짚는다', () => {
    const problems = check({ extraBinaries: ['theme/symbols/old.svg'] })
    expect(find(problems, 'theme/symbols/old.svg', '')?.message).toContain('아무도 참조하지 않는')
  })

  it('art/raw/는 재처리용이라 고아가 아니다', () => {
    expect(check({ extraBinaries: ['art/raw/wild.png'] })).toEqual([])
  })

  it('README.md 같은 문서는 고아가 아니다', () => {
    expect(check({ files: { 'CHECKLIST.md': '# x' } })).toEqual([])
  })

  it('--no-orphans면 검사하지 않는다', () => {
    const source = createFixtureSource({ extraBinaries: ['theme/symbols/old.svg'] })
    expect(checkGamePack(source, FIXTURE_ID, { orphans: false })).toEqual([])
  })
})

/**
 * `stage: 'serving'` — 팩을 **돌리는** 쪽(API 부팅 등)이 필요로 하는 것만 본다.
 * 저작 파이프라인 위생(git 추적·고아 파일·prompts.json 정합성 등)은 아직 다 그리지 않은 팩이
 * 정상적으로 갖는 상태라 여기서는 문제로 잡지 않는다 — 이게 잡히면 서버 부팅이 막힌다.
 */
function checkServing(overrides: FixtureOverrides = {}): PackProblem[] {
  return checkGamePack(createFixtureSource(overrides), FIXTURE_ID, { stage: 'serving' })
}

describe('checkGamePack — stage: serving', () => {
  it('멀쩡한 팩은 문제를 내지 않는다', () => {
    expect(checkServing()).toEqual([])
  })

  it('manifest.id가 폴더 이름과 다르면 여전히 오류다', () => {
    const manifest = { ...fixtureManifest, id: 'other' }
    const problems = checkServing({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'id')?.level).toBe('error')
  })

  it('manifest와 math의 합의가 깨지면 여전히 오류다', () => {
    const manifest = { ...fixtureManifest, betLevels: [10, 20] }
    const problems = checkServing({ files: { [PACK_FILES.manifest]: json(manifest) } })
    expect(find(problems, PACK_FILES.manifest, 'betLevels')?.level).toBe('error')
  })

  it('런타임이 받아가는 심볼 이미지가 없으면 여전히 오류다', () => {
    const problems = checkServing({ removeBinaries: ['theme/symbols/wild.webp'] })
    expect(find(problems, PACK_FILES.theme, 'symbols.wild')?.level).toBe('error')
  })

  it('prompts.game이 폴더 이름과 달라도 보지 않는다 (저작 전용 검사)', () => {
    const prompts = { ...fixturePrompts, game: 'other' }
    expect(checkServing({ files: { [PACK_FILES.prompts]: json(prompts) } })).toEqual([])
  })

  it('prompts.json의 asset id가 math와 안 맞아도 보지 않는다 (astral-clocktower류 사고 재발 방지)', () => {
    const prompts = clone(fixturePrompts)
    prompts.assets[0] = { ...prompts.assets[0], id: 'ghost', out: 'theme/symbols/ghost.webp' } as never
    expect(checkServing({ files: { [PACK_FILES.prompts]: json(prompts) } })).toEqual([])
  })

  it('128px 썸네일이 없어도 보지 않는다 (저작 전용 검사)', () => {
    expect(checkServing({ removeBinaries: ['theme/symbols/wild@128.webp'] })).toEqual([])
  })

  it('자산이 untracked여도 보지 않는다 (저작 전용 검사)', () => {
    expect(checkServing({ tracked: [] })).toEqual([])
  })

  it('고아 파일이 있어도 보지 않는다 (저작 전용 검사)', () => {
    expect(checkServing({ extraBinaries: ['theme/symbols/old.svg'] })).toEqual([])
  })

  it('art/fx.json이 theme.json.fx와 어긋나도 보지 않는다 (저작 전용 검사)', () => {
    const drifted = { fx: { default: { win: [{ type: 'glow', color: '#ffffff' }] } } }
    expect(checkServing({ files: { [PACK_FILES.fx]: json(drifted) } })).toEqual([])
  })

  it('테마가 아예 없어도 경고조차 내지 않는다 — 아트 파이프라인이 늦게 도는 것은 정상이다', () => {
    const problems = checkServing({ files: { [PACK_FILES.theme]: null } })
    expect(problems).toEqual([])
  })

  it('테마가 없고 prompts도 math와 안 맞는 hidden류 팩 전체가 통과한다', () => {
    // astral-clocktower가 실제로 겪은 상태 재현: manifest+math는 멀쩡한데 아트/프롬프트가 아직 안 맞는다.
    const prompts = clone(fixturePrompts)
    prompts.assets[0] = { ...prompts.assets[0], id: 'ghost', out: 'theme/symbols/ghost.webp' } as never
    const problems = checkServing({
      files: { [PACK_FILES.theme]: null, [PACK_FILES.prompts]: json(prompts) },
      removeBinaries: ['theme/symbols/wild@128.webp', 'theme/symbols/cherry@128.webp'],
    })
    expect(problems).toEqual([])
  })
})

describe('parseGamePack', () => {
  it('멀쩡한 팩을 돌려준다', () => {
    expect(parseGamePack(createFixtureSource(), FIXTURE_ID).id).toBe(FIXTURE_ID)
  })

  it('오류가 있으면 던지고 문제 목록을 함께 싣는다', () => {
    const source = createFixtureSource({ removeBinaries: ['theme/symbols/wild.webp'] })
    expect(() => parseGamePack(source, FIXTURE_ID)).toThrow(/게임 팩 검증 실패/)
    try {
      parseGamePack(source, FIXTURE_ID)
    } catch (error) {
      expect((error as { problems: PackProblem[] }).problems.length).toBeGreaterThan(0)
    }
  })

  it('경고만 있으면 던지지 않는다', () => {
    const source = createFixtureSource({ extraBinaries: ['theme/symbols/old.svg'] })
    expect(() => parseGamePack(source, FIXTURE_ID)).not.toThrow()
  })
})

describe('경로 계산', () => {
  it('normalizePackPath는 구분자를 통일하고 . / ..를 접는다', () => {
    expect(normalizePackPath('theme\\symbols\\wild.webp')).toBe('theme/symbols/wild.webp')
    expect(normalizePackPath('./theme/../thumb.webp')).toBe('thumb.webp')
  })

  it('resolveThemePath는 theme.json 기준 경로를 팩 기준으로 바꾼다', () => {
    expect(resolveThemePath('symbols/wild.webp')).toBe('theme/symbols/wild.webp')
    expect(resolveThemePath('../thumb.webp')).toBe('thumb.webp')
  })

  it('thumbnailPackPath는 규약에 맞는 URL만 푼다', () => {
    expect(thumbnailPackPath('/games/demo/thumb.webp', 'demo')).toBe('thumb.webp')
    expect(thumbnailPackPath('https://cdn/thumb.webp', 'demo')).toBeUndefined()
    expect(thumbnailPackPath('/games/other/thumb.webp', 'demo')).toBeUndefined()
  })
})

describe('checkGamePack — git 추적', () => {
  it('추적 정보를 모르면 (git 없는 환경) 이 검사만 건너뛴다', () => {
    // tracked를 주지 않으면 listTracked 자체가 없다.
    expect(check()).toEqual([])
  })

  it('참조된 자산이 전부 추적 중이면 문제가 없다', () => {
    expect(check({ tracked: 'all' })).toEqual([])
  })

  it('참조된 전환 클립이 untracked면 오류다 (커밋하면 배포본에서 사라진다)', () => {
    const theme = { ...fixtureTheme, transitions: { freeSpinsEnter: { src: 'transitions/fs-enter.webm' } } }
    const source = createFixtureSource({
      files: { [PACK_FILES.theme]: json(theme) },
      extraBinaries: ['theme/transitions/fs-enter.webm'],
      tracked: [
        PACK_FILES.manifest,
        PACK_FILES.math,
        PACK_FILES.theme,
        PACK_FILES.prompts,
        PACK_FILES.fx,
        'theme/symbols/wild.webp',
        'theme/symbols/wild@128.webp',
        'theme/symbols/cherry.webp',
        'theme/symbols/cherry@128.webp',
        'theme/bg.webp',
        'thumb.webp',
        'README.md',
      ],
    })
    const problems = checkGamePack(source, FIXTURE_ID)
    const problem = find(problems, PACK_FILES.theme, 'transitions.freeSpinsEnter')
    expect(problem?.level).toBe('error')
    expect(problem?.message).toContain('git에 추적되지 않는다')
    expect(problem?.message).toContain('theme/transitions/fs-enter.webm')
  })

  it('심볼 이미지가 untracked면 오류다', () => {
    const problems = check({ tracked: ['manifest.json', 'math.json', 'theme/theme.json'] })
    expect(find(problems, PACK_FILES.theme, 'symbols.wild')?.message).toContain('git에 추적되지 않는다')
  })

  it('썸네일이 untracked면 오류다', () => {
    const problems = check({ tracked: [] })
    expect(find(problems, PACK_FILES.manifest, 'thumbnail')?.message).toContain('git에 추적되지 않는다')
  })

  it('시트 아틀라스가 untracked면 오류다 (사이드카만 추적된 경우)', () => {
    const theme = { ...fixtureTheme, sheets: { wild: { win: 'sheets/wild-win.json' } } }
    const problems = checkGamePack(
      createFixtureSource({
        files: { [PACK_FILES.theme]: json(theme) },
        extraBinaries: ['theme/sheets/wild-win.json', 'theme/sheets/wild-win.webp'],
        tracked: ['theme/sheets/wild-win.json'],
      }),
      FIXTURE_ID,
    )
    const messages = problems.filter((problem) => problem.message.includes('git에 추적되지 않는다')).map((p) => p.message)
    expect(messages.some((message) => message.includes('theme/sheets/wild-win.webp'))).toBe(true)
  })

  it('gitignore된 art/raw/는 추적 검사에서 뺀다', () => {
    expect(check({ tracked: 'all', extraBinaries: ['art/raw/wild.png'] })).toEqual([])
  })

  it('파일 자체가 없으면 추적 오류를 겹쳐 찍지 않는다', () => {
    const problems = check({ tracked: [], removeBinaries: ['theme/symbols/wild.webp'] })
    const forSymbol = problems.filter((problem) => problem.field === 'symbols.wild')
    expect(forSymbol).toHaveLength(1)
    expect(forSymbol[0]?.message).toContain('파일이 없다')
  })

  it('128px 썸네일은 렌더러가 직접 받지 않으므로 추적 검사 대상이 아니다', () => {
    const problems = check({
      tracked: [
        PACK_FILES.manifest,
        PACK_FILES.math,
        PACK_FILES.theme,
        PACK_FILES.prompts,
        PACK_FILES.fx,
        'theme/symbols/wild.webp',
        'theme/symbols/cherry.webp',
        'theme/bg.webp',
        'thumb.webp',
        'README.md',
      ],
    })
    expect(problems).toEqual([])
  })
})
