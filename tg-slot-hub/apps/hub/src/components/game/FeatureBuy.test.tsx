import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../store/settings'
import { FeatureBuy, type FeatureBuyProps } from './FeatureBuy'

function setup(overrides: Partial<FeatureBuyProps> = {}) {
  const onBuy = vi.fn()
  const props: FeatureBuyProps = {
    price: 100,
    trigger: 'freeSpins',
    triggerCount: 3,
    bet: 20,
    cost: 2000,
    balance: 10_000,
    block: null,
    onBuy,
    ...overrides,
  }
  const view = render(<FeatureBuy {...props} />)
  return { onBuy, view, props }
}

describe('FeatureBuy 시트', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'ko' })
  })

  it('버튼을 누르면 비용·잔액·무엇이 시작되는지·[구매] [취소] 시트가 뜬다', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByTestId('feature-buy-cost')).toHaveTextContent('베팅 20 × 100배 = 2,000')
    expect(screen.getByText('10,000')).toBeInTheDocument()
    expect(screen.getByText('스캐터 3개 이상이 떨어진 판으로 시작해요. 프리스핀이 바로 열려요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '구매' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('[구매]는 시트를 닫고 onBuy를 한 번 부른다. 다음에도 매번 다시 묻는다', () => {
    const { onBuy } = setup()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    fireEvent.click(screen.getByRole('button', { name: '구매' }))
    expect(onBuy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('[취소]는 사지 않고 닫는다', () => {
    const { onBuy } = setup()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onBuy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    ['autoSpin', '오토스핀 중에는 살 수 없어요'],
    ['freeSpins', '보너스가 끝난 뒤에 살 수 있어요'],
    ['spinning', '스핀이 끝난 뒤에 살 수 있어요'],
    ['gamble', '더블업을 끝낸 뒤에 살 수 있어요'],
    ['funds', '코인이 모자라요 (필요 2,000)'],
  ] as const)('막힘(%s): 버튼이 흐려지고 누르면 시트 대신 이유를 보여 준다', (block, text) => {
    const { onBuy } = setup({ block })
    const button = screen.getByRole('button', { name: /피처 구매/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(text)
    expect(onBuy).not.toHaveBeenCalled()
  })

  it('시트가 열린 사이 잔액이 모자라지면 [구매]가 비활성화되고 이유가 보인다', () => {
    const { view, props } = setup()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    view.rerender(<FeatureBuy {...props} balance={500} block="funds" />)
    expect(screen.getByRole('button', { name: '구매' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('코인이 모자라요')
  })

  it('시트가 열린 사이 스핀이 시작되면 시트를 닫는다', () => {
    const { view, props } = setup()
    fireEvent.click(screen.getByRole('button', { name: /피처 구매/ }))
    view.rerender(<FeatureBuy {...props} block="spinning" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('영어: Buy Bonus / Bet 20 × 100 = 2,000', () => {
    useSettingsStore.setState({ locale: 'en' })
    setup({ trigger: 'coinRespin', triggerCount: 6 })
    fireEvent.click(screen.getByRole('button', { name: /Buy Bonus/ }))
    expect(screen.getByTestId('feature-buy-cost')).toHaveTextContent('Bet 20 × 100 = 2,000')
    expect(screen.getByText('Starts with a spin that lands 6+ coins. Coin respins begin right away.')).toBeInTheDocument()
  })
})
