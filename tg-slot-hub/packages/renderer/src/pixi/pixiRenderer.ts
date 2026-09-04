import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { GridPosition, SymbolId, WinLine } from '@tgslot/slot-engine'
import {
  ACCEL_DISTANCE_RATIO,
  ACCEL_TIME_RATIO,
  FALLBACK_CONTAINER_WIDTH,
  DIM_ALPHA,
  FREE_SPINS_EDGE_ALPHA,
  FREE_SPINS_EDGE_STROKE_PX,
  IDLE_AMPLITUDE_SYMBOLS,
  MODE_CURTAIN_COLOR,
  MODE_TINT_ALPHA,
  PHASE_CROSSFADE_MS,
  SCATTER_RING_PULSE_MS,
  SCATTER_RING_SCALE,
  SCATTER_RING_STROKE_PX,
  IDLE_CYCLE_MS,
  LANDING_SETTLE_SYMBOLS,
  PULL_UP_SYMBOLS,
  SKIP_SETTLE_SYMBOLS,
  SYMBOL_FILL_RATIO,
  WIN_GLOW_LAYERS,
  WIN_HIGHLIGHT_STROKE_PX,
  WIN_LINE_ALPHA,
  WIN_LINE_STROKE_PX,
} from '../constants.js'
import {
  dedupePositions,
  normalizePosition,
  spinTargetPosition,
  stopsToGrid,
  wrapIndex,
} from '../grid.js'
import {
  cellPitch,
  computeFrameLayout,
  computeLayout,
  computeWindowFitLayout,
  paylinePoints,
  positionRects,
  reelLeft,
  rowTop,
  symbolCenter,
  type Layout,
  type Point,
  type Rect,
} from '../layout.js'
import { resolveResolution } from '../motion.js'
import { resolveFrameWindow } from '../theme.js'
import {
  buildSkipPlan,
  buildSpinPlan,
  winStartDelayMs,
  type ReelSpinPlan,
  type SpinPlan,
  type SpinSpeed,
} from '../timing.js'
import type { RendererMode } from '../features.js'
import { buildModeTransition, modeTransitionTarget, type ModeTarget } from '../transition.js'
import { paylineColor } from '../wins.js'
import { resolveFxEffect, resolveSymbolFx, BUILTIN_FX } from '../fx.js'
import { isSheetOnly, planSheetFx } from '../sheet.js'
import {
  buildPresentation,
  presentationOptionsFor,
  runPresentation,
  shouldLoopPresentation,
  winLineEvent,
  type PresentationStep,
  type PresentationStepContext,
} from '../presentation.js'
import {
  buildMutationPlan,
  mutationReels,
  type MutationPlan,
  type MutationStep,
} from '../mutations.js'
import type { RendererCore, ResolvedRendererOptions } from '../internal.js'
import type { ResolvedFxEffect } from '../fx.js'
import { TextureRegistry } from '../textureRegistry.js'
import type { RendererEvent, ShowWinsOptions, SpinHandle, SpinToOptions } from '../types.js'
import { DEFAULT_SPIN_SPEED } from '../constants.js'
import { createSparkleTexture, startSparkles, type AmbientEffect } from './ambient.js'
import { burstCoins, burstConfetti, coinCountForTier, burstScatters } from './coins.js'
import {
  createCoinTexture,
  createSolidTexture,
  loadBackgroundTexture,
  loadFrameTexture,
  loadImageTexture,
  loadSymbolTextures,
} from './textures.js'
import { createFxTextures, playSymbolFxSet, type FxTextures, type SymbolFxHandle } from './symbolFx.js'
import { loadSheetFrames, peekSheet, playSheetFx } from './sheetFx.js'
import {
  playMutationFx,
  MutationSpritePool,
  type MutationCellTarget,
  type MutationFxHandle,
} from './mutationFx.js'

interface Cell {
  view: Container
  sprite: Sprite
  symbol: SymbolId | null
}

/** 회전 중인 릴 하나. 스킵할 때 필요한 것만 담는다. */
interface ActiveReel {
  timeline: gsap.core.Timeline
  view: ReelView
  stop: number
  stripLength: number
  token: number
  land: () => void
  /** 이미 스킵된 릴인지. 두 번째 호출은 아무 일도 하지 않는다. */
  skipped: boolean
}

interface ReelView {
  root: Container
  cells: Cell[]
  /** 화면 행 0에 오는 스트립 위치. 소수부는 칸 사이 이동량이다. */
  position: number
  /** 유휴 모션이 더하는 미세 오프셋. `position`을 더럽히지 않는다. */
  idleOffset: number
}

/**
 * 한 번 계산된 화면 배치.
 * 프레임 아트가 있으면 캔버스는 프레임 크기이고 릴은 창 안으로 밀려 들어간다.
 * 없으면 캔버스가 곧 릴 레이아웃이고 오프셋은 0이다 (기존 벡터 베젤 동작 그대로).
 */
interface Geometry {
  canvasWidth: number
  canvasHeight: number
  /** 프레임 스프라이트를 놓을 사각형. 프레임 이미지가 없으면 null. 캔버스 밖으로 나갈 수 있다. */
  frameRect: Rect | null
  /** 릴 창(캔버스 좌표). 프레임 이미지가 없으면 null. */
  window: Rect | null
  /** 릴 레이아웃. 좌표는 `content`를 원점으로 하는 지역 좌표계다. */
  layout: Layout
  /** 릴 레이아웃이 놓이는 캔버스 좌표. */
  content: Point
  framed: boolean
}

class PixiRenderer implements RendererCore {
  private readonly options: ResolvedRendererOptions
  private readonly app: Application
  private readonly textures: Map<SymbolId, Texture>
  private readonly coinTexture: Texture
  private readonly confettiTexture: Texture
  /** 이 인스턴스가 직접 만든 텍스처. 해제할 때 GPU 리소스까지 되돌려준다. */
  private readonly ownedTextures: TextureRegistry

  private geometry: Geometry
  private readonly root = new Container()
  private readonly backgroundLayer = new Container()
  private readonly frameGraphics = new Graphics()
  /** 릴·마스크·승리 오버레이를 함께 옮기는 층. 프레임 창 위치로 통째로 민다. */
  private readonly contentLayer = new Container()
  private readonly reelsLayer = new Container()
  private readonly maskGraphics = new Graphics()
  private readonly winGraphics = new Graphics()
  private readonly fxLayer = new Container()
  /** 변형 연출의 기둥·먼지가 사는 층. 릴 마스크 밖이라 잘리지 않는다. */
  private readonly mutationLayer = new Container()
  /** 변형 파티클 재사용 풀. 스핀마다 수백 개를 새로 만들지 않으려고 둔다. */
  private readonly mutationPool = new MutationSpritePool(this.mutationLayer)
  /** 스캐터 링. 맥동하느라 alpha가 계속 움직여서 다른 것과 섞으면 안 된다. */
  private readonly featureGraphics = new Graphics()
  /** 프리스핀 창 테두리. 전환이 이 층의 alpha를 0에서 끌어올린다. */
  private readonly modeGraphics = new Graphics()

  private readonly reels: ReelView[] = []
  private readonly backgroundSprite: Sprite | null
  /** 프리스핀 배경. 이미지가 없으면 금빛 틴트 스프라이트가 대신 선다. */
  private readonly freeSpinsSprite: Sprite
  /**
   * 전환 커튼. 화면 전체(프레임·베젤까지)를 완전히 덮는 불투명 레이어다 — 알파가 이 층 위로
   * 갈 뿐, 마스크로 배경을 교차시키던 예전 와이프와 달리 배경 교체 자체는 커튼이 완전히
   * 덮인 순간 한 번에 일어난다(그 순간이 커튼에 가려 보이지 않는다).
   */
  private readonly curtain: Sprite
  /** 베젤 아트. 릴 창이 알파로 뚫려 있어 릴 **위에** 얹는다. */
  private readonly frameSprite: Sprite | null
  /** 배경 위 반짝임. 프레임보다 아래에 둔다. */
  private readonly sparkleLayer = new Container()
  private readonly sparkleTexture: Texture | null
  private readonly fxTextures: FxTextures
  private ambient: AmbientEffect[] = []
  /** 캔버스가 컨테이너를 넘칠 수 있어 overflow를 바꾼다. 해제할 때 원래 값으로 되돌린다. */
  private readonly previousOverflow: string

  private resizeObserver: ResizeObserver | null = null
  private idleTweens: gsap.core.Tween[] = []
  private fxHandles: SymbolFxHandle[] = []
  /**
   * 셀 하나가 지금 물고 있는 연출. 순환이 한 바퀴 돌 때마다 같은 셀을 다시 터뜨리는데,
   * 앞엣것을 끄지 않으면 스프라이트가 무한히 쌓인다.
   */
  private cellFx = new Map<string, SymbolFxHandle[]>()
  /** 연출 세대. 늦게 도착한 시트가 이미 지난 연출에 끼어드는 것을 막는다. */
  private fxToken = 0
  private spinTimelines: gsap.core.Timeline[] = []
  /** 중단된 스핀의 대기자를 풀어 주기 위한 resolver 목록. */
  private spinResolvers: (() => void)[] = []
  /** 아직 돌고 있는 릴. 스킵이 이 목록을 훑어 곧장 착지시킨다. */
  private activeReels = new Map<number, ActiveReel>()
  private spinToken = 0
  private stopCoins: (() => void) | null = null
  private stopConfetti: (() => void) | null = null
  private stopScatterBurst: (() => void) | null = null
  private scatterTween: gsap.core.Tween | null = null
  private mode: RendererMode = { freeSpins: null }
  private modeTransition: gsap.core.Timeline | null = null
  /** 진행 중인 전환의 목적지. `end`를 한 번만 내보내기 위한 표식이다. */
  private modeTransitionTo: ModeTarget | null = null
  /** 화면이 지금 프리스핀 모습인지. 전환이 끝난 시점에 갱신된다. */
  private freeSpinsVisible = false
  private crossfadeTween: gsap.core.Tween | null = null
  private winToken = 0
  /** 돌고 있는 승리 순환의 스킵 손잡이. 연출이 없으면 null이다. */
  private winSkip: (() => void) | null = null
  /** 지금 걸린 스핀 속도. `spinTo(opts.speed)`가 이번 스핀만 덮어쓸 수 있다. */
  private spinSpeed: SpinSpeed = DEFAULT_SPIN_SPEED
  /**
   * 변형이 끝난 뒤의 화면 그리드(`grid[row][reel]`). null이면 스트립이 보이는 대로다.
   *
   * 변형은 스트립에 없는 심볼을 칸에 앉힌다(물음표가 체리가 되는 식). 스트립만 읽으면
   * 다시 그릴 때마다 원래 심볼로 되돌아가므로, 화면이 무엇을 보여줄지는 이 층이 정한다.
   */
  private gridOverride: readonly (readonly SymbolId[])[] | null = null
  /** 재생 중인 변형 한 단계. 스킵이 이걸 붙잡아 곧장 끝낸다. */
  private activeMutation: { finish: () => void } | null = null
  /** 스킵이 눌린 스핀. 변형 단계가 이 값을 보고 남은 단계를 접는다. */
  private skipRequestedToken = -1
  /** 대기 중인 타이머와 그 대기자. 취소할 때 깨워서 내보내려고 resolver를 함께 들고 있다. */
  private readonly timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  private destroyed = false

  constructor(
    options: ResolvedRendererOptions,
    app: Application,
    textures: Map<SymbolId, Texture>,
    coinTexture: Texture,
    backgroundTexture: Texture | null,
    frameTexture: Texture | null,
    freeSpinsTexture: Texture | null,
    ownedTextures: TextureRegistry,
  ) {
    this.options = options
    this.app = app
    this.textures = textures
    this.coinTexture = coinTexture
    this.ownedTextures = ownedTextures
    this.confettiTexture = createSolidTexture(ownedTextures)
    this.frameSprite = frameTexture === null ? null : new Sprite(frameTexture)
    this.geometry = this.measureGeometry()

    // 창 맞춤에서는 프레임이 컨테이너 밖으로 나가므로 잘라 줘야 한다.
    this.previousOverflow = options.container.style.overflow
    options.container.style.overflow = 'hidden'

    this.sparkleTexture = options.reducedMotion ? null : createSparkleTexture(ownedTextures)
    this.fxTextures = createFxTextures(ownedTextures)

    this.backgroundSprite = backgroundTexture === null ? null : new Sprite(backgroundTexture)
    if (this.backgroundSprite !== null) this.backgroundLayer.addChild(this.backgroundSprite)

    // 프리스핀 배경. 전용 이미지가 없으면 금빛 사각형으로 대신한다.
    this.freeSpinsSprite = new Sprite(freeSpinsTexture ?? this.confettiTexture)
    if (freeSpinsTexture === null) {
      this.freeSpinsSprite.tint = options.theme.palette.frame
      this.freeSpinsSprite.alpha = MODE_TINT_ALPHA
    }
    this.freeSpinsSprite.visible = false
    this.backgroundLayer.addChild(this.freeSpinsSprite)

    // 전환 커튼. 평소엔 투명하고 안 보인다 — 전환이 시작될 때만 캔버스 전체를 완전히 덮는다.
    this.curtain = new Sprite(this.confettiTexture)
    this.curtain.tint = MODE_CURTAIN_COLOR
    this.curtain.alpha = 0
    this.curtain.visible = false

    this.reelsLayer.mask = this.maskGraphics
    this.contentLayer.addChild(
      this.reelsLayer,
      this.maskGraphics,
      this.mutationLayer,
      this.featureGraphics,
      this.modeGraphics,
      this.winGraphics,
      this.fxLayer,
    )
    this.root.addChild(this.backgroundLayer)
    // 베젤 아트가 없을 때만 반짝임이 진짜 "배경"에 놓인다.
    if (this.frameSprite === null) this.root.addChild(this.sparkleLayer)
    this.root.addChild(this.frameGraphics, this.contentLayer)
    // 베젤 아트는 릴을 살짝 덮어야 안쪽 하이라이트가 살아난다. 릴 위에 둔다.
    // 베젤이 배경을 거의 다 가리므로 반짝임은 그 위로 올려야 보인다. 브라스가 반짝이는 것처럼 읽힌다.
    if (this.frameSprite !== null) this.root.addChild(this.frameSprite, this.sparkleLayer)
    // 커튼은 프레임·베젤까지 덮어야 전환이 화면 전체를 가리는 것처럼 보인다. 맨 위에 둔다.
    this.root.addChild(this.curtain)
    this.app.stage.addChild(this.root)

    this.buildReels()
    this.applyLayout()
    this.observeResize()
  }

  // ---------------------------------------------------------------- 레이아웃

  /** 릴 레이아웃. 좌표는 전부 `contentLayer` 지역 좌표계다. */
  private get layout(): Layout {
    return this.geometry.layout
  }

  private measureGeometry(): Geometry {
    const el = this.options.container
    const containerWidth = el.clientWidth > 0 ? el.clientWidth : FALLBACK_CONTAINER_WIDTH
    const containerHeight = el.clientHeight > 0 ? el.clientHeight : 0
    const { reels, rows } = this.options.math

    const frameTexture = this.frameSprite?.texture
    if (frameTexture !== undefined && frameTexture.width > 0 && frameTexture.height > 0) {
      const window = resolveFrameWindow(this.options.theme)
      // 창 맞춤은 컨테이너 높이를 알아야 성립한다. 아직 못 쟀으면 폭 맞춤으로 물러선다.
      if (this.options.fit === 'window' && containerHeight > 0) {
        const fitted = computeWindowFitLayout({
          containerWidth,
          containerHeight,
          frameWidth: frameTexture.width,
          frameHeight: frameTexture.height,
          window,
          reels,
          rows,
          overflowX: this.options.overflowX,
        })
        return {
          canvasWidth: fitted.canvasWidth,
          canvasHeight: fitted.canvasHeight,
          frameRect: fitted.frameRect,
          window: fitted.window,
          layout: fitted.layout,
          content: fitted.content,
          framed: true,
        }
      }

      const framed = computeFrameLayout({
        containerWidth,
        containerHeight,
        frameWidth: frameTexture.width,
        frameHeight: frameTexture.height,
        window,
        reels,
        rows,
      })
      return {
        canvasWidth: framed.canvasWidth,
        canvasHeight: framed.canvasHeight,
        frameRect: { x: 0, y: 0, width: framed.canvasWidth, height: framed.canvasHeight },
        window: framed.window,
        layout: framed.layout,
        content: framed.content,
        framed: true,
      }
    }

    const layout = computeLayout({ containerWidth, containerHeight, reels, rows })
    return {
      canvasWidth: layout.width,
      canvasHeight: layout.height,
      frameRect: null,
      window: null,
      layout,
      content: { x: 0, y: 0 },
      framed: false,
    }
  }

  private applyLayout(): void {
    const { canvasWidth, canvasHeight, content, framed, frameRect } = this.geometry
    this.app.renderer.resize(canvasWidth, canvasHeight)

    if (this.backgroundSprite !== null) {
      this.backgroundSprite.width = canvasWidth
      this.backgroundSprite.height = canvasHeight
    }
    for (const cover of [this.freeSpinsSprite, this.curtain]) {
      cover.width = canvasWidth
      cover.height = canvasHeight
    }
    if (this.frameSprite !== null && frameRect !== null) {
      this.frameSprite.position.set(frameRect.x, frameRect.y)
      this.frameSprite.width = frameRect.width
      this.frameSprite.height = frameRect.height
    }

    this.contentLayer.position.set(content.x, content.y)
    // 프레임 아트가 베젤을 이미 갖고 있으면 벡터 베젤은 그리지 않는다.
    this.frameGraphics.visible = !framed
    if (framed) this.frameGraphics.clear()
    else this.drawFrame()
    this.drawMask()
    this.drawMode()

    for (let reel = 0; reel < this.reels.length; reel += 1) {
      const view = this.reels[reel]
      if (view === undefined) continue
      view.root.x = reelLeft(this.layout, reel)
      view.root.y = 0
      for (const cell of view.cells) {
        cell.view.x = this.layout.symbolSize / 2
        // 심볼 크기가 바뀌었으니 다음 렌더에서 강제로 다시 적용시킨다.
        cell.symbol = null
      }
      this.renderReel(reel)
    }

    this.startAmbient()
  }

  private drawFrame(): void {
    const { frame, radius, border } = this.layout
    const palette = this.options.theme.palette
    this.frameGraphics.clear()
    this.frameGraphics
      .roundRect(frame.x, frame.y, frame.width, frame.height, radius)
      .fill({ color: palette.reelBg })
      .stroke({ width: border, color: palette.frame, alignment: 0.5 })
  }

  private drawMask(): void {
    const { reelArea, radius } = this.layout
    this.maskGraphics.clear()
    this.maskGraphics
      .roundRect(reelArea.x, reelArea.y, reelArea.width, reelArea.height, radius * 0.5)
      .fill({ color: 0xffffff })
  }

  // -------------------------------------------------------------------- 릴

  private buildReels(): void {
    const { math } = this.options
    for (let reel = 0; reel < math.reels; reel += 1) {
      const root = new Container()
      const cells: Cell[] = []
      // 위아래 오버스캔 1칸씩 포함해 rows + 2개를 만든다.
      for (let k = 0; k < math.rows + 2; k += 1) {
        const view = new Container()
        const sprite = new Sprite()
        sprite.anchor.set(0.5)
        view.addChild(sprite)
        root.addChild(view)
        cells.push({ view, sprite, symbol: null })
      }
      this.reelsLayer.addChild(root)
      const stop = this.options.initialStops[reel] ?? 0
      const strip = math.strips[reel]
      this.reels.push({
        root,
        cells,
        position: normalizePosition(stop, strip === undefined ? 1 : strip.length),
        idleOffset: 0,
      })
    }
  }

  private setCellSymbol(cell: Cell, symbol: SymbolId): void {
    if (cell.symbol === symbol) return
    const texture = this.textures.get(symbol)
    if (texture !== undefined) cell.sprite.texture = texture
    cell.sprite.setSize(this.layout.symbolSize * SYMBOL_FILL_RATIO)
    cell.symbol = symbol
  }

  /** 릴 1개를 현재 위치로 다시 그린다. 위치의 소수부가 스크롤 오프셋이 된다. */
  private renderReel(reel: number): void {
    const view = this.reels[reel]
    const strip = this.options.math.strips[reel]
    if (view === undefined || strip === undefined) return

    const position = view.position + view.idleOffset
    const base = Math.floor(position)
    const fraction = position - base
    const pitch = cellPitch(this.layout)

    for (let k = 0; k < view.cells.length; k += 1) {
      const cell = view.cells[k]
      if (cell === undefined) continue
      const row = k - 1
      // 변형이 앉힌 심볼이 스트립보다 우선한다. 오버스캔 칸(row -1, rows)에는 없다.
      const overridden = this.gridOverride?.[row]?.[reel]
      const symbol = overridden ?? strip[wrapIndex(base + row, strip.length)]
      if (symbol !== undefined) this.setCellSymbol(cell, symbol)
      cell.view.y = rowTop(this.layout, row) + this.layout.symbolSize / 2 - fraction * pitch
    }
  }

  private emit(event: RendererEvent): void {
    this.options.onEvent?.(event)
  }

  // ------------------------------------------------------------------ 스핀

  spinTo(stops: number[], opts?: SpinToOptions): SpinHandle {
    const done = this.runSpin(stops, opts)
    void done.catch(() => undefined)
    // runSpin은 첫 await 전에 토큰을 올린다. 그래서 여기서 이 스핀의 토큰을 붙잡을 수 있다.
    // 붙잡지 않으면 지난 스핀의 손잡이가 다음 스핀의 변형을 접어 버린다.
    const token = this.spinToken
    return {
      done,
      skip: () => this.skipSpin(token),
      then: (onFulfilled, onRejected) => done.then(onFulfilled, onRejected),
    }
  }

  /**
   * 남은 회전을 **버리고** 곧장 정지 위치로 스냅한다.
   *
   * 예전에는 남은 거리를 260ms에 몰아 지나갔다. 스트립이 길면 그 사이 심볼이 통째로 흘러
   * "다시 한 바퀴 돌다 멈춘다"로 보였다. 지금은 지금 어디에 있든 정지 위치 바로 위에 붙인 뒤
   * 아주 짧게 내려앉기만 한다. 다시 속도를 붙이는 구간이 없으므로 되도는 착시가 생기지 않는다.
   * 시작 당김 중에 눌러도 같다 — 현재 위치를 아예 보지 않기 때문이다.
   *
   * 착지는 원래 경로와 똑같이 `stops`로 확정되므로 결과가 달라지지 않는다.
   */
  private skipSpin(token: number): void {
    // 이미 지나간 스핀의 손잡이는 아무것도 접지 않는다.
    if (this.destroyed || token !== this.spinToken) return
    // 이 스핀은 접기로 했다. 아직 시작하지 않은 변형 단계도 이 표식을 보고 건너뛴다.
    this.skipRequestedToken = token
    // 변형 재생 중이면 그 단계를 곧장 끝낸다. 최종 그리드는 그대로 확정된다.
    this.activeMutation?.finish()
    if (this.activeReels.size === 0) return
    const plan = buildSkipPlan(this.options.math.reels)

    for (const [reel, active] of [...this.activeReels]) {
      if (active.skipped) continue
      const settleMs = plan.reels[reel]?.durationMs ?? plan.totalMs
      active.timeline.kill()

      // 정지 위치 바로 위에서 시작한다. 남은 거리는 계산하지도 지나가지도 않는다.
      const stopPosition = normalizePosition(active.stop, active.stripLength)
      const state = { p: stopPosition + SKIP_SETTLE_SYMBOLS }
      active.view.position = state.p
      active.view.idleOffset = 0
      this.renderReel(reel)

      const timeline = gsap.timeline({ onComplete: active.land })
      timeline.to(state, {
        p: stopPosition,
        duration: settleMs / 1000,
        // 감속만 한다. 가속 이징을 쓰면 다시 달리는 것처럼 보인다.
        ease: 'power2.out',
        onUpdate: () => {
          active.view.position = state.p
          this.renderReel(reel)
        },
      })
      // 이미 접은 릴은 다시 접지 않는다.
      this.activeReels.set(reel, { ...active, timeline, skipped: true })
      this.spinTimelines.push(timeline)
    }
  }

  private async runSpin(stops: number[], opts?: SpinToOptions): Promise<void> {
    if (this.destroyed) return
    if (stops.length !== this.options.math.reels) {
      throw new RangeError(`stops 개수(${stops.length})가 reels(${this.options.math.reels})와 다르다`)
    }
    this.clearWins()
    this.setSpinningIdle(false)
    this.killSpinTimelines()
    // 지난 스핀의 변형은 여기서 사라진다. 릴은 언제나 스트립 그대로 돌기 시작한다.
    this.clearGridOverride()
    const token = (this.spinToken += 1)

    const plan = buildSpinPlan({
      reels: this.options.math.reels,
      ...(opts?.durationMs === undefined ? {} : { durationMs: opts.durationMs }),
      ...(opts?.stagger === undefined ? {} : { stagger: opts.stagger }),
      ...(opts?.fast === undefined ? {} : { fast: opts.fast }),
      speed: opts?.speed ?? this.spinSpeed,
      reducedMotion: this.options.reducedMotion,
    })

    await Promise.all(
      plan.reels.map(async (reelPlan) => {
        const stop = stops[reelPlan.reel]
        if (stop === undefined) return
        await this.spinReel(reelPlan, stop, token, plan)
      }),
    )

    // 중간에 새 스핀이나 destroy가 끼어들었으면 이 스핀의 종료를 알리지 않는다.
    if (this.destroyed || token !== this.spinToken) return
    this.spinTimelines = []
    this.spinResolvers = []
    this.activeReels.clear()

    // 변형은 착지와 승리 사이에 온다. 승리 연출은 변형이 끝난 그리드 위에서 시작해야 한다.
    const mutationPlan = this.planMutations(stops, opts)
    if (mutationPlan !== null) {
      await this.runMutationPhase(mutationPlan, token)
      if (this.destroyed || token !== this.spinToken) return
    }

    this.emit({ type: 'spinEnd' })
  }

  /**
   * 릴 1개를 반동 → 가속 → 감속 → 마무리 순으로 돌린다.
   *
   * 반동은 스핀을 **시작할 때** 모든 릴이 함께 살짝 위로 당겼다가 아래로 튕겨 나가는 구간이다.
   * 멈출 때는 튕기지 않는다. `LANDING_SETTLE_SYMBOLS`만큼만 아주 짧게 자리를 잡는다.
   *
   * 착지는 애니메이션이 도달한 값이 아니라 정확한 정지 위치로 다시 확정하므로
   * 반동과 마무리가 어떻게 움직이든 결정론이 깨지지 않는다.
   */
  private spinReel(plan: ReelSpinPlan, stop: number, token: number, spinPlan: SpinPlan): Promise<void> {
    const view = this.reels[plan.reel]
    const strip = this.options.math.strips[plan.reel]
    if (view === undefined || strip === undefined) return Promise.resolve()

    const reduced = this.options.reducedMotion
    const length = strip.length
    const start = view.position
    // 양수가 위쪽이다. 반동은 릴을 위로 끌어올린다.
    const pullUpTo = reduced ? start : start + PULL_UP_SYMBOLS
    const target = spinTargetPosition(start, stop, length, plan.revolutions)
    const settle = reduced ? 0 : LANDING_SETTLE_SYMBOLS
    const landing = target - settle
    const distance = pullUpTo - landing
    const accelTo = pullUpTo - distance * ACCEL_DISTANCE_RATIO

    const state = { p: start }
    const onUpdate = (): void => {
      view.position = state.p
      this.renderReel(plan.reel)
    }

    return new Promise<void>((resolve) => {
      this.spinResolvers.push(resolve)
      // 정상 종료든 스킵이든 같은 착지 절차를 쓴다. 그래야 결과가 갈리지 않는다.
      const land = (): void => {
        this.activeReels.delete(plan.reel)
        view.position = normalizePosition(stop, length)
        view.idleOffset = 0
        this.renderReel(plan.reel)
        if (token === this.spinToken && !this.destroyed) {
          this.emit({ type: 'reelStop', reel: plan.reel })
        }
        resolve()
      }
      const timeline = gsap.timeline({ onComplete: land })
      this.activeReels.set(plan.reel, {
        timeline,
        view,
        stop,
        stripLength: length,
        token,
        land,
        skipped: false,
      })

      if (spinPlan.pullUpMs > 0) {
        timeline.to(state, {
          p: pullUpTo,
          duration: spinPlan.pullUpMs / 1000,
          ease: 'power2.out',
          onUpdate,
        })
      }

      timeline
        .to(state, {
          p: accelTo,
          duration: (plan.spinMs * ACCEL_TIME_RATIO) / 1000,
          ease: 'power2.in',
          onUpdate,
        })
        .to(state, {
          p: landing,
          duration: (plan.spinMs * (1 - ACCEL_TIME_RATIO)) / 1000,
          ease: 'power2.out',
          onUpdate,
        })

      if (plan.settleMs > 0) {
        timeline.to(state, {
          p: target,
          duration: plan.settleMs / 1000,
          ease: 'power2.out',
          onUpdate,
        })
      }

      this.spinTimelines.push(timeline)
    })
  }

  /**
   * 진행 중인 스핀을 끊는다. GSAP은 kill 시 onComplete를 부르지 않으므로
   * 대기 중인 promise를 여기서 직접 풀어 준다. 그러지 않으면 이전 `spinTo`가 영원히 매달린다.
   */
  private killSpinTimelines(): void {
    for (const timeline of this.spinTimelines) timeline.kill()
    this.spinTimelines = []
    this.activeReels.clear()
    // 재생 중이던 변형도 함께 끊는다. 끊긴 단계는 자기 그리드를 확정하고 물러난다.
    this.activeMutation?.finish()
    const resolvers = this.spinResolvers
    this.spinResolvers = []
    for (const resolve of resolvers) resolve()
  }


  // ------------------------------------------------------------------ 변형

  /**
   * 화면 그리드를 갈아 끼운다. 스트립에 없는 심볼도 이 층을 통해 칸에 앉는다.
   * 다시 그릴 때마다 스트립으로 되돌아가는 것을 막는 유일한 장치다.
   */
  private applyGridOverride(grid: readonly (readonly SymbolId[])[]): void {
    this.gridOverride = grid.map((row) => [...row])
    for (let reel = 0; reel < this.reels.length; reel += 1) this.renderReel(reel)
  }

  /** 변형 층을 걷어 내고 스트립이 보이는 그대로 되돌린다. */
  private clearGridOverride(): void {
    if (this.gridOverride === null) return
    this.gridOverride = null
    for (let reel = 0; reel < this.reels.length; reel += 1) this.renderReel(reel)
  }

  /**
   * 이번 스핀의 변형 계획. 재생할 것이 없으면 null이다.
   *
   * `gridBefore`를 주지 않았으면 정지 위치에서 되짚는데, 정지 위치가 스트립과 맞지 않으면
   * 여기서 예외가 난다. 그 예외로 스핀이 멎으면 spinEnd가 영영 안 나가고 허브가 멈춘다.
   * 변형은 연출이지 결과가 아니므로, 되짚기에 실패하면 변형만 건너뛰고 스핀은 정상 종료시킨다.
   */
  private planMutations(stops: number[], opts?: SpinToOptions): MutationPlan | null {
    const mutations = opts?.mutations ?? []
    if (mutations.length === 0) return null

    let gridBefore = opts?.gridBefore
    if (gridBefore === undefined) {
      try {
        gridBefore = stopsToGrid(this.options.math, stops)
      } catch {
        return null
      }
    }

    const plan = buildMutationPlan(gridBefore, mutations, {
      reducedMotion: this.options.reducedMotion,
    })
    return plan.steps.length === 0 ? null : plan
  }

  /**
   * 변형 단계를 순서대로 재생한다.
   *
   * 단계마다 `start`를 내고 연출을 끝낸 뒤 `end`를 낸다. 짝이 어긋나면 허브의 배너가
   * 걸린 채로 남는다. 스킵이 눌리면 아직 시작하지 않은 단계는 아예 열지 않는다.
   *
   * 어떻게 끝나든 마지막에 화면은 `plan.finalGrid`, 즉 엔진의 `SpinResult.grid`와 같다.
   */
  private async runMutationPhase(plan: MutationPlan, token: number): Promise<void> {
    for (const step of plan.steps) {
      if (this.destroyed || token !== this.spinToken) return
      if (this.skipRequestedToken === token) break
      this.emitMutation(step, 'start')
      await this.playMutationStep(step)
      // start를 냈으면 end도 반드시 낸다. 새 스핀이나 destroy가 끼어들어도 마찬가지다.
      // 짝이 어긋나면 이 신호를 기다리는 배너가 걸린 채로 남는다.
      this.emitMutation(step, 'end')
      if (this.destroyed || token !== this.spinToken) return
    }
    if (this.destroyed || token !== this.spinToken) return
    this.applyGridOverride(plan.finalGrid)
  }

  /**
   * 변형 이벤트 하나. 배너가 "무엇으로 바뀌었는지"를 바로 읽을 수 있도록
   * 공개된 심볼(리빌 결과·와일드 id)을 이벤트 맨 위에도 함께 올린다.
   */
  private emitMutation(step: MutationStep, phase: 'start' | 'end'): void {
    const symbol = step.mutation.symbol
    this.emit({
      type: 'mutation',
      mutation: step.mutation,
      ...(symbol === undefined ? {} : { symbol }),
      phase,
    })
  }

  /** 변형 단계 하나가 끝날 때까지 기다린다. 끝나는 길은 정상 종료와 스킵 둘뿐이다. */
  private playMutationStep(step: MutationStep): Promise<void> {
    return new Promise<void>((resolve) => {
      let handle: MutationFxHandle | null = null
      let hold: ReturnType<typeof setTimeout> | null = null
      let settled = false
      // 정상 종료든 스킵이든 같은 문을 지난다. 그래야 화면이 갈리지 않는다.
      const finish = (): void => {
        if (settled) return
        settled = true
        this.activeMutation = null
        if (hold !== null) clearTimeout(hold)
        handle?.stop()
        this.applyGridOverride(step.grid)
        resolve()
      }
      this.activeMutation = { finish }

      const targets = this.mutationTargets(step)
      handle = playMutationFx(step, targets, this.mutationContext(step), {
        onCommit: () => this.applyGridOverride(step.grid),
        onComplete: finish,
      })
      // 연출이 없으면 끝을 알려 줄 타임라인도 없다. 그렇다고 0ms에 닫으면 계획이 말한
      // 길이와 화면이 갈린다. 바뀐 결과를 읽을 시간은 계획이 정한 만큼 그대로 준다.
      // 이 타이머는 clearWins가 걷어 가는 목록에 넣지 않는다. 걷히면 단계가 안 닫힌다.
      if (this.options.reducedMotion || targets.length === 0) {
        hold = setTimeout(finish, step.durationMs)
      }
    })
  }

  /** 이 단계가 실제로 건드리는 화면 칸. 격자 밖 좌표는 조용히 버린다. */
  private mutationTargets(step: MutationStep): MutationCellTarget[] {
    const targets: MutationCellTarget[] = []
    for (const change of step.cells) {
      const [reel, row] = change.position
      const cell = this.reels[reel]?.cells[row + 1]
      if (cell === undefined) continue
      targets.push({
        view: cell.view,
        sprite: cell.sprite,
        center: symbolCenter(this.layout, reel, row),
      })
    }
    return targets
  }

  private mutationContext(step: MutationStep): {
    layer: Container
    pool: MutationSpritePool
    textures: FxTextures
    color: string
    symbolSize: number
    columns: Rect[]
    reducedMotion: boolean
  } {
    return {
      layer: this.mutationLayer,
      pool: this.mutationPool,
      textures: this.fxTextures,
      color: this.options.theme.palette.frame,
      symbolSize: this.layout.symbolSize,
      columns: step.type === 'expandWild' ? this.reelColumns(mutationReels(step.mutation)) : [],
      reducedMotion: this.options.reducedMotion,
    }
  }

  /** 릴 한 줄이 차지하는 사각형(콘텐츠 좌표). 확장 와일드 기둥이 여기에 선다. */
  private reelColumns(reels: readonly number[]): Rect[] {
    const { reelArea, symbolSize } = this.layout
    return reels
      .filter((reel) => reel >= 0 && reel < this.reels.length)
      .map((reel) => ({
        x: reelLeft(this.layout, reel),
        y: reelArea.y,
        width: symbolSize,
        height: reelArea.height,
      }))
  }

  // ------------------------------------------------------------------ 승리

  /**
   * 승리 연출. 한 바퀴는 A단계(전체 동시) → B단계(라인 하나씩) 순서다.
   *
   * 첫 바퀴가 끝나면 resolve한다. 기본값 `loop: true`에서는 그 뒤로도 A→B→A로 계속 돌고,
   * `clearWins()`·다음 `spinTo()`·`destroy()`·모드 전환이 순환을 끊는다.
   * 실제 순서와 길이는 `buildPresentation`이 정한다. 여기서는 그리기와 대기만 한다.
   *
   * 코인·색종이는 첫 바퀴에서 한 번만 터진다. 매 바퀴 다시 뿌리면 화면이 금세 지저분해진다.
   *
   * `showWins()`는 항상 마지막 릴의 정착 트윈까지 끝난 뒤에만 불린다(`spinTo()`가 돌려주는
   * 약속이 모든 릴의 착지·뮤테이션까지 기다린 뒤에야 풀리므로 — `runSpin()` 참고). 여기서는 그
   * 위에 사용자 피드백("각 연출은 릴스탑이 끝나고 나올 것")을 반영해 `winStartDelayMs`만큼 눈에
   * 보이는 숨 고르기를 하나 더 얹는다 — "멈췄다"와 "터진다"가 같은 프레임 근처에서 겹쳐 보이지
   * 않게 한다. 스킵(스탑/탭/스페이스)으로 릴을 곧장 스냅시킨 경우도 같은 `showWins()`를 거치므로
   * 여백이 동일하게 적용된다.
   */
  async showWins(wins: WinLine[], opts?: ShowWinsOptions): Promise<void> {
    this.clearWins()
    if (this.destroyed) return

    const token = this.winToken
    // 라인 승리가 없어도 스캐터나 프리스핀만으로 보여줄 것이 있다.
    // 빈 목록 판정은 buildPresentation에 맡긴다.
    const steps = buildPresentation(
      wins,
      this.options.math,
      presentationOptionsFor(opts, this.options.reducedMotion, this.spinSpeed),
    )
    if (steps.length === 0) return

    const delayMs = winStartDelayMs(this.spinSpeed, this.options.reducedMotion)
    if (delayMs > 0) {
      await this.wait(delayMs)
      // 대기하는 사이 새 스핀이 시작됐거나(clearWins가 winToken을 올린다) 렌더러가 죽었으면
      // 이제 와서 연출을 새로 시작하지 않는다 — 다음 스핀의 몫이다.
      if (this.destroyed || token !== this.winToken) return
    }

    const first = steps[0]
    const tier = first !== undefined && first.phase === 'all' ? first.tier : 'none'
    if (!this.options.reducedMotion && tier !== 'none') {
      this.stopCoins = burstCoins(this.fxLayer, this.coinTexture, this.layout, coinCountForTier(tier))
      // 색종이는 최고 등급에만. 아래 등급까지 뿌리면 특별함이 사라진다.
      if (tier === 'max') {
        this.stopConfetti = burstConfetti(this.fxLayer, this.confettiTexture, this.layout)
      }
    }

    const handle = runPresentation(steps, {
      render: (step, context) => this.renderStep(step, context),
      wait: (ms) => this.wait(ms),
      cancelled: () => token !== this.winToken || this.destroyed,
      loop: shouldLoopPresentation(opts),
    })
    this.winSkip = handle.skip
    return handle.firstPass
  }

  /**
   * 보고 있던 바퀴를 곧장 접는다. `showWins()`의 약속이 그 자리에서 resolve한다.
   *
   * 순환은 멈추지 않는다. 접은 자리에서 다음 바퀴가 A단계부터 다시 시작한다.
   * 남은 라인 스텝은 그리지도 `winLine`을 내지도 않는다 — 보지 않고 넘긴 것을 알릴 이유가 없다.
   * 배당 롤업을 접는 것은 허브의 몫이다. 여기서는 릴 위 타임라인만 접는다.
   */
  skipWins(): void {
    this.winSkip?.()
  }

  /** 연출 한 스텝을 화면에 올린다. 이전 스텝의 fx와 딤은 먼저 걷어낸다. */
  private renderStep(step: PresentationStep, context: PresentationStepContext): void {
    this.stopSymbolFx()
    this.winGraphics.clear()

    if (step.phase === 'all') {
      // ways 게임은 여러 심볼의 승리가 같은 칸을 겹쳐 짚는다. 겹친 채로 두면 한 칸에
      // 연출을 몇 겹씩 걸었다 끄기를 반복하고 stagger 인덱스도 실제 칸 수를 넘는다.
      const positions = dedupePositions(step.wins.flatMap((win) => win.positions))
      this.dimExcept([...positions, ...step.scatters])
      // A단계에도 B단계와 **같은** 브라스 테두리를 두른다. 이게 빠져 있어서 전체 연출에서만
      // 테두리가 사라져 보였다. 페이라인 선은 여전히 A단계에서 긋지 않는다 —
      // 라인이 여러 개면 선이 서로를 덮어 무엇이 이겼는지가 오히려 흐려진다.
      this.drawWinGlow(positions)
      this.crossfadeOverlay()
      this.playFxAt(positions)
      this.showScatters(step.scatters)
      // 허브가 배당 카운터를 이 시간에 맞춰 굴릴 수 있도록 시작할 때 알린다.
      // winCycle은 몇 바퀴째인지를 함께 알려 준다. 허브가 A단계 동안 총배당을 다시 띄우는 신호다.
      this.emit({ type: 'winCycle', cycle: context.cycle, totalWin: step.totalWin })
      this.emit({
        type: 'winTotal',
        totalWin: step.totalWin,
        tier: step.tier,
        durationMs: step.durationMs,
      })
      return
    }

    if (step.phase === 'feature') {
      // 스캐터는 계속 밝게 두고, 자리마다 파티클이 가운데로 모인다.
      this.dimExcept(step.scatters)
      this.playFxAt(step.scatters)
      this.showScatters(step.scatters)
      if (!this.options.reducedMotion && step.scatters.length > 0) {
        this.stopScatterBurst = burstScatters(this.fxLayer, this.coinTexture, this.layout, step.scatters)
      }
      // 인트로 배너는 허브가 띄운다. 여기서는 걸렸다는 사실만 알린다.
      this.emit({ type: 'featureTriggered', feature: step.feature })
      return
    }

    const win = step.win
    this.dimExcept([...win.positions, ...step.scatters])
    this.showScatters(step.scatters)
    this.drawWinHighlight(win)
    this.crossfadeOverlay()
    // 움직이는 빛은 없다. 이긴 자리마다 심볼 연출을 한 번 터뜨리고 고정 광채로 둘러싼다.
    this.playFxAt(win.positions)
    // 릴 위에는 글자를 찍지 않는다. 문구는 허브가 이 이벤트를 받아 릴 밖에 그린다.
    this.emit(winLineEvent(win, context))
  }

  /**
   * 스캐터 자리에 맥동하는 금빛 링을 그린다.
   * 페이라인은 그리지 않는다. 스캐터는 라인과 무관하게 이긴 것이라 선으로 이으면 거짓말이 된다.
   */
  private showScatters(positions: readonly GridPosition[]): void {
    this.scatterTween?.kill()
    this.scatterTween = null
    this.featureGraphics.clear()
    this.featureGraphics.alpha = 1
    if (positions.length === 0) return

    const brass = this.options.theme.palette.frame
    const radius = this.layout.symbolSize * SCATTER_RING_SCALE
    for (const [reel, row] of positions) {
      const center = symbolCenter(this.layout, reel, row)
      this.featureGraphics.circle(center.x, center.y, radius)
    }
    this.featureGraphics.stroke({ width: SCATTER_RING_STROKE_PX, color: brass, alpha: 0.95 })

    if (this.options.reducedMotion) return
    const ring = { alpha: 1 }
    this.scatterTween = gsap.to(ring, {
      alpha: 0.35,
      duration: SCATTER_RING_PULSE_MS / 2000,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      onUpdate: () => {
        this.featureGraphics.alpha = ring.alpha
      },
    })
  }

  /** 라인이 바뀔 때 오버레이를 투명에서 끌어올려 툭 끊기지 않게 한다. */
  private crossfadeOverlay(): void {
    this.crossfadeTween?.kill()
    if (this.options.reducedMotion) {
      // 모션 축소에서는 크로스페이드를 하지 않는다. 순환 자체는 그대로 한 칸씩 넘어간다.
      this.winGraphics.alpha = 1
      return
    }
    this.winGraphics.alpha = 0
    const overlay = { value: 0 }
    this.crossfadeTween = gsap.to(overlay, {
      value: 1,
      duration: PHASE_CROSSFADE_MS / 1000,
      ease: 'sine.out',
      onUpdate: () => {
        this.winGraphics.alpha = overlay.value
      },
    })
  }

  /** 승리에 참여하지 않는 심볼을 어둡게 눌러 이긴 심볼만 도드라지게 한다. */
  private dimExcept(positions: readonly (readonly [number, number])[]): void {
    const lit = new Set(positions.map(([reel, row]) => `${reel}:${row}`))
    for (let reel = 0; reel < this.reels.length; reel += 1) {
      const view = this.reels[reel]
      if (view === undefined) continue
      for (let k = 0; k < view.cells.length; k += 1) {
        const cell = view.cells[k]
        if (cell === undefined) continue
        // 셀 인덱스 0은 위쪽 오버스캔이라 화면 행은 k - 1이다.
        cell.view.alpha = lit.has(`${reel}:${k - 1}`) ? 1 : DIM_ALPHA
      }
    }
  }

  private undim(): void {
    for (const view of this.reels) {
      for (const cell of view.cells) cell.view.alpha = 1
    }
  }

  /**
   * 좌표 목록의 심볼에 테마가 정한 연출을 건다.
   *
   * 연출은 **그 자리에 실제로 그려진 심볼**(`cell.symbol`)로 찾는다. `win.symbol`은 쓰지 않는다.
   * 그룹 배당(Any BAR 등)에서 `win.symbol`은 그룹 id라 테마에 그런 심볼이 없기 때문이다.
   * 덕분에 한 라인 안에서 BAR 1·2·3이 각자 다른 연출을 낸다.
   */
  /** 셀 하나에 걸린 연출을 모두 끈다. 같은 자리를 다시 터뜨리기 전에 부른다. */
  private stopCellFx(key: string): void {
    const handles = this.cellFx.get(key)
    if (handles === undefined) return
    for (const handle of handles) handle.stop()
    this.cellFx.delete(key)
  }

  private addCellFx(key: string, handle: SymbolFxHandle): void {
    this.fxHandles.push(handle)
    const handles = this.cellFx.get(key)
    if (handles === undefined) this.cellFx.set(key, [handle])
    else handles.push(handle)
  }

  private playFxAt(positions: readonly (readonly [number, number])[]): void {
    const token = this.fxToken
    positions.forEach(([reel, row], index) => {
      const cell = this.reels[reel]?.cells[row + 1]
      if (cell === undefined || cell.symbol === null) return
      const key = `${reel}:${row}`
      // 순환이 같은 자리를 다시 짚을 때 앞의 연출을 반드시 걷어낸다.
      this.stopCellFx(key)

      const effects = resolveSymbolFx(this.options.theme.fx, cell.symbol, this.options.reducedMotion)
      const target = {
        view: cell.view,
        sprite: cell.sprite,
        symbolSize: this.layout.symbolSize,
        index,
      }

      // 모션 축소에서는 시트를 재생하지 않는다. 반복 애니메이션도 모션이다.
      const sheetUrl = this.options.reducedMotion
        ? undefined
        : this.options.theme.sheets?.[cell.symbol]?.win
      const ready = sheetUrl === undefined ? null : peekSheet(sheetUrl)
      const plan = planSheetFx(effects, ready !== null, this.fallbackFx())

      let procedural: SymbolFxHandle | null = null
      if (plan.procedural.length > 0) {
        procedural = playSymbolFxSet(target, plan.procedural, this.fxTextures)
        this.addCellFx(key, procedural)
      }

      if (plan.useSheet && ready !== null) {
        this.addCellFx(key, playSheetFx(target, ready))
        return
      }

      if (sheetUrl === undefined) return

      // 처음 쓰는 시트는 아직 없다. 절차적 연출로 먼저 보여주고, 도착하면 갈아 끼운다.
      const sheetOnly = isSheetOnly(effects)
      void loadSheetFrames(sheetUrl).then((loaded) => {
        if (loaded === null || token !== this.fxToken || this.destroyed) return
        if (sheetOnly) procedural?.stop()
        const handle = playSheetFx(target, loaded)
        if (token === this.fxToken) this.addCellFx(key, handle)
        else handle.stop()
      })
    })
  }

  /** 시트를 못 쓸 때 돌아갈 최소 연출. 심볼이 아무 반응도 없는 상태를 막는다. */
  private fallbackFx(): ResolvedFxEffect[] {
    return BUILTIN_FX.map(resolveFxEffect)
  }

  private stopSymbolFx(): void {
    this.fxToken += 1
    for (const handle of this.fxHandles) handle.stop()
    this.fxHandles = []
    this.cellFx.clear()
    this.undim()
    for (const view of this.reels) {
      for (const cell of view.cells) {
        cell.view.scale.set(1)
        cell.view.rotation = 0
        cell.sprite.alpha = 1
        cell.sprite.y = 0
        // 시트가 숨겨 둔 채로 끝났을 수 있다. 여기서 무조건 되살린다.
        cell.sprite.visible = true
      }
    }
  }

  /**
   * 승리 심볼 둘레의 브라스 광채. 기본 경로에서는 **선을 긋지 않는다.**
   * 움직이는 것은 없다. 이 광채는 스텝이 끝날 때까지 그 자리에 그대로 머문다.
   * `paylineStyle: 'line'`일 때만 예전 폴리라인을 덧그린다(좌표 확인용).
   */
  private drawWinHighlight(win: WinLine): void {
    // ways 게임에는 페이라인이 없다(`line`은 -1). 선을 그릴 좌표 자체가 없으므로 광채만 남는다.
    const payline = this.options.math.paylines[win.line]

    if (this.options.paylineStyle === 'line' && payline !== undefined) {
      const lineColor = paylineColor(this.options.theme.palette.winLine, win.line)
      const points = paylinePoints(this.layout, payline)
      const first = points[0]
      if (first !== undefined) {
        this.winGraphics.moveTo(first.x, first.y)
        for (let i = 1; i < points.length; i += 1) {
          const point = points[i]
          if (point !== undefined) this.winGraphics.lineTo(point.x, point.y)
        }
        this.winGraphics.stroke({
          width: WIN_LINE_STROKE_PX,
          color: lineColor,
          alpha: WIN_LINE_ALPHA,
          cap: 'round',
          join: 'round',
        })
      }
    }

    this.drawWinGlow(win.positions)
  }

  /**
   * 이긴 자리마다 브라스 광채 테두리를 두른다. 굵고 흐린 선부터 겹쳐 블러 없이 번짐을 만든다.
   * A단계(전체)와 B단계(라인별)가 같은 함수를 쓴다. 두 화면의 테두리가 달라 보이면 안 된다.
   */
  private drawWinGlow(positions: readonly GridPosition[]): void {
    const brass = this.options.theme.palette.frame
    const radius = this.layout.radius * 0.5
    const rects = positionRects(this.layout, positions)
    for (const glow of WIN_GLOW_LAYERS) {
      for (const rect of rects) {
        this.winGraphics.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
      }
      this.winGraphics.stroke({ width: glow.widthPx, color: brass, alpha: glow.alpha, join: 'round' })
    }
    for (const rect of rects) {
      this.winGraphics.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
    }
    this.winGraphics.stroke({ width: WIN_HIGHLIGHT_STROKE_PX, color: brass, alpha: 0.95, join: 'round' })
  }

  clearWins(): void {
    this.winToken += 1
    this.winSkip = null
    this.winGraphics.clear()
    this.stopSymbolFx()
    this.clearTimers()
    this.scatterTween?.kill()
    this.scatterTween = null
    this.featureGraphics.clear()
    this.featureGraphics.alpha = 1
    this.stopScatterBurst?.()
    this.stopScatterBurst = null
    this.drawMode()
    this.crossfadeTween?.kill()
    this.crossfadeTween = null
    this.winGraphics.alpha = 1
    this.stopCoins?.()
    this.stopCoins = null
    this.stopConfetti?.()
    this.stopConfetti = null
  }

  /**
   * `ms`만큼 기다린다. `clearTimers()`가 걷어 가면 **곧바로** resolve한다.
   *
   * 그냥 타이머만 지우면 기다리던 약속이 영영 매달린 채 남는다. 승리 순환은 매 스텝 여기서
   * 기다리므로, 매달린 약속 하나가 그 바퀴의 클로저를 통째로 붙잡는다. 깨워서 내보내면
   * 다음 줄의 취소 검사가 순환을 정상적으로 끝낸다.
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id)
        resolve()
      }, ms)
      this.timers.set(id, resolve)
    })
  }

  private clearTimers(): void {
    const pending = [...this.timers]
    this.timers.clear()
    for (const [id, resolve] of pending) {
      clearTimeout(id)
      resolve()
    }
  }

  // ------------------------------------------------------------- 진행 상태

  setMode(mode: RendererMode): void {
    // 남은 횟수만 바뀐 경우에는 전환하지 않는다. 매 스핀 화면이 번쩍이면 피곤하다.
    const target = modeTransitionTarget(this.mode, mode)
    if (target !== null) {
      // 배경이 통째로 바뀌는 전환이다. 돌고 있던 승리 순환을 여기서 끊는다.
      // 끊지 않으면 전환이 끝난 화면 위에 지난 스핀의 하이라이트와 fx가 계속 되살아난다.
      // mode를 갈아 끼우기 **전에** 부른다 — clearWins가 다시 그리는 테두리는 아직 화면에
      // 있는 그대로여야 하고, 프리스핀에서 나올 때는 그 테두리가 흐려지며 사라져야 한다.
      this.clearWins()
    }
    this.mode = mode

    if (target === null) {
      this.drawMode()
      return
    }
    // 테두리/배경 교체는 커튼이 화면을 완전히 덮은 순간(applyModeSwap)에 한 번에 일어난다 —
    // 여기서 미리 그리거나 알파를 낮춰 둘 필요가 없다.
    this.playModeTransition(target)
  }

  /**
   * 프리스핀 진입/이탈 전환 — 화면 전체를 완전히 가리는 커튼 3단계.
   * (a) 덮기: 커튼이 알파 0→1로 캔버스 전체를 완전히 가린다.
   * (b) 배너: 완전히 가려진 채로 배경/테두리를 갈아 끼우고(applyModeSwap) 그 상태를 붙든다 —
   *     허브가 이 구간 위에 전체화면 배너(FREE SPINS!/COMPLETE)를 얹는다.
   * (c) 걷기: 커튼이 알파 1→0으로 걷히며 새 모드가 드러난다.
   * 되돌아올 때도 같은 3단계를 그대로 반복한다(양방향 동일).
   */
  private playModeTransition(to: ModeTarget): void {
    // 진행 중인 전환이 있으면 그 끝을 먼저 알린다. start 하나에 end 하나를 보장한다.
    this.finishModeTransition()
    const plan = buildModeTransition(to, {
      hasFreeSpinsBackground: this.options.theme.backgroundFreeSpins !== undefined,
      reducedMotion: this.options.reducedMotion,
      speed: this.spinSpeed,
    })
    this.modeTransitionTo = to
    this.emit({ type: 'modeTransition', to, phase: 'start' })

    this.curtain.visible = true
    this.curtain.alpha = 0

    const timeline = gsap.timeline({ onComplete: () => this.finishModeTransition() })
    timeline
      .to(this.curtain, { alpha: 1, duration: plan.coverInMs / 1000, ease: 'sine.inOut' }, 0)
      .call(() => this.applyModeSwap(to), undefined, plan.swapAtMs / 1000)
      .to(
        this.curtain,
        { alpha: 0, duration: plan.coverOutMs / 1000, ease: 'sine.inOut' },
        plan.coverOutStartMs / 1000,
      )

    this.modeTransition = timeline
  }

  /** 커튼이 화면을 완전히 덮은 순간 배경/테두리를 갈아 끼운다. 교체 자체는 가려져 보이지 않는다. */
  private applyModeSwap(to: ModeTarget): void {
    this.freeSpinsVisible = to === 'freeSpins'
    this.freeSpinsSprite.visible = this.freeSpinsVisible
    this.modeGraphics.alpha = 1
    this.drawMode()
  }

  /**
   * 전환을 마무리한다. 정상 종료든 중간에 끊긴 것이든 여기 한 곳을 지난다.
   *
   * gsap는 `kill()` 때 `onComplete`를 부르지 않는다. 그대로 두면 `end`가 영영 안 나가고
   * 허브의 프리스핀 진입 대기가 풀리지 않는다. 그래서 끊을 때도 이 절차를 직접 탄다 — 중간에
   * 끊겨 `applyModeSwap`(걷기 전 `.call`)이 아직 안 불렸을 수도 있으니 여기서도 한 번 더
   * 불러 최종 상태를 보장한다(멱등).
   */
  private finishModeTransition(): void {
    const to = this.modeTransitionTo
    this.modeTransition?.kill()
    this.modeTransition = null
    if (to === null) return
    this.modeTransitionTo = null

    this.applyModeSwap(to)
    this.curtain.visible = false
    this.curtain.alpha = 0
    this.emit({ type: 'modeTransition', to, phase: 'end' })
  }

  /**
   * 프리스핀 표시. 릴 창 테두리에 금빛을 두른다.
   * 스캐터 링과 같은 Graphics를 쓰므로 링을 다시 그릴 때도 함께 불린다.
   *
   * 남은 횟수/배수 명판은 더 이상 릴 위에 그리지 않는다 — 심볼과 겹쳐 가독성을 해쳤다.
   * 그 정보는 허브가 릴 밖(컨트롤 위 스트립)에서 store의 freeSpins 상태로 직접 보여준다.
   */
  private drawMode(): void {
    // 자기 층을 먼저 비운다. 이걸 빼면 스핀마다 테두리가 겹겹이 쌓인다.
    this.modeGraphics.clear()
    const freeSpins = this.mode.freeSpins
    if (freeSpins === null || freeSpins === undefined) return

    const { reelArea, radius } = this.layout
    this.modeGraphics
      .roundRect(reelArea.x, reelArea.y, reelArea.width, reelArea.height, radius * 0.5)
      .stroke({
        width: FREE_SPINS_EDGE_STROKE_PX,
        color: this.options.theme.palette.frame,
        alpha: FREE_SPINS_EDGE_ALPHA,
      })
  }

  // ------------------------------------------------------------------ 유휴

  /**
   * 이후 모든 스핀의 속도 프로파일을 바꾼다. 돌고 있는 스핀은 건드리지 않는다.
   * 승리 연출 A단계 홀드도 이 값을 따른다. 모션 축소가 켜져 있으면 그 상한이 언제나 이긴다.
   */
  setSpinSpeed(speed: SpinSpeed): void {
    this.spinSpeed = speed
  }

  setSpinningIdle(on: boolean): void {
    for (const tween of this.idleTweens) tween.kill()
    this.idleTweens = []

    if (!on || this.options.reducedMotion || this.destroyed) {
      for (let reel = 0; reel < this.reels.length; reel += 1) {
        const view = this.reels[reel]
        if (view === undefined) continue
        view.idleOffset = 0
        this.renderReel(reel)
      }
      return
    }

    for (let reel = 0; reel < this.reels.length; reel += 1) {
      const view = this.reels[reel]
      if (view === undefined) continue
      this.idleTweens.push(
        gsap.to(view, {
          idleOffset: IDLE_AMPLITUDE_SYMBOLS,
          duration: IDLE_CYCLE_MS / 2000,
          delay: (reel * IDLE_CYCLE_MS) / (4000 * Math.max(1, this.reels.length)),
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
          onUpdate: () => this.renderReel(reel),
        }),
      )
    }
  }

  // ------------------------------------------------------------------ 은은한 연출

  private stopAmbient(): void {
    for (const effect of this.ambient) effect.stop()
    this.ambient = []
    this.sparkleLayer.removeChildren()
  }

  /**
   * 배경 반짝임을 다시 건다.
   * 배치가 캔버스 크기에 묶여 있어 레이아웃이 바뀔 때마다 새로 시작한다.
   * 모션 축소에서는 텍스처조차 만들지 않으므로 아무것도 하지 않는다.
   */
  private startAmbient(): void {
    this.stopAmbient()
    if (this.destroyed || this.options.reducedMotion) return

    const { canvasWidth, canvasHeight, frameRect } = this.geometry
    if (canvasWidth <= 0 || canvasHeight <= 0) return

    if (this.sparkleTexture !== null) {
      const area = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
      // 릴 창 위에서는 반짝이지 않는다. 심볼을 읽는 데 방해가 된다.
      const window = this.geometry.window
      this.ambient.push(
        startSparkles(this.sparkleLayer, this.sparkleTexture, area, {
          ...(window === null ? {} : { exclude: window }),
        }),
      )
    }
  }

  // -------------------------------------------------------------- 리사이즈

  private observeResize(): void {
    if (typeof ResizeObserver !== 'function') return
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.options.container)
  }

  resize(): void {
    if (this.destroyed) return
    const next = this.measureGeometry()
    if (next.canvasWidth === this.geometry.canvasWidth && next.canvasHeight === this.geometry.canvasHeight) {
      return
    }
    this.geometry = next
    this.applyLayout()
    // `app.renderer.resize()`(applyLayout 안에서 호출)는 캔버스의 width/height 속성을 바꾼다 —
    // 브라우저는 이 순간 드로잉 버퍼를 곧장 비운다. Pixi의 자체 티커가 다음 rAF에 다시 그릴
    // 때까지 기다리면 그 사이에 브라우저가 "방금 비워진" 캔버스를 한 프레임 그대로 페인트할 수
    // 있다 — 릴 전체가 새까맣게 한 프레임 번쩍이는 원인이었다(실측: ResizeObserver가 WinStrip
    // 레이아웃 변화로 1px 단위 지터를 감지할 때마다 재현됐다). 리사이즈와 재렌더를 같은 동기
    // 호출 안에서 묶어 그 틈을 아예 없앤다.
    this.app.render()
  }

  // ------------------------------------------------------------------ 해제

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    // 대기 중인 쪽이 영영 매달리지 않도록 전환의 끝을 먼저 알린다.
    this.finishModeTransition()
    this.clearWins()
    this.killSpinTimelines()
    this.stopAmbient()
    for (const tween of this.idleTweens) tween.kill()
    this.idleTweens = []
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.options.container.style.overflow = this.previousOverflow
    this.app.destroy({ removeView: true }, { children: true })
    // 앱을 내린 뒤에 정리한다. 스프라이트는 기본적으로 텍스처를 파괴하지 않으므로
    // 캔버스로 만든 폴백·코인 텍스처는 여기서만 해제된다.
    // Assets.load로 받은 것은 전역 캐시 소유라 손대지 않는다.
    this.ownedTextures.destroyAll()
  }
}

/**
 * PixiJS 애플리케이션을 만들고 에셋을 모두 준비한 뒤 렌더러 코어를 돌려준다.
 * 이 모듈은 `createSlotRenderer`가 **동적 import** 하는 유일한 브라우저 전용 진입점이다.
 */
export async function createPixiRendererCore(options: ResolvedRendererOptions): Promise<RendererCore> {
  const app = new Application()
  await app.init({
    width: FALLBACK_CONTAINER_WIDTH,
    height: FALLBACK_CONTAINER_WIDTH,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: resolveResolution(),
  })
  app.canvas.style.display = 'block'
  app.canvas.style.margin = '0 auto'
  app.canvas.style.touchAction = 'manipulation'
  options.container.appendChild(app.canvas)

  const symbolIds = options.math.symbols.map((symbol) => symbol.id)
  const ownedTextures = new TextureRegistry()
  const [textures, backgroundTexture, frameTexture, freeSpinsTexture] = await Promise.all([
    loadSymbolTextures(options.theme, symbolIds, ownedTextures),
    loadBackgroundTexture(options.theme),
    loadFrameTexture(options.theme.frame, ownedTextures),
    loadImageTexture(options.theme.backgroundFreeSpins),
  ])
  const coinTexture = createCoinTexture(options.theme, ownedTextures)

  return new PixiRenderer(
    options,
    app,
    textures,
    coinTexture,
    backgroundTexture,
    frameTexture,
    freeSpinsTexture,
    ownedTextures,
  )
}
