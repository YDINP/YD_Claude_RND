import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 팩토리는 파일 상단으로 호이스팅되므로, 그 안에서 참조할 값은 vi.hoisted()로 만들어야 한다.
const mockedHapticFeedback = vi.hoisted(() => ({
  impactOccurred: vi.fn(),
  notificationOccurred: vi.fn(),
}))

vi.mock('@telegram-apps/sdk-react', () => ({
  init: vi.fn(),
  backButton: { isSupported: vi.fn(() => false), isMounted: vi.fn(() => false), mount: vi.fn(), onClick: vi.fn(), show: vi.fn(), hide: vi.fn() },
  miniApp: { mount: vi.fn(), bindCssVars: vi.fn(), ready: vi.fn() },
  themeParams: { mount: vi.fn(), bindCssVars: vi.fn() },
  viewport: { mount: vi.fn(() => Promise.resolve()), expand: vi.fn(), bindCssVars: vi.fn() },
  hapticFeedback: mockedHapticFeedback,
  retrieveRawInitData: vi.fn(() => null),
}))

import { useSettingsStore } from '../store/settings'
import { haptic } from './tma'

describe('haptic()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ haptics: true })
  })

  it('calls the Telegram haptic bridge when haptics are enabled', () => {
    haptic('medium')
    expect(mockedHapticFeedback.impactOccurred).toHaveBeenCalledWith('medium')

    haptic('success')
    expect(mockedHapticFeedback.notificationOccurred).toHaveBeenCalledWith('success')
  })

  it('is a no-op when settings.haptics is false', () => {
    useSettingsStore.setState({ haptics: false })

    haptic('medium')
    haptic('success')

    expect(mockedHapticFeedback.impactOccurred).not.toHaveBeenCalled()
    expect(mockedHapticFeedback.notificationOccurred).not.toHaveBeenCalled()
  })
})
