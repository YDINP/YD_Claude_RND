import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../store/settings'
import { Modal } from './Modal'

describe('Modal', () => {
  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: false })
  })

  it('renders as a centered dialog', () => {
    render(
      <Modal onClose={() => {}}>
        <p>content</p>
      </Modal>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <p>content</p>
      </Modal>,
    )

    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the card itself is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <p>content</p>
      </Modal>,
    )

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <p>content</p>
      </Modal>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when a close button inside is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </Modal>,
    )

    screen.getByRole('button', { name: 'Close' }).click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('applies the scale-in animation class unless reducedMotion is on', () => {
    const { rerender } = render(
      <Modal onClose={() => {}}>
        <p>content</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog').className).toContain('hub-modal--animate')

    useSettingsStore.setState({ reducedMotion: true })
    rerender(
      <Modal onClose={() => {}}>
        <p>content</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog').className).not.toContain('hub-modal--animate')
  })
})
