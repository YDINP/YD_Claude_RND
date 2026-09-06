/**
 * 프리스핀 진입/종료 팝업 테스트.
 *
 * 등급 표·롤업 산수·파티클 배열은 공용이라 `WinCelebration.test.tsx`에서 본다. 여기서는
 * **프리스핀 문맥에서만 벌어지는 일**만 다룬다: 스핀 수 카운트업과 배수 배지, 종료 요약줄,
 * "굴러가는 중 첫 탭은 감기, 그 뒤는 닫기"라는 입력 계약, 모션 축소, 스크린리더 경로.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RoundPopupView } from './RoundPopup'
import { REDUCED_ROLLUP_MS, SHOWER_COUNT_BY_TIER } from './winTiers'
import { useSettingsStore } from '../../store/settings'
import type { RoundPopup } from '../../game/roundFlow'

const ENTRY: RoundPopup = { kind: 'freeSpinsEntry', spins: 12, multiplier: 1 }
const EXIT: RoundPopup = { kind: 'freeSpinsExit', totalWin: 4820 }

function valueText(): string {
  return screen.getByTestId('win-amount').textContent ?? ''
}

describe('RoundPopupView', () => {
  beforeEach(() => {
    useSettingsStore.setState({ reducedMotion: false })
  })

  it('counts the free spins up from zero and shows no multiplier badge at ×1', async () => {
    render(<RoundPopupView popup={ENTRY} onDismiss={() => {}} />)

    expect(screen.getByText('FREE SPINS!')).toBeInTheDocument()
    expect(valueText()).toBe('0')
    expect(screen.getByText('SPINS')).toBeInTheDocument()

    await waitFor(() => expect(valueText()).toBe('12'), { timeout: 3000 })
    expect(screen.queryByText('×1')).not.toBeInTheDocument()
  })

  it('pops the ×N badge in only after the count-up, and only when the multiplier is above 1', async () => {
    render(<RoundPopupView popup={{ ...ENTRY, multiplier: 2 }} onDismiss={() => {}} />)

    // 카운트업이 도는 동안에는 배수가 스핀 수를 잡아먹지 않는다.
    expect(screen.queryByText('×2')).not.toBeInTheDocument()

    // 배지는 카운트업이 **끝난 뒤**에 붙는다 — ease-out 때문에 숫자가 먼저 12에 닿아 있어도
    // 시계가 다 돌기 전까지는 나오지 않는다.
    const badge = await screen.findByText('×2', undefined, { timeout: 3000 })
    expect(badge).toHaveAttribute('aria-label', 'Multiplier ×2')
    expect(valueText()).toBe('12')
  })

  it('escalates the exit title at each tier boundary and stays plain without a total bet', () => {
    const cases = [
      { totalWin: 999, totalBet: 100, title: 'WIN' },
      { totalWin: 1000, totalBet: 100, title: 'SURGE' },
      { totalWin: 2000, totalBet: 100, title: 'BLAST' },
      { totalWin: 5000, totalBet: 100, title: 'STORM' },
      { totalWin: 10_000, totalBet: 100, title: 'CATACLYSM' },
      { totalWin: 10_000, totalBet: undefined, title: 'WIN' },
    ] as const

    for (const { totalWin, totalBet, title } of cases) {
      const { unmount } = render(
        <RoundPopupView popup={{ kind: 'freeSpinsExit', totalWin }} onDismiss={() => {}} totalBet={totalBet} />,
      )
      expect(screen.getByText(title)).toBeInTheDocument()
      unmount()
    }
  })

  it('lets a game pack rename the tier, exactly as the base-game overlay does', () => {
    render(
      <RoundPopupView
        popup={{ kind: 'freeSpinsExit', totalWin: 5000 }}
        onDismiss={() => {}}
        totalBet={100}
        labels={{ storm: 'STAMPEDE' }}
      />,
    )
    expect(screen.getByText('STAMPEDE')).toBeInTheDocument()
    expect(screen.queryByText('STORM')).not.toBeInTheDocument()
  })

  it('rolls the total up to the final amount and thickens the coin shower with the tier', async () => {
    const { container, unmount } = render(
      <RoundPopupView popup={EXIT} onDismiss={() => {}} totalBet={100} freeSpinsPlayed={8} />,
    )

    // 4820 / 100 = 48.2× → BLAST
    expect(container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(SHOWER_COUNT_BY_TIER.blast)
    expect(screen.getByText('8 free spins')).toBeInTheDocument()
    await waitFor(() => expect(valueText()).toBe('4,820'), { timeout: 4000 })
    unmount()

    const max = render(
      <RoundPopupView popup={{ kind: 'freeSpinsExit', totalWin: 12_000 }} onDismiss={() => {}} totalBet={100} />,
    )
    expect(max.container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(
      SHOWER_COUNT_BY_TIER.cataclysm,
    )
  })

  it('falls back to the generic summary line when the spin count was not supplied', () => {
    render(<RoundPopupView popup={EXIT} onDismiss={() => {}} totalBet={100} />)
    expect(screen.getByText('FREE SPINS COMPLETE')).toBeInTheDocument()
  })

  it('shows the trigger symbol only when an image is supplied', () => {
    const { container, unmount } = render(<RoundPopupView popup={ENTRY} onDismiss={() => {}} />)
    expect(container.querySelector('.hub-round-popup__symbol-img')).toBeNull()
    // 진입에는 코인 샤워 대신 반짝임이 붙는다.
    expect(container.querySelector('.hub-win-fx__coin')).toBeNull()
    expect(container.querySelectorAll('.hub-round-popup__sparkle').length).toBeGreaterThan(0)
    unmount()

    const withSymbol = render(
      <RoundPopupView popup={ENTRY} onDismiss={() => {}} scatterImageUrl="/scatter.png" />,
    )
    expect(withSymbol.container.querySelector('.hub-round-popup__symbol-img')).toHaveAttribute(
      'src',
      '/scatter.png',
    )
  })

  it('completes the roll-up on the first tap and closes only on the next one', async () => {
    const onDismiss = vi.fn()
    render(<RoundPopupView popup={EXIT} onDismiss={onDismiss} totalBet={100} />)

    // 아직 굴러가는 중 — 첫 탭은 "끝까지 감기"다.
    expect(valueText()).not.toBe('4,820')
    fireEvent.click(screen.getByRole('button'))
    expect(valueText()).toBe('4,820')
    expect(onDismiss).not.toHaveBeenCalled()

    // 다 굴렀으니 이제는 닫힌다.
    fireEvent.click(screen.getByRole('button'))
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // 굴러가던 프레임이 되살아나 값을 되돌리지 않는다.
    await waitFor(() => expect(valueText()).toBe('4,820'), { timeout: 2000 })
  })

  it('says what the next tap will do — reveal while rolling, close once settled', () => {
    render(<RoundPopupView popup={EXIT} onDismiss={() => {}} totalBet={100} />)

    expect(screen.getByText('Tap to reveal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Tap to close')).toBeInTheDocument()
  })

  it('closes on a backdrop tap too, once the roll-up has finished', async () => {
    const onDismiss = vi.fn()
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={onDismiss} totalBet={100} />)
    const backdrop = container.querySelector('.hub-modal-backdrop') as HTMLElement

    fireEvent.click(backdrop)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(valueText()).toBe('4,820')

    fireEvent.click(backdrop)
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('drops every particle and shortens the roll-up under reduced motion', async () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} totalBet={100} />)

    expect(container.querySelector('.hub-win-fx__rays')).toBeNull()
    expect(container.querySelector('.hub-win-fx__coin')).toBeNull()
    expect(container.querySelector('.hub-round-popup__sparkle')).toBeNull()
    expect(container.querySelector('.hub-round-popup')?.className).toContain('hub-round-popup--still')
    expect(container.querySelector('.hub-win')?.className).toContain('hub-win--still')

    // 넉넉한 상한이다 — 통과하는 즉시 빠져나오므로, 부하가 걸린 병렬 실행에서 흔들리지만 않으면 된다.
    expect(REDUCED_ROLLUP_MS).toBeLessThan(1000)
    await waitFor(() => expect(valueText()).toBe('4,820'), { timeout: 3000 })
  })

  it('announces the final amount once through a single polite live region', async () => {
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} totalBet={100} />)
    const regions = container.querySelectorAll('[aria-live]')
    const live = regions[0] as HTMLElement

    expect(regions).toHaveLength(1)
    expect(live).toHaveAttribute('aria-live', 'polite')
    // 중간값은 읽히지 않는다 — 다 굴러야 문장이 들어온다.
    expect(live.textContent).toBe('')
    await waitFor(() => expect(live.textContent).toBe('Total win 4,820'), { timeout: 4000 })
  })

  it('announces the granted spins (with the multiplier) on the entry popup', async () => {
    const { container } = render(<RoundPopupView popup={{ ...ENTRY, multiplier: 3 }} onDismiss={() => {}} />)
    const live = container.querySelector('[aria-live]')

    await waitFor(() => expect(live?.textContent).toBe('12 free spins ×3'), { timeout: 3000 })
  })
})
