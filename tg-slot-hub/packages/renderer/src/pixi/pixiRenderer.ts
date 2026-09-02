import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { GridPosition, SymbolId, WinLine } from '@tgslot/slot-engine'
import {
  ACCEL_DISTANCE_RATIO,
  ACCEL_TIME_RATIO,
  FALLBACK_CONTAINER_WIDTH,
  DIM_ALPHA,
  FREE_SPINS_EDGE_ALPHA,
  FREE_SPINS_EDGE_STROKE_PX,
  FREE_SPINS_PLAQUE_FONT_RATIO,
  IDLE_AMPLITUDE_SYMBOLS,
  MODE_FLASH_ALPHA,
  MODE_FLASH_COLOR,
  MODE_TINT_ALPHA,
  PHASE_CROSSFADE_MS,
  SCATTER_RING_PULSE_MS,
  SCATTER_RING_SCALE,
  SCATTER_RING_STROKE_PX,
  IDLE_CYCLE_MS,
  LANDING_SETTLE_SYMBOLS,
  PULL_UP_SYMBOLS,
  SYMBOL_FILL_RATIO,
  WIN_GLOW_LAYERS,
  WIN_HIGHLIGHT_STROKE_PX,
  WIN_LINE_ALPHA,
  WIN_LINE_STROKE_PX,
} from '../constants.js'
import { normalizePosition, spinTargetPosition, wrapIndex } from '../grid.js'
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
import { buildSkipPlan, buildSpinPlan, type ReelSpinPlan, type SpinPlan } from '../timing.js'
import {
  formatFreeSpinsPlaque,
  shouldShowFreeSpinsPlaque,
  type RendererMode,
} from '../features.js'
import { buildModeTransition, modeTransitionTarget, type ModeTarget } from '../transition.js'
import { paylineColor, type WinTier } from '../wins.js'
import { resolveFxEffect, resolveSymbolFx, BUILTIN_FX } from '../fx.js'
import { isSheetOnly, planSheetFx } from '../sheet.js'
import {
  buildPresentation,
  defaultLineLabel,
  presentationOptionsFor,
  type PresentationStep,
} from '../presentation.js'
import { buildPulsePath, pulseHopMsForTier, pulseTrailForTier } from '../pulse.js'
import type { RendererCore, ResolvedRendererOptions } from '../internal.js'
import type { ResolvedFxEffect } from '../fx.js'
import { TextureRegistry } from '../textureRegistry.js'
import type { RendererEvent, ShowWinsOptions, SpinHandle, SpinToOptions } from '../types.js'
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
import { createPulseTexture, playWinPulse, type WinPulseHandle } from './winPulse.js'
import { loadSheetFrames, peekSheet, playSheetFx } from './sheetFx.js'

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

/** 배당 라벨 글자 크기 = 심볼 한 변 x 이 값. */
const LABEL_FONT_RATIO = 0.24

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
  private readonly winLabel: Text
  /** 스캐터 링. 맥동하느라 alpha가 계속 움직여서 다른 것과 섞으면 안 된다. */
  private readonly featureGraphics = new Graphics()
  /** 프리스핀 창 테두리. 전환이 이 층의 alpha를 0에서 끌어올린다. */
  private readonly modeGraphics = new Graphics()
  private readonly modeLabel: Text

  private readonly reels: ReelView[] = []
  private readonly backgroundSprite: Sprite | null
  /** 프리스핀 배경. 이미지가 없으면 금빛 틴트 스프라이트가 대신 선다. */
  private readonly freeSpinsSprite: Sprite
  /** 전환 순간의 금빛 섬광. */
  private readonly flashSprite: Sprite
  /** 방사형 와이프 마스크. 반지름을 키웠다 줄이며 배경을 교차시킨다. */
  private readonly wipeMask = new Graphics()
  /** 베젤 아트. 릴 창이 알파로 뚫려 있어 릴 **위에** 얹는다. */
  private readonly frameSprite: Sprite | null
  /** 배경 위 반짝임. 프레임보다 아래에 둔다. */
  private readonly sparkleLayer = new Container()
  private readonly sparkleTexture: Texture | null
  private readonly fxTextures: FxTextures
  private readonly pulseTexture: Texture
  private ambient: AmbientEffect[] = []
  /** 캔버스가 컨테이너를 넘칠 수 있어 overflow를 바꾼다. 해제할 때 원래 값으로 되돌린다. */
  private readonly previousOverflow: string

  private resizeObserver: ResizeObserver | null = null
  private idleTweens: gsap.core.Tween[] = []
  private fxHandles: SymbolFxHandle[] = []
  /**
   * 셀 하나가 지금 물고 있는 연출. 빛이 한 바퀴 돌 때마다 같은 셀을 다시 터뜨리는데,
   * 앞엣것을 끄지 않으면 스프라이트가 무한히 쌓인다.
   */
  private cellFx = new Map<string, SymbolFxHandle[]>()
  /** 이번 승리의 등급. 빛의 속도와 잔상 길이를 여기서 가져온다. */
  private winTier: WinTier = 'none'
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
  private winPulse: WinPulseHandle | null = null
  private winToken = 0
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
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
    this.pulseTexture = createPulseTexture(ownedTextures)

    this.backgroundSprite = backgroundTexture === null ? null : new Sprite(backgroundTexture)
    if (this.backgroundSprite !== null) this.backgroundLayer.addChild(this.backgroundSprite)

    // 프리스핀 배경. 전용 이미지가 없으면 금빛 사각형으로 대신한다.
    this.freeSpinsSprite = new Sprite(freeSpinsTexture ?? this.confettiTexture)
    if (freeSpinsTexture === null) {
      this.freeSpinsSprite.tint = options.theme.palette.frame
      this.freeSpinsSprite.alpha = MODE_TINT_ALPHA
    }
    this.freeSpinsSprite.visible = false
    this.backgroundLayer.addChild(this.freeSpinsSprite, this.wipeMask)

    this.flashSprite = new Sprite(this.confettiTexture)
    this.flashSprite.tint = MODE_FLASH_COLOR
    this.flashSprite.blendMode = 'add'
    this.flashSprite.alpha = 0
    this.flashSprite.visible = false

    this.winLabel = new Text({
      text: '',
      style: {
        fill: options.theme.palette.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: Math.round(this.layout.symbolSize * LABEL_FONT_RATIO),
        fontWeight: '700',
      },
    })
    this.winLabel.anchor.set(0.5)
    this.winLabel.visible = false

    this.modeLabel = new Text({
      text: '',
      style: {
        fill: options.theme.palette.frame,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: Math.round(this.layout.symbolSize * FREE_SPINS_PLAQUE_FONT_RATIO),
        fontWeight: '700',
      },
    })
    this.modeLabel.anchor.set(0.5, 0)
    this.modeLabel.visible = false

    this.reelsLayer.mask = this.maskGraphics
    this.contentLayer.addChild(
      this.reelsLayer,
      this.maskGraphics,
      this.featureGraphics,
      this.modeGraphics,
      this.winGraphics,
      this.winLabel,
      this.modeLabel,
      this.fxLayer,
    )
    this.root.addChild(this.backgroundLayer)
    // 베젤 아트가 없을 때만 반짝임이 진짜 "배경"에 놓인다.
    if (this.frameSprite === null) this.root.addChild(this.sparkleLayer)
    this.root.addChild(this.frameGraphics, this.contentLayer)
    // 베젤 아트는 릴을 살짝 덮어야 안쪽 하이라이트가 살아난다. 릴 위에 둔다.
    // 베젤이 배경을 거의 다 가리므로 반짝임은 그 위로 올려야 보인다. 브라스가 반짝이는 것처럼 읽힌다.
    if (this.frameSprite !== null) this.root.addChild(this.frameSprite, this.sparkleLayer)
    // 섬광은 프레임까지 덮어야 전환이 화면 전체에서 일어난 것처럼 보인다.
    this.root.addChild(this.flashSprite)
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
    for (const cover of [this.freeSpinsSprite, this.flashSprite]) {
      cover.width = canvasWidth
      cover.height = canvasHeight
    }
    // 전환 중이 아니면 마스크가 남아 있을 이유가 없다.
    if (this.modeTransition === null) this.drawWipe(this.freeSpinsVisible ? this.wipeRadius() : 0)
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
    this.winLabel.style.fontSize = Math.round(this.layout.symbolSize * LABEL_FONT_RATIO)
    this.modeLabel.style.fontSize = Math.round(this.layout.symbolSize * FREE_SPINS_PLAQUE_FONT_RATIO)
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
      const symbol = strip[wrapIndex(base + row, strip.length)]
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
    return {
      done,
      skip: () => this.skipSpin(),
      then: (onFulfilled, onRejected) => done.then(onFulfilled, onRejected),
    }
  }

  /**
   * 남은 회전을 접고 곧장 정지 위치로 붙인다.
   * 왼쪽부터 짧은 간격을 남겨 한꺼번에 툭 서지 않게 한다.
   * 착지는 원래 경로와 똑같이 `stops`로 확정되므로 결과가 달라지지 않는다.
   */
  private skipSpin(): void {
    if (this.destroyed || this.activeReels.size === 0) return
    const plan = buildSkipPlan(this.options.math.reels)

    for (const [reel, active] of [...this.activeReels]) {
      if (active.skipped) continue
      const duration = plan.reels[reel]?.durationMs ?? plan.totalMs
      active.timeline.kill()

      // 0바퀴. 남은 거리만 간다. 한 바퀴를 더 돌리면 260ms 안에 스트립이 다 지나가 번쩍인다.
      const target = spinTargetPosition(active.view.position, active.stop, active.stripLength, 0)
      const state = { p: active.view.position }
      const timeline = gsap.timeline({ onComplete: active.land })
      timeline.to(state, {
        p: target,
        duration: duration / 1000,
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
    const token = (this.spinToken += 1)

    const plan = buildSpinPlan({
      reels: this.options.math.reels,
      ...(opts?.durationMs === undefined ? {} : { durationMs: opts.durationMs }),
      ...(opts?.stagger === undefined ? {} : { stagger: opts.stagger }),
      ...(opts?.fast === undefined ? {} : { fast: opts.fast }),
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
    const resolvers = this.spinResolvers
    this.spinResolvers = []
    for (const resolve of resolvers) resolve()
  }

  // ------------------------------------------------------------------ 승리

  /**
   * 승리 연출. 한 바퀴는 A단계(전체 동시) → B단계(라인 하나씩) 순서다.
   *
   * 첫 바퀴가 끝나면 resolve한다. `loop`면 그 뒤로도 `clearWins()`나 다음 `spinTo()`까지 계속 돈다.
   * 실제 순서와 길이는 `buildPresentation`이 정한다. 여기서는 그리기와 대기만 한다.
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
      presentationOptionsFor(opts, this.options.reducedMotion),
    )
    if (steps.length === 0) return

    const first = steps[0]
    const tier = first !== undefined && first.phase === 'all' ? first.tier : 'none'
    this.winTier = tier
    if (!this.options.reducedMotion && tier !== 'none') {
      this.stopCoins = burstCoins(this.fxLayer, this.coinTexture, this.layout, coinCountForTier(tier))
      // 색종이는 최고 등급에만. 아래 등급까지 뿌리면 특별함이 사라진다.
      if (tier === 'max') {
        this.stopConfetti = burstConfetti(this.fxLayer, this.confettiTexture, this.layout)
      }
    }

    const label = opts?.formatLineLabel ?? defaultLineLabel

    const runCycle = async (): Promise<void> => {
      for (const step of steps) {
        if (token !== this.winToken || this.destroyed) return
        this.renderStep(step, label)
        await this.wait(step.durationMs)
      }
    }

    await runCycle()

    if (opts?.loop === true && token === this.winToken && !this.destroyed) {
      void (async () => {
        while (token === this.winToken && !this.destroyed) {
          await runCycle()
        }
      })()
    }
  }

  /** 연출 한 스텝을 화면에 올린다. 이전 스텝의 fx와 딤은 먼저 걷어낸다. */
  private renderStep(step: PresentationStep, label: (win: WinLine) => string): void {
    this.stopSymbolFx()
    this.winGraphics.clear()
    this.winLabel.visible = false

    if (step.phase === 'all') {
      const positions = step.wins.flatMap((win) => win.positions)
      this.dimExcept([...positions, ...step.scatters])
      this.playFxAt(positions)
      this.showScatters(step.scatters)
      // 허브가 배당 카운터를 이 시간에 맞춰 굴릴 수 있도록 시작할 때 알린다.
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
    // 라벨은 빛이 마지막 심볼에 닿을 때 뜬다. 미리 띄우면 금액이 근거보다 먼저 나온다.
    this.winLabel.visible = false
    this.playWinPath(win, step.durationMs, () => this.placeWinLabel(win, label))
    this.emit({ type: 'winLine', line: win.line, win: win.win })
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
      this.winGraphics.alpha = 1
      this.winLabel.alpha = 1
      return
    }
    this.winGraphics.alpha = 0
    this.winLabel.alpha = 0
    const overlay = { value: 0 }
    this.crossfadeTween = gsap.to(overlay, {
      value: 1,
      duration: PHASE_CROSSFADE_MS / 1000,
      ease: 'sine.out',
      onUpdate: () => {
        this.winGraphics.alpha = overlay.value
        this.winLabel.alpha = overlay.value
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
      // 빛이 다시 지나갈 때 앞의 연출을 반드시 걷어낸다.
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
    this.stopWinPulse()
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
   * `paylineStyle: 'line'`일 때만 예전 폴리라인을 덧그린다(좌표 확인용).
   */
  private drawWinHighlight(win: WinLine): void {
    const payline = this.options.math.paylines[win.line]
    if (payline === undefined) return
    const brass = this.options.theme.palette.frame
    const radius = this.layout.radius * 0.5

    if (this.options.paylineStyle === 'line') {
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

    // 승리 심볼은 브라스 광채로 감싼다. 굵고 흐린 선부터 겹쳐 블러 없이 번짐을 만든다.
    const rects = positionRects(this.layout, win.positions)
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

  /**
   * 당첨 심볼을 왼쪽부터 훑는 빛. 빛이 닿는 순간 그 심볼이 fx를 한 번 터뜨린다.
   * 선을 대신하는 연출이라 `paylineStyle: 'line'`에서도 함께 돈다(선은 참고용 덧그림).
   */
  private playWinPath(win: WinLine, stepMs: number, onFinalArrive: () => void): void {
    this.stopWinPulse()
    // 등급이 높을수록 빛이 느긋하게 간다. 큰 승리를 더 오래 보게 만드는 장치다.
    const path = buildPulsePath(this.layout, win.positions, pulseHopMsForTier(this.winTier))
    const last = path.waypoints.length - 1
    if (last < 0) return

    if (this.options.reducedMotion) {
      // 모션 축소에서는 빛을 움직이지 않고 심볼만 한 번에 강조한다.
      this.playFxAt(win.positions)
      onFinalArrive()
      return
    }

    this.winPulse = playWinPulse(this.fxLayer, this.pulseTexture, path, {
      symbolSize: this.layout.symbolSize,
      trailCount: pulseTrailForTier(this.winTier),
      // 스텝이 한 바퀴보다 길면 남는 시간 동안 다시 훑는다.
      loop: stepMs > path.totalMs,
      onArrive: (index) => {
        const position = path.waypoints[index]?.position
        if (position === undefined) return
        this.playFxAt([position])
        this.emit({ type: 'pulseArrive', line: win.line, reel: position[0], row: position[1] })
        if (index === last) onFinalArrive()
      },
    })
  }

  private stopWinPulse(): void {
    this.winPulse?.stop()
    this.winPulse = null
  }

  /** 라인 끝 심볼 옆에 "Line n · 배당" 명판을 띄운다. */
  private placeWinLabel(win: WinLine, label: (win: WinLine) => string): void {
    const payline = this.options.math.paylines[win.line]
    if (payline === undefined) return
    const lastReel = Math.max(0, win.positions.length - 1)
    const row = payline[lastReel] ?? 0
    const center = symbolCenter(this.layout, lastReel, row)
    this.winLabel.text = label(win)
    this.winLabel.x = Math.min(
      Math.max(this.winLabel.width / 2, center.x + this.layout.symbolSize * 0.5),
      this.layout.width - this.winLabel.width / 2,
    )
    this.winLabel.y = center.y - this.layout.symbolSize * 0.55
    this.winLabel.visible = true
  }

  clearWins(): void {
    this.winToken += 1
    this.winGraphics.clear()
    this.winLabel.visible = false
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
    this.winLabel.alpha = 1
    this.stopCoins?.()
    this.stopCoins = null
    this.stopConfetti?.()
    this.stopConfetti = null
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id)
        resolve()
      }, ms)
      this.timers.add(id)
    })
  }

  private clearTimers(): void {
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
  }

  // ------------------------------------------------------------- 진행 상태

  setMode(mode: RendererMode): void {
    // 남은 횟수만 바뀐 경우에는 전환하지 않는다. 매 스핀 화면이 번쩍이면 피곤하다.
    const target = modeTransitionTarget(this.mode, mode)
    this.mode = mode

    if (target === null) {
      this.drawMode()
      return
    }
    // 프리스핀으로 갈 때는 테두리를 미리 그려 두고 alpha 0에서 끌어올린다.
    // 되돌아올 때는 테두리를 남겨 둔 채 흐려지게 하고, 전환이 끝나면 지운다.
    if (target === 'freeSpins') this.drawMode()
    this.playModeTransition(target)
  }

  /** 캔버스를 모두 덮는 원의 반지름. 대각선의 절반이면 모서리까지 닿는다. */
  private wipeRadius(): number {
    const { canvasWidth, canvasHeight } = this.geometry
    return Math.hypot(canvasWidth, canvasHeight) / 2
  }

  private drawWipe(radius: number): void {
    const { canvasWidth, canvasHeight } = this.geometry
    this.wipeMask.clear()
    if (radius <= 0) {
      this.freeSpinsSprite.visible = false
      this.freeSpinsSprite.mask = null
      return
    }
    this.wipeMask.circle(canvasWidth / 2, canvasHeight / 2, radius).fill({ color: 0xffffff })
    this.freeSpinsSprite.visible = true
    this.freeSpinsSprite.mask = this.wipeMask
  }

  /**
   * 프리스핀 배경으로 갈아타는 전환.
   * 금빛 섬광이 시선을 한 번 끊고, 그 틈에 방사형 와이프가 배경을 교차시킨다.
   * 되돌아올 때는 같은 절차를 반대로 재생한다.
   */
  private playModeTransition(to: ModeTarget): void {
    // 진행 중인 전환이 있으면 그 끝을 먼저 알린다. start 하나에 end 하나를 보장한다.
    this.finishModeTransition()
    const plan = buildModeTransition(to, {
      hasFreeSpinsBackground: this.options.theme.backgroundFreeSpins !== undefined,
      reducedMotion: this.options.reducedMotion,
    })
    this.modeTransitionTo = to
    this.emit({ type: 'modeTransition', to, phase: 'start' })

    const maxRadius = this.wipeRadius()
    const wipe = { radius: to === 'freeSpins' ? 0 : maxRadius }
    this.drawWipe(wipe.radius)

    this.flashSprite.visible = true
    this.flashSprite.alpha = 0

    this.modeGraphics.alpha = to === 'freeSpins' ? 0 : 1
    const timeline = gsap.timeline({ onComplete: () => this.finishModeTransition() })

    timeline
      .to(this.flashSprite, {
        alpha: MODE_FLASH_ALPHA,
        duration: plan.flashMs / 2000,
        ease: 'sine.out',
      })
      .to(this.flashSprite, {
        alpha: 0,
        duration: plan.flashMs / 2000,
        ease: 'sine.in',
      })
      .to(
        wipe,
        {
          radius: to === 'freeSpins' ? maxRadius : 0,
          duration: plan.wipeMs / 1000,
          ease: 'power2.inOut',
          onUpdate: () => this.drawWipe(wipe.radius),
        },
        plan.wipeStartMs / 1000,
      )
      .to(
        this.modeGraphics,
        { alpha: to === 'freeSpins' ? 1 : 0, duration: plan.glowMs / 1000, ease: 'sine.out' },
        plan.wipeStartMs / 1000,
      )

    this.modeTransition = timeline
  }

  /**
   * 전환을 마무리한다. 정상 종료든 중간에 끊긴 것이든 여기 한 곳을 지난다.
   *
   * gsap는 `kill()` 때 `onComplete`를 부르지 않는다. 그대로 두면 `end`가 영영 안 나가고
   * 허브의 프리스핀 진입 대기가 풀리지 않는다. 그래서 끊을 때도 이 절차를 직접 탄다.
   */
  private finishModeTransition(): void {
    const to = this.modeTransitionTo
    this.modeTransition?.kill()
    this.modeTransition = null
    if (to === null) return
    this.modeTransitionTo = null

    this.freeSpinsVisible = to === 'freeSpins'
    this.flashSprite.visible = false
    this.flashSprite.alpha = 0
    // 전환이 끝나면 마스크를 걷어 낸다. 매 프레임 원을 다시 그릴 이유가 없다.
    this.freeSpinsSprite.mask = null
    this.freeSpinsSprite.visible = this.freeSpinsVisible
    this.wipeMask.clear()
    this.modeGraphics.alpha = 1
    // 되돌아온 경우 여기서 테두리를 지운다.
    this.drawMode()
    this.emit({ type: 'modeTransition', to, phase: 'end' })
  }

  /**
   * 프리스핀 표시. 릴 창 테두리에 금빛을 두르고 위쪽에 명판을 띄운다.
   * 스캐터 링과 같은 Graphics를 쓰므로 링을 다시 그릴 때도 함께 불린다.
   */
  private drawMode(): void {
    // 자기 층을 먼저 비운다. 이걸 빼면 스핀마다 테두리가 겹겹이 쌓인다.
    this.modeGraphics.clear()
    const freeSpins = this.mode.freeSpins
    const show = shouldShowFreeSpinsPlaque(this.mode, this.options.showFreeSpinsPlaque)
    if (freeSpins === null || freeSpins === undefined) {
      this.modeLabel.visible = false
      return
    }

    const { reelArea, radius } = this.layout
    this.modeGraphics
      .roundRect(reelArea.x, reelArea.y, reelArea.width, reelArea.height, radius * 0.5)
      .stroke({
        width: FREE_SPINS_EDGE_STROKE_PX,
        color: this.options.theme.palette.frame,
        alpha: FREE_SPINS_EDGE_ALPHA,
      })

    this.modeLabel.visible = show
    if (!show) return
    this.modeLabel.text = formatFreeSpinsPlaque(freeSpins)
    this.modeLabel.x = reelArea.x + reelArea.width / 2
    // 창 위쪽 안쪽에 붙인다. 심볼과 겹치지 않도록 살짝 띄운다.
    this.modeLabel.y = reelArea.y + this.layout.symbolSize * 0.06
  }

  // ------------------------------------------------------------------ 유휴

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
