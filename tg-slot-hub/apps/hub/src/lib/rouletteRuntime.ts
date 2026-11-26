/**
 * 무대 룰렛 오버레이가 쓰는 자원 장부. 진행 중인 WAAPI 애니메이션과 토큰 DOM 수를 세어 두었다가
 * 디버그 패널·QA 스크립트가 읽는다(«진입 3회 뒤 토큰 DOM 6개 유지 · 언마운트 뒤 진행 중 애니메이션 0»).
 * 장부는 세기만 한다 — 자원의 주인은 각 컴포넌트다.
 */
const live = new Set<Animation>()
let tokens = 0
let mounts = 0
let frames = 0

/** 애니메이션을 장부에 올린다. 끝나거나 취소되면 스스로 내려간다. */
export function trackAnimation(animation: Animation): Animation {
  live.add(animation)
  const drop = (): void => {
    live.delete(animation)
  }
  animation.addEventListener('finish', drop, { once: true })
  animation.addEventListener('cancel', drop, { once: true })
  return animation
}

/** 장부에 올라 있는 애니메이션을 전부 취소한다(언마운트). */
export function cancelTrackedAnimations(): void {
  for (const animation of [...live]) {
    try {
      animation.cancel()
    } catch {
      /* 이미 끝난 애니메이션 */
    }
  }
  live.clear()
}

export function setRouletteTokenNodes(count: number): void {
  tokens = count
}

export function noteRouletteMount(delta: 1 | -1): void {
  mounts = Math.max(0, mounts + delta)
}

export function noteRouletteFrames(count: number): void {
  frames = count
}

export interface RouletteDiagnostics {
  /** 진행 중인 WAAPI 애니메이션 수. */
  animations: number
  /** 마운트된 불빛 토큰 DOM 수(풀 크기). */
  tokenNodes: number
  /** 마운트된 오버레이 수. */
  mounted: number
  /** 마지막으로 센 회전 프레임 수(디버그용). */
  frames: number
}

export function rouletteDiagnostics(): RouletteDiagnostics {
  return { animations: live.size, tokenNodes: tokens, mounted: mounts, frames }
}
