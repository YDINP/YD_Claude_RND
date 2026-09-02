/** 가로 막대 차트. 차트 라이브러리 없이 SVG를 직접 그린다. */

export interface BarRow {
  key: string
  label: string
  value: number
  /** 막대 오른쪽에 붙는 보조 문구. */
  note?: string
}

const LABEL_WIDTH = 118
const BAR_LEFT = 124
const BAR_RIGHT = 372
const VALUE_X = 380
const WIDTH = 460
const ROW_HEIGHT = 22
const BAR_HEIGHT = 12

/**
 * 로그 스케일 위치. 확률처럼 0.7과 0.00003이 한 차트에 섞일 때 쓴다.
 * 0 이하는 길이 0으로 눕힌다.
 */
function logRatio(value: number, max: number, floor: number): number {
  if (value <= 0) return 0
  const low = Math.log10(floor)
  const span = Math.log10(max) - low
  if (span <= 0) return 1
  return Math.max(0, Math.min(1, (Math.log10(value) - low) / span))
}

export interface BarChartProps {
  rows: BarRow[]
  format: (value: number) => string
  /** 막대 색. 기본은 브라스. */
  color?: string
  /** 값의 편차가 클 때 'log'. 기본 'linear'. */
  scale?: 'linear' | 'log'
  title?: string
}

export function BarChart({ rows, format, color = 'var(--sim-brass)', scale = 'linear', title }: BarChartProps) {
  if (rows.length === 0) return <p className="sim-empty">표시할 데이터가 없다.</p>

  const max = Math.max(...rows.map((row) => row.value), 0)
  const positives = rows.map((row) => row.value).filter((value) => value > 0)
  const floor = positives.length > 0 ? Math.min(...positives) / 3 : 1
  const height = rows.length * ROW_HEIGHT + 8

  const ratioOf = (value: number): number => {
    if (max <= 0) return 0
    return scale === 'log' ? logRatio(value, max, floor) : Math.max(0, value / max)
  }

  return (
    <svg
      className="sim-chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={title ?? '막대 차트'}
      preserveAspectRatio="xMidYMid meet"
    >
      {rows.map((row, index) => {
        const y = index * ROW_HEIGHT + 4
        const width = (BAR_RIGHT - BAR_LEFT) * ratioOf(row.value)
        return (
          <g key={row.key}>
            <text x={LABEL_WIDTH} y={y + BAR_HEIGHT - 1} textAnchor="end">
              {row.label}
            </text>
            <rect x={BAR_LEFT} y={y} width={BAR_RIGHT - BAR_LEFT} height={BAR_HEIGHT} rx={3} fill="var(--sim-bg)" />
            <rect x={BAR_LEFT} y={y} width={width} height={BAR_HEIGHT} rx={3} fill={color} />
            <text className="sim-chart-value" x={VALUE_X} y={y + BAR_HEIGHT - 1}>
              {format(row.value)}
              {row.note === undefined ? '' : ` ${row.note}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
