import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RTP_TOLERANCE,
  agreementVerdict,
  auditBetLevels,
  buildAuditMarkdown,
  composeAuditResult,
  enumerateAudit,
  jackpotAccounting,
} from '@tgslot/rtp-sim/audit'
import type { AuditResult, BetLevelRow, EnumerationReport, MonteCarloResult, RuinReport } from '@tgslot/rtp-sim/audit'
import { BarChart } from './components/BarChart.js'
import type { BarRow } from './components/BarChart.js'
import { ConvergenceChart } from './components/ConvergenceChart.js'
import { KpiTiles } from './components/KpiTiles.js'
import { LeftPanel, SPIN_CHOICES } from './components/LeftPanel.js'
import type { GateChip } from './components/LeftPanel.js'
import { SampleSpins } from './components/SampleSpins.js'
import {
  BetLevelTable,
  ContributionTable,
  CountTable,
  GateTable,
  HistogramTable,
  LineTable,
  McTable,
  VolatilityTable,
} from './components/Tables.js'
import { defaultBet, loadGameCatalog } from './games.js'
import { pct } from './lib/format.js'
import { CANCELLED, runMcInWorker } from './lib/mcClient.js'
import type { McHandle } from './lib/mcClient.js'

/** GUI의 파산 시뮬 설정. CLI 기본값과 같다. */
const RUIN_TRIALS = 500
const RUIN_SPINS = 1000

interface ExactState {
  exact: EnumerationReport
  betLevels: BetLevelRow[]
}

interface McState {
  mc: MonteCarloResult
  ruin: RuinReport
}

type Tab = 'summary' | 'spins'

const catalog = loadGameCatalog()

export function App() {
  const [gameId, setGameId] = useState(catalog.packs[0]?.id ?? '')
  const pack = catalog.packs.find((candidate) => candidate.id === gameId) ?? catalog.packs[0]

  const [totalBet, setTotalBet] = useState(() => (pack === undefined ? 0 : defaultBet(pack.math)))
  const [spins, setSpins] = useState<number>(SPIN_CHOICES[1])
  const [seed, setSeed] = useState('42')
  const [exactState, setExactState] = useState<ExactState | null>(null)
  const [mcState, setMcState] = useState<McState | null>(null)
  const [busy, setBusy] = useState<{ phase: string; ratio: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const handleRef = useRef<McHandle | null>(null)

  // 게임이나 베팅액이 바뀌면 이전 측정값은 더 이상 그 조건의 결과가 아니다.
  useEffect(() => {
    setExactState(null)
    setMcState(null)
    setError(null)
  }, [gameId, totalBet])

  useEffect(() => () => handleRef.current?.cancel(), [])

  const changeGame = useCallback(
    (id: string) => {
      const next = catalog.packs.find((candidate) => candidate.id === id)
      setGameId(id)
      if (next !== undefined) setTotalBet(defaultBet(next.math))
    },
    [],
  )

  const runExact = useCallback(() => {
    if (pack === undefined) return
    setError(null)
    setBusy({ phase: '전수 조사', ratio: 0 })
    // 32k~수백만 조합이라 동기로 돌린다. 진행 표시가 한 번은 그려지도록 다음 프레임에 실행한다.
    setTimeout(() => {
      try {
        const exact = enumerateAudit(pack.math, totalBet)
        const betLevels = auditBetLevels(pack.math)
        setExactState({ exact, betLevels })
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : String(thrown))
      } finally {
        setBusy(null)
      }
    }, 0)
  }, [pack, totalBet])

  const runMc = useCallback(() => {
    if (pack === undefined) return
    setError(null)
    setBusy({ phase: '몬테카를로', ratio: 0 })
    const handle = runMcInWorker(
      { mathJson: pack.math, totalBet, spins, seed, ruinTrials: RUIN_TRIALS, ruinSpins: RUIN_SPINS },
      (progress) => setBusy({ phase: progress.phase, ratio: progress.ratio }),
    )
    handleRef.current = handle
    handle.promise
      .then((done) => setMcState(done))
      .catch((thrown: unknown) => {
        const message = thrown instanceof Error ? thrown.message : String(thrown)
        // 사용자가 직접 중단한 것은 실패가 아니다.
        if (message === CANCELLED) return
        setError(message)
      })
      .finally(() => {
        handleRef.current = null
        setBusy(null)
      })
  }, [pack, totalBet, spins, seed])

  const cancel = useCallback(() => {
    handleRef.current?.cancel()
    handleRef.current = null
    setBusy(null)
  }, [])

  const audit: AuditResult | null = useMemo(() => {
    if (pack === undefined || exactState === null || mcState === null) return null
    return composeAuditResult(
      pack.math,
      pack.manifestJson,
      { totalBet, spins: mcState.mc.spins, seed: mcState.mc.seed },
      { exact: exactState.exact, betLevels: exactState.betLevels, mc: mcState.mc, ruin: mcState.ruin },
    )
  }, [pack, exactState, mcState, totalBet])

  const exportMarkdown = useCallback(() => {
    if (audit === null) return
    const blob = new Blob([buildAuditMarkdown(audit)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `RTP_AUDIT_${audit.game.id}.md`
    link.click()
    URL.revokeObjectURL(url)
  }, [audit])

  if (pack === undefined) {
    return (
      <main className="sim-main">
        <h1>게임 팩이 없다</h1>
        <p className="sim-empty">
          games/ 아래에 math.json을 가진 폴더가 필요하다.
          {catalog.errors.map((item) => (
            <span key={item.id}>
              <br />
              {item.id}: {item.message}
            </span>
          ))}
        </p>
      </main>
    )
  }

  const agreement = exactState === null || mcState === null ? null : agreementVerdict(mcState.mc, exactState.exact.rtp)
  const jackpot = exactState === null ? null : jackpotAccounting(exactState.exact.rtp, pack.extras)
  const contribution = pack.extras?.jackpotContribution ?? null
  const chips = buildChips(exactState, pack.math.rtpTarget, jackpot, agreement)

  return (
    <div className="sim-app">
      <LeftPanel
        packs={catalog.packs}
        gameId={pack.id}
        onGameChange={changeGame}
        betLevels={pack.math.betLevels}
        totalBet={totalBet}
        onBetChange={setTotalBet}
        spins={spins}
        onSpinsChange={setSpins}
        seed={seed}
        onSeedChange={setSeed}
        onRunExact={runExact}
        onRunMc={runMc}
        onCancel={cancel}
        onExport={exportMarkdown}
        busy={busy}
        exactDone={exactState !== null}
        exportReady={audit !== null}
        chips={chips}
        error={error}
      />

      <main className="sim-main">
        <div className="sim-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="sim-tab"
            aria-selected={tab === 'summary'}
            onClick={() => setTab('summary')}
          >
            검수 요약
          </button>
          <button
            type="button"
            role="tab"
            className="sim-tab"
            aria-selected={tab === 'spins'}
            onClick={() => setTab('spins')}
          >
            샘플 스핀
          </button>
        </div>

        {tab === 'spins' ? (
          <SampleSpins math={pack.math} totalBet={totalBet} seed={seed} />
        ) : (
          <Summary
            exactState={exactState}
            mcState={mcState}
            audit={audit}
            target={pack.math.rtpTarget}
            contribution={contribution}
            rtpTotalTarget={pack.extras?.rtpTotalTarget ?? null}
          />
        )}
      </main>
    </div>
  )
}

function buildChips(
  exactState: ExactState | null,
  target: number,
  jackpot: ReturnType<typeof jackpotAccounting>,
  agreement: ReturnType<typeof agreementVerdict> | null,
): GateChip[] {
  const chips: GateChip[] = []
  const tolerance = `±${(RTP_TOLERANCE * 100).toFixed(1)}%p`

  chips.push({
    key: 'target',
    label: `목표 ${pct(target, 2)} ${tolerance}`,
    state:
      exactState === null ? 'idle' : Math.abs(exactState.exact.rtp - target) <= RTP_TOLERANCE ? 'pass' : 'fail',
  })

  if (jackpot !== null) {
    chips.push({
      key: 'total',
      label: `총 RTP ${pct(jackpot.totalRtp, 2)}`,
      state: jackpot.pass === null ? 'idle' : jackpot.pass ? 'pass' : 'fail',
    })
  }

  chips.push({
    key: 'hit',
    label: exactState === null ? '적중률' : `적중률 ${pct(exactState.exact.hitRate, 1)}`,
    state:
      exactState === null ? 'idle' : exactState.exact.hitRate > 0.1 && exactState.exact.hitRate < 0.6 ? 'pass' : 'fail',
  })

  chips.push({
    key: 'maxwin',
    label: exactState === null ? '최대 배수' : `최대 ${exactState.exact.maxWinMultiplier.toFixed(0)}x`,
    state: exactState === null ? 'idle' : exactState.exact.maxWinMultiplier >= 100 ? 'pass' : 'fail',
  })

  chips.push({
    key: 'mc',
    label: '몬테카를로 일치',
    state: agreement === null ? 'idle' : agreement.pass ? 'pass' : 'fail',
  })

  return chips
}

interface SummaryProps {
  exactState: ExactState | null
  mcState: McState | null
  audit: AuditResult | null
  target: number
  contribution: number | null
  rtpTotalTarget: number | null
}

function Summary({ exactState, mcState, audit, target, contribution, rtpTotalTarget }: SummaryProps) {
  const exact = exactState?.exact ?? null
  const agreement = exact === null || mcState === null ? null : agreementVerdict(mcState.mc, exact.rtp)

  const symbolBars: BarRow[] =
    exact === null
      ? []
      : exact.symbols.map((row) => ({ key: row.key, label: row.label, value: row.rtp, note: `(${pct(row.share, 1)})` }))
  const lineBars: BarRow[] =
    exact === null ? [] : exact.lines.map((row) => ({ key: String(row.line), label: `#${row.line} [${row.pattern.join(',')}]`, value: row.rtp }))
  const histogramProbabilityBars: BarRow[] =
    exact === null ? [] : exact.histogram.map((row) => ({ key: row.key, label: row.label, value: row.probability }))
  const histogramRtpBars: BarRow[] =
    exact === null ? [] : exact.histogram.map((row) => ({ key: row.key, label: row.label, value: row.rtpShare }))

  return (
    <>
      <KpiTiles
        exact={exact}
        mc={mcState?.mc ?? null}
        agreement={agreement}
        target={target}
        jackpotContribution={contribution}
        rtpTotalTarget={rtpTotalTarget}
      />

      {audit !== null && (
        <section className="sim-section">
          <h2>게이트 판정</h2>
          <GateTable gates={audit.gates} />
        </section>
      )}

      {exact === null ? (
        <section className="sim-section">
          <h2>전수 조사</h2>
          <p className="sim-empty">왼쪽에서 &quot;전수조사 실행&quot;을 누르면 모든 정지 조합을 계산한다.</p>
        </section>
      ) : (
        <>
          <div className="sim-grid-2">
            <section className="sim-section">
              <h2>배수 분포 — 확률 (로그 축)</h2>
              <p>구간이 로그 간격이라 축도 로그로 그린다. 숫자는 실제 확률이다.</p>
              <BarChart
                rows={histogramProbabilityBars}
                format={(value) => pct(value, 4)}
                scale="log"
                color="var(--sim-gem)"
                title="배수 구간별 확률"
              />
            </section>
            <section className="sim-section">
              <h2>배수 분포 — RTP 기여</h2>
              <p>각 구간이 전체 RTP에서 차지하는 몫. 합은 전수 조사 RTP와 같다.</p>
              <BarChart rows={histogramRtpBars} format={(value) => pct(value, 4)} title="배수 구간별 RTP 기여" />
            </section>
          </div>

          <section className="sim-section">
            <h2>배수 분포 표</h2>
            <HistogramTable rows={exact.histogram} rtp={exact.rtp} />
          </section>

          <div className="sim-grid-2">
            <section className="sim-section">
              <h2>심볼별 RTP 기여</h2>
              <BarChart rows={symbolBars} format={(value) => pct(value, 3)} title="심볼별 RTP 기여" />
              <ContributionTable rows={exact.symbols} keyHeader="심볼" />
            </section>
            <section className="sim-section">
              <h2>라인별 RTP 기여</h2>
              <BarChart rows={lineBars} format={(value) => pct(value, 3)} color="var(--sim-gem)" title="라인별 RTP 기여" />
              <LineTable rows={exact.lines} />
            </section>
          </div>

          {exact.groups.length > 0 && (
            <section className="sim-section">
              <h2>그룹별 RTP 기여</h2>
              <p>&quot;아무 BAR&quot;처럼 여러 심볼이 섞여도 지급하는 배당의 몫이다.</p>
              <ContributionTable rows={exact.groups} keyHeader="그룹" />
            </section>
          )}

          <div className="sim-grid-2">
            <section className="sim-section">
              <h2>매치 개수별 RTP 기여</h2>
              <CountTable rows={exact.counts} />
            </section>
            <section className="sim-section">
              <h2>베팅 레벨별 전수 조사</h2>
              {exactState !== null && <BetLevelTable rows={exactState.betLevels} />}
            </section>
          </div>
        </>
      )}

      <section className="sim-section">
        <h2>몬테카를로 수렴</h2>
        {mcState === null || exact === null ? (
          <p className="sim-empty">
            &quot;시뮬레이션 실행&quot;을 누르면 워커에서 스핀을 돌리고 1%마다 누적 RTP를 찍는다.
          </p>
        ) : (
          <>
            <ConvergenceChart points={mcState.mc.convergence} exactRtp={exact.rtp} target={target} />
            <div className="sim-legend">
              <span style={{ color: 'var(--sim-text)' }}>누적 RTP</span>
              <span style={{ color: 'var(--sim-gem)' }}>전수 조사</span>
              <span style={{ color: 'var(--sim-brass)' }}>목표</span>
            </div>
          </>
        )}
      </section>

      {mcState !== null && agreement !== null && (
        <div className="sim-grid-2">
          <section className="sim-section">
            <h2>몬테카를로 결과</h2>
            <McTable mc={mcState.mc} agreement={agreement} />
          </section>
          <section className="sim-section">
            <h2>변동성 · 파산 확률</h2>
            <p>잔액 100x 베팅에서 시작해 1000스핀 안에 베팅액을 낼 수 없게 되는 비율이다.</p>
            <VolatilityTable mc={mcState.mc} ruin={mcState.ruin} />
          </section>
        </div>
      )}
    </>
  )
}
