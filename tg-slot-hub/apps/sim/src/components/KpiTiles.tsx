import type { AgreementVerdict, DistributionReport, FeatureReport, MonteCarloResult } from '@tgslot/rtp-sim/audit'
import { mult, num, pct, pp } from '../lib/format.js'

export interface KpiTilesProps {
  distribution: DistributionReport | null
  mc: MonteCarloResult | null
  agreement: AgreementVerdict | null
  features: FeatureReport | null
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
  /** 표본에서 온 값이면 배지를 단다. */
  estimated?: boolean
}

function Tile({ id, label, value, note, tone, estimated = false }: TileProps) {
  return (
    <div className={`sim-kpi${tone === undefined ? '' : ` sim-kpi--${tone}`}`} data-testid={`kpi-${id}`}>
      <div className="sim-kpi-label">
        {label}
        {estimated && <span className="sim-badge sim-badge--estimated">표본 추정</span>}
      </div>
      <div className="sim-kpi-value">{value}</div>
      <div className="sim-kpi-note">{note ?? ' '}</div>
    </div>
  )
}

const DASH = '—'

/** 상단 KPI 타일. 아직 실행하지 않은 지표는 값 대신 —를 보여 준다. */
export function KpiTiles({
  distribution,
  mc,
  agreement,
  features,
  target,
  jackpotContribution,
  rtpTotalTarget,
}: KpiTilesProps) {
  const totalRtp = distribution === null ? null : distribution.rtp + (jackpotContribution ?? 0)
  const estimated = distribution?.estimated ?? false
  const methodLabel =
    distribution === null
      ? null
      : distribution.method === 'enumerate'
        ? '전수조사'
        : distribution.method === 'analytic'
          ? '해석적'
          : '몬테카를로'

  return (
    <div className="sim-kpis">
      <Tile
        id="exact-rtp"
        label={methodLabel === null ? 'RTP' : `RTP (${methodLabel})`}
        tone="brass"
        value={distribution === null ? DASH : pct(distribution.rtp)}
        note={
          distribution === null
            ? '전수조사를 실행하세요'
            : distribution.precision === null
              ? `목표 ${pct(target, 2)} 대비 ${pp(distribution.rtp - target)}`
              : `${pp(distribution.rtp - target)} · 95% CI ±${pp(distribution.precision.ci95HalfWidth)}`
        }
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
        estimated={estimated}
        value={distribution === null ? DASH : pct(distribution.hitRate, 3)}
        note={mc === null ? undefined : `시뮬 ${pct(mc.hitRate, 3)}`}
      />
      <Tile
        id="max-win"
        label="최대 배수"
        estimated={estimated}
        value={distribution === null ? DASH : mult(distribution.maxWinMultiplier)}
        note={mc === null ? undefined : `시뮬 관측 ${mult(mc.maxWin / mc.totalBet)}`}
      />
      <Tile
        id="std-dev"
        label="표준편차"
        value={mc === null ? DASH : mc.stdDev.toFixed(4)}
        note="라운드 승리 배수 기준"
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
      {features !== null && (
        <>
          <Tile
            id="free-spins"
            label="프리스핀 몫"
            tone="gem"
            value={distribution === null ? DASH : pct(features.freeSpinsShare, 2)}
            note={
              distribution === null
                ? undefined
                : `RTP ${pct(distribution.breakdown.freeSpins)} · 배수 ${features.multiplier}x`
            }
          />
          <Tile
            id="trigger"
            label="프리스핀 트리거"
            value={pct(features.triggerProbability, 3)}
            note={
              features.triggerProbability <= 0
                ? undefined
                : `약 ${num(1 / features.triggerProbability)}스핀에 1회 · 트리거당 ${features.spinsPerTrigger.toFixed(1)}회`
            }
          />
        </>
      )}
    </div>
  )
}
