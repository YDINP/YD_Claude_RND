import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 워커는 jsdom에 없다. 게다가 이 스모크 테스트가 재는 것은 "전수조사를 돌리면 KPI가 채워지는가"라서
 * 몬테카를로는 목으로 막고 메인 스레드 계산만 진짜로 돌린다.
 */
vi.mock('./lib/mcClient.js', () => ({
  CANCELLED: '시뮬레이션이 취소되었다',
  runMcInWorker: vi.fn(() => ({ promise: new Promise(() => {}), cancel: vi.fn() })),
}))

const { App } = await import('./App.js')
const { loadGameCatalog, defaultBet } = await import('./games.js')
const { enumerateAudit } = await import('@tgslot/rtp-sim/audit')

function classic777() {
  const pack = loadGameCatalog().packs.find((candidate) => candidate.id === 'classic-777')
  if (pack === undefined) throw new Error('classic-777 팩을 찾지 못했다')
  return pack
}

describe('검수 시뮬레이터', () => {
  it('games/*를 읽어 classic-777을 목록에 올린다', () => {
    render(<App />)
    expect(screen.getByLabelText('게임')).toHaveValue('classic-777')
    expect(screen.getByRole('button', { name: '전수조사 실행' })).toBeEnabled()
  })

  it('전수조사를 실행하면 KPI 타일이 실제 계산값으로 채워진다', async () => {
    const pack = classic777()
    const bet = defaultBet(pack.math)
    const expected = enumerateAudit(pack.math, bet)

    render(<App />)
    expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent('—')

    fireEvent.click(screen.getByRole('button', { name: '전수조사 실행' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent(`${(expected.rtp * 100).toFixed(4)}%`)
    })
    expect(screen.getByTestId('kpi-hit-rate')).toHaveTextContent(`${(expected.hitRate * 100).toFixed(3)}%`)
    expect(screen.getByTestId('kpi-max-win')).toHaveTextContent(`${expected.maxWinMultiplier.toFixed(2)}x`)
    // 몬테카를로를 돌리지 않았으므로 시뮬 지표는 비어 있어야 한다.
    expect(screen.getByTestId('kpi-mc-rtp')).toHaveTextContent('—')
  })

  it('전수조사 뒤 기여도 표와 배수 분포가 그려진다', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '전수조사 실행' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '심볼별 RTP 기여' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '라인별 RTP 기여' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '배수 분포 표' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '배수 구간별 확률' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '베팅 레벨별 전수 조사' })).toBeInTheDocument()
  })

  it('시뮬레이션 실행은 워커 클라이언트에 시드와 스핀 수를 그대로 넘긴다', async () => {
    const { runMcInWorker } = await import('./lib/mcClient.js')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 실행' }))

    expect(runMcInWorker).toHaveBeenCalledTimes(1)
    const request = vi.mocked(runMcInWorker).mock.calls[0]?.[0]
    expect(request?.seed).toBe('42')
    expect(request?.spins).toBe(1_000_000)
    expect(request?.totalBet).toBe(defaultBet(classic777().math))
  })

  it('워커가 실패하면 빨간 경고로 이유를 보여 준다', async () => {
    const { runMcInWorker } = await import('./lib/mcClient.js')
    vi.mocked(runMcInWorker).mockReturnValueOnce({
      promise: Promise.reject(new Error('워커 로드 실패 (/src/lib/mc.worker.ts:3): boom')),
      cancel: vi.fn(),
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 실행' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('워커 로드 실패')
    expect(alert).toHaveClass('sim-chip--fail')
  })

  it('사용자가 중단한 경우는 오류로 보여 주지 않는다', async () => {
    const { runMcInWorker, CANCELLED } = await import('./lib/mcClient.js')
    vi.mocked(runMcInWorker).mockReturnValueOnce({
      promise: Promise.reject(new Error(CANCELLED)),
      cancel: vi.fn(),
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 실행' }))

    await waitFor(() => {
      expect(screen.queryByText('몬테카를로 0%')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('전수조사만으로는 리포트를 내보낼 수 없다', async () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '검수 결과 내보내기' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '전수조사 실행' }))
    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).not.toHaveTextContent('—')
    })
    expect(screen.getByRole('button', { name: '검수 결과 내보내기' })).toBeDisabled()
  })

  it('샘플 스핀 탭은 격자를 보여 주고 스핀 1회로 늘어난다', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '샘플 스핀' }))

    const pack = classic777()
    const cells = pack.math.rows * pack.math.reels
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#20')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '스핀 1회' }))
    expect(screen.getByText('#21')).toBeInTheDocument()
    expect(cells).toBeGreaterThan(0)
  })
})
