/**
 * 최소 i18n 유틸 — 플랫 키맵 + {var} 보간.
 * t()는 순수 함수(테스트 용이). useT()는 세션 유저의 locale을 자동으로 반영하는 훅.
 */
import { DEFAULT_LOCALE, type Locale } from '@tgslot/shared'
import { useSessionStore } from '../store/session'
import en, { type TranslationKey } from './en'
import ko from './ko'

export type { TranslationKey } from './en'

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, ko }

type Vars = Record<string, string | number>

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key]
    return value === undefined ? match : String(value)
  })
}

/**
 * 순수 번역 함수. 지원하지 않는 로케일이거나 키가 비어있으면 en으로 폴백한다.
 */
export function t(locale: Locale, key: TranslationKey, vars?: Vars): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]
  const template = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key
  return interpolate(template, vars)
}

/**
 * 현재 세션 유저의 locale(없으면 DEFAULT_LOCALE)을 반영하는 번역 훅.
 * locale prop을 이미 가진 컴포넌트(GameCard, Lobby 등)는 t()를 직접 쓰는 편이
 * 테스트하기 쉽다 — 이 훅은 세션 컨텍스트가 자연스러운 상위 컴포넌트용.
 */
export function useT(): (key: TranslationKey, vars?: Vars) => string {
  const locale = useSessionStore((s) => s.user?.locale ?? DEFAULT_LOCALE)
  return (key, vars) => t(locale, key, vars)
}
