import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('defaults to ko locale, sound/haptics on, reducedMotion off, and normal spin speed when nothing is stored', async () => {
    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()
    expect(state.locale).toBe('ko')
    expect(state.sound).toBe(true)
    expect(state.haptics).toBe(true)
    expect(state.reducedMotion).toBe(false)
    expect(state.spinSpeed).toBe('normal')
  })

  it('persists changes to localStorage under tgslot.settings', async () => {
    const { useSettingsStore } = await import('./settings')

    useSettingsStore.getState().setLocale('ko')
    useSettingsStore.getState().setSound(false)
    useSettingsStore.getState().setHaptics(false)
    useSettingsStore.getState().setReducedMotion(true)
    useSettingsStore.getState().setSpinSpeed('turbo')

    const stored = JSON.parse(localStorage.getItem('tgslot.settings') ?? '{}')
    expect(stored).toEqual({
      locale: 'ko',
      sound: false,
      sfxVolume: 100,
      bgm: true,
      bgmVolume: 40,
      haptics: false,
      reducedMotion: true,
      spinSpeed: 'turbo',
    })
  })

  it('persists the SFX volume clamped to 0..100 and restores it on the next load', async () => {
    const { useSettingsStore } = await import('./settings')
    expect(useSettingsStore.getState().sfxVolume).toBe(100)

    useSettingsStore.getState().setSfxVolume(35)
    expect(JSON.parse(localStorage.getItem('tgslot.settings') ?? '{}').sfxVolume).toBe(35)
    useSettingsStore.getState().setSfxVolume(250)
    expect(useSettingsStore.getState().sfxVolume).toBe(100)
    useSettingsStore.getState().setSfxVolume(-5)
    expect(useSettingsStore.getState().sfxVolume).toBe(0)

    useSettingsStore.getState().setSfxVolume(60)
    vi.resetModules()
    const reloaded = await import('./settings')
    expect(reloaded.useSettingsStore.getState().sfxVolume).toBe(60)
  })

  it('defaults music to on at 40, persists the toggle and clamped volume, and restores them', async () => {
    const { useSettingsStore } = await import('./settings')
    const audio = await import('../lib/audio')
    expect(useSettingsStore.getState().bgm).toBe(true)
    expect(useSettingsStore.getState().bgmVolume).toBe(40)
    expect(audio.isBgmEnabled()).toBe(true)
    expect(audio.getBgmVolume()).toBe(40)

    useSettingsStore.getState().setBgm(false)
    useSettingsStore.getState().setBgmVolume(130)
    expect(useSettingsStore.getState().bgmVolume).toBe(100)
    useSettingsStore.getState().setBgmVolume(25)
    expect(audio.isBgmEnabled()).toBe(false)
    expect(audio.getBgmVolume()).toBe(25)
    const stored = JSON.parse(localStorage.getItem('tgslot.settings') ?? '{}')
    expect(stored.bgm).toBe(false)
    expect(stored.bgmVolume).toBe(25)

    vi.resetModules()
    const reloaded = await import('./settings')
    expect(reloaded.useSettingsStore.getState().bgm).toBe(false)
    expect(reloaded.useSettingsStore.getState().bgmVolume).toBe(25)
  })

  it('ignores malformed stored music values', async () => {
    localStorage.setItem('tgslot.settings', JSON.stringify({ bgm: 'yes', bgmVolume: 'loud' }))
    const { useSettingsStore } = await import('./settings')
    expect(useSettingsStore.getState().bgm).toBe(true)
    expect(useSettingsStore.getState().bgmVolume).toBe(40)
  })

  it('restores persisted settings on the next module load', async () => {
    localStorage.setItem(
      'tgslot.settings',
      JSON.stringify({ locale: 'ko', sound: false, haptics: false, reducedMotion: true, spinSpeed: 'quick' }),
    )

    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()

    expect(state.locale).toBe('ko')
    expect(state.sound).toBe(false)
    expect(state.haptics).toBe(false)
    expect(state.reducedMotion).toBe(true)
    expect(state.spinSpeed).toBe('quick')
  })

  it('cycles through spin speeds and ignores a malformed stored spinSpeed value', async () => {
    localStorage.setItem('tgslot.settings', JSON.stringify({ spinSpeed: 'ludicrous' }))
    const { useSettingsStore } = await import('./settings')

    expect(useSettingsStore.getState().spinSpeed).toBe('normal')

    useSettingsStore.getState().setSpinSpeed('quick')
    expect(useSettingsStore.getState().spinSpeed).toBe('quick')
    useSettingsStore.getState().setSpinSpeed('turbo')
    expect(useSettingsStore.getState().spinSpeed).toBe('turbo')
  })

  it('ignores malformed stored JSON and falls back to defaults', async () => {
    localStorage.setItem('tgslot.settings', '{not json')

    const { useSettingsStore } = await import('./settings')
    const state = useSettingsStore.getState()

    expect(state.locale).toBe('ko')
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
