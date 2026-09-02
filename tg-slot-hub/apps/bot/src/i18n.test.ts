import { describe, expect, it } from 'vitest'
import { resolveLocale, t } from './i18n.js'

describe('resolveLocale', () => {
  it('picks ko for Korean language codes', () => {
    expect(resolveLocale('ko')).toBe('ko')
    expect(resolveLocale('ko-KR')).toBe('ko')
    expect(resolveLocale('KO')).toBe('ko')
  })

  it('falls back to en for other or missing language codes', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('ru')).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
  })
})

describe('t', () => {
  it('interpolates the user name into the welcome message per locale', () => {
    expect(t('en').welcome('Alex')).toContain('Alex')
    expect(t('ko').welcome('민준')).toContain('민준')
  })

  it('provides non-empty openHub and help strings for every locale', () => {
    for (const locale of ['en', 'ko'] as const) {
      expect(t(locale).openHub.length).toBeGreaterThan(0)
      expect(t(locale).help.length).toBeGreaterThan(0)
    }
  })
})
