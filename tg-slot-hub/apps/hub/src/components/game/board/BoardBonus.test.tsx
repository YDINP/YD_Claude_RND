import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardBonusFeature } from '@tgslot/shared'
import { BoardBonus, type BoardBonusProps } from './BoardBonus'
import { boardLayout } from './yutLayout'
import { findBoardFeature, hanbokBoardConfig } from '../../../test/hanbokMath'

const config = hanbokBoardConfig()
const layout = boardLayout('yut29')
if (layout === null) throw new Error('좌표표 없음')

// 갈림길 멈춤 + 함정이 한 번 이상 섞인, 던지기 5번 이상인 판 — 화면이 보여 줄 게 많다.
const feature: BoardBonusFeature = findBoardFeature(
  (f) => f.throws.length >= 5 && f.throws.some((t) => config.forks[t.at] !== undefined) && f.throws.some((t) => t.tile === 'trap'),
)

function props(overrides: Partial<BoardBonusProps> = {}): BoardBonusProps {
  return {
    feature,
    config,
    layout: layout as NonNullable<typeof layout>,
    totalBet: 100,
    symbols: undefined,
    bgUrl: undefined,
    speed: 'normal',
    reducedMotion: true,
    auto: false,
    started: true,
    onProgress: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  }
}

const q = (container: HTMLElement, selector: string): HTMLElement | null => container.querySelector<HTMLElement>(selector)
const text = (container: HTMLElement, selector: string): string => q(container, selector)?.textContent?.trim() ?? ''
const phaseOf = (container: HTMLElement): string => q(container, '.board-bonus')?.getAttribute('data-phase') ?? ''

function hud(container: HTMLElement): { mult: string; pot: string; lit: number; chances: number } {
  return {
    mult: text(container, '.board-hud__cell--mult b'),
    pot: text(container, '.board-hud__cell--pot b'),
    lit: container.querySelectorAll('.board-lantern--on').length,
    chances: container.querySelectorAll('.board-dot--on').length,
  }
}

/** 시간을 조금씩 흘려 `done`이 될 때까지(상한 안에서) 돌린다. */
function advanceUntil(container: HTMLElement, done: () => boolean, stepMs = 40, limitMs = 60_000): void {
  for (let spent = 0; spent < limitMs && !done(); spent += stepMs) act(() => vi.advanceTimersByTime(stepMs))
  expect(done()).toBe(true)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BoardBonus', () => {
  it('진입 연출 뒤 던지기 차례가 되고, 던지기마다 HUD가 서버 기록의 값과 같다', () => {
    const p = props()
    const { container } = render(<BoardBonus {...p} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    expect(hud(container)).toMatchObject({ mult: '×1', pot: '0x', lit: 3, chances: 5 })

    for (let i = 0; i < feature.throws.length; i += 1) {
      const button = q(container, '.board-btn--throw') as HTMLButtonElement
      expect(button.disabled).toBe(false)
      fireEvent.click(button)
      expect(phaseOf(container)).toBe('throwing')
      advanceUntil(container, () => ['ready', 'summary'].includes(phaseOf(container)))
      const record = feature.throws[i]
      expect(record).toBeDefined()
      if (record === undefined) continue
      const view = hud(container)
      expect(view.mult).toBe(`×${record.multiplier}`)
      expect(view.pot).toBe(`${record.pot}x`)
      expect(view.lit).toBe(Math.max(0, config.trapLimit - record.traps))
      if (phaseOf(container) === 'ready') expect(view.chances).toBe(record.throwsLeft)
    }

    expect(phaseOf(container)).toBe('summary')
    expect(text(container, '.board-summary__formula')).toBe(
      `Basket ${feature.pot}x × Multiplier ${feature.multiplier} = ${feature.pot * feature.multiplier}x`,
    )
    // 진행 기록: 1..n, 그리고 summary에서 한 번 더 n(요약 진입)
    const progress = (p.onProgress as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(progress.slice(0, feature.throws.length)).toEqual(feature.throws.map((_, i) => i + 1))
  })

  it('최소 지급이 적용된 판도 식은 산수가 맞고, 최소 지급은 아랫줄에서 따로 올린다', () => {
    const low = findBoardFeature((f) => f.pot * f.multiplier < config.minPayout)
    const { container } = render(<BoardBonus {...props({ feature: low })} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    expect(phaseOf(container)).toBe('summary')
    expect(low.payout).toBe(config.minPayout)
    expect(text(container, '.board-summary__formula')).toBe(
      `Basket ${low.pot}x × Multiplier ${low.multiplier} = ${low.pot * low.multiplier}x`,
    )
    expect(text(container, '.board-summary__min')).toBe(`→ Raised to the minimum payout of ${config.minPayout}x`)
  })

  it('«지금 끝나면 N배»는 max(최소, 바구니×배수)이고 금액은 총 베팅 곱이다', () => {
    const { container } = render(<BoardBonus {...props()} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    expect(text(container, '.board-endsnow__main')).toBe(`If it ends now: ${config.minPayout}x`)
    expect(text(container, '.board-endsnow__coins')).toContain((config.minPayout * 100).toLocaleString('en-US'))
  })

  it('입력(탭·자동·빨리 감기)을 어떻게 섞어도 끝 값은 서버 기록 그대로다', () => {
    const scenarios: ((container: HTMLElement) => void)[] = [
      // 자동으로만
      (c) => fireEvent.click(q(c, '.board-btn--small') as HTMLElement),
      // 던지고 재생 중 화면을 계속 탭
      (c) => {
        fireEvent.click(q(c, '.board-btn--throw') as HTMLElement)
        for (let i = 0; i < 6; i += 1) {
          fireEvent.click(q(c, '.board-stage') as HTMLElement, { bubbles: true })
          act(() => vi.advanceTimersByTime(30))
        }
      },
      // ⏩ 두 번(요약 직행)
      (c) => {
        fireEvent.click(q(c, '.board-btn--icon') as HTMLElement)
        fireEvent.click(q(c, '.board-btn--icon') as HTMLElement)
      },
      // 자동 + ⏩ 한 번(압축 재생)
      (c) => {
        fireEvent.click(q(c, '.board-btn--icon') as HTMLElement)
      },
    ]
    for (const scenario of scenarios) {
      cleanup()
      const p = props()
      const { container } = render(<BoardBonus {...p} />)
      advanceUntil(container, () => phaseOf(container) === 'ready')
      scenario(container)
      // 자동·압축이 아닌 시나리오(탭만)는 나머지를 손으로 던진다.
      for (let guard = 0; guard < 200 && phaseOf(container) !== 'summary'; guard += 1) {
        if (phaseOf(container) === 'ready' && !(q(container, '.board-btn--throw') as HTMLButtonElement).disabled) {
          const auto = q(container, '.board-btn--small')?.getAttribute('aria-pressed') === 'true'
          if (!auto) fireEvent.click(q(container, '.board-btn--throw') as HTMLElement)
        }
        act(() => vi.advanceTimersByTime(60))
      }
      expect(phaseOf(container)).toBe('summary')
      expect(text(container, '.board-summary__formula')).toBe(
        `Basket ${feature.pot}x × Multiplier ${feature.multiplier} = ${feature.pot * feature.multiplier}x`,
      )
      expect(hud(container).pot).toBe(`${feature.pot}x`)
      expect(hud(container).mult).toBe(`×${feature.multiplier}`)
      const progress = (p.onProgress as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as number)
      // 보여 준 던지기 수는 줄지 않고 끝은 전체 수다.
      for (let i = 1; i < progress.length; i += 1) expect(progress[i] as number).toBeGreaterThanOrEqual(progress[i - 1] as number)
      expect(progress.at(-1)).toBe(feature.throws.length)
    }
  })

  it('[받기]를 누르면 끝까지 봤다고 기록하고 복귀를 요청한다(한 번만)', () => {
    const p = props()
    const { container } = render(<BoardBonus {...p} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    expect(phaseOf(container)).toBe('summary')
    const collect = q(container, '.board-summary__collect') as HTMLButtonElement
    fireEvent.click(collect)
    fireEvent.click(collect)
    expect(p.onExit).toHaveBeenCalledTimes(1)
    const progress = (p.onProgress as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(progress.filter((v) => v === 'done')).toHaveLength(1)
    expect(progress.at(-1)).toBe('done')
  })

  it('start 전에는 아무 타이머도 돌지 않고, started가 되면 진입 연출이 시작된다', () => {
    const p = props({ started: false })
    const { container, rerender } = render(<BoardBonus {...p} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(phaseOf(container)).toBe('intro')
    expect((q(container, '.board-btn--throw') as HTMLButtonElement).disabled).toBe(true)
    rerender(<BoardBonus {...p} started />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    expect((q(container, '.board-btn--throw') as HTMLButtonElement).disabled).toBe(false)
  })

  it('복원: 보여 준 던지기 수만큼 반영된 상태에서 곧장 이어 간다', () => {
    const resumeShown = 3
    const p = props({ resumeShown })
    const { container } = render(<BoardBonus {...p} />)
    act(() => vi.advanceTimersByTime(50))
    expect(phaseOf(container)).toBe('ready')
    const record = feature.throws[resumeShown - 1]
    expect(hud(container).pot).toBe(`${record?.pot}x`)
    expect(hud(container).mult).toBe(`×${record?.multiplier}`)
    expect(container.querySelectorAll('.board-chip').length).toBeGreaterThan(0)
  })

  it('던지기 직전에는 도·개·걸·윷·모 꼬리표가 보이고 재생 중에는 숨는다(영어는 1~5 숫자)', () => {
    const { container } = render(<BoardBonus {...props()} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    const chipText = [...container.querySelectorAll('.board-chip text')].map((n) => n.textContent).join('')
    for (const digit of ['1', '2', '3', '4', '5']) expect(chipText).toContain(digit)
    expect(container.querySelectorAll('.board-chip--num').length).toBe(container.querySelectorAll('.board-chip').length)
    fireEvent.click(q(container, '.board-btn--throw') as HTMLElement)
    expect(container.querySelectorAll('.board-chip').length).toBe(0)
  })

  it('언마운트하면 걸려 있던 타이머가 남지 않는다', () => {
    const { container, unmount } = render(<BoardBonus {...props()} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    fireEvent.click(q(container, '.board-btn--throw') as HTMLElement)
    act(() => vi.advanceTimersByTime(100))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('요약이 열린 뒤에는 던지기·자동·빨리 감기가 잠긴다', () => {
    const { container } = render(<BoardBonus {...props()} />)
    advanceUntil(container, () => phaseOf(container) === 'ready')
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    fireEvent.click(q(container, '.board-btn--icon') as HTMLElement)
    expect((q(container, '.board-btn--throw') as HTMLButtonElement).disabled).toBe(true)
    expect((q(container, '.board-btn--small') as HTMLButtonElement).disabled).toBe(true)
    expect((q(container, '.board-btn--icon') as HTMLButtonElement).disabled).toBe(true)
  })
})
