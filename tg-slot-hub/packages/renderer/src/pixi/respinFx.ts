import { Container, Graphics, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { CoinCell, SymbolId } from '@tgslot/slot-engine'
import { SYMBOL_FILL_RATIO } from '../constants.js'
import { symbolCenter, type Layout, type Point } from '../layout.js'
import type {
  RespinCollectDurations,
  RespinCollectItem,
  RespinPlanStep,
  RespinStepDurations,
  RespinWrapDurations,
  RespinWrapPlan,
} from '../respin.js'
import { RESPIN_DIM_TINT } from '../respinConstants.js'
import { tentaclePeekShape, type TentacleGeometry } from '../tentaclePath.js'
import type { CoinFaceCache, CoinFaceSpec } from './coinFace.js'
import { TREASURE_TINT } from './coinFace.js'
import { LayerSpritePool } from './spritePool.js'
import { TentaclePool, type TentacleRope } from './tentacle.js'
import type { FxTextures } from './symbolFx.js'

/** 리스핀 칸 한 개가 한 번의 회전에 훑는 심볼 수의 하한·상한. 회전이 짧을수록 적게 지나간다. */
const STRIP_MIN = 4
const STRIP_MAX = 9
/** 칸 회전이 한 심볼을 지나는 데 걸리는 시간(ms). 길이를 심볼 수로 바꿀 때 쓴다. */
const MS_PER_STRIP_SYMBOL = 90
/** 새 코인이 착지할 때 «툭» 부푸는 배율. */
const HIT_SCALE = 1.2
/** 감기가 끝난 뒤 두 배가 된 코인을 다시 띄우기까지(초). 촉수가 물러나기 시작한 뒤라 숫자가 보인다. */
const DOUBLED_DELAY_S = 0.24
/** 그때 코인이 부푸는 배율. */
const DOUBLED_SCALE = 1.18
/** 한 칸 남은 줄 아래 촉수 끝이 내미는 길이(칸 대비, 판 아래 0.4칸에서부터). */
const PEEK_REACH = 0.62
/** 고정 테두리 두께(칸 한 변 대비). */
const RING_WIDTH_RATIO = 0.05
/** 고정 테두리 안쪽 여백(칸 한 변 대비). */
const RING_INSET_RATIO = 0.07
/** 전역 보물 «최고 보물» 그림 한 변(칸 한 변 대비). */
const TOP_PROP_RATIO = 2.6
/** 한 칸에서 터지는 반짝이 수. */
const SPARKS_PER_PIN = 7
/** 보물·최고 보물 광채 색. */
const GOLD = 0xffd75a

export interface RespinSceneDeps {
  /** 릴 마스크 안의 층. 칸·촉수가 여기에 산다(창 밖은 잘린다). */
  layer: Container
  /** 마스크 밖 층. 광채·반짝이·날아가는 코인이 여기서 그려진다. */
  overlay: Container
  symbols: ReadonlyMap<SymbolId, Texture>
  /** 리스핀 칸 스트립. 회전 중 지나가는 심볼의 재료다(비코인 심볼만 쓴다). */
  fillers: readonly (readonly SymbolId[])[]
  coinSymbol: SymbolId
  faces: CoinFaceCache
  fx: FxTextures
  solid: Texture
  /** 촉수 그림. 없으면 코드로 그린다. */
  tentacleTexture: Texture | null
  /** 최고 보물 그림. 없으면 코드로 그린 상자 대신 금빛 코인 더미 글자를 쓴다. */
  topTexture: Texture | null
  /** 감기 배지(×2) 텍스처. 한 번 그려 돌려 쓴다. */
  badge: () => Texture
  formatCoin: (amount: number) => string
  getLayout: () => Layout
  reels: number
  rows: number
  ringColor: number
  reducedMotion: boolean
}

interface Slot {
  reel: number
  row: number
  root: Container
  mask: Graphics
  strip: Container
  sprites: Sprite[]
  face: Sprite
  /** 지금 face가 보여 주는 코인. 비코인이면 null. */
  coin: CoinCell | null
  /** face의 기준 배율. 팝 연출이 이 값에 곱한다. */
  baseScale: number
}

/** 재생 한 토막의 손잡이. 압축·정리·결정론적 마무리가 이 셋이다. */
export interface RespinHandle {
  /** 남은 재생을 `ms` 안에 끝내도록 빨리 돌린다. 이미 그보다 짧으면 그대로 둔다. 두 번 불러도 같다. */
  compress(ms: number): void
  /** 타임라인을 끊고 화면을 이 토막이 끝났을 때의 모습으로 확정한다. 완료 콜백은 부르지 않는다. */
  settle(): void
  /** 정리만 한다(스프라이트 반납). `settle()` 뒤에 부른다. */
  release(): void
}

export interface StepHooks {
  /** 칸이 다 선 순간(회전 길이 끝). */
  onLand: () => void
  /** 새 코인이 고정된 순간. 새 코인이 있을 때만. */
  onPin: () => void
  onComplete: () => void
}

export interface WrapHooks {
  onRise: () => void
  onComplete: () => void
}

export interface CollectHooks {
  onCoin: (index: number, item: RespinCollectItem) => void
  onTopStart: () => void
  onTopEnd: () => void
  onComplete: () => void
}

function s(ms: number): number {
  return ms / 1000
}

/** 심볼 하나의 결정적 의사 난수(0 이상 1 미만). 화면용이라 결과와 무관하고, 같은 입력이면 같은 그림이 나온다. */
function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const key = (pos: readonly [number, number]): string => `${pos[0]}:${pos[1]}`

/**
 * 코인 리스핀 무대. 동굴로 들어간 뒤 판 전체를 이 층이 맡는다(릴은 감춘다).
 *
 * 칸 15개가 각자 하나의 «칸 릴»이다 — 비어 있는 칸만 위치 트윈으로 돌고 서며, 고정된 칸은 움직이지 않는다.
 * 착지에서 텍스처를 바꾸지 않는다: 도는 칸의 마지막 스프라이트가 이미 착지 심볼(또는 코인 얼굴)이라 서는 순간
 * 제자리에서 그림이 바뀌어 보이지 않는다. 비코인 결과는 틴트로 어둡게 눌러 둔다(필터 없음).
 *
 * 한 토막(리스핀 1회·촉수 1줄·정산)은 타임라인 하나다. STOP 압축은 배속 하나로 끝나고, 어떻게 끊기든
 * `settle()`이 화면을 그 토막의 끝 모습으로 확정한다.
 */
export class RespinScene {
  readonly root = new Container()
  private readonly slots: Slot[] = []
  private readonly pinGraphics = new Graphics()
  private readonly ropeLayer = new Container()
  private readonly ropes: TentaclePool
  private readonly fxPool: LayerSpritePool
  /** 지금 고정된 코인(`reel:row` → 코인). 고정 테두리와 한 칸 남음 판정이 이걸 본다. */
  private readonly pinned = new Map<string, CoinCell>()
  private readonly wrapped = new Set<number>()
  /** 한 칸 남은 줄 아래에서 꿈틀대는 촉수 끝. */
  private readonly peeks = new Map<number, TentacleRope>()
  /** 끊어야 하는 트윈·타임라인 전부(복귀 촉수 등 타임라인 밖에서 도는 것 포함). */
  private readonly loose = new Set<gsap.core.Animation>()
  private ticking = false
  private visible = false

  constructor(private readonly deps: RespinSceneDeps) {
    this.root.visible = false
    this.fxPool = new LayerSpritePool(deps.overlay, 56)
    this.ropes = new TentaclePool(this.ropeLayer, deps.tentacleTexture)
    for (let reel = 0; reel < deps.reels; reel += 1) {
      for (let row = 0; row < deps.rows; row += 1) this.slots.push(this.makeSlot(reel, row))
    }
    for (const slot of this.slots) this.root.addChild(slot.root)
    this.root.addChild(this.pinGraphics, this.ropeLayer)
    deps.layer.addChild(this.root)
    this.layout()
  }

  // ------------------------------------------------------------------ 구성

  private makeSlot(reel: number, row: number): Slot {
    const root = new Container()
    const mask = new Graphics()
    const strip = new Container()
    strip.mask = mask
    const face = new Sprite()
    face.anchor.set(0.5)
    const sprites: Sprite[] = []
    for (let i = 0; i < STRIP_MAX; i += 1) {
      const sprite = new Sprite()
      sprite.anchor.set(0.5)
      sprite.visible = false
      strip.addChild(sprite)
      sprites.push(sprite)
    }
    root.addChild(mask, strip, face)
    return { reel, row, root, mask, strip, sprites, face, coin: null, baseScale: 1 }
  }

  private get layoutNow(): Layout {
    return this.deps.getLayout()
  }

  private slotAt(reel: number, row: number): Slot {
    const slot = this.slots[reel * this.deps.rows + row]
    if (slot === undefined) throw new RangeError(`칸 [${reel}, ${row}]이 판 밖이다`)
    return slot
  }

  /** 레이아웃이 바뀔 때마다 부른다. 칸 위치·마스크·촉수 굵기를 다시 맞춘다. */
  layout(): void {
    const layout = this.layoutNow
    const size = layout.symbolSize
    for (const slot of this.slots) {
      const c = symbolCenter(layout, slot.reel, slot.row)
      slot.root.position.set(c.x, c.y)
      slot.mask.clear()
      slot.mask.rect(-size / 2, -size / 2, size, size).fill({ color: 0xffffff })
      for (const sprite of slot.sprites) sprite.setSize(size * SYMBOL_FILL_RATIO)
      if (slot.face.texture !== undefined) {
        slot.face.setSize(size * SYMBOL_FILL_RATIO)
        slot.baseScale = slot.face.scale.x
      }
    }
    this.drawPins()
  }

  /** 칸 한 변의 콘텐츠 좌표 사각형(고정 테두리·광채용). */
  private cellBox(reel: number, row: number): { x: number; y: number; size: number } {
    const layout = this.layoutNow
    const c = symbolCenter(layout, reel, row)
    return { x: c.x - layout.symbolSize / 2, y: c.y - layout.symbolSize / 2, size: layout.symbolSize }
  }

  // ------------------------------------------------------------------ 보임 / 숨김

  /**
   * 판을 세운다. `grid[row][reel]`은 트리거 판(코인이 아닌 칸은 어둡게 보인다), `coins`는 고정된 코인이다.
   * 전환 클립이 화면을 덮은 순간에 부른다.
   */
  show(grid: readonly (readonly SymbolId[])[], coins: readonly CoinCell[]): void {
    this.killLoose()
    this.pinned.clear()
    this.wrapped.clear()
    this.releasePeeks()
    const coinAt = new Map(coins.map((coin) => [key(coin.pos), coin]))
    for (const slot of this.slots) {
      slot.strip.visible = false
      slot.strip.y = 0
      slot.face.visible = true
      slot.face.alpha = 1
      const coin = coinAt.get(`${slot.reel}:${slot.row}`)
      if (coin !== undefined) {
        this.applyCoin(slot, coin)
        this.pinned.set(`${slot.reel}:${slot.row}`, coin)
      } else {
        const symbol = grid[slot.row]?.[slot.reel]
        this.applySymbol(slot, symbol ?? this.deps.coinSymbol)
      }
    }
    this.root.visible = true
    this.visible = true
    this.drawPins()
    this.refreshPeeks()
  }

  /** 동굴을 나간다. 트윈·촉수·스프라이트를 전부 거둔다. */
  hide(): void {
    this.killLoose()
    this.releasePeeks()
    this.pinned.clear()
    this.wrapped.clear()
    this.pinGraphics.clear()
    for (const slot of this.slots) {
      slot.strip.visible = false
      slot.face.scale.set(slot.baseScale)
      slot.face.alpha = 1
      slot.coin = null
    }
    this.root.visible = false
    this.visible = false
  }

  /**
   * 동굴을 나가며 판만 남긴다(다음 스핀까지). 트윈과 꿈틀대는 촉수 끝은 거두고 칸·고정 테두리는 그대로 둔다.
   * 다음 스핀이 `hide()`로 완전히 걷는다.
   */
  freeze(): void {
    this.killLoose()
    this.releasePeeks()
    // 정산이 흐려 둔 코인을 다시 밝혀 «방금 끝난 판»을 그대로 보여 준다.
    this.pinned.clear()
    for (const slot of this.slots) {
      slot.strip.visible = false
      slot.face.visible = true
      slot.face.scale.set(slot.baseScale)
      if (slot.coin !== null) {
        slot.face.alpha = 1
        this.pinned.set(`${slot.reel}:${slot.row}`, slot.coin)
      }
    }
    this.drawPins()
  }

  get isVisible(): boolean {
    return this.visible
  }

  // ------------------------------------------------------------------ 칸 그리기

  private specOf(coin: CoinCell): CoinFaceSpec {
    return { kind: coin.kind, tier: coin.tier, label: this.deps.formatCoin(coin.amount) }
  }

  private setFace(slot: Slot, texture: Texture, tint: number): void {
    const size = this.layoutNow.symbolSize * SYMBOL_FILL_RATIO
    slot.face.texture = texture
    slot.face.setSize(size)
    slot.face.tint = tint
    slot.face.scale.set(slot.face.scale.x)
    slot.baseScale = slot.face.scale.x
  }

  private applyCoin(slot: Slot, coin: CoinCell): void {
    slot.coin = coin
    this.setFace(slot, this.deps.faces.get(this.specOf(coin)), 0xffffff)
  }

  private applySymbol(slot: Slot, symbol: SymbolId): void {
    slot.coin = null
    const texture = this.deps.symbols.get(symbol)
    if (texture !== undefined) this.setFace(slot, texture, RESPIN_DIM_TINT)
  }

  private symbolTexture(symbol: SymbolId): Texture | undefined {
    return this.deps.symbols.get(symbol)
  }

  // ------------------------------------------------------------------ 고정 테두리

  private pinColor(coin: CoinCell): number {
    if (coin.kind === 'treasure' && coin.tier !== undefined) return parseInt(TREASURE_TINT[coin.tier].slice(1), 16)
    return this.deps.ringColor
  }

  private drawPins(): void {
    const g = this.pinGraphics
    g.clear()
    const layout = this.layoutNow
    const inset = layout.symbolSize * RING_INSET_RATIO
    const width = Math.max(2, layout.symbolSize * RING_WIDTH_RATIO)
    const radius = layout.radius * 0.45
    for (const [cellKey, coin] of this.pinned) {
      const [reel, row] = cellKey.split(':').map(Number) as [number, number]
      const box = this.cellBox(reel, row)
      const color = this.pinColor(coin)
      g.roundRect(box.x + inset, box.y + inset, box.size - inset * 2, box.size - inset * 2, radius)
      g.stroke({ width: width * 2.2, color, alpha: 0.22 })
      g.roundRect(box.x + inset, box.y + inset, box.size - inset * 2, box.size - inset * 2, radius)
      g.stroke({ width, color, alpha: 0.95 })
    }
  }

  private pinSlot(slot: Slot, coin: CoinCell): void {
    this.pinned.set(`${slot.reel}:${slot.row}`, coin)
    slot.coin = coin
    this.drawPins()
  }

  // ------------------------------------------------------------------ 칸 회전

  private fillerFor(reel: number, step: number, k: number, row: number): SymbolId {
    const pool = this.deps.fillers[reel]
    const list = pool !== undefined && pool.length > 0 ? pool : [...this.deps.symbols.keys()]
    const pick = list[Math.floor(hash01(reel * 7 + row, step * 13 + k, 17) * list.length)]
    return pick ?? this.deps.coinSymbol
  }

  /** 도는 칸 하나를 준비한다. 스프라이트 0이 지금 보이는 것이고, 마지막이 착지할 것이다. */
  private beginSpin(slot: Slot, landing: { symbol: SymbolId; coin: CoinCell | null }, count: number, step: number): void {
    const pitch = this.layoutNow.symbolSize
    const n = Math.max(2, Math.min(STRIP_MAX, count))
    slot.strip.y = 0
    for (let i = 0; i < slot.sprites.length; i += 1) {
      const sprite = slot.sprites[i]
      if (sprite === undefined) continue
      if (i >= n) {
        sprite.visible = false
        continue
      }
      let texture: Texture | undefined
      let tint = RESPIN_DIM_TINT
      if (i === 0) {
        texture = slot.face.texture
      } else if (i === n - 1) {
        if (landing.coin !== null) {
          texture = this.deps.faces.get(this.specOf(landing.coin))
          tint = 0xffffff
        } else {
          texture = this.symbolTexture(landing.symbol)
        }
      } else {
        texture = this.symbolTexture(this.fillerFor(slot.reel, step, i, slot.row))
      }
      if (texture === undefined) {
        sprite.visible = false
        continue
      }
      sprite.texture = texture
      sprite.setSize(this.layoutNow.symbolSize * SYMBOL_FILL_RATIO)
      sprite.tint = tint
      sprite.alpha = 1
      sprite.position.set(0, -i * pitch)
      sprite.visible = true
    }
    slot.strip.visible = true
    slot.face.visible = false
  }

  /** 칸이 섰다. 마지막 스프라이트와 같은 그림을 face에 올리고 strip을 접는다(같은 tick이라 눈에 띄지 않는다). */
  private landSlot(slot: Slot, landing: { symbol: SymbolId; coin: CoinCell | null }): void {
    slot.strip.visible = false
    slot.strip.y = 0
    if (landing.coin !== null) this.applyCoin(slot, landing.coin)
    else this.applySymbol(slot, landing.symbol)
    slot.face.alpha = 1
    slot.face.visible = true
  }

  // ------------------------------------------------------------------ 효과(광채·반짝이)

  private flash(center: Point, sizePx: number, color: number, ms: number): void {
    if (this.deps.reducedMotion) return
    const sprite = this.fxPool.acquire(this.deps.fx.glow)
    sprite.tint = color
    sprite.blendMode = 'add'
    sprite.position.set(center.x, center.y)
    sprite.setSize(sizePx * 0.7)
    sprite.alpha = 0.95
    const from = sprite.scale.x
    const tween = gsap.to(sprite, {
      alpha: 0,
      duration: s(ms),
      ease: 'power2.out',
      onComplete: () => {
        this.loose.delete(tween)
        this.fxPool.release(sprite)
      },
    })
    const grow = gsap.to(sprite.scale, {
      x: from * 2.1,
      y: from * 2.1,
      duration: s(ms),
      ease: 'power2.out',
      onComplete: () => {
        this.loose.delete(grow)
      },
    })
    this.loose.add(tween)
    this.loose.add(grow)
  }

  private sparks(center: Point, count: number, color: number, spread: number): void {
    if (this.deps.reducedMotion) return
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + hash01(i, Math.round(center.x), Math.round(center.y)) * 0.8
      const sprite = this.fxPool.acquire(this.deps.fx.spark)
      sprite.tint = color
      sprite.blendMode = 'add'
      sprite.position.set(center.x, center.y)
      sprite.setSize(this.layoutNow.symbolSize * (0.1 + (i % 3) * 0.04))
      const tween = gsap.to(sprite, {
        x: center.x + Math.cos(angle) * spread,
        y: center.y + Math.sin(angle) * spread - spread * 0.2,
        alpha: 0,
        duration: 0.42 + (i % 3) * 0.06,
        ease: 'power2.out',
        onComplete: () => {
          this.loose.delete(tween)
          this.fxPool.release(sprite)
        },
      })
      this.loose.add(tween)
    }
  }

  /** 진입 펄스에서 쓰는 광채 한 번(릴 위 코인 하나). */
  pulseAt(reel: number, row: number): void {
    const layout = this.layoutNow
    const c = symbolCenter(layout, reel, row)
    this.flash(c, layout.symbolSize * 1.4, GOLD, 360)
    this.sparks(c, 4, GOLD, layout.symbolSize * 0.55)
  }

  // ------------------------------------------------------------------ 리스핀 1회

  /**
   * 리스핀 1회: 빈 칸이 돌고(칸마다 조금씩 늦게 선다) → 새 코인은 «툭 → 멈춤 → 고정 빛» → 정리.
   * 칸 회전은 언제나 위치 트윈이다(STOP으로 압축해도 제자리 텍스처 교체가 없다).
   */
  playStep(step: RespinPlanStep, d: RespinStepDurations, hooks: StepHooks): RespinHandle {
    const size = this.layoutNow.symbolSize
    const total = step.landings.length
    const timeline = gsap.timeline({
      onComplete: () => {
        this.loose.delete(timeline)
        hooks.onComplete()
      },
    })
    this.loose.add(timeline)
    // 길이를 계획 그대로 못 박는다. 마지막 트윈이 짧게 끝나도 단계는 계획만큼 간다.
    timeline.to({}, { duration: s(d.totalMs) }, 0)

    const slotsByKey = new Map<string, Slot>()
    const landed = new Set<string>()
    step.landings.forEach((landing, k) => {
      const slot = this.slotAt(landing.pos[0], landing.pos[1])
      slotsByKey.set(key(landing.pos), slot)
      const landAt = Math.max(60, d.spinMs - (total - 1 - k) * d.staggerMs)
      const count = Math.max(STRIP_MIN, Math.round(landAt / MS_PER_STRIP_SYMBOL) + 2)
      this.beginSpin(slot, landing, count, step.index)
      const travel = (Math.min(STRIP_MAX, count) - 1) * size
      timeline.to(slot.strip, { y: travel, duration: s(landAt), ease: 'power2.inOut' }, 0)
      timeline.call(
        () => {
          landed.add(key(landing.pos))
          this.landSlot(slot, landing)
        },
        undefined,
        s(landAt),
      )
    })

    timeline.call(hooks.onLand, undefined, s(d.spinMs))

    const coinSlots = step.newCoins.map((coin) => this.slotAt(coin.pos[0], coin.pos[1]))
    if (step.newCoins.length > 0 && d.pinMs > 0) {
      const hitMs = Math.max(30, Math.round(d.pinMs * 0.3))
      const pinAt = d.spinMs + Math.round(d.pinMs * 0.7)
      // 착지(landSlot→applyCoin)가 얼굴 텍스처와 baseScale을 바꾸므로 배율은 트윈이 시작할 때 읽는다.
      const hitStart = Math.max(60, d.spinMs)
      coinSlots.forEach((slot) => {
        if (this.deps.reducedMotion) return
        timeline.fromTo(
          slot.face.scale,
          { x: () => slot.baseScale * HIT_SCALE, y: () => slot.baseScale * HIT_SCALE },
          { x: () => slot.baseScale, y: () => slot.baseScale, duration: s(hitMs), ease: 'back.out(2.2)', immediateRender: false },
          s(hitStart),
        )
      })
      timeline.call(
        () => {
          step.newCoins.forEach((coin, i) => {
            const slot = coinSlots[i]
            if (slot === undefined) return
            this.pinSlot(slot, coin)
            const c = symbolCenter(this.layoutNow, coin.pos[0], coin.pos[1])
            this.flash(c, size * 1.5, this.pinColor(coin), 320)
            this.sparks(c, SPARKS_PER_PIN, this.pinColor(coin), size * 0.6)
          })
          this.refreshPeeks()
          hooks.onPin()
        },
        undefined,
        s(pinAt),
      )
    }

    let released = false
    const settle = (): void => {
      timeline.kill()
      this.loose.delete(timeline)
      step.landings.forEach((landing) => {
        const slot = slotsByKey.get(key(landing.pos))
        if (slot === undefined) return
        this.landSlot(slot, landing)
        slot.face.scale.set(slot.baseScale)
      })
      step.newCoins.forEach((coin, i) => {
        const slot = coinSlots[i]
        if (slot !== undefined) this.pinSlot(slot, coin)
      })
      this.refreshPeeks()
    }
    return {
      compress: (ms) => {
        if (released) return
        const remaining = (timeline.duration() - timeline.time()) * 1000
        const scale = remaining / Math.max(1, ms)
        if (scale > timeline.timeScale()) timeline.timeScale(scale)
      },
      settle,
      release: () => {
        released = true
      },
    }
  }

  // ------------------------------------------------------------------ 촉수 감기

  private ropeGeometry(reel: number): TentacleGeometry {
    const layout = this.layoutNow
    const c = symbolCenter(layout, reel, 0)
    const area = layout.reelArea
    return {
      cx: c.x,
      bottomY: area.y + area.height + layout.symbolSize * 0.4,
      topY: area.y - layout.symbolSize * 0.05,
      cell: layout.symbolSize,
    }
  }

  private columnPinnedCount(reel: number): number {
    let count = 0
    for (let row = 0; row < this.deps.rows; row += 1) if (this.pinned.has(`${reel}:${row}`)) count += 1
    return count
  }

  /** 한 칸 남은 줄 아래에 촉수 끝을 내밀고, 그 밖의 줄에서는 거둔다. */
  refreshPeeks(): void {
    if (this.deps.reducedMotion) return
    for (let reel = 0; reel < this.deps.reels; reel += 1) {
      const wants = !this.wrapped.has(reel) && this.columnPinnedCount(reel) === this.deps.rows - 1
      const existing = this.peeks.get(reel)
      if (wants && existing === undefined) {
        this.peeks.set(reel, this.ropes.acquire(this.layoutNow.symbolSize))
      } else if (!wants && existing !== undefined) {
        this.peeks.delete(reel)
        this.ropes.release(existing)
      }
    }
    this.ensureTicker()
  }

  private releasePeeks(): void {
    for (const rope of this.peeks.values()) this.ropes.release(rope)
    this.peeks.clear()
    this.stopTicker()
  }

  private readonly tick = (): void => {
    const time = gsap.ticker.time
    for (const [reel, rope] of this.peeks) {
      const geo = this.ropeGeometry(reel)
      // 판 아래(칸 0.4 밑)에서 고개를 내밀되 맨 아래 칸의 숫자(칸 가운데)는 덮지 않는다: 칸 안으로는 최대 0.22칸.
      rope.setShape(geo, tentaclePeekShape(geo, time, PEEK_REACH))
    }
  }

  private ensureTicker(): void {
    if (this.peeks.size === 0) {
      this.stopTicker()
      return
    }
    if (this.ticking) return
    this.ticking = true
    gsap.ticker.add(this.tick)
  }

  private stopTicker(): void {
    if (!this.ticking) return
    this.ticking = false
    gsap.ticker.remove(this.tick)
  }

  /**
   * 촉수 1줄: 아래에서 올라와(rise) 줄을 휘감고(coil) 숫자가 두 배로 바뀐다(count). 촉수는 배경에서 물러간다.
   * 모션 축소에서는 그림 없이 줄이 한 번 깜빡이며 숫자가 바뀐다.
   */
  playWrap(wrap: RespinWrapPlan, d: RespinWrapDurations, hooks: WrapHooks): RespinHandle {
    const reduced = this.deps.reducedMotion
    const reel = wrap.reel
    const geo = this.ropeGeometry(reel)
    const layout = this.layoutNow
    const slots = wrap.cells.map((cell) => this.slotAt(reel, cell.row))
    const timeline = gsap.timeline({
      onComplete: () => {
        this.loose.delete(timeline)
        hooks.onComplete()
      },
    })
    this.loose.add(timeline)
    timeline.to({}, { duration: s(d.totalMs) }, 0)
    timeline.call(hooks.onRise, undefined, 0)

    let rope: TentacleRope | null = null
    const state = { head: 0, length: 0.92, wiggle: 0.05 }
    if (!reduced) {
      rope = this.peeks.get(reel) ?? this.ropes.acquire(layout.symbolSize)
      this.peeks.delete(reel)
      const shape = (): void => {
        rope?.setShape(geo, { head: state.head, length: state.length, wiggle: state.wiggle, time: gsap.ticker.time })
      }
      // 대기하던 끝이 있었으면 그 높이에서 이어 올라간다.
      state.head = rope.visible ? 0.12 : 0
      timeline.to(state, { head: 1, duration: s(d.riseMs), ease: 'power2.out', onUpdate: shape }, 0)
      timeline.to(state, { wiggle: 0.015, duration: s(d.coilMs), ease: 'sine.inOut', onUpdate: shape }, s(d.riseMs))
    }

    const countAt = d.riseMs + d.coilMs
    wrap.cells.forEach((cell, i) => {
      const slot = slots[i]
      if (slot === undefined) return
      const base = slot.baseScale
      if (!reduced) {
        timeline.to(
          slot.face.scale,
          { x: base * 0.93, y: base * 0.93, duration: s(d.coilMs / 2), ease: 'sine.inOut', yoyo: true, repeat: 1 },
          s(d.riseMs),
        )
      }
      if (cell.after === cell.before) return
      const coin = slot.coin
      if (coin === null) return
      const after: CoinCell = { ...coin, amount: cell.after, value: coin.value * (cell.after / Math.max(1, cell.before)) }
      const flipMs = Math.max(40, d.countMs * 0.4)
      if (reduced) {
        timeline.to(slot.face, { alpha: 0.2, duration: s(d.countMs / 2) }, s(countAt))
        timeline.call(() => this.applyCoin(slot, after), undefined, s(countAt + d.countMs / 2))
        timeline.to(slot.face, { alpha: 1, duration: s(d.countMs / 2) }, s(countAt + d.countMs / 2))
        return
      }
      timeline.to(slot.face.scale, { x: 0, duration: s(flipMs / 2), ease: 'power2.in' }, s(countAt))
      timeline.call(
        () => {
          this.applyCoin(slot, after)
          slot.face.scale.x = 0
          this.pinned.set(`${slot.reel}:${slot.row}`, after)
        },
        undefined,
        s(countAt + flipMs / 2),
      )
      timeline.to(
        slot.face.scale,
        { x: () => slot.baseScale, duration: s(flipMs / 2), ease: 'back.out(2)', immediateRender: false },
        s(countAt + flipMs / 2),
      )
      timeline.call(
        () => {
          const c = symbolCenter(this.layoutNow, slot.reel, slot.row)
          this.flash(c, layout.symbolSize * 1.4, GOLD, 300)
          this.sparks(c, 5, GOLD, layout.symbolSize * 0.5)
          this.popBadge(c)
        },
        undefined,
        s(countAt + flipMs / 2),
      )
    })

    // 촉수가 물러난 뒤 두 배가 된 코인을 한 번 더 «툭» 띄운다 — 바뀌는 순간은 촉수에 가려 잘 안 보인다(점멸 모드는 생략).
    const doubled = wrap.cells
      .map((cell, i) => (cell.after !== cell.before ? slots[i] : undefined))
      .filter((slot): slot is Slot => slot !== undefined)
    timeline.call(
      () => {
        this.wrapped.add(reel)
        // 촉수는 시간 예산 밖에서 물러난다: 꼬리가 머리를 따라잡아 사라진다.
        if (rope !== null) this.retreat(rope, state, geo)
        rope = null
        this.refreshPeeks()
        if (!reduced && d.riseMs > 0) this.showDoubled(doubled)
      },
      undefined,
      s(d.totalMs),
    )

    let released = false
    return {
      compress: (ms) => {
        if (released) return
        const remaining = (timeline.duration() - timeline.time()) * 1000
        const scale = remaining / Math.max(1, ms)
        if (scale > timeline.timeScale()) timeline.timeScale(scale)
      },
      settle: () => {
        timeline.kill()
        this.loose.delete(timeline)
        wrap.cells.forEach((cell, i) => {
          const slot = slots[i]
          if (slot === undefined) return
          slot.face.scale.set(slot.baseScale)
          slot.face.alpha = 1
          const coin = slot.coin
          if (coin !== null && cell.after !== cell.before) {
            const after: CoinCell = { ...coin, amount: cell.after, value: coin.value * (cell.after / Math.max(1, cell.before)) }
            this.applyCoin(slot, after)
            this.pinned.set(`${slot.reel}:${slot.row}`, after)
          }
        })
        this.wrapped.add(reel)
        if (rope !== null) {
          this.ropes.release(rope)
          rope = null
        }
        this.refreshPeeks()
      },
      release: () => {
        released = true
      },
    }
  }

  /** 배경에서 촉수를 거둔다. 타임라인 밖에서 돌므로 `loose`에 걸어 둔다. */
  private retreat(rope: TentacleRope, state: { head: number; length: number; wiggle: number }, geo: TentacleGeometry): void {
    const tween = gsap.to(state, {
      length: 0.02,
      wiggle: 0.08,
      duration: 0.45,
      ease: 'power2.in',
      onUpdate: () => {
        rope.setShape(geo, { head: state.head, length: state.length, wiggle: state.wiggle, time: gsap.ticker.time })
      },
      onComplete: () => {
        this.loose.delete(tween)
        this.ropes.release(rope)
      },
    })
    this.loose.add(tween)
  }

  /** 감기가 끝나고 촉수가 물러날 즈음, 두 배가 된 코인을 금빛으로 한 번 띄운다(시간 예산 밖, 다음 리스핀을 막지 않는다). */
  private showDoubled(slots: readonly Slot[]): void {
    if (slots.length === 0) return
    const call = gsap.delayedCall(DOUBLED_DELAY_S, () => {
      this.loose.delete(call)
      for (const slot of slots) {
        if (slot.coin === null) continue
        this.flash(symbolCenter(this.layoutNow, slot.reel, slot.row), this.layoutNow.symbolSize * 1.2, GOLD, 360)
        const tween = gsap.to(slot.face.scale, {
          x: () => slot.baseScale * DOUBLED_SCALE,
          y: () => slot.baseScale * DOUBLED_SCALE,
          duration: 0.14,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1,
          onComplete: () => {
            this.loose.delete(tween)
            slot.face.scale.set(slot.baseScale)
          },
        })
        this.loose.add(tween)
      }
    })
    this.loose.add(call)
  }

  /** «×2» 배지가 코인 위로 떠올랐다 사라진다. */
  private popBadge(center: Point): void {
    const sprite = this.fxPool.acquire(this.deps.badge())
    const size = this.layoutNow.symbolSize
    sprite.position.set(center.x + size * 0.18, center.y - size * 0.34)
    sprite.setSize(size * 0.56)
    const base = sprite.scale.x
    sprite.scale.set(0)
    sprite.alpha = 1
    const tween = gsap.timeline({
      onComplete: () => {
        this.loose.delete(tween)
        this.fxPool.release(sprite)
      },
    })
    tween.to(sprite.scale, { x: base * 1.2, y: base * 1.2, duration: 0.14, ease: 'back.out(2.4)' })
    tween.to(sprite.scale, { x: base, y: base, duration: 0.08 })
    tween.to(sprite, { y: sprite.y - size * 0.18, alpha: 0, duration: 0.3, ease: 'power1.in' }, 0.3)
    this.loose.add(tween)
  }

  // ------------------------------------------------------------------ 정산

  /**
   * 정산: 코인이 릴 → 행 순서로 하나씩 합계(판 아래)로 날아간다. 보물 코인은 더 머문다.
   * 15칸이면 마지막에 «최고 보물» 연출이 붙는다. STOP이면 배속 하나로 줄인다.
   */
  playCollect(
    items: readonly RespinCollectItem[],
    full: boolean,
    d: RespinCollectDurations,
    hooks: CollectHooks,
  ): RespinHandle {
    const layout = this.layoutNow
    const reduced = this.deps.reducedMotion
    const target: Point = {
      x: layout.reelArea.x + layout.reelArea.width / 2,
      y: layout.reelArea.y + layout.reelArea.height + layout.symbolSize * 0.9,
    }
    const timeline = gsap.timeline({
      onComplete: () => {
        this.loose.delete(timeline)
        hooks.onComplete()
      },
    })
    this.loose.add(timeline)

    const copies: Sprite[] = []
    let t = 0
    items.forEach((item, index) => {
      const slot = this.slotAt(item.cell.pos[0], item.cell.pos[1])
      const treasure = item.cell.kind === 'treasure'
      timeline.call(() => hooks.onCoin(index, item), undefined, s(t))
      timeline.to(
        slot.face.scale,
        { x: slot.baseScale * 1.22, y: slot.baseScale * 1.22, duration: s(Math.min(110, d.gapMs * 0.9)), ease: 'power2.out', yoyo: true, repeat: 1 },
        s(t),
      )
      if (treasure) {
        timeline.call(
          () => {
            const c = symbolCenter(this.layoutNow, slot.reel, slot.row)
            this.flash(c, layout.symbolSize * 1.7, this.pinColor(item.cell), 420)
            this.sparks(c, 9, this.pinColor(item.cell), layout.symbolSize * 0.8)
          },
          undefined,
          s(t),
        )
      }
      const flyAt = t + (treasure ? d.treasureHoldMs : 0)
      if (!reduced && d.flyMs > 0) {
        const copy = this.fxPool.acquire(slot.face.texture)
        copy.visible = false
        copy.setSize(layout.symbolSize * SYMBOL_FILL_RATIO)
        const c = symbolCenter(layout, slot.reel, slot.row)
        copy.position.set(c.x, c.y)
        copies.push(copy)
        timeline.set(copy, { visible: true }, s(flyAt))
        timeline.to(
          copy,
          { x: target.x, y: target.y, alpha: 0, duration: s(d.flyMs), ease: 'power2.in' },
          s(flyAt),
        )
        timeline.to(copy.scale, { x: copy.scale.x * 0.55, y: copy.scale.y * 0.55, duration: s(d.flyMs), ease: 'power1.in' }, s(flyAt))
      }
      // 코인을 거두면 칸은 흐려지고 고정 테두리가 빠진다.
      timeline.call(
        () => {
          this.pinned.delete(`${slot.reel}:${slot.row}`)
          this.drawPins()
          this.refreshPeeks()
        },
        undefined,
        s(flyAt),
      )
      timeline.to(slot.face, { alpha: 0.28, duration: s(Math.max(60, d.gapMs)) }, s(flyAt))
      t += d.gapMs + (treasure ? d.treasureHoldMs : 0)
    })

    let end = t - d.gapMs + d.flyMs
    if (items.length === 0) end = 0
    if (full) {
      const topAt = Math.max(0, end)
      timeline.call(hooks.onTopStart, undefined, s(topAt))
      this.scheduleTop(timeline, topAt, d.topMs, hooks.onTopEnd)
      end = topAt + d.topMs
    }
    // 길이를 못 박는다.
    timeline.to({}, { duration: s(Math.max(1, end)) }, 0)

    let released = false
    return {
      compress: (ms) => {
        if (released) return
        const remaining = (timeline.duration() - timeline.time()) * 1000
        const scale = remaining / Math.max(1, ms)
        if (scale > timeline.timeScale()) timeline.timeScale(scale)
      },
      settle: () => {
        timeline.kill()
        this.loose.delete(timeline)
        for (const copy of copies) this.fxPool.release(copy)
        copies.length = 0
        this.pinned.clear()
        this.drawPins()
        for (const item of items) {
          const slot = this.slotAt(item.cell.pos[0], item.cell.pos[1])
          slot.face.scale.set(slot.baseScale)
          slot.face.alpha = 0.28
        }
        this.refreshPeeks()
      },
      release: () => {
        released = true
        for (const copy of copies) this.fxPool.release(copy)
        copies.length = 0
      },
    }
  }

  /** 15칸을 채운 «최고 보물»: 판 전체가 금빛으로 맥동하고 보물 그림이 가운데서 커진다. */
  private scheduleTop(timeline: gsap.core.Timeline, atMs: number, durationMs: number, onEnd: () => void): void {
    const layout = this.layoutNow
    const area = layout.reelArea
    const center: Point = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    const flash = this.fxPool.acquire(this.deps.solid)
    flash.tint = GOLD
    flash.position.set(center.x, center.y)
    flash.width = area.width
    flash.height = area.height
    flash.alpha = 0
    flash.blendMode = 'add'
    const prop = this.fxPool.acquire(this.deps.topTexture ?? this.deps.faces.get({ kind: 'treasure', tier: 'large', label: '' }))
    prop.position.set(center.x, center.y)
    prop.setSize(layout.symbolSize * TOP_PROP_RATIO)
    const base = prop.scale.x
    prop.scale.set(0)
    prop.alpha = 1
    const s0 = s(atMs)
    const pulses = Math.max(1, Math.round(durationMs / 520))
    for (let i = 0; i < pulses; i += 1) {
      timeline.to(flash, { alpha: 0.38, duration: s(durationMs / pulses / 2), ease: 'sine.out' }, s0 + (i * s(durationMs)) / pulses)
      timeline.to(flash, { alpha: 0.05, duration: s(durationMs / pulses / 2), ease: 'sine.in' }, s0 + (i * s(durationMs)) / pulses + s(durationMs / pulses / 2))
    }
    timeline.to(prop.scale, { x: base * 1.12, y: base * 1.12, duration: s(durationMs * 0.22), ease: 'back.out(2)' }, s0)
    timeline.to(prop.scale, { x: base, y: base, duration: s(durationMs * 0.1) }, s0 + s(durationMs * 0.22))
    timeline.to(prop, { alpha: 0, duration: s(durationMs * 0.2), ease: 'power1.in' }, s0 + s(durationMs * 0.8))
    timeline.to(flash, { alpha: 0, duration: s(durationMs * 0.15) }, s0 + s(durationMs * 0.85))
    timeline.call(
      () => {
        this.fxPool.release(flash)
        this.fxPool.release(prop)
        onEnd()
      },
      undefined,
      s0 + s(durationMs),
    )
    if (!this.deps.reducedMotion) {
      timeline.call(() => this.sparks(center, 14, GOLD, layout.symbolSize * 1.6), undefined, s0 + s(durationMs * 0.1))
    }
  }

  // ------------------------------------------------------------------ 진단 / 정리

  /** 풀과 캐시의 지금 상태. 진단 패널이 읽는다. */
  get stats(): { coinFaces: number; tentaclesCreated: number; tentaclesLive: number; fxLive: number; liveTweens: number } {
    return {
      coinFaces: this.deps.faces.size,
      tentaclesCreated: this.ropes.stats.created,
      tentaclesLive: this.ropes.stats.live,
      fxLive: this.fxPool.live,
      liveTweens: this.loose.size,
    }
  }

  private killLoose(): void {
    for (const animation of [...this.loose]) animation.kill()
    this.loose.clear()
  }

  destroy(): void {
    this.killLoose()
    this.releasePeeks()
    this.fxPool.clear()
    this.ropes.clear()
    this.root.removeFromParent()
    this.root.destroy({ children: true })
  }
}
