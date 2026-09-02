import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 워커는 jsdom에 없다. 게다가 이 스모크 테스트가 재는 것은 "전수조사를 돌리면 KPI가 채워지는가"라서
 * 몬테카를로는 목으로 막고 메인 스레드 계산만 진짜로 돌린다.
 */
vi.mock('./lib/mcClient.js', () => ({
  CANCELLED: '시뮬레이션이 취소되었다',
  runMcInWorker: vi.fn(() => ({ promise: new Promise(() => {}), cancel: vi.fn() })),
  runDistributionInWorker: vi.fn(() => ({ promise: new Promise(() => {}), cancel: vi.fn() })),
}))

const { App } = await import('./App.js')
const { loadGameCatalog, defaultBet } = await import('./games.js')
const { isAnalytic } = await import('@tgslot/slot-engine')
const { analyzeDistribution, auditBetLevels, enumerateAudit, sampleDistribution } = await import('@tgslot/rtp-sim/audit')

function pack(id: string) {
  const found = loadGameCatalog().packs.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`${id} 팩을 찾지 못했다`)
  return found
}

function classic777() {
  return pack('classic-777')
}

describe('검수 시뮬레이터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
      expect(screen.getByRole('heading', { name: /심볼별 RTP 기여/ })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /라인별 RTP 기여/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /배수 분포 표/ })).toBeInTheDocument()
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

  it('게임 선택기에 두 게임이 모두 올라온다', () => {
    render(<App />)
    const select = screen.getByLabelText('게임')
    const ids = [...select.querySelectorAll('option')].map((option) => option.getAttribute('value'))
    expect(ids).toContain('classic-777')
    expect(ids).toContain('fruit-fiesta')
    // _template은 스캐폴드라 목록에 없다.
    expect(ids).not.toContain('_template')
  })

  it('전수조사가 가능한 게임은 전수조사 배지를 단다', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '전수조사 실행' }))
    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent('RTP (전수조사)')
    })
    expect(screen.getAllByText('전수조사').length).toBeGreaterThan(0)
    expect(screen.queryByText('표본 추정')).not.toBeInTheDocument()
  })

  it('5릴 게임을 고르면 버튼이 해석적 산출로 바뀌고 워커가 표본을 맡는다', async () => {
    const { runDistributionInWorker } = await import('./lib/mcClient.js')
    render(<App />)
    fireEvent.change(screen.getByLabelText('게임'), { target: { value: 'fruit-fiesta' } })

    const button = await screen.findByRole('button', { name: '해석적 산출 + 표본' })
    // 전수 조사가 불가능하므로 표본 크기 선택이 나타난다.
    expect(screen.getByLabelText('표본 스핀 수 (분포 추정)')).toBeInTheDocument()

    fireEvent.click(button)
    expect(runDistributionInWorker).toHaveBeenCalledTimes(1)
    const request = vi.mocked(runDistributionInWorker).mock.calls[0]?.[0]
    expect(request?.sampleSpins).toBe(1_000_000)
    expect(request?.totalBet).toBe(defaultBet(pack('fruit-fiesta').math))
  })

  it('5릴 표본 결과가 오면 표본 추정 배지와 프리스핀 타일이 뜬다', async () => {
    const { runDistributionInWorker } = await import('./lib/mcClient.js')
    const fruit = pack('fruit-fiesta')
    const bet = defaultBet(fruit.math)
    const distribution = sampleDistribution(fruit.math, bet, { spins: 3_000, seed: 'test' })
    vi.mocked(runDistributionInWorker).mockReturnValueOnce({
      promise: Promise.resolve({ distribution, betLevels: auditBetLevels(fruit.math) }),
      cancel: vi.fn(),
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('게임'), { target: { value: 'fruit-fiesta' } })
    fireEvent.click(await screen.findByRole('button', { name: '해석적 산출 + 표본' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent('RTP (해석적)')
    })
    expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent(`${(distribution.rtp * 100).toFixed(4)}%`)
    expect(screen.getAllByText('표본 추정').length).toBeGreaterThan(0)
    expect(screen.getByTestId('kpi-free-spins')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-trigger')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '스캐터 · 프리스핀' })).toBeInTheDocument()
  })

  it('몬테카를로 결과는 몬테카를로 배지와 정밀도 표를 띄운다', async () => {
    const { runDistributionInWorker } = await import('./lib/mcClient.js')
    // 방법은 엔진 디스패처가 고른다. 닫힌 식이 없는 팩이어야 몬테카를로가 나온다.
    const mcPack = loadGameCatalog().packs.find((candidate) => !isAnalytic(candidate.math))
    expect(mcPack).toBeDefined()
    if (mcPack === undefined) return

    const bet = defaultBet(mcPack.math)
    const distribution = analyzeDistribution(mcPack.math, bet, { sampleSpins: 2_000, sampleSeed: 'mc' })
    expect(distribution.method).toBe('monte-carlo')

    vi.mocked(runDistributionInWorker).mockReturnValueOnce({
      promise: Promise.resolve({ distribution, betLevels: [] }),
      cancel: vi.fn(),
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('게임'), { target: { value: mcPack.id } })
    fireEvent.click(await screen.findByRole('button', { name: '해석적 산출 + 표본' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent('RTP (몬테카를로)')
    })
    expect(screen.getAllByText('몬테카를로').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /RTP 정밀도/ })).toBeInTheDocument()
    // 신뢰구간이 KPI 노트에 함께 뜬다.
    expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent('95% CI')
  })

  it('프리스핀이 있는 게임은 세션이 나올 때까지 뽑을 수 있다', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('게임'), { target: { value: 'fruit-fiesta' } })
    fireEvent.click(screen.getByRole('tab', { name: '샘플 스핀' }))

    fireEvent.click(screen.getByRole('button', { name: '프리스핀 나올 때까지' }))
    await waitFor(() => {
      expect(screen.getAllByText(/프리스핀 2x/).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/프리스핀 \d+회 획득/).length).toBeGreaterThan(0)
  })

  it('프리스핀이 없는 게임에는 그 버튼이 없다', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: '샘플 스핀' }))
    expect(screen.queryByRole('button', { name: '프리스핀 나올 때까지' })).not.toBeInTheDocument()
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
