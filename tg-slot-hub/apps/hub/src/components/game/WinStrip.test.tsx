import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WinStrip } from './WinStrip'

describe('WinStrip', () => {
  it('shows the label and formatted amount', () => {
    render(<WinStrip label="WIN" amount={12345} />)

    expect(screen.getByText('WIN')).toBeInTheDocument()
    expect(screen.getByText('12,345')).toBeInTheDocument()
  })

  it('is not focusable/clickable and has no aria-label when there is nothing to skip (onTap omitted)', () => {
    const { container } = render(<WinStrip label="WIN" amount={0} />)

    const strip = container.querySelector('.hub-win-strip')
    expect(strip).not.toBeNull()
    expect(strip).not.toHaveAttribute('role')
    expect(strip).not.toHaveAttribute('tabindex')
    expect(strip).not.toHaveAttribute('aria-label')
  })

  it('becomes a focusable, labeled button when onTap is provided (rolling/holding) and click calls it', () => {
    const onTap = vi.fn()
    render(<WinStrip label="WIN" amount={50} onTap={onTap} />)

    const strip = screen.getByRole('button', { name: 'WIN 50' })
    expect(strip).toHaveAttribute('tabindex', '0')

    fireEvent.click(strip)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('calls onTap on Enter and Space keydown, but not on other keys', () => {
    const onTap = vi.fn()
    render(<WinStrip label="WIN" amount={50} onTap={onTap} />)

    const strip = screen.getByRole('button', { name: 'WIN 50' })

    fireEvent.keyDown(strip, { key: 'a' })
    expect(onTap).not.toHaveBeenCalled()

    fireEvent.keyDown(strip, { key: 'Enter' })
    expect(onTap).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(strip, { key: ' ' })
    expect(onTap).toHaveBeenCalledTimes(2)
  })
})
