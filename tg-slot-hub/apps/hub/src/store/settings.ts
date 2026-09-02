/**
 * 설정 스토어 — 언어/사운드/진동/모션 줄이기. localStorage에 저장되고(`tgslot.settings`),
 * 언어는 세션의 user.locale(서버 값)과 별개로 로컬에서 즉시 우선 적용된다 — 실제 서버
 * 반영은 `SettingsSheet`가 `PATCH /me`로 따로 호출한다 (이 스토어는 네트워크를 모른다).
 */
import { create } from 'zustand'
import type { Locale } from '@tgslot/shared'
import { setAudioMuted } from '../lib/audio'

/** 'auto'면 서버가 정한 user.locale(텔레그램 language_code 기반)을 그대로 따른다 */
export type SettingsLocale = Locale | 'auto'

const STORAGE_KEY = 'tgslot.settings'

export interface SettingsState {
  locale: SettingsLocale
  sound: boolean
  haptics: boolean
  reducedMotion: boolean
}

export interface SettingsActions {
  setLocale: (locale: SettingsLocale) => void
  setSound: (on: boolean) => void
  setHaptics: (on: boolean) => void
  setReducedMotion: (on: boolean) => void
}

export type SettingsStore = SettingsState & SettingsActions

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

function isSettingsLocale(value: unknown): value is SettingsLocale {
  return value === 'en' || value === 'ko' || value === 'auto'
}

function readStoredSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const p = parsed as Record<string, unknown>
    const result: Partial<SettingsState> = {}
    if (isSettingsLocale(p.locale)) result.locale = p.locale
    if (typeof p.sound === 'boolean') result.sound = p.sound
    if (typeof p.haptics === 'boolean') result.haptics = p.haptics
    if (typeof p.reducedMotion === 'boolean') result.reducedMotion = p.reducedMotion
    return result
  } catch {
    return {}
  }
}

function writeStoredSettings(state: SettingsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage 접근 불가(프라이빗 모드 등) — 설정 저장 없이 계속 진행 */
  }
}

function buildInitialState(): SettingsState {
  const stored = readStoredSettings()
  return {
    locale: stored.locale ?? 'auto',
    sound: stored.sound ?? true,
    haptics: stored.haptics ?? true,
    reducedMotion: stored.reducedMotion ?? prefersReducedMotion(),
  }
}

const initialState = buildInitialState()
// 모듈 로드 시점의 저장된(또는 기본) 사운드 설정을 오디오 뮤트 플래그에 즉시 반영한다.
setAudioMuted(!initialState.sound)

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialState,

  setLocale(locale) {
    set({ locale })
    writeStoredSettings(get())
  },

  setSound(on) {
    set({ sound: on })
    setAudioMuted(!on)
    writeStoredSettings(get())
  },

  setHaptics(on) {
    set({ haptics: on })
    writeStoredSettings(get())
  },

  setReducedMotion(on) {
    set({ reducedMotion: on })
    writeStoredSettings(get())
  },
}))
