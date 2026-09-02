/**
 * 최소 i18n 유틸 — 플랫 키맵 + {var} 보간.
 * t()는 순수 함수(테스트 용이). useT()는 유효 locale(설정 > 세션 유저)을 자동으로 반영하는 훅.
 */
import { DEFAULT_LOCALE, type Locale } from '@tgslot/shared'
import { useSessionStore } from '../store/session'
import { useSettingsStore } from '../store/settings'
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
 * 유효 locale — settings.locale이 'auto'가 아니면 그 값을, 'auto'면 세션 유저의 locale
 * (서버가 텔레그램 language_code로 정한 값, 없으면 DEFAULT_LOCALE)을 그대로 따른다.
 * 두 스토어 모두 구독하므로 설정 화면에서 언어를 바꾸면 이 값을 쓰는 모든 컴포넌트가 즉시 리렌더된다.
 */
export function useEffectiveLocale(): Locale {
  const settingsLocale = useSettingsStore((s) => s.locale)
  const userLocale = useSessionStore((s) => s.user?.locale ?? DEFAULT_LOCALE)
  return settingsLocale === 'auto' ? userLocale : settingsLocale
}

/**
 * 유효 locale(위 `useEffectiveLocale()`)을 반영하는 번역 훅.
 * locale prop을 이미 가진 컴포넌트(GameCard, Lobby 등)는 t()를 직접 쓰는 편이
 * 테스트하기 쉽다 — 이 훅은 세션/설정 컨텍스트가 자연스러운 상위 컴포넌트용.
 */
export function useT(): (key: TranslationKey, vars?: Vars) => string {
  const locale = useEffectiveLocale()
  return (key, vars) => t(locale, key, vars)
}
