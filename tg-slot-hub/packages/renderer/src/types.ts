import type { GameMath, SymbolId, WinLine } from '@tgslot/slot-engine'
import type { FrameWindow } from './layout.js'

/** 테마가 선택적으로 선언할 수 있는 효과음 키. 파일이 없으면 키를 빼면 된다. */
export type SfxKey = 'spin' | 'stop' | 'win' | 'bigwin'

/** 프레임 아트의 배치 정보. 값은 프레임 이미지 크기에 대한 분수다. */
export interface FrameLayout {
  window: FrameWindow
}

export interface ThemePalette {
  /** 벡터 베젤을 그릴 때의 테두리 색. `Theme.frame`(이미지)과는 별개다. */
  frame: string
  /** 릴 뒷면 색. */
  reelBg: string
  /** 페이라인 색 팔레트. 라인 인덱스를 이 배열 길이로 나눈 나머지로 고른다. */
  winLine: string[]
  /** 배당 라벨 등 텍스트 색. */
  text: string
}

/**
 * 게임 팩 1개의 표시용 자산 묶음. URL은 전부 절대 경로거나 문서 기준 경로여야 한다
 * (`loadTheme`가 `theme.json`의 상대 경로를 baseUrl 기준으로 풀어 준다).
 */
export interface Theme {
  /** symbolId -> 이미지 URL (svg 권장). */
  symbols: Record<SymbolId, string>
  /** 배경 이미지 URL. 없으면 팔레트 색만 쓴다. */
  background?: string
  /**
   * 릴을 감싸는 베젤 아트 URL. 릴 창은 알파로 뚫려 있어야 한다.
   * 있으면 렌더러가 벡터 베젤 대신 이 이미지를 릴 위에 얹는다.
   */
  frame?: string
  /** 프레임 아트 안의 릴 창 위치. 없으면 `DEFAULT_FRAME_WINDOW`를 쓴다. */
  frameLayout?: FrameLayout
  palette: ThemePalette
  /** 효과음 URL. 렌더러는 재생하지 않고 허브의 AudioBus가 쓴다. */
  sfx?: Partial<Record<SfxKey, string>>
}

export type RendererEvent =
  | { type: 'reelStop'; reel: number }
  | { type: 'spinEnd' }
  | { type: 'winShown'; line: number }

export interface RendererOptions {
  /** 캔버스를 붙일 DOM 요소. 크기는 이 요소의 클라이언트 박스를 따른다. */
  container: HTMLElement
  math: GameMath
  theme: Theme
  /** 첫 화면에 보일 정지 위치. 없으면 전부 0. */
  initialStops?: number[]
  onEvent?: (e: RendererEvent) => void
  /** true면 긴 애니메이션을 건너뛴다. 미지정 시 `prefers-reduced-motion`을 따른다. */
  reducedMotion?: boolean
}

export interface SpinToOptions {
  /** 릴 1개가 도는 시간(ms). */
  durationMs?: number
  /** 릴 사이 정지 간격(ms). */
  stagger?: number
}

export interface ShowWinsOptions {
  /** true면 정지 없이 계속 순환한다. false면 한 바퀴 돌고 끝낸다. */
  loop?: boolean
  /**
   * 이번 스핀의 총 베팅액. 주면 빅윈 판정이 정확해진다.
   * 없으면 `sum(multiplier) / paylines.length`로 배수를 추정한다.
   */
  totalBet?: number
}

export interface SlotRenderer {
  /** 에셋 로딩과 첫 렌더가 끝나면 resolve. */
  ready: Promise<void>
  /** 모든 릴이 `stops`에 정확히 멈추면 resolve. */
  spinTo(stops: number[], opts?: SpinToOptions): Promise<void>
  /** 승리 라인 하이라이트. `loop: false`면 한 바퀴를 다 보여준 뒤 resolve. */
  showWins(wins: WinLine[], opts?: ShowWinsOptions): Promise<void>
  clearWins(): void
  /** 스핀 대기 중 미세한 유휴 모션. */
  setSpinningIdle(on: boolean): void
  resize(): void
  destroy(): void
}
