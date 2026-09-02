import type { ConvergencePoint } from '@tgslot/rtp-sim/audit'
import { compactCount, pct } from '../lib/format.js'

const WIDTH = 480
const HEIGHT = 200
const PAD_LEFT = 52
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 26

export interface ConvergenceChartProps {
  points: ConvergencePoint[]
  /** 전수 조사 RTP. 수렴해야 할 값. */
  exactRtp: number
  /** math.json의 목표 RTP. */
  target: number
}

/**
 * 누적 RTP 수렴 곡선. 스핀이 쌓일수록 전수 조사 값으로 빨려 들어가는지 눈으로 확인하는 용도다.
 * 앞쪽 1~2%는 값이 크게 튀므로 y축은 전 구간 min/max에 목표선을 더해 잡는다.
 */
export function ConvergenceChart({ points, exactRtp, target }: ConvergenceChartProps) {
  if (points.length < 2) return <p className="sim-empty">시뮬레이션을 실행하면 수렴 곡선이 그려진다.</p>

  const values = points.map((point) => point.rtp)
  const low = Math.min(...values, exactRtp, target)
  const high = Math.max(...values, exactRtp, target)
  const pad = (high - low) * 0.1 || 0.01
  const yMin = low - pad
  const yMax = high + pad
  const maxSpins = points[points.length - 1]?.spins ?? 1

  const x = (spins: number): number => PAD_LEFT + ((WIDTH - PAD_LEFT - PAD_RIGHT) * spins) / maxSpins
  const y = (rtp: number): number =>
    PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - (rtp - yMin) / (yMax - yMin))

  const path = points.map((point) => `${x(point.spins).toFixed(2)},${y(point.rtp).toFixed(2)}`).join(' ')

  return (
    <svg
      className="sim-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="몬테카를로 RTP 수렴 곡선"
      preserveAspectRatio="xMidYMid meet"
    >
      <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={HEIGHT - PAD_BOTTOM} stroke="var(--sim-border)" />
      <line
        x1={PAD_LEFT}
        y1={HEIGHT - PAD_BOTTOM}
        x2={WIDTH - PAD_RIGHT}
        y2={HEIGHT - PAD_BOTTOM}
        stroke="var(--sim-border)"
      />

      <line
        x1={PAD_LEFT}
        y1={y(target)}
        x2={WIDTH - PAD_RIGHT}
        y2={y(target)}
        stroke="var(--sim-brass)"
        strokeDasharray="4 4"
      />
      <line x1={PAD_LEFT} y1={y(exactRtp)} x2={WIDTH - PAD_RIGHT} y2={y(exactRtp)} stroke="var(--sim-gem)" />

      <polyline points={path} fill="none" stroke="var(--sim-text)" strokeWidth={1.5} />

      <text x={PAD_LEFT - 6} y={y(yMax) + 10} textAnchor="end">
        {pct(yMax, 2)}
      </text>
      <text x={PAD_LEFT - 6} y={y(yMin)} textAnchor="end">
        {pct(yMin, 2)}
      </text>
      <text x={PAD_LEFT} y={HEIGHT - 8}>
        0
      </text>
      <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end">
        {compactCount(maxSpins)} 스핀
      </text>
    </svg>
  )
}
