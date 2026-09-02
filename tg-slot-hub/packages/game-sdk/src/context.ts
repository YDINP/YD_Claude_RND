import type { Bet, SpinResult } from '@tgslot/slot-engine'

/** 프레임워크 중립 구독 가능 값. React·Zustand·PixiJS 어디서나 쓸 수 있게 최소 형태만 둔다. */
export interface Signal<T> {
  get(): T
  /** 구독 해제 함수를 반환한다. */
  subscribe(fn: (value: T) => void): () => void
}

export interface AudioBus {
  play(id: string, options?: { volume?: number; loop?: boolean }): void
  stop(id: string): void
  setMuted(muted: boolean): void
}

export type HapticKind = 'light' | 'medium' | 'success'

/**
 * 허브가 게임에 주입하는 실행 컨텍스트.
 * 게임은 지갑을 **직접 만지지 않는다**. 잔액은 읽기 전용이고 결과는 서버가 준 것만 쓴다.
 */
export interface GameContext {
  wallet: { balance$: Signal<number> }
  /** 스핀 결과의 유일한 소스. 클라이언트 계산 결과를 신뢰하지 않는다. */
  api: { spin(bet: Bet): Promise<SpinResult> }
  audio: AudioBus
  haptic: (kind: HapticKind) => void
  i18n: (key: string) => string
  track: (event: string, props?: object) => void
}

/** 게임 팩의 선택적 `client.ts`가 default export 하는 인터페이스. */
export interface GameClient {
  mount(container: HTMLElement, ctx: GameContext): Promise<void>
  unmount(): void
}
