import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('defaults to auto locale, sound/haptics on, and reducedMotion off when nothing is stored', async () => {
    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()
    expect(state.locale).toBe('auto')
    expect(state.sound).toBe(true)
    expect(state.haptics).toBe(true)
    expect(state.reducedMotion).toBe(false)
  })

  it('persists changes to localStorage under tgslot.settings', async () => {
    const { useSettingsStore } = await import('./settings')

    useSettingsStore.getState().setLocale('ko')
    useSettingsStore.getState().setSound(false)
    useSettingsStore.getState().setHaptics(false)
    useSettingsStore.getState().setReducedMotion(true)

    const stored = JSON.parse(localStorage.getItem('tgslot.settings') ?? '{}')
    expect(stored).toEqual({ locale: 'ko', sound: false, haptics: false, reducedMotion: true })
  })

  it('restores persisted settings on the next module load', async () => {
    localStorage.setItem(
      'tgslot.settings',
      JSON.stringify({ locale: 'ko', sound: false, haptics: false, reducedMotion: true }),
    )

    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()

    expect(state.locale).toBe('ko')
    expect(state.sound).toBe(false)
    expect(state.haptics).toBe(false)
    expect(state.reducedMotion).toBe(true)
  })

  it('ignores malformed stored JSON and falls back to defaults', async () => {
    localStorage.setItem('tgslot.settings', '{not json')

    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()

    expect(state.locale).toBe('auto')
    expect(state.sound).toBe(true)
  })

  it('mutes the audio flag when sound is turned off, and unmutes when turned back on', async () => {
    const { useSettingsStore } = await import('./settings')
    const { isAudioMuted } = await import('../lib/audio')

    expect(isAudioMuted()).toBe(false)

    useSettingsStore.getState().setSound(false)
    expect(isAudioMuted()).toBe(true)

    useSettingsStore.getState().setSound(true)
    expect(isAudioMuted()).toBe(false)
  })
})
