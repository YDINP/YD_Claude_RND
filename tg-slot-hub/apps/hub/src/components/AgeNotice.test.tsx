import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../store/settings'
import { AGE_NOTICE_KEY, AgeNotice, resetAgeNoticeForTest } from './AgeNotice'

describe('AgeNotice', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAgeNoticeForTest()
    useSettingsStore.setState({ locale: 'ko' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('첫 실행에는 안내가 뜨고, 바깥 탭·Esc로는 닫히지 않는다', () => {
    render(<AgeNotice />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('시작하기 전에')).toBeInTheDocument()
    expect(screen.getByText(/가상 코인/)).toBeInTheDocument()
    expect(screen.getByText(/현금 가치가 없고/)).toBeInTheDocument()
    expect(screen.getByText(/만 19세 이상/)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    const backdrop = document.querySelector('.hub-modal-backdrop')
    if (backdrop) fireEvent.click(backdrop)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('확인하면 닫히고 저장되어 다시 뜨지 않는다', () => {
    const first = render(<AgeNotice />)
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem(AGE_NOTICE_KEY)).toBe('1')

    first.unmount()
    resetAgeNoticeForTest()
    render(<AgeNotice />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('저장소 접근이 막혀도 렌더되고, 같은 탭에서는 한 번만 뜬다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const first = render(<AgeNotice />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    first.unmount()
    render(<AgeNotice />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('영어 사전도 있다', () => {
    useSettingsStore.setState({ locale: 'en' })
    render(<AgeNotice />)
    expect(screen.getByText('Before you start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })
})
