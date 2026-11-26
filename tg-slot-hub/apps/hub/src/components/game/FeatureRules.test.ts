import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from '@tgslot/slot-engine'
import { t } from '../../i18n'
import { featureRuleSections, payRuleLines } from './FeatureRules'

function pack(id: string) {
  return parseGameMath(JSON.parse(readFileSync(resolve(process.cwd(), '../../games', id, 'math.json'), 'utf8')))
}
const ko = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t('ko', key, vars)
const allLines = (id: string) => featureRuleSections(pack(id), 'ko', ko).flatMap((s) => [s.title, ...s.lines])

describe('도움말 특수 기능 규칙 카드(실제 팩)', () => {
  it('classic-777: 아무 BAR 묶음과 체리 1개 규칙', () => {
    const lines = allLines('classic-777')
    expect(lines.some((l) => l.includes('아무 BAR'))).toBe(true)
    expect(lines.some((l) => l.includes('1번 릴에 있을 때만'))).toBe(true)
    expect(payRuleLines(pack('classic-777'), ko)).toEqual([ko('ruleLinesLeftToRight'), ko('ruleHighestPerLine')])
  })

  it('royal-diamond-777: 물음표 타일은 와일드·스캐터로 바뀌지 않는다', () => {
    const lines = allLines('royal-diamond-777')
    expect(lines).toContain(ko('mysteryTitle'))
    expect(lines).toContain(ko('mysteryNoSpecial'))
  })

  it('sheriff-sixgun: 2·3·4번 릴 확장 와일드와 두 배 도전', () => {
    const lines = allLines('sheriff-sixgun')
    expect(lines).toContain(ko('expandWildRule', { reels: '2·3·4' }))
    expect(lines).toContain(ko('gambleRulesTitle'))
  })

  it('shiba-shrine: 와일드 떨어뜨리기 확률과 릴', () => {
    const math = pack('shiba-shrine')
    const drop = (math.mutations ?? []).find((m) => m.type === 'randomWild')
    expect(drop).toBeDefined()
    expect(allLines('shiba-shrine').some((l) => l.includes(`${Math.round((drop?.type === 'randomWild' ? drop.chance : 0) * 100)}%`))).toBe(true)
  })

  it('astral-clocktower: 승급 사다리를 한 카드에 모으고 와일드 릴을 알린다', () => {
    const sections = featureRuleSections(pack('astral-clocktower'), 'ko', ko)
    const upgrade = sections.filter((s) => s.title === ko('upgradeTitle'))
    expect(upgrade).toHaveLength(1)
    expect(upgrade[0]?.lines.length).toBeGreaterThan(1)
    expect(allLines('astral-clocktower')).toContain(ko('ruleWildReels', { reels: '2·3' }))
  })
})
