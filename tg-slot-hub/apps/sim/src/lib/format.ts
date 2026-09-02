/** 화면 표기 헬퍼. 리포트(마크다운)와 같은 자릿수를 쓴다. */

export function pct(value: number, digits = 4): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function num(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function mult(value: number, digits = 2): string {
  return `${value.toFixed(digits)}x`
}

/** 소수 비율을 부호 붙은 %p로. 0.0032 -> "+0.320%p". */
export function pp(value: number, digits = 3): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%p`
}

/** 1000000 -> "1M", 100000 -> "100k". 스핀 수 선택지 표기용. */
export function compactCount(value: number): string {
  if (value >= 1_000_000) return `${value / 1_000_000}M`
  if (value >= 1_000) return `${value / 1_000}k`
  return String(value)
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}
