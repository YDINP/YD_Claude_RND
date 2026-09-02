import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { SymbolId, WinLine } from '@tgslot/slot-engine'
import {
  ACCEL_DISTANCE_RATIO,
  ACCEL_TIME_RATIO,
  FALLBACK_CONTAINER_WIDTH,
  IDLE_AMPLITUDE_SYMBOLS,
  IDLE_CYCLE_MS,
  LANDING_SETTLE_SYMBOLS,
  PULL_UP_SYMBOLS,
  REDUCED_WIN_CYCLE_MS,
  SYMBOL_FILL_RATIO,
  WIN_CYCLE_MS,
  WIN_GLOW_LAYERS,
  WIN_HIGHLIGHT_STROKE_PX,
  WIN_LINE_ALPHA,
  WIN_LINE_STROKE_PX,
  WIN_PULSE_MS,
  WIN_PULSE_SCALE,
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
import { buildSpinPlan, type ReelSpinPlan, type SpinPlan } from '../timing.js'
import { formatWinLabel, isBigWin, paylineColor } from '../wins.js'
import type { RendererCore, ResolvedRendererOptions } from '../internal.js'
import { TextureRegistry } from '../textureRegistry.js'
import type { RendererEvent, ShowWinsOptions, SpinToOptions } from '../types.js'
import {
  createShineTexture,
  createSparkleTexture,
  startLightSweep,
  startSparkles,
  type AmbientEffect,
} from './ambient.js'
import { burstCoins } from './coins.js'
import { createCoinTexture, loadBackgroundTexture, loadFrameTexture, loadSymbolTextures } from './textures.js'

interface Cell {
  view: Container
  sprite: Sprite
  symbol: SymbolId | null
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

  private readonly reels: ReelView[] = []
  private readonly backgroundSprite: Sprite | null
  /** 베젤 아트. 릴 창이 알파로 뚫려 있어 릴 **위에** 얹는다. */
  private readonly frameSprite: Sprite | null
  /** 배경 위 반짝임. 프레임보다 아래에 둔다. */
  private readonly sparkleLayer = new Container()
  /** 프레임 위를 지나가는 빛. 항상 맨 위다. */
  private readonly ambientLayer = new Container()
  private readonly shineTexture: Texture | null
  private readonly sparkleTexture: Texture | null
  private ambient: AmbientEffect[] = []
  /** 캔버스가 컨테이너를 넘칠 수 있어 overflow를 바꾼다. 해제할 때 원래 값으로 되돌린다. */
  private readonly previousOverflow: string

  private resizeObserver: ResizeObserver | null = null
  private idleTweens: gsap.core.Tween[] = []
  private pulseTweens: gsap.core.Tween[] = []
  private spinTimelines: gsap.core.Timeline[] = []
  /** 중단된 스핀의 대기자를 풀어 주기 위한 resolver 목록. */
  private spinResolvers: (() => void)[] = []
  private spinToken = 0
  private stopCoins: (() => void) | null = null
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
    ownedTextures: TextureRegistry,
  ) {
    this.options = options
    this.app = app
    this.textures = textures
    this.coinTexture = coinTexture
    this.ownedTextures = ownedTextures
    this.frameSprite = frameTexture === null ? null : new Sprite(frameTexture)
    this.geometry = this.measureGeometry()

    // 창 맞춤에서는 프레임이 컨테이너 밖으로 나가므로 잘라 줘야 한다.
    this.previousOverflow = options.container.style.overflow
    options.container.style.overflow = 'hidden'

    const ambientOn = !options.reducedMotion
    this.shineTexture = ambientOn ? createShineTexture(ownedTextures) : null
    this.sparkleTexture = ambientOn ? createSparkleTexture(ownedTextures) : null

    this.backgroundSprite = backgroundTexture === null ? null : new Sprite(backgroundTexture)
    if (this.backgroundSprite !== null) this.backgroundLayer.addChild(this.backgroundSprite)

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

    this.reelsLayer.mask = this.maskGraphics
    this.contentLayer.addChild(
      this.reelsLayer,
      this.maskGraphics,
      this.winGraphics,
      this.winLabel,
      this.fxLayer,
    )
    this.root.addChild(this.backgroundLayer)
    // 베젤 아트가 없을 때만 반짝임이 진짜 "배경"에 놓인다.
    if (this.frameSprite === null) this.root.addChild(this.sparkleLayer)
    this.root.addChild(this.frameGraphics, this.contentLayer)
    // 베젤 아트는 릴을 살짝 덮어야 안쪽 하이라이트가 살아난다. 릴 위에 둔다.
    // 베젤이 배경을 거의 다 가리므로 반짝임은 그 위로 올려야 보인다. 브라스가 반짝이는 것처럼 읽힌다.
    if (this.frameSprite !== null) this.root.addChild(this.frameSprite, this.sparkleLayer)
    this.root.addChild(this.ambientLayer)
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

  async spinTo(stops: number[], opts?: SpinToOptions): Promise<void> {
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
      const timeline = gsap.timeline({
        onComplete: () => {
          view.position = normalizePosition(stop, length)
          view.idleOffset = 0
          this.renderReel(plan.reel)
          if (token === this.spinToken && !this.destroyed) {
            this.emit({ type: 'reelStop', reel: plan.reel })
          }
          resolve()
        },
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
    const resolvers = this.spinResolvers
    this.spinResolvers = []
    for (const resolve of resolvers) resolve()
  }

  // ------------------------------------------------------------------ 승리

  async showWins(wins: WinLine[], opts?: ShowWinsOptions): Promise<void> {
    this.clearWins()
    if (this.destroyed || wins.length === 0) return

    const token = this.winToken
    const cycleMs = this.options.reducedMotion ? REDUCED_WIN_CYCLE_MS : WIN_CYCLE_MS

    if (!this.options.reducedMotion && isBigWin(wins, this.options.math, opts?.totalBet)) {
      this.stopCoins = burstCoins(this.fxLayer, this.coinTexture, this.layout)
    }

    const runPass = async (): Promise<void> => {
      for (const win of wins) {
        if (token !== this.winToken || this.destroyed) return
        this.drawWin(win)
        this.emit({ type: 'winShown', line: win.line })
        await this.wait(cycleMs)
      }
    }

    await runPass()

    // loop면 첫 바퀴가 끝난 시점에 resolve하고, 이후는 clearWins/spinTo가 멈출 때까지 계속 돈다.
    if (opts?.loop === true && token === this.winToken && !this.destroyed) {
      void (async () => {
        while (token === this.winToken && !this.destroyed) {
          await runPass()
        }
      })()
    }
  }

  private drawWin(win: WinLine): void {
    const payline = this.options.math.paylines[win.line]
    if (payline === undefined) return
    const lineColor = paylineColor(this.options.theme.palette.winLine, win.line)
    const brass = this.options.theme.palette.frame
    const radius = this.layout.radius * 0.5

    this.winGraphics.clear()

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

    this.placeWinLabel(win, payline)
    this.pulseWinSymbols(win)
  }

  private placeWinLabel(win: WinLine, payline: readonly number[]): void {
    const lastReel = Math.max(0, win.positions.length - 1)
    const row = payline[lastReel] ?? 0
    const center = symbolCenter(this.layout, lastReel, row)
    this.winLabel.text = formatWinLabel(win)
    this.winLabel.x = Math.min(
      center.x + this.layout.symbolSize * 0.5,
      this.layout.width - this.layout.symbolSize * 0.4,
    )
    this.winLabel.y = center.y - this.layout.symbolSize * 0.5
    this.winLabel.visible = true
  }

  private pulseWinSymbols(win: WinLine): void {
    this.killPulses()
    if (this.options.reducedMotion) return
    for (const [reel, row] of win.positions) {
      const cell = this.reels[reel]?.cells[row + 1]
      if (cell === undefined) continue
      cell.view.scale.set(1)
      this.pulseTweens.push(
        gsap.to(cell.view.scale, {
          x: WIN_PULSE_SCALE,
          y: WIN_PULSE_SCALE,
          duration: WIN_PULSE_MS / 2000,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        }),
      )
    }
  }

  private killPulses(): void {
    for (const tween of this.pulseTweens) tween.kill()
    this.pulseTweens = []
    for (const view of this.reels) {
      for (const cell of view.cells) cell.view.scale.set(1)
    }
  }

  clearWins(): void {
    this.winToken += 1
    this.winGraphics.clear()
    this.winLabel.visible = false
    this.killPulses()
    this.clearTimers()
    this.stopCoins?.()
    this.stopCoins = null
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
    this.ambientLayer.removeChildren()
  }

  /**
   * 배경 반짝임과 프레임 위 빛 쓸기를 다시 건다.
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
      this.ambient.push(startSparkles(this.sparkleLayer, this.sparkleTexture, area))
    }
    // 빛 쓸기는 훑을 표면이 있을 때만 의미가 있다. 벡터 베젤에는 걸지 않는다.
    if (this.shineTexture !== null && frameRect !== null) {
      this.ambient.push(startLightSweep(this.ambientLayer, this.shineTexture, frameRect))
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
  const [textures, backgroundTexture, frameTexture] = await Promise.all([
    loadSymbolTextures(options.theme, symbolIds, ownedTextures),
    loadBackgroundTexture(options.theme),
    loadFrameTexture(options.theme.frame, ownedTextures),
  ])
  const coinTexture = createCoinTexture(options.theme, ownedTextures)

  return new PixiRenderer(
    options,
    app,
    textures,
    coinTexture,
    backgroundTexture,
    frameTexture,
    ownedTextures,
  )
}
