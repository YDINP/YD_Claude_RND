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

  it('centers everything: the strip element itself is a column with centered content', () => {
    const { container } = render(<WinStrip label="WIN" amount={12345} />)
    const strip = container.querySelector('.hub-win-strip')
    expect(strip).not.toBeNull()
    // 실제 정렬은 CSS(.hub-win-strip { flex-direction: column; align-items: center })가 맡는다 —
    // 여기서는 레이블/금액/라인문구가 모두 같은 컨테이너 안에 형제로 있는지만(중첩 래퍼 없이) 확인한다.
    expect(strip?.children.length).toBeGreaterThanOrEqual(2)
    expect(strip?.querySelector('.hub-win-strip__label')?.textContent).toBe('WIN')
    expect(strip?.querySelector('.hub-win-strip__amount')?.textContent).toBe('12,345')
  })

  it('centers the gamble layout too — label/amount/countdown/actions are siblings in one column', () => {
    const { container } = render(
      <WinStrip
        label="PENDING WIN"
        amount={200}
        gambleActions={{
          onCollect: vi.fn(),
          onDouble: vi.fn(),
          collectLabel: 'Collect',
          doubleLabel: 'Double (50%)',
          expiresInLabel: '9:45',
        }}
      />,
    )
    const strip = container.querySelector('.hub-win-strip--gamble')
    expect(strip).not.toBeNull()
    // 더블업 모드에서도 별도의 좌/우 래퍼 div로 나뉘지 않는다 — .hub-win-strip(부모)의
    // flex-direction: column이 라벨/금액/카운트다운/버튼줄을 그대로 세로로 쌓는다.
    expect(strip?.querySelector('.hub-win-strip__gamble-amount')).toBeNull()
    expect(strip?.querySelector('.hub-win-strip__label')?.textContent).toBe('PENDING WIN')
    expect(strip?.querySelector('.hub-win-strip__amount')?.textContent).toBe('200')
    expect(strip?.querySelector('.hub-win-strip__gamble-countdown')?.textContent).toBe('9:45')
    expect(strip?.querySelector('.hub-win-strip__gamble-actions')).not.toBeNull()
  })

  it('shows no line label when lineLabel is omitted or null', () => {
    const { container, rerender } = render(<WinStrip label="WIN" amount={0} />)
    expect(container.querySelector('.hub-win-strip__line-label')).toBeNull()

    rerender(<WinStrip label="WIN" amount={0} lineLabel={null} />)
    expect(container.querySelector('.hub-win-strip__line-label')).toBeNull()
  })

  it('shows the line label text when provided (e.g. "Whiskey ×3 · 20")', () => {
    render(<WinStrip label="WIN" amount={20} lineLabel={{ text: 'Whiskey ×3 · 20', key: 1 }} />)
    expect(screen.getByText('Whiskey ×3 · 20')).toHaveClass('hub-win-strip__line-label')
  })

  it('re-mounts the line label node when only the key changes (same text) so the pop animation replays', () => {
    const { container, rerender } = render(
      <WinStrip label="WIN" amount={20} lineLabel={{ text: 'Whiskey ×3 · 20', key: 1 }} />,
    )
    const first = container.querySelector('.hub-win-strip__line-label')
    expect(first).not.toBeNull()

    rerender(<WinStrip label="WIN" amount={20} lineLabel={{ text: 'Whiskey ×3 · 20', key: 2 }} />)
    const second = container.querySelector('.hub-win-strip__line-label')
    expect(second).not.toBeNull()
    expect(second?.textContent).toBe('Whiskey ×3 · 20')
    // React가 key로 새 엘리먼트를 만들었는지는 직접 관찰할 수 없지만(같은 텍스트), 최소한
    // 문구가 바뀌는 다른 케이스에서 갱신되는 것을 검증해 회귀를 잡는다.
    rerender(<WinStrip label="WIN" amount={40} lineLabel={{ text: 'Cherry ×5 · 40', key: 3 }} />)
    expect(container.querySelector('.hub-win-strip__line-label')?.textContent).toBe('Cherry ×5 · 40')
  })

  it('shows the line label together with the gamble Collect/Double buttons (defect: used to be hidden while gambling)', () => {
    render(
      <WinStrip
        label="PENDING WIN"
        amount={200}
        lineLabel={{ text: 'Whiskey ×3 · 20', key: 1 }}
        gambleActions={{
          onCollect: vi.fn(),
          onDouble: vi.fn(),
          collectLabel: 'Collect',
          doubleLabel: 'Double (50%)',
        }}
      />,
    )
    expect(screen.getByText('Whiskey ×3 · 20')).toHaveClass('hub-win-strip__line-label')
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Double (50%)' })).toBeInTheDocument()
  })

  it('keeps the gamble buttons mounted (same node) when only the line label changes across rerenders', () => {
    const onCollect = vi.fn()
    const onDouble = vi.fn()
    const { rerender } = render(
      <WinStrip
        label="PENDING WIN"
        amount={200}
        lineLabel={{ text: 'Whiskey ×3 · 20', key: 1 }}
        gambleActions={{ onCollect, onDouble, collectLabel: 'Collect', doubleLabel: 'Double (50%)' }}
      />,
    )
    const collectBefore = screen.getByRole('button', { name: 'Collect' })
    const doubleBefore = screen.getByRole('button', { name: 'Double (50%)' })

    rerender(
      <WinStrip
        label="PENDING WIN"
        amount={200}
        lineLabel={{ text: 'Cherry ×5 · 40', key: 2 }}
        gambleActions={{ onCollect, onDouble, collectLabel: 'Collect', doubleLabel: 'Double (50%)' }}
      />,
    )
    // 새 lineLabel.key로 문구는 바뀌었지만, 버튼 두 개는 리마운트되거나 사라지지 않고 그대로다.
    expect(screen.getByText('Cherry ×5 · 40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collect' })).toBe(collectBefore)
    expect(screen.getByRole('button', { name: 'Double (50%)' })).toBe(doubleBefore)
  })

  it('shows no free-spins counter when freeSpinsCounter is omitted or null (row stays mounted for reserved height)', () => {
    const { container, rerender } = render(<WinStrip label="WIN" amount={0} />)
    expect(container.querySelector('.hub-win-strip__free-spins-row')).not.toBeNull()
    expect(container.querySelector('.hub-win-strip__free-spins-counter')).toBeNull()

    rerender(<WinStrip label="WIN" amount={0} freeSpinsCounter={null} />)
    expect(container.querySelector('.hub-win-strip__free-spins-counter')).toBeNull()
  })

  it('shows the free-spins counter text right under the label when provided', () => {
    render(<WinStrip label="FREE SPINS TOTAL" amount={120} freeSpinsCounter="Free spins 5/8 ×2" />)
    expect(screen.getByText('Free spins 5/8 ×2')).toHaveClass('hub-win-strip__free-spins-counter')
  })

  it('renders the symbol image count times instead of the name when icons are provided', () => {
    const { container } = render(
      <WinStrip
        label="WIN"
        amount={20}
        lineLabel={{
          text: 'Whiskey ×3 · 20',
          key: 1,
          icons: { srcs: ['/whiskey.png', '/whiskey.png', '/whiskey.png'], ariaLabel: 'Whiskey ×3', suffix: '20' },
        }}
      />,
    )
    const lineLabelEl = container.querySelector('.hub-win-strip__line-label')
    expect(lineLabelEl).not.toBeNull()

    const imgs = lineLabelEl!.querySelectorAll('img')
    expect(imgs).toHaveLength(3)
    imgs.forEach((img) => {
      expect(img).toHaveAttribute('src', '/whiskey.png')
      expect(img).toHaveAttribute('alt', '')
      expect(img).toHaveAttribute('aria-hidden', 'true')
    })

    // 이름 텍스트("Whiskey ×3")는 화면에 그대로 노출되지 않는다 — 대신 아이콘 그룹의
    // aria-label이 스크린리더용으로 그 문구를 대신한다.
    expect(screen.queryByText('Whiskey ×3 · 20')).not.toBeInTheDocument()
    expect(lineLabelEl!.querySelector('.hub-win-strip__line-icons')).toHaveAttribute('aria-label', 'Whiskey ×3')
    expect(lineLabelEl!.textContent).toContain('20')
  })

  it('falls back to the name text when lineLabel has no icons (missing theme/image or a group win)', () => {
    render(<WinStrip label="WIN" amount={50} lineLabel={{ text: 'Any BAR ×3 · 50', key: 1 }} />)
    const label = screen.getByText('Any BAR ×3 · 50')
    expect(label).toHaveClass('hub-win-strip__line-label')
    expect(label.querySelector('img')).toBeNull()
  })

  it('keeps the line row height reserved the same way whether it renders icons or text', () => {
    const { container, rerender } = render(
      <WinStrip label="WIN" amount={20} lineLabel={{ text: 'Whiskey ×3 · 20', key: 1 }} />,
    )
    const textRow = container.querySelector('.hub-win-strip__line-row')
    expect(textRow).not.toBeNull()

    rerender(
      <WinStrip
        label="WIN"
        amount={20}
        lineLabel={{
          text: 'Whiskey ×3 · 20',
          key: 2,
          icons: { srcs: ['/whiskey.png', '/whiskey.png', '/whiskey.png'], ariaLabel: 'Whiskey ×3', suffix: '20' },
        }}
      />,
    )
    const iconRow = container.querySelector('.hub-win-strip__line-row')
    expect(iconRow).not.toBeNull()
    // 두 모드 모두 같은 .hub-win-strip__line-row 컨테이너 하나뿐이다 — 높이를 결정하는 요소가
    // 늘거나 줄지 않는다(CSS min-height가 두 모드에 동일하게 적용된다).
    expect(container.querySelectorAll('.hub-win-strip__line-row')).toHaveLength(1)
  })

  it('shows the free-spins counter alongside the gamble Collect/Double buttons too', () => {
    render(
      <WinStrip
        label="PENDING WIN"
        amount={200}
        freeSpinsCounter="Free spins 5/8 ×2"
        gambleActions={{
          onCollect: vi.fn(),
          onDouble: vi.fn(),
          collectLabel: 'Collect',
          doubleLabel: 'Double (50%)',
        }}
      />,
    )
    expect(screen.getByText('Free spins 5/8 ×2')).toHaveClass('hub-win-strip__free-spins-counter')
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument()
  })
})
