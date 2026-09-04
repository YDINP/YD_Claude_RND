import type { GameMath, MutationEvent, SymbolId, WinLine } from '@tgslot/slot-engine'
import type { FrameWindow } from './layout.js'
import type { FxMap, SheetMap } from './theme.js'
import type { WinTier } from './wins.js'
import type { FeatureTrigger, RendererMode } from './features.js'
import type { ModeTarget } from './transition.js'
import type { SpinSpeed } from './timing.js'

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
   * 프리스핀 중에 쓰는 배경 이미지 URL.
   * 없으면 기본 배경 위에 금빛 틴트를 덧씌워 같은 전환을 낸다.
   */
  backgroundFreeSpins?: string
  /**
   * 릴을 감싸는 베젤 아트 URL. 릴 창은 알파로 뚫려 있어야 한다.
   * 있으면 렌더러가 벡터 베젤 대신 이 이미지를 릴 위에 얹는다.
   */
  frame?: string
  /** 프레임 아트 안의 릴 창 위치. 없으면 `DEFAULT_FRAME_WINDOW`를 쓴다. */
  frameLayout?: FrameLayout
  /** 심볼 승리 연출. 심볼 id 또는 `default`를 키로 쓴다. */
  fx?: FxMap
  /**
   * 심볼별 스프라이트 시트. 값은 사이드카 JSON 경로이고 아틀라스는 같은 이름의 `.webp`다.
   * 있으면 승리 연출 동안 정지 이미지를 애니메이션으로 갈아 끼운다.
   */
  sheets?: SheetMap
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

/**
 * 당첨 라인을 보여주는 방식.
 * - `effect`(기본): 당첨 심볼 둘레에 고정 광채를 두르고 심볼 연출만 터뜨린다. 선을 그리지 않는다.
 * - `line`: 예전의 3px 폴리라인. 좌표를 눈으로 확인할 때만 쓴다.
 */
export type PaylineStyle = 'effect' | 'line'

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
  /**
   * 승리 연출 B단계에서 라인(ways면 심볼) 하나를 짚었다. B단계의 매 스텝 **시작**에 온다.
   *
   * 허브가 이 값으로 릴 밖 문구를 만든다. 렌더러는 이름도 번역도 모르므로 id를 그대로 싣는다.
   * `index`/`total`은 이번 바퀴에서 몇 번째인지, `cycle`은 몇 바퀴째인지(0부터)다.
   */
  | {
      type: 'winLine'
      line: number
      win: number
      symbol: string
      count: number
      ways?: number
      group?: string
      direction?: 'ltr' | 'rtl'
      index: number
      total: number
      cycle: number
    }
  /**
   * 승리 연출 한 바퀴(A단계)가 시작됐다. `cycle`은 0부터 늘어난다.
   * A단계 동안 총배당을 보여 주라고 있는 이벤트다. 등급과 길이는 `winTotal`이 함께 준다.
   */
  | { type: 'winCycle'; cycle: number; totalWin: number }
  /**
   * 프리스핀 같은 피처에 걸렸다. A단계가 끝나고 스캐터 연출이 시작할 때 온다.
   * 인트로 배너는 허브가 띄운다. 렌더러는 릴 위 연출만 맡는다.
   */
  | { type: 'featureTriggered'; feature: FeatureTrigger }
  /**
   * 배경 전환이 시작하거나 끝났다.
   * 허브가 프리스핀 인트로/종료 배너를 이 신호에 맞춰 띄우고 내리라고 있는 이벤트다.
   */
  | { type: 'modeTransition'; to: ModeTarget; phase: 'start' | 'end' }
  /**
   * 변형(미스터리 리빌·확장 와일드·승급·랜덤 와일드) 한 단계가 시작하거나 끝났다.
   * 배너와 효과음은 허브가 띄운다. 렌더러는 릴 위 연출만 맡는다.
   *
   * `start` 하나에 `end` 하나가 반드시 따른다. 중간에 `skip()`으로 접어도 마찬가지다.
   * 다만 아직 시작하지 않은 단계는 건너뛰므로 `start`도 `end`도 나오지 않는다.
   *
   * `symbol`은 `mutation.symbol`과 같은 값이다. 배너가 "무엇으로 바뀌었는지"를
   * 한 단계 더 들어가지 않고 읽도록 맨 위에도 올려 둔다. 이벤트에 없으면 정의되지 않는다.
   */
  | { type: 'mutation'; mutation: MutationEvent; symbol?: SymbolId; phase: 'start' | 'end' }

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
  /** 당첨 라인 표시 방식. 기본 `'effect'`. */
  paylineStyle?: PaylineStyle
  /**
   * `fit: 'window'`에서 프레임이 컨테이너 폭을 넘어도 되는 **상한**. 기본 0.
   *
   * 기본값에서는 프레임이 좌우로 잘리지 않는다. 창이 조금 좁아지더라도 아트가 온전히 보인다.
   * 0보다 크게 주면 그 비율만큼 다시 넘칠 수 있다 — 잘림을 감수하고 릴을 키우려는 게임용이다.
   * `fit: 'width'`에서는 무시된다.
   */
  overflowX?: number
}

export interface SpinToOptions {
  /**
   * 이번 스핀만 쓸 속도 프로파일. 없으면 `setSpinSpeed`로 정해 둔 값(기본 `normal`)을 쓴다.
   * `durationMs`/`stagger`를 직접 주면 그쪽이 이긴다.
   */
  speed?: SpinSpeed
  /** 릴 1개가 도는 시간(ms). */
  durationMs?: number
  /** 릴 사이 정지 간격(ms). */
  stagger?: number
  /** 프리스핀처럼 리듬을 당길 때. 회전 시간이 0.8배로 줄어든다. */
  fast?: boolean
  /**
   * 릴이 그대로 멈춘 그리드(`SpinResult.gridBefore`, `grid[row][reel]`).
   * 변형 연출의 첫 프레임이다. 주지 않으면 `stops`와 스트립에서 되짚는다.
   */
  gridBefore?: readonly (readonly SymbolId[])[]
  /**
   * 착지 뒤에 순서대로 재생할 변형(`SpinResult.mutations`).
   * 재생이 끝나면 화면은 엔진의 `SpinResult.grid`와 정확히 같아진다.
   */
  mutations?: readonly MutationEvent[]
}

export interface ShowWinsOptions {
  /**
   * 기본 true. 다음 `spinTo`/`clearWins`/`destroy`나 모드 전환까지 A→B→A로 계속 순환한다.
   * false면 한 바퀴만 돌고 멈춘다(테스트와 일회성 재생용).
   *
   * 어느 쪽이든 `showWins`가 돌려주는 약속은 **첫 바퀴**가 끝나면 resolve한다.
   */
  loop?: boolean
  /**
   * 연출 분량. 기본 `'full'`(A단계 전체 표시 → 필요하면 피처 → 라인별 순차 B단계).
   *
   * `'brief'`는 **A단계만** 짧게 한 번 보여주고 끝낸다 — 라인별 순차를 아예 만들지 않고,
   * 홀드도 등급과 무관하게 짧게 고정한다(속도 프로파일 배율은 그대로). 오토스핀처럼 다음 판으로
   * 곧장 넘어가야 하는 흐름용이다. `loop`는 무시된다(brief는 언제나 한 번만 재생한다).
   *
   * 프리스핀에 걸린 스핀에서는 피처 스텝이 그대로 남는다 — `featureTriggered`가 나가야
   * 허브의 프리스핀 인트로/진입 게이트가 끊기지 않는다.
   */
  presentation?: 'full' | 'brief'
  /**
   * @deprecated 릴 위 라인 명판은 사라졌다. 문구는 `winLine` 이벤트를 받아 허브가 그린다.
   * 다음 릴리스에서 제거한다. 지금은 넘겨도 무시된다.
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

/**
 * 스핀 하나를 다루는 손잡이.
 *
 * `await renderer.spinTo(...)`가 그대로 되도록 thenable이다.
 * 결과를 기다리지 않고 건너뛰려면 `skip()`을 부른다.
 */
export interface SpinHandle extends PromiseLike<void> {
  /** 모든 릴이 멈추면 resolve. */
  done: Promise<void>
  /**
   * 남은 회전을 접고 곧장 정지 위치로 붙인다.
   * 착지 좌표는 그대로이고 `reelStop`/`spinEnd`도 정상적으로 발생한다.
   *
   * 변형 연출 중이면 남은 단계를 접고 최종 그리드로 곧장 넘어간다.
   * 화면은 언제나 엔진의 최종 그리드와 같아지므로 결과가 달라지지 않는다.
   * 이미 다 끝난 뒤에 불러도 아무 일도 일어나지 않는다.
   */
  skip(): void
}

export interface SlotRenderer {
  /** 에셋 로딩과 첫 렌더가 끝나면 resolve. */
  ready: Promise<void>
  /**
   * 릴을 돌려 `stops`에 정확히 멈춘다. 기다리거나 건너뛸 수 있는 손잡이를 돌려준다.
   *
   * `mutations`를 주면 착지 뒤에 변형 연출을 순서대로 재생하고, 그것까지 끝난 뒤에
   * `spinEnd`를 내보내며 resolve한다. 승리 연출은 변형이 끝난 그리드 위에서 시작해야 한다.
   */
  spinTo(stops: number[], opts?: SpinToOptions): SpinHandle
  /**
   * 승리 라인 하이라이트. 첫 바퀴(A단계 + B단계 한 바퀴)가 끝나면 resolve한다.
   * 기본값 `loop: true`에서는 resolve한 뒤에도 `clearWins()`나 다음 `spinTo()`까지 계속 돈다.
   */
  showWins(wins: WinLine[], opts?: ShowWinsOptions): Promise<void>
  /**
   * 보고 있던 바퀴를 곧장 접는다. `showWins()`의 약속이 그 자리에서 resolve한다.
   *
   * 순환은 멈추지 않는다 — 접은 자리에서 다음 바퀴가 A단계부터 다시 시작한다.
   * 남은 라인 스텝의 `winLine`은 나오지 않고, 다음 바퀴부터 정상적으로 다시 나온다.
   * 연출이 돌고 있지 않으면 아무 일도 일어나지 않는다.
   */
  skipWins(): void
  /** 진행 중인 승리 연출을 멈추고 화면에서 걷어낸다. 순환도 여기서 끝난다. */
  clearWins(): void
  /**
   * 이후 모든 스핀의 속도 프로파일. 기본 `'normal'`.
   *
   * - `normal`: 5릴 기준 총 1.65초.
   * - `quick`: 총 0.9초. 회전과 정지 간격이 55%로 줄어든다.
   * - `turbo`: 총 0.45초. 당김을 생략하고 릴이 거의 동시에 서며 승리 A단계 홀드도 짧아진다.
   *
   * 돌고 있는 스핀은 건드리지 않는다. `ready` 전에 불러도 잃지 않는다.
   * 모션 축소가 켜져 있으면 그 상한이 언제나 우선한다.
   */
  setSpinSpeed(speed: SpinSpeed): void
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
