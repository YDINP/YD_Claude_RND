import type { HistogramRow } from './types.js'

/**
 * 배수 분포 히스토그램의 구간 정의. 구간은 반열림 `[min, max)`이고
 * 첫 구간(꽝)만 배수가 정확히 0인 경우를 가리킨다.
 */
export interface HistogramBucket {
  key: string
  label: string
  min: number
  max: number
}

export const HISTOGRAM_BUCKETS: readonly HistogramBucket[] = [
  { key: 'zero', label: '0 (꽝)', min: 0, max: 0 },
  { key: 'lt1', label: '0 초과 ~ 1x 미만', min: 0, max: 1 },
  { key: '1-2', label: '1x ~ 2x', min: 1, max: 2 },
  { key: '2-5', label: '2x ~ 5x', min: 2, max: 5 },
  { key: '5-10', label: '5x ~ 10x', min: 5, max: 10 },
  { key: '10-20', label: '10x ~ 20x', min: 10, max: 20 },
  { key: '20-50', label: '20x ~ 50x', min: 20, max: 50 },
  { key: '50-100', label: '50x ~ 100x', min: 50, max: 100 },
  { key: 'gte100', label: '100x 이상', min: 100, max: Number.POSITIVE_INFINITY },
]

/**
 * 총 베팅액 대비 배수를 히스토그램 구간 인덱스로 바꾼다.
 * 0 이하는 꽝(0번), 그 밖에는 `multiplier < max`인 첫 구간이다.
 */
export function bucketIndexFor(multiplier: number): number {
  if (!(multiplier > 0)) return 0
  for (let i = 1; i < HISTOGRAM_BUCKETS.length; i += 1) {
    const bucket = HISTOGRAM_BUCKETS[i]
    if (bucket === undefined) continue
    if (multiplier < bucket.max) return i
  }
  return HISTOGRAM_BUCKETS.length - 1
}

/** 구간별 (조합 수, 배수 합)을 확률·RTP 기여가 붙은 표로 바꾼다. */
export function buildHistogramRows(
  combosPerBucket: readonly number[],
  multiplierSumPerBucket: readonly number[],
  totalCombos: number,
): HistogramRow[] {
  if (totalCombos <= 0) throw new RangeError(`totalCombos는 양수여야 한다: ${totalCombos}`)
  return HISTOGRAM_BUCKETS.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    combos: combosPerBucket[index] ?? 0,
    probability: (combosPerBucket[index] ?? 0) / totalCombos,
    rtpShare: (multiplierSumPerBucket[index] ?? 0) / totalCombos,
  }))
}
