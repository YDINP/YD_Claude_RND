import { describe, expect, it } from 'vitest'
import type { GameMath } from '@tgslot/slot-engine'
import { groupLabel, groupMembers, localizedName, symbolLabel, winLineLabel } from './labels'

// groups는 아직 실제 GameMath 타입/스키마에 없을 수 있으므로(엔진 작업 중) 캐스트로 우회한다 —
// 이 테스트는 라벨 조회 로직만 검증하고 math.json 전체 검증과는 무관하다.
const math = {
  symbols: [
    { id: 'seven', name: { en: 'Seven', ko: '세븐' } },
    { id: 'bar1', name: { en: 'Bar 1' } },
    { id: 'bar2', name: { en: 'Bar 2' } },
    { id: 'bar3', name: { en: 'Bar 3' } },
  ],
  groups: {
    anybar: { name: { en: 'Any BAR', ko: '바 아무거나' }, members: ['bar1', 'bar2', 'bar3'] },
  },
} as unknown as GameMath

describe('localizedName', () => {
  it('returns the ko string when locale is ko and a ko translation exists', () => {
    expect(localizedName({ en: 'Seven', ko: '세븐' }, 'ko')).toBe('세븐')
  })

  it('falls back to en when locale is ko but no ko translation exists', () => {
    expect(localizedName({ en: 'Bar 1' }, 'ko')).toBe('Bar 1')
  })

  it('returns en for the en locale', () => {
    expect(localizedName({ en: 'Seven', ko: '세븐' }, 'en')).toBe('Seven')
  })
})

describe('symbolLabel', () => {
  it('resolves a declared symbol name for the locale', () => {
    expect(symbolLabel(math, 'seven', 'ko')).toBe('세븐')
    expect(symbolLabel(math, 'seven', 'en')).toBe('Seven')
  })

  it('falls back to the raw id for an unknown symbol', () => {
    expect(symbolLabel(math, 'unknown', 'en')).toBe('unknown')
  })
})

describe('groupLabel', () => {
  it('resolves a declared group name for the locale', () => {
    expect(groupLabel(math, 'anybar', 'ko')).toBe('바 아무거나')
    expect(groupLabel(math, 'anybar', 'en')).toBe('Any BAR')
  })

  it('falls back to the raw id for an unknown group', () => {
    expect(groupLabel(math, 'unknown-group', 'en')).toBe('unknown-group')
  })
})

describe('groupMembers', () => {
  it('returns the member symbol ids of a declared group', () => {
    expect(groupMembers(math, 'anybar')).toEqual(['bar1', 'bar2', 'bar3'])
  })

  it('returns an empty array for an unknown group', () => {
    expect(groupMembers(math, 'unknown-group')).toEqual([])
  })

  it('returns an empty array when math has no groups at all', () => {
    const noGroups = { symbols: math.symbols } as unknown as GameMath
    expect(groupMembers(noGroups, 'anybar')).toEqual([])
  })
})

describe('winLineLabel', () => {
  it('uses the symbol name for a plain (non-group) win', () => {
    expect(winLineLabel(math, { symbol: 'seven' }, 'en')).toBe('Seven')
  })

  it('uses the group name (not the raw symbol/group id) when the win has a group', () => {
    expect(winLineLabel(math, { symbol: 'anybar', group: 'anybar' }, 'ko')).toBe('바 아무거나')
    expect(winLineLabel(math, { symbol: 'anybar', group: 'anybar' }, 'en')).toBe('Any BAR')
  })

  it('appends "× N ways" for a ways win (Wave 1)', () => {
    expect(winLineLabel(math, { symbol: 'seven', ways: 8 }, 'en')).toBe('Seven × 8 ways')
  })

  it('keeps the "ways" word untranslated even in Korean (genre term, matches renderer example)', () => {
    expect(winLineLabel(math, { symbol: 'seven', ways: 27 }, 'ko')).toBe('세븐 × 27 ways')
  })

  it('does not append anything when ways is absent (line games)', () => {
    expect(winLineLabel(math, { symbol: 'seven', ways: undefined }, 'en')).toBe('Seven')
  })
})
