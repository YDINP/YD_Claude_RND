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
const { analyzeDistribution, auditBetLevels, canEnumerate, enumerateAudit, sampleDistribution } = await import(
  '@tgslot/rtp-sim/audit'
)

function pack(id: string) {
  const found = loadGameCatalog().packs.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`${id} 팩을 찾지 못했다`)
  return found
}

function classic777() {
  return pack('classic-777')
}

/**
 * "전수조사" 계열 테스트는 전수조사가 가능한 팩이 있어야 의미가 있다.
 * 특정 id를 박아 넣으면 그 게임이 없어지거나 조합 수가 늘어날 때 조용히 다른 문제로 깨진다 —
 * 카탈로그에서 조건에 맞는 팩을 직접 찾아 실패 이유를 분명히 한다.
 */
function firstEnumerablePack() {
  const found = loadGameCatalog().packs.find((candidate) => canEnumerate(candidate.math))
  if (found === undefined) throw new Error('전수조사가 가능한 팩이 카탈로그에 없다 — 이 테스트는 그런 팩을 전제로 한다')
  return found
}

function firstPackWithoutFreeSpins() {
  const found = loadGameCatalog().packs.find((candidate) => candidate.math.scatter?.freeSpins === undefined)
  if (found === undefined) throw new Error('프리스핀이 없는 팩이 카탈로그에 없다 — 이 테스트는 그런 팩을 전제로 한다')
  return found
}

function selectGame(id: string) {
  fireEvent.change(screen.getByLabelText('게임'), { target: { value: id } })
}

describe('검수 시뮬레이터', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('games/*를 읽어 선택기를 채우고 그중 하나를 기본 선택해 둔다', () => {
    const packs = loadGameCatalog().packs
    expect(packs.length).toBeGreaterThan(0)

    render(<App />)
    const select = screen.getByLabelText('게임') as HTMLSelectElement
    const defaultPack = packs.find((candidate) => candidate.id === select.value)
    expect(defaultPack).toBeDefined()

    // 실행 버튼 라벨은 전수조사 가능 여부에 따라 게임마다 다르다. 라벨이 아니라
    // "실행 버튼이 있고 활성화돼 있다"만 본다.
    const runLabel = defaultPack !== undefined && canEnumerate(defaultPack.math) ? '전수조사 실행' : '해석적 산출 + 표본'
    expect(screen.getByRole('button', { name: runLabel })).toBeEnabled()
  })

  it('기본 선택된 게임을 그대로 실행해도 화면이 정상 동작한다 (몬테카를로 전용이어도)', async () => {
    const { runDistributionInWorker } = await import('./lib/mcClient.js')
    render(<App />)

    const select = screen.getByLabelText('게임') as HTMLSelectElement
    const defaultPack = loadGameCatalog().packs.find((candidate) => candidate.id === select.value)
    if (defaultPack === undefined) throw new Error('기본 선택된 게임을 카탈로그에서 찾지 못했다')

    if (canEnumerate(defaultPack.math)) {
      // 지금 카탈로그의 기본 팩이 전수조사가 가능한 경우다. 그 경로는 바로 아래 테스트가 이미 덮는다.
      const bet = defaultBet(defaultPack.math)
      const expected = enumerateAudit(defaultPack.math, bet)
      fireEvent.click(screen.getByRole('button', { name: '전수조사 실행' }))
      await waitFor(() => {
        expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent(`${(expected.rtp * 100).toFixed(4)}%`)
      })
      return
    }

    // 전수조사가 불가능한 모델이 기본으로 뜬 경우다. 지금 카탈로그에서는 astral-clocktower
    // (625 ways, 정지 조합 1,800만+)가 여기 해당한다 — 회귀가 실제로 이 경로에서 났다.
    const bet = defaultBet(defaultPack.math)
    const distribution = analyzeDistribution(defaultPack.math, bet, { sampleSpins: 2_000, sampleSeed: 'default-boot' })
    vi.mocked(runDistributionInWorker).mockReturnValueOnce({
      promise: Promise.resolve({ distribution, betLevels: [] }),
      cancel: vi.fn(),
    })

    expect(screen.getByLabelText('표본 스핀 수 (분포 추정)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '해석적 산출 + 표본' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-exact-rtp')).not.toHaveTextContent('—')
    })
    expect(screen.getByTestId('kpi-exact-rtp')).toHaveTextContent(
      distribution.method === 'monte-carlo' ? 'RTP (몬테카를로)' : 'RTP (해석적)',
    )
  })

  it('전수조사를 실행하면 KPI 타일이 실제 계산값으로 채워진다', async () => {
    const target = firstEnumerablePack()
    const bet = defaultBet(target.math)
    const expected = enumerateAudit(target.math, bet)

    render(<App />)
    selectGame(target.id)
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
    selectGame(firstEnumerablePack().id)
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
    const target = firstEnumerablePack()
    render(<App />)
    selectGame(target.id)
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 실행' }))

    expect(runMcInWorker).toHaveBeenCalledTimes(1)
    const request = vi.mocked(runMcInWorker).mock.calls[0]?.[0]
    expect(request?.seed).toBe('42')
    expect(request?.spins).toBe(1_000_000)
    expect(request?.totalBet).toBe(defaultBet(target.math))
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
    selectGame(firstEnumerablePack().id)
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
    selectGame(firstEnumerablePack().id)
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
    selectGame(firstPackWithoutFreeSpins().id)
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
