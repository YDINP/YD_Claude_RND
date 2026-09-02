import type { AgreementVerdict, EnumerationReport, MonteCarloResult } from '@tgslot/rtp-sim/audit'
import { mult, num, pct, pp } from '../lib/format.js'

export interface KpiTilesProps {
  exact: EnumerationReport | null
  mc: MonteCarloResult | null
  agreement: AgreementVerdict | null
  target: number
  /** manifest의 jackpotContribution. 없으면 null. */
  jackpotContribution: number | null
  rtpTotalTarget: number | null
}

interface TileProps {
  id: string
  label: string
  value: string
  note?: string
  tone?: 'brass' | 'gem'
}

function Tile({ id, label, value, note, tone }: TileProps) {
  return (
    <div className={`sim-kpi${tone === undefined ? '' : ` sim-kpi--${tone}`}`} data-testid={`kpi-${id}`}>
      <div className="sim-kpi-label">{label}</div>
      <div className="sim-kpi-value">{value}</div>
      <div className="sim-kpi-note">{note ?? ' '}</div>
    </div>
  )
}

const DASH = '—'

/** 상단 KPI 타일. 아직 실행하지 않은 지표는 값 대신 —를 보여 준다. */
export function KpiTiles({ exact, mc, agreement, target, jackpotContribution, rtpTotalTarget }: KpiTilesProps) {
  const totalRtp = exact === null ? null : exact.rtp + (jackpotContribution ?? 0)

  return (
    <div className="sim-kpis">
      <Tile
        id="exact-rtp"
        label="전수 조사 RTP"
        tone="brass"
        value={exact === null ? DASH : pct(exact.rtp)}
        note={exact === null ? '전수조사를 실행하세요' : `목표 ${pct(target, 2)} 대비 ${pp(exact.rtp - target)}`}
      />
      <Tile
        id="mc-rtp"
        label="몬테카를로 RTP"
        tone="gem"
        value={mc === null ? DASH : pct(mc.rtp)}
        note={
          mc === null || agreement === null
            ? '시뮬레이션을 실행하세요'
            : `95% CI ±${pp(agreement.halfWidth95)} · ${num(mc.spins)} 스핀`
        }
      />
      <Tile
        id="hit-rate"
        label="적중률"
        value={exact === null ? DASH : pct(exact.hitRate, 3)}
        note={mc === null ? undefined : `시뮬 ${pct(mc.hitRate, 3)}`}
      />
      <Tile
        id="max-win"
        label="최대 배수"
        value={exact === null ? DASH : mult(exact.maxWinMultiplier)}
        note={mc === null ? undefined : `시뮬 관측 ${mult(mc.maxWin / mc.totalBet)}`}
      />
      <Tile
        id="std-dev"
        label="표준편차"
        value={mc === null ? DASH : mc.stdDev.toFixed(4)}
        note="스핀당 승리 배수 기준"
      />
      <Tile
        id="total-rtp"
        label="총 RTP (잭팟 포함)"
        value={totalRtp === null ? DASH : pct(totalRtp)}
        note={
          jackpotContribution === null
            ? '잭팟 기여분 없음'
            : `기본 + 잭팟 ${pct(jackpotContribution, 2)}${
                rtpTotalTarget === null || totalRtp === null ? '' : ` · 목표 대비 ${pp(totalRtp - rtpTotalTarget)}`
              }`
        }
      />
    </div>
  )
}
