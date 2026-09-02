import { describe, expect, it } from 'vitest'
import { t } from './index'

describe('i18n t()', () => {
  it('returns English strings for the en locale', () => {
    expect(t('en', 'play')).toBe('Play')
    expect(t('en', 'comingSoon')).toBe('Coming soon')
  })

  it('returns Korean strings for the ko locale', () => {
    expect(t('ko', 'play')).toBe('플레이')
    expect(t('ko', 'comingSoon')).toBe('출시 예정')
  })

  it('interpolates {var} placeholders for both locales', () => {
    expect(t('en', 'level', { level: 7 })).toBe('Lv. 7')
    expect(t('ko', 'level', { level: 7 })).toBe('Lv. 7')
  })

  it('leaves the placeholder untouched when the variable is missing', () => {
    expect(t('en', 'level')).toBe('Lv. {level}')
  })

  it('falls back to the en dictionary when the locale is unsupported', () => {
    // @ts-expect-error 의도적으로 지원하지 않는 로케일을 전달해 폴백 동작을 검증
    expect(t('fr', 'play')).toBe('Play')
  })
})
