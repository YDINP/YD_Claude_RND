import type {
  AgreementVerdict,
  BetLevelRow,
  ContributionRow,
  CountContributionRow,
  GateRow,
  HistogramRow,
  LineContributionRow,
  MonteCarloResult,
  RuinReport,
} from '@tgslot/rtp-sim/audit'
import { mult, num, pct, pp, seconds } from '../lib/format.js'

const OK = '✅'
const NG = '❌'

export function GateTable({ gates }: { gates: GateRow[] }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th>판정</th>
          <th className="sim-left">항목</th>
          <th className="sim-left">측정값</th>
        </tr>
      </thead>
      <tbody>
        {gates.map((gate) => (
          <tr key={gate.label}>
            <td className={gate.pass ? 'sim-pass' : 'sim-fail'}>{gate.pass ? OK : NG}</td>
            <td className="sim-left">{gate.label}</td>
            <td className="sim-left sim-mono">{gate.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BetLevelTable({ rows }: { rows: BetLevelRow[] }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th className="sim-left">총 베팅액</th>
          <th>라인당</th>
          <th>RTP</th>
          <th>목표 대비</th>
          <th>적중률</th>
          <th>최대 배수</th>
          <th>판정</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.totalBet}>
            <td className="sim-left sim-mono">{num(row.totalBet)}</td>
            <td className="sim-mono">{num(row.betPerLine)}</td>
            <td className="sim-mono">{pct(row.rtp)}</td>
            <td className="sim-mono">{pp(row.delta)}</td>
            <td className="sim-mono">{pct(row.hitRate, 3)}</td>
            <td className="sim-mono">{mult(row.maxWinMultiplier)}</td>
            <td className={row.pass ? 'sim-pass' : 'sim-fail'}>{row.pass ? OK : NG}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ContributionTable({ rows, keyHeader }: { rows: ContributionRow[]; keyHeader: string }) {
  if (rows.length === 0) return <p className="sim-empty">해당 없음.</p>
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th className="sim-left">{keyHeader}</th>
          <th className="sim-left">이름</th>
          <th>RTP 기여</th>
          <th>전체 대비</th>
          <th>지급 라인 수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="sim-left sim-mono">{row.key}</td>
            <td className="sim-left">{row.label}</td>
            <td className="sim-mono">{pct(row.rtp)}</td>
            <td className="sim-mono">{pct(row.share, 2)}</td>
            <td className="sim-mono">{num(row.hits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function LineTable({ rows }: { rows: LineContributionRow[] }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th className="sim-left">라인</th>
          <th className="sim-left">패턴</th>
          <th>RTP 기여</th>
          <th>전체 대비</th>
          <th>지급 라인 수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.line}>
            <td className="sim-left sim-mono">#{row.line}</td>
            <td className="sim-left sim-mono">[{row.pattern.join(', ')}]</td>
            <td className="sim-mono">{pct(row.rtp)}</td>
            <td className="sim-mono">{pct(row.share, 2)}</td>
            <td className="sim-mono">{num(row.hits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CountTable({ rows }: { rows: CountContributionRow[] }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th className="sim-left">매치 개수</th>
          <th>RTP 기여</th>
          <th>전체 대비</th>
          <th>지급 라인 수</th>
          <th>지급 코인</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.count}>
            <td className="sim-left">{row.count}개 연속</td>
            <td className="sim-mono">{pct(row.rtp)}</td>
            <td className="sim-mono">{pct(row.share, 2)}</td>
            <td className="sim-mono">{num(row.hits)}</td>
            <td className="sim-mono">{num(row.win)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HistogramTable({ rows, rtp }: { rows: HistogramRow[]; rtp: number }) {
  return (
    <table className="sim-table">
      <thead>
        <tr>
          <th className="sim-left">배수 구간</th>
          <th>조합 수</th>
          <th>확률</th>
          <th>RTP 기여</th>
          <th>전체 대비</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="sim-left">{row.label}</td>
            <td className="sim-mono">{num(row.combos)}</td>
            <td className="sim-mono">{pct(row.probability)}</td>
            <td className="sim-mono">{pct(row.rtpShare)}</td>
            <td className="sim-mono">{rtp === 0 ? '-' : pct(row.rtpShare / rtp, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function VolatilityTable({ mc, ruin }: { mc: MonteCarloResult; ruin: RuinReport }) {
  const rows: [string, string][] = [
    ['표준편차 (배수)', mc.stdDev.toFixed(4)],
    ['시작 잔액', `${num(ruin.startBalanceMultiple)}x 베팅 (${num(ruin.startBalanceMultiple * mc.totalBet)} 코인)`],
    ['반복 횟수', `${num(ruin.trials)}회 x ${num(ruin.spins)} 스핀`],
    ['파산 횟수', `${num(ruin.ruined)} / ${num(ruin.trials)}`],
    ['파산 확률', pct(ruin.ruinRate, 2)],
    ['종료 잔액 중앙값', mult(ruin.medianEndMultiple)],
    ['파산까지 평균 스핀', ruin.meanSpinsToRuin === null ? '파산 없음' : `${num(ruin.meanSpinsToRuin)} 스핀`],
  ]
  return <KeyValueTable rows={rows} />
}

export function McTable({ mc, agreement }: { mc: MonteCarloResult; agreement: AgreementVerdict }) {
  const rows: [string, string][] = [
    ['스핀 수', num(mc.spins)],
    ['시드', mc.seed],
    ['RTP', pct(mc.rtp)],
    ['95% 신뢰구간', `${pct(agreement.ciLow)} ~ ${pct(agreement.ciHigh)} (±${pp(agreement.halfWidth95)})`],
    ['표준오차', pp(agreement.standardError)],
    ['적중률', pct(mc.hitRate)],
    ['최대 승리', `${num(mc.maxWin)} 코인 (${mult(mc.maxWin / mc.totalBet)})`],
    ['소요 시간', seconds(mc.elapsedMs)],
    [
      '전수 조사와의 차이',
      `${pp(agreement.diff)} / 임계 ±${(agreement.threshold * 100).toFixed(3)}%p ${agreement.pass ? OK : NG}`,
    ],
  ]
  return <KeyValueTable rows={rows} />
}

export function KeyValueTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="sim-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td className="sim-left">{label}</td>
            <td className="sim-left sim-mono">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
