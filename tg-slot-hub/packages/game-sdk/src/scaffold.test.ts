import { describe, expect, it } from 'vitest'
import { SCAFFOLD_FILES, isValidGameId, scaffoldGamePack, titleFromId } from './scaffold.js'

const template = {
  'manifest.json': JSON.stringify({
    id: '_template',
    name: { en: 'Template Slot', ko: '템플릿 슬롯' },
    thumbnail: '/games/_template/thumb.webp',
  }),
  'math.json': JSON.stringify({ id: '_template', reels: 3 }),
  'art/prompts.json': JSON.stringify({ game: '_template', concept: 'TODO' }),
  'art/fx.json': JSON.stringify({ fx: { default: { win: [{ type: 'pulse' }] } } }),
  'README.md': '# Template Slot\n\n생성: `pnpm --filter @tgslot/theme-gen gen games/<id>`\n',
  'CHECKLIST.md': '# 새 게임 체크리스트 — Template Slot\n',
}

describe('isValidGameId', () => {
  it('kebab-case만 받는다', () => {
    expect(isValidGameId('lucky-koi')).toBe(true)
    expect(isValidGameId('royal-diamond-777')).toBe(true)
    expect(isValidGameId('classic777')).toBe(true)
  })

  it('대문자·언더스코어·앞뒤 하이픈은 거부한다', () => {
    for (const id of ['LuckyKoi', 'lucky_koi', '-lucky', 'lucky-', '777-lucky', '']) {
      expect(isValidGameId(id)).toBe(false)
    }
  })
})

describe('titleFromId', () => {
  it('하이픈을 공백으로 바꾸고 단어마다 첫 글자를 올린다', () => {
    expect(titleFromId('royal-diamond-777')).toBe('Royal Diamond 777')
    expect(titleFromId('lucky')).toBe('Lucky')
  })
})

describe('scaffoldGamePack', () => {
  it('템플릿의 모든 파일을 만든다', () => {
    const { files, skipped } = scaffoldGamePack('lucky-koi', template)
    expect(Object.keys(files).sort()).toEqual([...SCAFFOLD_FILES].sort())
    expect(skipped).toEqual([])
  })

  it('id를 manifest·math·prompts에 모두 치환한다', () => {
    const { files } = scaffoldGamePack('lucky-koi', template)
    const manifest = JSON.parse(files['manifest.json'] as string) as { id: string; thumbnail: string }
    expect(manifest.id).toBe('lucky-koi')
    expect(manifest.thumbnail).toBe('/games/lucky-koi/thumb.webp')
    expect((JSON.parse(files['math.json'] as string) as { id: string }).id).toBe('lucky-koi')
    expect((JSON.parse(files['art/prompts.json'] as string) as { game: string }).game).toBe('lucky-koi')
  })

  it('표시 이름을 id에서 만든 제목으로 바꾼다 (en/ko 둘 다)', () => {
    const { files } = scaffoldGamePack('lucky-koi', template)
    const manifest = JSON.parse(files['manifest.json'] as string) as { name: { en: string; ko: string } }
    expect(manifest.name).toEqual({ en: 'Lucky Koi', ko: 'Lucky Koi' })
  })

  it('문서 안의 템플릿 이름도 바꾼다', () => {
    const { files } = scaffoldGamePack('lucky-koi', template)
    expect(files['README.md']).toContain('# Lucky Koi')
    expect(files['CHECKLIST.md']).toContain('Lucky Koi')
    expect(files['README.md']).not.toContain('Template Slot')
  })

  it('fx 원본은 그대로 복사한다 (심볼 id는 math를 따라가므로 사람이 고친다)', () => {
    const { files } = scaffoldGamePack('lucky-koi', template)
    expect(JSON.parse(files['art/fx.json'] as string)).toEqual({ fx: { default: { win: [{ type: 'pulse' }] } } })
  })

  it('템플릿에 없는 파일은 건너뛰고 목록으로 알린다', () => {
    const partial = { 'manifest.json': template['manifest.json'], 'math.json': template['math.json'] }
    const { files, skipped } = scaffoldGamePack('lucky-koi', partial)
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'math.json'])
    expect(skipped).toEqual(['art/prompts.json', 'art/fx.json', 'README.md', 'CHECKLIST.md'])
  })

  it('id가 kebab-case가 아니면 던진다', () => {
    expect(() => scaffoldGamePack('Lucky_Koi', template)).toThrow(/kebab-case/)
  })
})
