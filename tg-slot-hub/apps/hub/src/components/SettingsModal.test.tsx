import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicUser } from '@tgslot/shared'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, patchMe: vi.fn() }
})

import { patchMe } from '../sdk/api'
import { useSessionStore } from '../store/session'
import { useSettingsStore } from '../store/settings'
import { SettingsModal } from './SettingsModal'

const mockedPatchMe = vi.mocked(patchMe)

const baseUser: PublicUser = {
  id: 'u1',
  telegramId: 424242,
  firstName: 'Dev',
  locale: 'en',
  level: 1,
  xp: 0,
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'auto', sound: true, haptics: true, reducedMotion: false, spinSpeed: 'normal' })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: baseUser,
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  it('renders as a centered modal with the Telegram support id and app version', () => {
    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(/424242/)).toBeInTheDocument()
  })

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<SettingsModal user={baseUser} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is tapped', () => {
    const onClose = vi.fn()
    render(<SettingsModal user={baseUser} onClose={onClose} />)

    fireEvent.click(screen.getByRole('presentation'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('switching the language to Korean immediately re-renders labels and persists via PATCH /me', async () => {
    mockedPatchMe.mockResolvedValue({
      user: { ...baseUser, locale: 'ko' },
      wallet: { coins: 1000, gems: 0 },
      levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 1000 },
      jackpot: 0,
    })

    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    const koButton = screen.getByRole('radio', { name: '한국어' })
    await act(async () => {
      koButton.click()
    })

    expect(useSettingsStore.getState().locale).toBe('ko')
    // 화면 전체가 즉시 한국어로 바뀐다 — 모달 제목이 '설정'으로 리렌더된다.
    expect(await screen.findByText('설정')).toBeInTheDocument()
    expect(mockedPatchMe).toHaveBeenCalledWith('test-token', 'ko')
  })

  it('does not call PATCH /me when the language is set back to Auto', async () => {
    useSettingsStore.setState({ locale: 'ko' })

    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    // locale이 이미 'ko'이므로 화면 라벨도 한국어로 렌더된다 ('자동' = Auto).
    const autoButton = screen.getByRole('radio', { name: '자동' })
    await act(async () => {
      autoButton.click()
    })

    expect(useSettingsStore.getState().locale).toBe('auto')
    expect(mockedPatchMe).not.toHaveBeenCalled()
  })

  it('keeps the local locale choice when the PATCH call fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedPatchMe.mockRejectedValue(new Error('network down'))

    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    const koButton = screen.getByRole('radio', { name: '한국어' })
    await act(async () => {
      koButton.click()
      await Promise.resolve()
    })

    expect(useSettingsStore.getState().locale).toBe('ko')
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('toggles sound/haptics/reducedMotion in the settings store', async () => {
    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    const soundSwitch = screen.getByRole('switch', { name: 'Sound' })
    await act(async () => {
      soundSwitch.click()
    })
    expect(useSettingsStore.getState().sound).toBe(false)

    const hapticsSwitch = screen.getByRole('switch', { name: 'Haptics' })
    await act(async () => {
      hapticsSwitch.click()
    })
    expect(useSettingsStore.getState().haptics).toBe(false)

    const motionSwitch = screen.getByRole('switch', { name: 'Reduce motion' })
    await act(async () => {
      motionSwitch.click()
    })
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })

  it('changes the spin speed in the settings store via the segmented control', async () => {
    render(<SettingsModal user={baseUser} onClose={() => {}} />)

    const turboButton = screen.getByRole('radio', { name: 'Turbo' })
    await act(async () => {
      turboButton.click()
    })
    expect(useSettingsStore.getState().spinSpeed).toBe('turbo')

    const quickButton = screen.getByRole('radio', { name: 'Quick' })
    await act(async () => {
      quickButton.click()
    })
    expect(useSettingsStore.getState().spinSpeed).toBe('quick')
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<SettingsModal user={baseUser} onClose={onClose} />)

    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click()
    })

    expect(onClose).toHaveBeenCalled()
  })
})
