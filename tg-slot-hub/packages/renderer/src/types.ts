import type { GameMath, SymbolId, WinLine } from '@tgslot/slot-engine'
import type { FrameWindow } from './layout.js'
import type { FxMap } from './theme.js'
import type { WinTier } from './wins.js'
import type { FeatureTrigger, RendererMode } from './features.js'

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
  /** 심볼 승리 연출. 심볼 id 또는 `default`를 키로 쓴다. */
  fx?: FxMap
  palette: ThemePalette
  /** 효과음 URL. 렌더러는 재생하지 않고 허브의 AudioBus가 쓴다. */
  sfx?: Partial<Record<SfxKey, string>>
}

/**
 * 릴 프레임을 컨테이너에 맞추는 방식.
 * - `window`(기본): 릴 **창**을 최대한 키운다. 프레임의 기둥과 마퀴가 잘려 나갈 수 있다.
 * - `width`: 프레임 **전체**가 폭에 들어오게 맞춘다. 아무것도 잘리지 않지만 릴이 작아진다.
 *
 * 프레임 이미지가 없으면 두 값 모두 같은 결과를 낸다.
 */
export type RendererFit = 'width' | 'window'

export type RendererEvent =
  /** 릴 하나가 정확한 정지 위치에 닿았다. */
  | { type: 'reelStop'; reel: number }
  /** 모든 릴이 멈췄다. */
  | { type: 'spinEnd' }
  /**
   * 승리 연출 A단계가 시작됐다. 총배당과 그 단계의 길이를 함께 준다.
   * 허브가 배당 카운터를 이 시간에 맞춰 굴리라고 있는 이벤트다.
   */
  | { type: 'winTotal'; totalWin: number; tier: WinTier; durationMs: number }
  /** 승리 연출 B단계에서 라인 하나를 짚었다. */
  | { type: 'winLine'; line: number; win: number }
  /**
   * 프리스핀 같은 피처에 걸렸다. A단계가 끝나고 스캐터 연출이 시작할 때 온다.
   * 인트로 배너는 허브가 띄운다. 렌더러는 릴 위 연출만 맡는다.
   */
  | { type: 'featureTriggered'; feature: FeatureTrigger }

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
  /** 프레임을 맞추는 방식. 기본 `'window'`. */
  fit?: RendererFit
  /**
   * 프리스핀 중 릴 창 위에 명판을 띄울지. 기본 true.
   * 허브가 자체 카운터를 이미 보여준다면 false로 꺼도 된다.
   */
  showFreeSpinsPlaque?: boolean
  /**
   * `fit: 'window'`에서 프레임이 컨테이너 폭을 넘어도 되는 비율. 기본 0.30.
   * 키울수록 릴 창이 커지고 좌우 기둥이 더 잘린다. `fit: 'width'`에서는 무시된다.
   */
  overflowX?: number
}

export interface SpinToOptions {
  /** 릴 1개가 도는 시간(ms). */
  durationMs?: number
  /** 릴 사이 정지 간격(ms). */
  stagger?: number
  /** 프리스핀처럼 리듬을 당길 때. 회전 시간이 0.8배로 줄어든다. */
  fast?: boolean
}

export interface ShowWinsOptions {
  /** true면 정지 없이 계속 순환한다. false면 한 바퀴 돌고 끝낸다. */
  loop?: boolean
  /**
   * 라인 명판 문구를 만드는 함수. 렌더러는 번역을 모르므로 허브가 넣어 준다.
   * 기본값은 `Line {n} · {배당}`.
   */
  formatLineLabel?: (win: WinLine) => string
  /**
   * 서버가 준 피처 트리거. 스캐터 좌표와 프리스핀 진입이 여기서 온다.
   * 스캐터 자리는 연출 내내 어두워지지 않고 금빛 링이 맥동한다.
   */
  features?: FeatureTrigger[]
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
  /**
   * 프리스핀 같은 진행 상태를 갈아 끼운다.
   * `{ freeSpins: null }`로 되돌리면 금빛 테두리와 명판이 사라진다.
   */
  setMode(mode: RendererMode): void
  resize(): void
  destroy(): void
}
