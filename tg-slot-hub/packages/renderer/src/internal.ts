import type {
  PaylineStyle,
  RendererFit,
  RendererOptions,
  ShowWinsOptions,
  SpinHandle,
  SpinToOptions,
} from './types.js'
import type { WinLine } from '@tgslot/slot-engine'
import type { RendererMode } from './features.js'
import type { SpinSpeed } from './timing.js'

/** 옵션 기본값이 모두 채워진 형태. pixi 구현은 이것만 받는다. */
export interface ResolvedRendererOptions extends RendererOptions {
  reducedMotion: boolean
  initialStops: number[]
  fit: RendererFit
  overflowX: number
  paylineStyle: PaylineStyle
}

/** pixi 구현이 노출하는 내부 인터페이스. `ready`는 파사드가 관리한다. */
export interface RendererCore {
  spinTo(stops: number[], opts?: SpinToOptions): SpinHandle
  showWins(wins: WinLine[], opts?: ShowWinsOptions): Promise<void>
  skipWins(): void
  clearWins(): void
  setSpinSpeed(speed: SpinSpeed): void
  setSpinningIdle(on: boolean): void
  setMode(mode: RendererMode): void
  resize(): void
  destroy(): void
}
