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

  it('never escalates the exit title — the session total is not a tier, however big it gets', () => {
    // 계약이 뒤집혔다. 예전에는 총액이 등급을 올렸다(1000/100 = 10× → SURGE …).
    // 이제는 «프리스핀 도중 빅윈은 그 판에서 이미 축하했다»는 이유로 등급을 매기지 않는다 —
    // 총액은 그대로 보여 주되 제목은 늘 평범한 «획득»이다.
    for (const totalWin of [999, 1000, 5000, 10_000, 1_000_000]) {
      const { unmount } = render(
        <RoundPopupView popup={{ kind: 'freeSpinsExit', totalWin }} onDismiss={() => {}} />,
      )
      expect(screen.getByText('WIN')).toBeInTheDocument()
      for (const tierName of ['SURGE', 'BLAST', 'STORM', 'CATACLYSM']) {
        expect(screen.queryByText(tierName)).not.toBeInTheDocument()
      }
      unmount()
    }
  })

  it('ignores a game pack tier rename too — there is no tier here to rename', () => {
    render(
      <RoundPopupView
        popup={{ kind: 'freeSpinsExit', totalWin: 5000 }}
        onDismiss={() => {}}
        labels={{ storm: 'STAMPEDE' }}
      />,
    )
    expect(screen.getByText('WIN')).toBeInTheDocument()
    expect(screen.queryByText('STAMPEDE')).not.toBeInTheDocument()
  })

  it('still rolls the total up and still showers coins — only the escalation is gone', async () => {
    const { container } = render(
      <RoundPopupView popup={EXIT} onDismiss={() => {}} freeSpinsPlayed={8} />,
    )

    // 등급이 없어도 축하는 남는다(사용자: "결과 팝업은 잘해야 함") — 기본 분량의 코인 샤워.
    expect(container.querySelectorAll('.hub-win-fx__coin')).toHaveLength(SHOWER_COUNT_BY_TIER.none)
    expect(screen.getByText('8 free spins')).toBeInTheDocument()
    await waitFor(() => expect(valueText()).toBe('4,820'), { timeout: 4000 })
  })

  it('falls back to the generic summary line when the spin count was not supplied', () => {
    render(<RoundPopupView popup={EXIT} onDismiss={() => {}} />)
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
    render(<RoundPopupView popup={EXIT} onDismiss={onDismiss} />)

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
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} />)

    expect(screen.getByText('Tap to reveal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Tap to close')).toBeInTheDocument()
    // 힌트는 이 팝업에서는 카드 «안»에 그대로 있다 — 부딪칠 게임 아트가 없다(빅윈 오버레이만
    // 바닥으로 옮겼다). 두 화면이 같은 컴포넌트를 쓰므로 여기서 한 번 못 박아 둔다.
    expect(container.querySelector('.hub-win .hub-win__hint')).toBeInTheDocument()
  })

  it('keeps its own modal weight — the big-win overlay scrim never wraps this popup (no double darkening)', () => {
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} />)

    // 축하 연출(WinCelebration/Fx)은 공용이지만 «전면을 가리는 층»은 각자의 것이다 —
    // 이 팝업은 Modal의 backdrop + 불투명 카드로 이미 충분하고, 거기에 오버레이 스크림까지
    // 겹치면 이중으로 어두워진다.
    expect(container.querySelector('.hub-win-overlay')).toBeNull()
    expect(container.querySelector('.hub-modal-backdrop')).toBeInTheDocument()
  })

  it('closes on a backdrop tap too, once the roll-up has finished', async () => {
    const onDismiss = vi.fn()
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={onDismiss} />)
    const backdrop = container.querySelector('.hub-modal-backdrop') as HTMLElement

    fireEvent.click(backdrop)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(valueText()).toBe('4,820')

    fireEvent.click(backdrop)
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('drops every particle and shortens the roll-up under reduced motion', async () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} />)

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
    const { container } = render(<RoundPopupView popup={EXIT} onDismiss={() => {}} />)
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
