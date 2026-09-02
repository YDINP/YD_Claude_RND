/**
 * 모션 축소 여부. 명시 옵션이 최우선이고, 없으면 `prefers-reduced-motion`을 본다.
 * matchMedia가 없는 환경(SSR, 테스트)에서는 false다.
 */
export function resolveReducedMotion(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit
  if (typeof globalThis.matchMedia !== 'function') return false
  try {
    return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** 캔버스 해상도 배율. 1~3으로 묶어 고DPI 기기에서 메모리가 폭발하지 않게 한다. */
export const MAX_RESOLUTION = 3

export function resolveResolution(dpr: number = globalThis.devicePixelRatio ?? 1): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1
  return Math.min(MAX_RESOLUTION, Math.max(1, dpr))
}
