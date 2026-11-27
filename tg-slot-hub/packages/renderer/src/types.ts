import type { CascadeStep, CoinCell, GameMath, GardenBounds, GardenSeed, GardenTrigger, GridPosition, MutationEvent, SymbolId, TreasureTier, WinLine } from '@tgslot/slot-engine'
import type { RespinInput } from './respin.js'
import type { RendererDiagnostics } from './diagnostics.js'
import type { FrameWindow } from './layout.js'
import type { CelebrationSkin, FxMap, ReelBackdrop, SheetMap, ThemeTransitions } from './theme.js'
import type { WinTier } from './wins.js'
import type { WinBand } from './winBands.js'
import type { FeatureTrigger, RendererMode } from './features.js'
import type { ModeTarget } from './transition.js'
import type { SpinSpeed } from './timing.js'

/** 테마가 선택적으로 선언할 수 있는 효과음 키. 파일이 없으면 키를 빼면 된다. */
export type SfxKey = 'spin' | 'stop' | 'win' | 'bigwin'
export type SoundPreset = 'bell' | 'fruit' | 'western' | 'shrine' | 'clockwork' | 'candy' | 'deepsea' | 'hanbok' | 'idol' | 'forge' | 'garden'

/** 프레임 아트의 배치 정보. 값은 프레임 이미지 크기에 대한 분수다. */
export interface FrameLayout {
  window: FrameWindow
  /** 칸 사이 간격 / 심볼 크기. 없으면 렌더러 기본값(live 팩 값 그대로). */
  gapRatio?: number
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
  /**
   * 모드 전환 커튼 위에서 재생할 영상 클립 URL. 방향(진입/이탈)마다 따로 건다.
   * 없으면 전환은 지금까지처럼 단색 커튼만으로 진행한다.
   */
  transitions?: ThemeTransitions
  /**
   * 릴 창 뒤에 까는 패널. 밝은 배경 아트에서 심볼 대비를 세운다.
   * 없으면 렌더러 기본값(검정 반투명)이고, `alpha: 0`이면 그리지 않는다.
   */
  reelBackdrop?: ReelBackdrop
  palette: ThemePalette
  /** 효과음 URL. 렌더러는 재생하지 않고 허브의 AudioBus가 쓴다. */
  sfx?: Partial<Record<SfxKey, string>>
  /** 빅윈 축하 스킨(원본 그대로). 허브와 렌더러가 `resolveCelebrationSkin`으로 채워 쓴다. */
  celebration?: CelebrationSkin
  /** 게임별 합성 효과음 세트. 허브의 오디오가 읽는다. 없으면 기본 `bell`. */
  sound?: { preset: SoundPreset }
  /**
   * 심볼이 아닌 그림(보물 코인·촉수 등). 키는 게임 팩이 정한다.
   * 코인 리스핀 팩은 `coin-small`·`coin-medium`·`coin-large`(보물 코인), `treasure-top`(최고 보물), `tentacle`(촉수 한 가닥)을 읽는다.
   * 없는 키는 코드로 그린 대체 그림으로 동작한다.
   */
  props?: Record<string, string>
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
  /**
   * 기대감 연출. 스캐터가 트리거 직전 개수까지 떨어져 `reel`이 늘어난 시간 동안 천천히 선다.
   * `start`는 앞 릴이 멈춘 순간, `end`는 그 릴이 멈추는 순간(스킵하면 그 즉시)에 온다.
   * 결과는 바뀌지 않는다 — 연출 시간만 늘어난다.
   */
  | { type: 'anticipation'; phase: 'start' | 'end'; reel: number }
  /** 모든 릴이 멈췄다. */
  | { type: 'spinEnd' }
  /**
   * 승리 연출 A단계가 시작됐다. 총배당과 그 단계의 길이를 함께 준다.
   * 허브가 배당 카운터를 이 시간에 맞춰 굴리라고 있는 이벤트다.
   */
  | {
      type: 'winTotal'
      totalWin: number
      tier: WinTier
      /**
       * 배수 단계(베팅 대비). 허브가 소리·라벨을 고른다. `big`이면 `tier`가 이어받는다.
       * 렌더러는 늘 채우지만 선택 필드로 둔다 — 없으면 허브는 단계 없는 평소 당첨으로 다룬다.
       */
      band?: WinBand
      durationMs: number
      /**
       * 연쇄 게임에서 카운터를 굴리기 시작할 금액. 연쇄 재생 중에 이미 `cumulativeWin`까지 올렸으므로
       * 여기서는 그 값부터 `totalWin`(스캐터·주문 상품분)까지만 굴린다. 없으면 0부터.
       */
      fromAmount?: number
    }
  /**
   * 승리 연출 B단계에서 라인(ways면 심볼) 하나를 짚었다. B단계의 매 스텝 **시작**에 온다.
   *
   * 허브가 이 값으로 릴 밖 문구를 만든다. 렌더러는 이름도 번역도 모르므로 id를 그대로 싣는다.
   * `index`/`total`은 이번 바퀴에서 몇 번째인지, `cycle`은 몇 바퀴째인지(0부터)다.
   *
   * `positions`는 이긴 칸의 [reel, row] 좌표다. 그룹 지급(Any BAR 등)에서 `symbol`은 그룹 id라
   * 대표할 그림이 없다 — 허브가 이 좌표로 그리드를 짚어 **실제로 이긴 심볼들**(bar1·bar1·bar2)을
   * 보여준다. 렌더러는 그리드를 실어 보내지 않는다(허브가 서버 응답으로 이미 들고 있다).
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
      positions?: readonly (readonly [number, number])[]
      /** `WinLine.payKind`. 없으면 line/ways로 짐작한다. */
      payKind?: 'line' | 'ways' | 'cluster' | 'anywhere'
      /** 연쇄 단계 인덱스(0부터). 연쇄 게임만. */
      cascade?: number
      /** 이 승리에 곱해진 사다리 배수. 연쇄 게임만. */
      ladder?: number
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
   * 무대 룰렛 진입에서 응원봉 칸이 빛나기 시작했다(초대권 강조 다음 단계). 허브가 이 칸들의 좌표로
   * 불빛 토큰을 날려 프레임 위 칩 «응원봉 ×N»으로 모은다. 응원봉이 없는 판에서는 오지 않는다.
   */
  | { type: 'rouletteCheer'; positions: readonly GridPosition[] }
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
   * 스핀을 스킵하면 아직 시작하지 않은 단계도 건너뛰지 않고 짧게 압축해 재생한다(`start`/`end` 모두 나온다).
   *
   * `symbol`은 `mutation.symbol`과 같은 값이다. 배너가 "무엇으로 바뀌었는지"를
   * 한 단계 더 들어가지 않고 읽도록 맨 위에도 올려 둔다. 이벤트에 없으면 정의되지 않는다.
   */
  | { type: 'mutation'; mutation: MutationEvent; symbol?: SymbolId; phase: 'start' | 'end' }
  /**
   * 연쇄 한 단계가 시작하거나 끝났다. 변형이 끝난 뒤, `spinEnd` 전에 단계마다 `start`/`end` 한 쌍이 온다.
   * STOP으로 압축 재생해도 쌍은 빠지지 않는다.
   *
   * `stepWin`은 이 단계 지급, `cumulativeWin`은 1단계부터 이 단계까지의 합이다(허브 WinStrip 틱).
   * `multiplier`는 이 단계의 사다리 배수(사다리 미터), `removed`는 지워진 칸 [reel, row]이고
   * `removedSymbols`는 같은 순서의 원래 심볼 id다(주문 카드 표시용 진행. 와일드도 들어 있으니 허브가 거른다).
   */
  | {
      type: 'cascadeStep'
      index: number
      total: number
      phase: 'start' | 'end'
      stepWin: number
      cumulativeWin: number
      multiplier: number
      removed: readonly GridPosition[]
      removedSymbols: readonly SymbolId[]
    }
  /**
   * 코인 리스핀 진입 펄스. 기본 판 코인이 릴 → 행 순서로 하나씩 «칭» 한다(`index`는 0부터).
   * 허브가 코인마다 효과음을 올릴 때 쓴다.
   */
  | { type: 'respinPulse'; index: number; total: number }
  /**
   * 동굴이 열렸다(전환 클립이 화면을 덮은 뒤). 허브가 남은 횟수 점과 «판 위 코인» 합계를 올린다.
   * `coinTotal`은 진입 판 금액 합(진입 감기 전)이고 `empty`는 비어 있는 칸 수다.
   */
  | { type: 'respinStart'; respins: number; coinTotal: number; empty: number; treasures: readonly TreasureTier[] }
  /**
   * 리스핀 1회. `start`는 빈 칸이 돌기 시작한 순간, `land`는 칸이 다 선 순간, `pin`은 새 코인이 붙어 고정된 순간
   * (새 코인이 있을 때만), `end`는 리스핀이 끝난 순간이다. STOP으로 압축해도 `start`와 `end`는 한 쌍으로 나온다.
   * `left`·`coinTotal`·`empty`·`treasures`는 이 리스핀이 끝난 뒤의 값이다(`pin` 전에는 아직 화면에 반영하지 않는다).
   */
  | {
      type: 'respinStep'
      index: number
      total: number
      phase: 'start' | 'land' | 'pin' | 'end'
      /** 이 리스핀을 시작할 때 «1회 남음»이었나. 허브가 «마지막!»을 띄우고 박동 소리를 낸다. */
      last: boolean
      left: number
      empty: number
      newCoins: readonly CoinCell[]
      coinTotal: number
      treasures: readonly TreasureTier[]
    }
  /**
   * 촉수가 세로줄 하나를 감는다. `entry`는 진입 판에서 이미 다 찬 줄(클립이 걷힌 직후)이다.
   * `before`·`after`는 행 0 → 2의 금액(코인)이다. `end`가 오면 그 줄 숫자가 `after`로 바뀌어 있다.
   */
  | {
      type: 'columnWrap'
      reel: number
      phase: 'start' | 'end'
      entry: boolean
      before: readonly number[]
      after: readonly number[]
    }
  /** 정산 중 코인 1개가 합계로 날아간다(`index`는 0부터). `running`은 이 코인까지 센 누적(상한을 넘지 않는다). */
  | { type: 'respinCollect'; index: number; total: number; cell: CoinCell; running: number }
  /** 15칸을 채워 «최고 보물»이 지급된다. */
  | { type: 'respinTop'; amount: number; phase: 'start' | 'end' }
  /** 리스핀 라운드가 끝났다(정산까지). 화면은 아직 동굴이고, 기본 화면으로 돌아가는 것은 `endRespin()`이다. */
  | { type: 'respinEnd'; coinWin: number; topWin: number; full: boolean }
  /**
   * 정원 한 단계(강조 → 팝 → 낙하 → 성장)가 시작하거나 끝났다. `start`에는 `end`가 반드시 짝으로 온다(STOP 압축·끼어들기도 같다).
   * `popped`는 이 단계 뒤 성장 막대 값, `size`는 단계 시작(`start`) 또는 끝(`end`)의 활성 한 변,
   * `seedMultiplier`는 이 단계 클러스터에 붙은 가장 큰 씨앗 배율(없으면 1), `bloomed`는 쓰인 씨앗 수다.
   */
  | {
      type: 'gardenStep'
      index: number
      total: number
      phase: 'start' | 'end'
      stepWin: number
      cumulativeWin: number
      popped: number
      size: number
      bloomed: number
      seedMultiplier: number
      /** 이 단계의 당첨 묶음(WinStrip 한 줄용). 칸 수 `count`와 씨앗 배율 `seed`(없으면 생략). */
      wins: readonly { symbol: SymbolId; count: number; win: number; seed?: number }[]
    }
  /** 판이 한 겹 자란다. `start`는 새 칸을 열기 전(카메라가 물러나기 직전), `end`는 새 칸이 다 열린 순간이다. */
  | {
      type: 'gardenGrow'
      phase: 'start' | 'end'
      from: GardenBounds
      to: GardenBounds
      size: number
      newCells: number
      newSeeds: number
      grown: number
      popped: number
    }
  /** 씨앗 칸이 낀 클러스터가 터지기 직전, 씨앗이 피며 배율이 곱해진다. */
  | { type: 'seedBloom'; count: number; multipliers: readonly number[] }
  /** 프리스핀 8×8 햇살. 씨앗 전부 한 등급 오르고 새 씨앗이 심긴다. */
  | { type: 'gardenSun'; phase: 'start' | 'end'; grown: number; planted: number }

export interface RendererOptions {
  /** 캔버스를 붙일 DOM 요소. 크기는 이 요소의 클라이언트 박스를 따른다. */
  container: HTMLElement
  math: GameMath
  theme: Theme
  /** 첫 화면에 보일 정지 위치. 없으면 전부 0. */
  initialStops?: number[]
  onEvent?: (e: RendererEvent) => void
  /**
   * 연쇄 단계 `index`가 끝난 뒤 다음 단계 전에 멈출 시간(ms). 0이면 안 멈춘다. 화로 «가득» 연출처럼 허브가
   * 연쇄를 잠깐 세워야 할 때 쓴다. STOP(`skipped`)이면 허브가 압축 값을 돌려주고, 멈추는 도중 STOP이 오면 바로 풀린다.
   */
  cascadeHoldMs?: (index: number, skipped: boolean) => number
  /** true면 긴 애니메이션을 건너뛴다. 미지정 시 `prefers-reduced-motion`을 따른다. */
  reducedMotion?: boolean
  /** 프레임을 맞추는 방식. 기본 `'window'`. */
  fit?: RendererFit
  /** 당첨 라인 표시 방식. 기본 `'effect'`. */
  paylineStyle?: PaylineStyle
  /**
   * 코인 금액 얼굴에 찍을 글자. 언어별 압축 표기(ko `2만`, en `20K`)를 허브가 정해 넘긴다.
   * 5글자 안팎으로 줄여야 390px에서 코인 폭의 80% 안에 든다. 없으면 천 단위 쉼표 표기다.
   */
  formatCoin?: (amount: number) => string
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
  /**
   * 변형 뒤에 재생할 연쇄 단계(`SpinResult.cascades`). `grid`에서 시작해 단계마다 접는다.
   * 재생이 끝나면 화면은 `finalGrid`와 정확히 같아진다.
   */
  cascades?: readonly CascadeStep[]
  /** 연쇄가 끝난 판(`SpinResult.finalGrid`). 계획이 접은 결과와 다르면 이 값이 이긴다. */
  finalGrid?: readonly (readonly SymbolId[])[]
  /**
   * 기본 판에 뜬 코인(`coinBoard` 피처의 `cells`). 릴이 서는 순간 금액 얼굴을 단다.
   * 서버가 정한 금액을 그대로 그린다 — 렌더러는 금액을 만들지 않는다.
   */
  coins?: readonly CoinCell[]
  /**
   * 코인 리스핀 라운드(`coinRespin` 피처). 착지 뒤에 재생하고, 결과는 이미 서버가 정했다.
   * 재생이 끝나도 화면은 동굴에 머문다 — 기본 화면으로 돌아가는 것은 `endRespin()`이다.
   */
  respin?: RespinInput
  /**
   * 자라는 정원 스핀(`garden` 피처). 착지 뒤 단계(팝 → 낙하 → 성장)와 햇살을 재생한다. 서버가 정한 결과 그대로다.
   * `fast`(프리스핀)이면 착지는 `growBoard.bonus.strips`를 읽는다. 시작 판은 `gridBefore`(응답 `grid`, 8×8)를 주는 것이 좋다.
   */
  garden?: GardenTrigger
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
   * 기본 `'standard'`. `'cascade'`는 연쇄 재생 중에 강조를 이미 마친 스핀용이다 —
   * A단계와 피처만 보여 주고 라인별 B단계 순환은 하지 않는다(끝난 판에서 지난 단계를 되짚지 않는다).
   */
  mode?: 'standard' | 'cascade'
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
  /** 베팅을 내고 얻은 판인지. 기본 true. 프리스핀 판은 false라 베팅 미만 당첨(`under`)을 `small`로 올린다. */
  paid?: boolean
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

/** 캔버스 기준 CSS px 사각형. 캔버스 요소의 왼쪽 위가 원점이다. */
export interface CellRect {
  x: number
  y: number
  w: number
  h: number
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
   * 코인 리스핀이 끝난 동굴에서 기본 화면으로 돌아온다(복귀 전환 클립). 동굴에 있지 않으면 곧장 resolve한다.
   * 빅윈 연출이 동굴 배경 위에서 먼저 끝나야 하므로 `spinTo`가 resolve해도 자동으로 나가지 않는다.
   * 다음 `spinTo`·`destroy`가 끼어들면 전환 없이 기본 화면으로 곧장 돌아온다.
   */
  endRespin(): Promise<void>
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
  /**
   * 그리기 루프(Pixi 티커)를 멈추거나 다시 돌린다. 캔버스 전체를 불투명한 허브 화면이 덮는 동안
   * (말판 보너스 등) GPU를 쉬게 하려는 것이다 — 결과·타이밍에는 영향이 없다. 해제 전에 켜 두지 않아도 안전하다.
   * 선택 메서드: 가짜 렌더러(테스트)는 없어도 된다. 부르는 쪽은 `setPaused?.()`로 부른다.
   */
  setPaused?(paused: boolean): void
  resize(): void
  destroy(): void
  /**
   * 풀과 텍스처 장부의 지금 상태. 디버그 패널이 읽을 순수 데이터다.
   * 초기화 전이나 해제 뒤에는 전부 0인 빈 진단이 나온다.
   */
  diagnostics(): RendererDiagnostics
  /**
   * 칸 `[reel, row]`의 화면 사각형(캔버스 기준 CSS px). 허브가 주문 토큰을 날릴 출발점이다.
   * 초기화 전이나 해제 뒤에는 null. 범위 밖 칸이면 던진다.
   */
  getCellRect(reel: number, row: number): CellRect | null
  /**
   * 자라는 정원 팩의 판 크기·씨앗을 맞춘다(새로고침 복원·프리스핀 종료). `null`이면 4×4·씨앗 없음.
   * `immediate`면 카메라를 트윈 없이 옮긴다. 정원 팩이 아니면 아무 일도 하지 않는다.
   */
  setGardenView?(view: { bounds: GardenBounds; seeds: readonly GardenSeed[] } | null, immediate?: boolean): void
}
