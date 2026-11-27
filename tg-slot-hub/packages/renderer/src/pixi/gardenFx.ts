import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { GardenBounds, GardenSeed, SymbolId } from '@tgslot/slot-engine'
import { SYMBOL_FILL_RATIO } from '../constants.js'
import {
  gardenCameraFor,
  gardenScatterCount,
  type GardenCamera,
  type GardenPlanStep,
  type GardenStepDurations,
  type GardenSunPlan,
} from '../garden.js'
import { cellPitch, reelLeft, rowTop, symbolCenter, type Layout } from '../layout.js'
import type { TextureRegistry } from '../textureRegistry.js'
import { createCanvasTexture } from './textures.js'
import { LayerSpritePool } from './spritePool.js'

/**
 * 자라는 정원 연출. 카메라(컨테이너 배율)·덮인 화분 덮개·씨앗 배지를 다룬다.
 * 규칙은 전부 순수 계획(`garden.ts`)이 정하고 여기서는 그리기와 대기만 한다.
 *
 * 메모리: 덮개 스프라이트·배지 스프라이트는 풀이고 텍스처는 장면 생성 때 한 번만 만든다(씨앗 얼굴 N장 + 번호판 N장 + 덮개 1장 + 칸 받침).
 * 카메라는 컨테이너 배율 값 하나라 텍스처를 다시 만들지 않는다.
 */

/** 칸 받침(활성 칸 뒤 크림 판) 투명도. */
const PLATE_ALPHA = 0.18
/** 덮개·배지·부유 숫자 풀 상한. 덮개는 64-16, 배지는 maxSeeds(16)의 아이콘+번호판. */
const COVER_POOL_MAX = 48
const BADGE_POOL_MAX = 40
const FLOAT_TEXT_MAX = 4
const GLOW_POOL_MAX = 72

/** 씨앗 번호판 색(등급 순). 모자라면 마지막 색. */
const TIER_PLATE_COLORS = ['#7fcf8e', '#f6a6c1', '#ff8fa3', '#ffb347', '#ffd23f'] as const
const SOIL_COLOR = 0x7a5236
const PETAL_COLOR = 0xf6a6c1
const SUN_COLOR = 0xfff1b8

/** 카메라를 다루는 쪽(렌더러)이 장면에 건네는 손잡이. */
export interface GardenCameraHandle {
  /** 지금 카메라 값. 트윈이 이 객체를 직접 움직인다. */
  readonly state: GardenCamera
  /** 값을 컨테이너에 반영한다. */
  apply(): void
}

export interface GardenSceneOptions {
  /** 릴 마스크 안의 층. 받침·덮개·배지가 여기 산다. */
  reelsLayer: Container
  registry: TextureRegistry
  /** 씨앗 값 목록(`growBoard.seedTiers`). 번호판 글자가 된다. */
  tiers: readonly number[]
  /** 테마가 준 화분 덮개 그림(`props.pot`). 없으면 코드로 그린다. */
  potTexture: Texture | null
  /** 테마가 준 씨앗 얼굴(`props['seed-N']`). 없는 등급은 코드로 그린다. */
  seedTextures: readonly (Texture | null)[]
  spark: Texture
  solid: Texture
  getLayout: () => Layout
  cameraHandle: GardenCameraHandle
}

export interface GardenStepContext {
  layout: Layout
  symbols: LayerSpritePool
  debris: LayerSpritePool
  textures: ReadonlyMap<SymbolId, Texture>
  reducedMotion: boolean
  scatter?: { symbol: SymbolId; trigger: number }
  /** 허브 이벤트용 신호. 타임라인 위 제 시각에 불린다(STOP 압축을 따라 빨라진다). */
  hooks?: { bloom?: () => void; growStart?: () => void; growEnd?: () => void }
}

export interface GardenFxHandle {
  compress(ms: number): void
  release(): void
}

interface Badge {
  seed: GardenSeed
  icon: Sprite
  label: Sprite
  /** `setSize` 직후 배율. 트윈이 이 값을 곱한다. */
  iconBase: number
  labelBase: number
}

const cellKey = (reel: number, row: number): number => row * 64 + reel

// ----------------------------------------------------------------- 코드로 그린 그림

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** 화분 덮개: 테라코타 테두리 + 흙 봉분. 흙색 판 위에서도 읽히게 테두리가 밝다. */
function paintPot(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size)
  roundRectPath(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.2)
  ctx.fillStyle = '#d98a5f'
  ctx.fill()
  ctx.lineWidth = size * 0.035
  ctx.strokeStyle = '#fbf7ee'
  ctx.stroke()
  const soil = ctx.createRadialGradient(size * 0.42, size * 0.38, size * 0.04, size / 2, size / 2, size * 0.46)
  soil.addColorStop(0, '#7b5238')
  soil.addColorStop(1, '#3f2718')
  roundRectPath(ctx, size * 0.15, size * 0.15, size * 0.7, size * 0.7, size * 0.16)
  ctx.fillStyle = soil
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 238, 214, 0.22)'
  for (const [x, y, r] of [
    [0.36, 0.34, 0.045],
    [0.6, 0.46, 0.035],
    [0.46, 0.64, 0.04],
    [0.68, 0.68, 0.028],
  ] as const) {
    ctx.beginPath()
    ctx.arc(size * x, size * y, size * r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number, fill: string): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function petals(ctx: CanvasRenderingContext2D, cx: number, cy: number, count: number, radius: number, petal: number, fill: string, rotate = 0): void {
  for (let i = 0; i < count; i += 1) {
    const angle = rotate + (Math.PI * 2 * i) / count
    leaf(ctx, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, petal, petal * 0.62, angle, fill)
  }
}

/** 씨앗 얼굴. 0 새싹 · 1 봉오리 · 2 반쯤 핀 꽃 · 3 활짝 핀 큰 꽃 · 4 황금 꽃. 두꺼운 크림 외곽 대신 어두운 원판 위에 얹어 작아도 읽힌다. */
function paintSeedFace(ctx: CanvasRenderingContext2D, size: number, tier: number): void {
  ctx.clearRect(0, 0, size, size)
  const c = size / 2
  ctx.beginPath()
  ctx.arc(c, c, size * 0.46, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(52, 36, 24, 0.82)'
  ctx.fill()
  ctx.lineWidth = size * 0.045
  ctx.strokeStyle = '#fbf7ee'
  ctx.stroke()
  const stem = '#4fa66a'
  ctx.strokeStyle = stem
  ctx.lineWidth = size * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(c, size * 0.82)
  ctx.lineTo(c, size * (tier === 0 ? 0.5 : 0.56))
  ctx.stroke()
  if (tier === 0) {
    leaf(ctx, c - size * 0.12, size * 0.46, size * 0.13, size * 0.08, -0.5, '#7fcf8e')
    leaf(ctx, c + size * 0.12, size * 0.46, size * 0.13, size * 0.08, 0.5, '#7fcf8e')
    return
  }
  leaf(ctx, c - size * 0.15, size * 0.7, size * 0.12, size * 0.06, -0.5, '#6cc08b')
  leaf(ctx, c + size * 0.15, size * 0.66, size * 0.12, size * 0.06, 0.5, '#6cc08b')
  if (tier === 1) {
    leaf(ctx, c, size * 0.42, size * 0.1, size * 0.16, 0, '#f6a6c1')
    leaf(ctx, c, size * 0.4, size * 0.05, size * 0.12, 0, '#ff8fa3')
    return
  }
  const centerY = size * 0.42
  if (tier === 2) {
    petals(ctx, c, centerY, 5, size * 0.1, size * 0.1, '#f6a6c1', -Math.PI / 2)
    ctx.beginPath()
    ctx.arc(c, centerY, size * 0.06, 0, Math.PI * 2)
    ctx.fillStyle = '#ffd66b'
    ctx.fill()
    return
  }
  const gold = tier >= 4
  if (gold) {
    const glow = ctx.createRadialGradient(c, centerY, size * 0.05, c, centerY, size * 0.4)
    glow.addColorStop(0, 'rgba(255, 224, 120, 0.7)')
    glow.addColorStop(1, 'rgba(255, 224, 120, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)
  }
  petals(ctx, c, centerY, 8, size * 0.15, size * 0.12, gold ? '#ffd23f' : '#f6a6c1', -Math.PI / 2)
  petals(ctx, c, centerY, 8, size * 0.09, size * 0.09, gold ? '#fff0a8' : '#ffc4d8', -Math.PI / 2 + Math.PI / 8)
  ctx.beginPath()
  ctx.arc(c, centerY, size * 0.07, 0, Math.PI * 2)
  ctx.fillStyle = gold ? '#e08a2a' : '#ffd66b'
  ctx.fill()
}

/** 번호판: 등급 색 알약에 `×N`. 흰 글자에 짙은 테두리라 어느 꽃 위에서도 읽힌다. */
function paintPlate(ctx: CanvasRenderingContext2D, width: number, height: number, text: string, color: string): void {
  ctx.clearRect(0, 0, width, height)
  roundRectPath(ctx, 2, 2, width - 4, height - 4, height / 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = Math.max(3, height * 0.1)
  ctx.strokeStyle = '#fbf7ee'
  ctx.stroke()
  ctx.font = `800 ${Math.round(height * 0.62)}px system-ui, "Apple SD Gothic Neo", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, height * 0.14)
  ctx.strokeStyle = '#4b2c17'
  ctx.strokeText(text, width / 2, height / 2 + height * 0.03)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, width / 2, height / 2 + height * 0.03)
}

const FACE_SIZE = 128
const PLATE_W = 128
const PLATE_H = 64

/**
 * 정원 장면. 렌더러가 `math.growBoard` 팩에서만 만든다.
 * 층 순서(릴 마스크 안): 칸 받침 → 릴 → 연쇄 풀 → 광채 → 덮개 → 배지 → 부유 숫자.
 */
export class GardenScene {
  private readonly plates = new Graphics()
  private readonly glowLayer = new Container()
  private readonly coverLayer = new Container()
  private readonly badgeLayer = new Container()
  private readonly floatLayer = new Container()
  private readonly covers: LayerSpritePool
  private readonly badgeSprites: LayerSpritePool
  private readonly glows: LayerSpritePool
  private readonly floatTexts: Text[] = []
  private readonly floatFree: Text[] = []
  private readonly faceTextures: Texture[] = []
  private readonly plateTextures: Texture[] = []
  private readonly potTexture: Texture
  private readonly badges = new Map<number, Badge>()
  private destroyed = false
  private readonly liveTimelines = new Set<gsap.core.Animation>()

  constructor(private readonly options: GardenSceneOptions) {
    const { reelsLayer, registry, tiers } = options
    this.potTexture = options.potTexture ?? createCanvasTexture(FACE_SIZE, FACE_SIZE, (ctx) => paintPot(ctx, FACE_SIZE), registry)
    tiers.forEach((value, tier) => {
      this.faceTextures.push(
        options.seedTextures[tier] ?? createCanvasTexture(FACE_SIZE, FACE_SIZE, (ctx) => paintSeedFace(ctx, FACE_SIZE, tier), registry),
      )
      const color = TIER_PLATE_COLORS[Math.min(tier, TIER_PLATE_COLORS.length - 1)] as string
      this.plateTextures.push(createCanvasTexture(PLATE_W, PLATE_H, (ctx) => paintPlate(ctx, PLATE_W, PLATE_H, `×${value}`, color), registry))
    })
    // 받침은 릴보다 아래, 마스크 안이라 창 밖으로 번지지 않는다.
    reelsLayer.addChildAt(this.plates, 0)
    reelsLayer.addChild(this.glowLayer, this.coverLayer, this.badgeLayer, this.floatLayer)
    this.covers = new LayerSpritePool(this.coverLayer, COVER_POOL_MAX)
    this.badgeSprites = new LayerSpritePool(this.badgeLayer, BADGE_POOL_MAX)
    this.glows = new LayerSpritePool(this.glowLayer, GLOW_POOL_MAX)
    this.layout()
  }

  // ------------------------------------------------------------- 배치

  /** 레이아웃이 바뀔 때(크기 조정 포함) 받침을 다시 그리고 배지를 제자리로 보낸다. */
  layout(): void {
    const layout = this.options.getLayout()
    this.plates.clear()
    const radius = layout.symbolSize * 0.16
    for (let row = 0; row < layout.rows; row += 1) {
      for (let reel = 0; reel < layout.reels; reel += 1) {
        this.plates.roundRect(reelLeft(layout, reel), rowTop(layout, row), layout.symbolSize, layout.symbolSize, radius)
      }
    }
    this.plates.fill({ color: 0xfbf7ee, alpha: PLATE_ALPHA })
    for (const badge of this.badges.values()) this.placeBadge(badge)
  }

  // ------------------------------------------------------------- 배지

  private faceFor(tier: number): Texture {
    return this.faceTextures[Math.min(tier, this.faceTextures.length - 1)] as Texture
  }

  private plateFor(tier: number): Texture {
    return this.plateTextures[Math.min(tier, this.plateTextures.length - 1)] as Texture
  }

  private placeBadge(badge: Badge): void {
    const layout = this.options.getLayout()
    const center = symbolCenter(layout, badge.seed.reel, badge.seed.row)
    const s = layout.symbolSize
    badge.icon.setSize(s * 0.5)
    badge.iconBase = badge.icon.scale.x
    badge.icon.position.set(center.x - s * 0.22, center.y - s * 0.22)
    badge.label.setSize(s * 0.72, s * 0.36)
    badge.labelBase = badge.label.scale.x
    badge.label.position.set(center.x, center.y + s * 0.3)
  }

  private createBadge(seed: GardenSeed): Badge {
    const icon = this.badgeSprites.acquire(this.faceFor(seed.tier))
    const label = this.badgeSprites.acquire(this.plateFor(seed.tier))
    const badge: Badge = { seed: { ...seed }, icon, label, iconBase: 1, labelBase: 1 }
    this.placeBadge(badge)
    this.badges.set(cellKey(seed.reel, seed.row), badge)
    return badge
  }

  private removeBadge(key: number): void {
    const badge = this.badges.get(key)
    if (badge === undefined) return
    this.badgeSprites.release(badge.icon)
    this.badgeSprites.release(badge.label)
    this.badges.delete(key)
  }

  private resetBadgeVisual(badge: Badge): void {
    badge.icon.texture = this.faceFor(badge.seed.tier)
    badge.label.texture = this.plateFor(badge.seed.tier)
    badge.icon.alpha = 1
    badge.label.alpha = 1
    badge.icon.visible = true
    badge.label.visible = true
    this.placeBadge(badge)
  }

  /** 서버 씨앗 목록으로 배지를 맞춘다. 트윈이 건드린 상태(배율·투명도)도 이때 되돌린다. */
  setSeeds(seeds: readonly GardenSeed[]): void {
    if (this.destroyed) return
    const wanted = new Map(seeds.map((seed) => [cellKey(seed.reel, seed.row), seed] as const))
    for (const key of [...this.badges.keys()]) if (!wanted.has(key)) this.removeBadge(key)
    for (const [key, seed] of wanted) {
      const existing = this.badges.get(key)
      if (existing === undefined) {
        this.createBadge(seed)
        continue
      }
      existing.seed = { ...seed }
      this.resetBadgeVisual(existing)
    }
  }

  get seedCount(): number {
    return this.badges.size
  }

  private setBadgeTier(key: number, tier: number): void {
    const badge = this.badges.get(key)
    if (badge === undefined) return
    badge.seed.tier = tier
    badge.icon.texture = this.faceFor(tier)
    badge.label.texture = this.plateFor(tier)
  }

  // ------------------------------------------------------------- 부유 숫자

  private acquireFloat(text: string, size: number): Text | null {
    if (this.destroyed) return null
    let node = this.floatFree.pop()
    if (node === undefined) {
      if (this.floatTexts.length >= FLOAT_TEXT_MAX) return null
      node = new Text({
        text,
        style: {
          fontFamily: 'system-ui, "Apple SD Gothic Neo", sans-serif',
          fontWeight: '800',
          fill: '#fff8d6',
          stroke: { color: '#4b2c17', width: 6, join: 'round' },
          fontSize: size,
        },
      })
      node.anchor.set(0.5)
      this.floatTexts.push(node)
      this.floatLayer.addChild(node)
    }
    node.text = text
    node.style.fontSize = size
    node.alpha = 1
    node.scale.set(1)
    node.visible = true
    return node
  }

  private releaseFloat(node: Text): void {
    node.visible = false
    if (!this.floatFree.includes(node)) this.floatFree.push(node)
  }

  // ------------------------------------------------------------- 단계

  playStep(
    step: GardenPlanStep,
    durations: GardenStepDurations,
    ctx: GardenStepContext,
    onComplete: () => void,
  ): GardenFxHandle {
    const { layout } = ctx
    const camera = this.options.cameraHandle
    const size = layout.symbolSize * SYMBOL_FILL_RATIO
    const symbols: Sprite[] = []
    const glows: Sprite[] = []
    const debris: Sprite[] = []
    const covers: Sprite[] = []
    const floats: Text[] = []
    const byCell = new Map<number, Sprite>()
    const s = (ms: number): number => ms / 1000

    const place = (symbol: SymbolId, reel: number, row: number): Sprite | null => {
      const texture = ctx.textures.get(symbol)
      if (texture === undefined) return null
      const sprite = ctx.symbols.acquire(texture)
      sprite.setSize(size)
      const center = symbolCenter(layout, reel, row)
      sprite.position.set(center.x, center.y)
      symbols.push(sprite)
      return sprite
    }

    const { boundsBefore: before } = step
    for (let row = before.y; row < before.y + before.size; row += 1) {
      for (let reel = before.x; reel < before.x + before.size; reel += 1) {
        const sprite = place(step.gridBefore[row]?.[reel] as SymbolId, reel, row)
        if (sprite !== null) byCell.set(cellKey(reel, row), sprite)
      }
    }

    const { highlightMs, bloomMs, popMs, dropMs, anticipationMs, growMs, staggerMs, totalMs } = durations
    const popAt = highlightMs + bloomMs
    const dropAt = popAt + popMs
    const growAt = dropAt + dropMs + anticipationMs
    const timeline = gsap.timeline({ onComplete })
    this.liveTimelines.add(timeline)
    // 길이를 계획 그대로 못 박는다. 마지막 트윈이 짧게 끝나도 단계는 계획만큼 간다.
    timeline.to({}, { duration: s(totalMs) }, 0)

    // ---- 강조: 이긴 칸이 부드럽게 빛나며 살짝 튄다(선은 그리지 않는다).
    const hitKeys = new Set<number>()
    for (const group of step.groups) for (const [reel, row] of group.positions) hitKeys.add(cellKey(reel, row))
    if (highlightMs > 0) {
      for (const key of hitKeys) {
        const sprite = byCell.get(key)
        if (sprite === undefined) continue
        const base = sprite.scale.x
        timeline.to(
          sprite.scale,
          { x: base * 1.1, y: base * 1.1, duration: s((highlightMs * 0.6) / 2), ease: 'sine.inOut', yoyo: true, repeat: 1 },
          0,
        )
        const glow = this.glows.acquire(this.options.spark)
        glow.position.copyFrom(sprite.position)
        glow.setSize(layout.symbolSize * 1.5)
        glow.tint = SUN_COLOR
        glow.blendMode = 'add'
        glow.alpha = 0
        glows.push(glow)
        timeline.to(glow, { alpha: 0.85, duration: s(Math.max(30, highlightMs * 0.5)), ease: 'sine.out' }, 0)
        timeline.to(glow, { alpha: 0, duration: s(Math.max(30, popMs + bloomMs * 0.5)), ease: 'power1.in' }, s(Math.max(0, highlightMs - 30)))
      }
    }

    // ---- 개화: 씨앗 칸이 낀 클러스터는 씨앗이 피며 배율 숫자가 클러스터 가운데로 모인다.
    const bloomKeys = new Set(step.bloomed.map((seed) => cellKey(seed.reel, seed.row)))
    for (const key of bloomKeys) {
      const badge = this.badges.get(key)
      if (badge === undefined) continue
      const dur = Math.max(60, bloomMs > 0 ? bloomMs * 0.5 : highlightMs * 0.5)
      timeline.to(badge.icon.scale, { x: badge.iconBase * 1.35, y: badge.iconBase * 1.35, duration: s(dur), ease: 'back.out(2)' }, s(Math.max(0, highlightMs * 0.4)))
      timeline.to(badge.label.scale, { x: badge.labelBase * 1.18, y: badge.labelBase * 1.18, duration: s(dur), ease: 'back.out(2)' }, s(Math.max(0, highlightMs * 0.4)))
      const fadeDur = Math.max(40, popMs)
      timeline.to([badge.icon, badge.label], { alpha: 0, duration: s(fadeDur), ease: 'power1.in' }, s(popAt))
      timeline.to(badge.icon.scale, { x: badge.iconBase * 1.8, y: badge.iconBase * 1.8, duration: s(fadeDur), ease: 'power1.out' }, s(popAt))
    }
    if (ctx.hooks?.bloom !== undefined && (bloomKeys.size > 0 || step.groups.some((group) => (group.seed ?? 1) > 1))) {
      timeline.call(ctx.hooks.bloom, [], s(Math.max(0, highlightMs * 0.4)))
    }
    const showFloat = highlightMs >= 120 || bloomMs > 0
    for (const group of step.groups) {
      if (group.seed === undefined || group.seed <= 1 || !showFloat) continue
      const text = this.acquireFloat(`×${group.seed}`, Math.round(layout.symbolSize * 0.95))
      if (text === null) continue
      floats.push(text)
      let cx = 0
      let cy = 0
      for (const [reel, row] of group.positions) {
        const c = symbolCenter(layout, reel, row)
        cx += c.x
        cy += c.y
      }
      text.position.set(cx / group.positions.length, cy / group.positions.length)
      text.alpha = 0
      text.scale.set(0.3)
      const inAt = highlightMs * 0.45
      const inDur = Math.max(80, bloomMs > 0 ? bloomMs * 0.55 : highlightMs * 0.4)
      timeline.to(text, { alpha: 1, duration: s(inDur * 0.5) }, s(inAt))
      timeline.to(text.scale, { x: 1, y: 1, duration: s(inDur), ease: 'back.out(2.2)' }, s(inAt))
      timeline.to(text, { alpha: 0, duration: s(Math.max(60, popMs * 0.8)) }, s(popAt))
    }

    // ---- 팝
    const removed = step.removed
      .map(([reel, row]) => ({ reel, row, sprite: byCell.get(cellKey(reel, row)) }))
      .filter((entry): entry is { reel: number; row: number; sprite: Sprite } => entry.sprite !== undefined)
    for (const { sprite } of removed) {
      if (popMs > 0) {
        timeline.to(sprite.scale, { x: 0, y: 0, duration: s(popMs), ease: 'back.in(2)' }, s(popAt))
        timeline.to(sprite, { alpha: 0, duration: s(popMs), ease: 'power1.in' }, s(popAt))
      } else {
        timeline.set(sprite, { visible: false }, s(popAt))
      }
    }
    if (!ctx.reducedMotion && popMs > 0) {
      const distance = layout.symbolSize * 0.55
      const lifeMs = popMs + dropMs * 0.5
      for (const { reel, row } of removed) {
        const center = symbolCenter(layout, reel, row)
        for (let i = 0; i < 4; i += 1) {
          const angle = (Math.PI * 2 * i) / 4 + (reel * 7 + row * 3) * 0.21
          const petal = ctx.debris.acquire(this.options.spark)
          petal.tint = PETAL_COLOR
          petal.position.set(center.x, center.y)
          petal.setSize(layout.symbolSize * (0.16 + (i % 3) * 0.05))
          petal.visible = false
          debris.push(petal)
          timeline.set(petal, { visible: true }, s(popAt))
          timeline.to(
            petal,
            {
              x: center.x + Math.cos(angle) * distance,
              y: center.y + Math.sin(angle) * distance + layout.symbolSize * 0.25,
              alpha: 0,
              rotation: angle * 2,
              duration: s(lifeMs),
              ease: 'power2.out',
            },
            s(popAt),
          )
        }
      }
    }

    // ---- 낙하: 언제나 위치 트윈이다(제자리에서 심볼이 바뀌어 보이지 않는다).
    const movedFrom = new Set(step.moves.filter((move) => !move.refill).map((move) => cellKey(move.reel, move.fromRow)))
    const goneKeys = new Set(removed.map(({ reel, row }) => cellKey(reel, row)))
    const afterByCell = new Map<number, Sprite>()
    for (const [key, sprite] of byCell) if (!goneKeys.has(key) && !movedFrom.has(key)) afterByCell.set(key, sprite)
    const moveMs = Math.max(1, dropMs - staggerMs * Math.max(0, before.size - 1))
    for (const move of step.moves) {
      const sprite = move.refill ? place(move.symbol, move.reel, move.fromRow) : byCell.get(cellKey(move.reel, move.fromRow))
      if (sprite === null || sprite === undefined) continue
      const to = symbolCenter(layout, move.reel, move.toRow)
      timeline.to(sprite, { y: to.y, duration: s(moveMs), ease: 'power2.in' }, s(dropAt + (move.reel - before.x) * staggerMs))
      afterByCell.set(cellKey(move.reel, move.toRow), sprite)
    }
    // ---- 기대감: 활성 판의 스캐터가 보너스 직전이면 성장 공개 전에 숨을 고른다(판 상태만 조건).
    if (anticipationMs > 0 && ctx.scatter !== undefined) {
      const pulse = Math.min(0.18, s(anticipationMs) / 2)
      for (let row = before.y; row < before.y + before.size; row += 1) {
        for (let reel = before.x; reel < before.x + before.size; reel += 1) {
          if (step.gridAfter[row]?.[reel] !== ctx.scatter.symbol) continue
          const sprite = afterByCell.get(cellKey(reel, row))
          if (sprite === undefined) continue
          timeline.to(sprite.scale, { x: sprite.scale.x * 1.2, y: sprite.scale.y * 1.2, duration: pulse, ease: 'sine.inOut', yoyo: true, repeat: 1 }, s(dropAt + dropMs))
        }
      }
    }

    // ---- 성장
    const grow = step.grow
    const growTimes: { camStart: number; camDur: number } = { camStart: 0, camDur: 0 }
    if (grow !== undefined && growMs > 0) {
      const g = s(growMs)
      const gt = s(growAt)
      if (ctx.hooks?.growStart !== undefined) timeline.call(ctx.hooks.growStart, [], gt)
      if (ctx.hooks?.growEnd !== undefined) timeline.call(ctx.hooks.growEnd, [], gt + g)
      // 1) 남은 씨앗이 한 등급 오른다.
      const grownSeeds = step.seedsPopped.filter((seed) => {
        const after = step.seedsAfter.find((other) => other.reel === seed.reel && other.row === seed.row)
        return after !== undefined && after.tier > seed.tier
      })
      for (const seed of grownSeeds) {
        const key = cellKey(seed.reel, seed.row)
        const badge = this.badges.get(key)
        if (badge === undefined) continue
        const after = step.seedsAfter.find((other) => other.reel === seed.reel && other.row === seed.row)
        const nextTier = after?.tier ?? seed.tier
        timeline.to(badge.icon.scale, { x: badge.iconBase * 1.35, y: badge.iconBase * 1.35, duration: g * 0.12, ease: 'sine.out', yoyo: true, repeat: 1 }, gt)
        timeline.to(badge.label.scale, { x: badge.labelBase * 1.25, y: badge.labelBase * 1.25, duration: g * 0.12, ease: 'sine.out', yoyo: true, repeat: 1 }, gt)
        timeline.call(() => this.setBadgeTier(key, nextTier), [], gt + g * 0.12)
      }
      // 2) 카메라가 한 겹 물러난다.
      const target = gardenCameraFor(layout, grow.to)
      const camStart = gt + g * 0.08
      const camDur = Math.min(0.35, g * 0.54)
      growTimes.camStart = camStart
      growTimes.camDur = camDur
      timeline.to(
        camera.state,
        { scale: target.scale, x: target.x, y: target.y, duration: camDur, ease: 'power2.out', onUpdate: () => camera.apply() },
        camStart,
      )
      // 3) 새 칸: 심볼은 착지 때 정해진 값 그대로 덮개 아래에 놓는다. 덮개는 바깥에서 안쪽 순서로 열린다.
      const centerX = grow.to.x + (grow.to.size - 1) / 2
      const centerY = grow.to.y + (grow.to.size - 1) / 2
      const ordered = [...grow.cells].sort((a, b) => {
        const da = Math.hypot(a.position[0] - centerX, a.position[1] - centerY)
        const db = Math.hypot(b.position[0] - centerX, b.position[1] - centerY)
        return db - da || a.position[1] - b.position[1] || a.position[0] - b.position[0]
      })
      const openStart = camStart + camDur * 0.75
      const windowSec = Math.max(0.04, gt + g - openStart)
      const openDur = Math.max(0.03, Math.min(0.14, windowSec * 0.7))
      const gap = ordered.length > 1 ? Math.max(0, Math.min(0.03, (windowSec - openDur) / (ordered.length - 1))) : 0
      const newSeedByCell = new Map(grow.newSeeds.map((seed) => [cellKey(seed.reel, seed.row), seed] as const))
      ordered.forEach(({ position, symbol }, i) => {
        const [reel, row] = position
        place(symbol, reel, row)
        const cover = this.covers.acquire(this.potTexture)
        cover.setSize(layout.symbolSize * 1.02)
        const center = symbolCenter(layout, reel, row)
        cover.position.set(center.x, center.y)
        covers.push(cover)
        const at = openStart + gap * i
        timeline.to(cover.scale, { x: cover.scale.x * 0.3, y: cover.scale.y * 0.3, duration: openDur, ease: 'back.in(1.6)' }, at)
        timeline.to(cover, { alpha: 0, duration: openDur, ease: 'power1.in' }, at)
        if (!ctx.reducedMotion) {
          for (let k = 0; k < 3; k += 1) {
            const angle = (Math.PI * 2 * k) / 3 + i * 0.7
            const crumb = ctx.debris.acquire(this.options.solid)
            crumb.tint = SOIL_COLOR
            crumb.position.set(center.x, center.y)
            crumb.setSize(layout.symbolSize * 0.1)
            crumb.visible = false
            debris.push(crumb)
            timeline.set(crumb, { visible: true }, at)
            timeline.to(
              crumb,
              {
                x: center.x + Math.cos(angle) * layout.symbolSize * 0.45,
                y: center.y + Math.sin(angle) * layout.symbolSize * 0.45 + layout.symbolSize * 0.2,
                alpha: 0,
                rotation: angle,
                duration: openDur * 1.5,
                ease: 'power2.out',
              },
              at,
            )
          }
        }
        const seed = newSeedByCell.get(cellKey(reel, row))
        if (seed !== undefined) {
          const badge = this.createBadge(seed)
          badge.icon.scale.set(0)
          badge.label.scale.set(0)
          badge.icon.alpha = 0
          badge.label.alpha = 0
          timeline.set([badge.icon, badge.label], { alpha: 1 }, at + openDur * 0.5)
          timeline.to(badge.icon.scale, { x: badge.iconBase, y: badge.iconBase, duration: 0.2, ease: 'back.out(2.4)' }, at + openDur * 0.5)
          timeline.to(badge.label.scale, { x: badge.labelBase, y: badge.labelBase, duration: 0.2, ease: 'back.out(2.4)' }, at + openDur * 0.6)
        }
      })
    }

    let released = false
    return {
      compress: (ms: number): void => {
        if (released) return
        const remaining = (timeline.duration() - timeline.time()) * 1000
        const target = Math.max(1, ms)
        const scale = remaining / target
        if (scale > timeline.timeScale()) timeline.timeScale(scale)
      },
      release: (): void => {
        if (released) return
        released = true
        timeline.kill()
        this.liveTimelines.delete(timeline)
        for (const sprite of symbols) ctx.symbols.release(sprite)
        for (const sprite of debris) ctx.debris.release(sprite)
        for (const sprite of glows) this.glows.release(sprite)
        for (const sprite of covers) this.covers.release(sprite)
        for (const text of floats) this.releaseFloat(text)
        // 트윈이 건드린 배지 상태를 서버가 확정한 값으로 되돌린다.
        this.setSeeds(step.seedsAfter)
      },
    }
  }

  // ------------------------------------------------------------- 햇살

  /** 프리스핀 8×8 햇살: 판 전체가 따뜻하게 밝아지고(사선 광택 아님) → 씨앗이 자라고 → 새 씨앗이 떨어져 심긴다. */
  playSun(
    plan: GardenSunPlan,
    bounds: GardenBounds,
    ctx: Pick<GardenStepContext, 'layout' | 'reducedMotion'>,
    onComplete: () => void,
  ): GardenFxHandle {
    const { layout } = ctx
    const pitch = cellPitch(layout)
    const s = (ms: number): number => ms / 1000
    const total = plan.durationMs
    const timeline = gsap.timeline({ onComplete })
    this.liveTimelines.add(timeline)
    timeline.to({}, { duration: s(total) }, 0)

    const wash = this.glows.acquire(this.options.solid)
    wash.tint = SUN_COLOR
    wash.blendMode = 'add'
    const spanX = reelLeft(layout, bounds.x + bounds.size - 1) + layout.symbolSize - reelLeft(layout, bounds.x)
    const spanY = rowTop(layout, bounds.y + bounds.size - 1) + layout.symbolSize - rowTop(layout, bounds.y)
    wash.setSize(spanX + pitch, spanY + pitch)
    wash.position.set(reelLeft(layout, bounds.x) + spanX / 2, rowTop(layout, bounds.y) + spanY / 2)
    wash.alpha = 0
    timeline.to(wash, { alpha: 0.34, duration: s(total * 0.3), ease: 'sine.out' }, 0)
    timeline.to(wash, { alpha: 0, duration: s(total * 0.45), ease: 'sine.in' }, s(total * 0.3))

    // 이미 있던 씨앗이 한 등급 오른다.
    const grownKeys: number[] = []
    for (const seed of plan.before) {
      const grown = plan.grownSeeds.find((other) => other.reel === seed.reel && other.row === seed.row)
      if (grown === undefined || grown.tier <= seed.tier) continue
      const key = cellKey(seed.reel, seed.row)
      const badge = this.badges.get(key)
      if (badge === undefined) continue
      grownKeys.push(key)
      const at = s(total * 0.25)
      timeline.to(badge.icon.scale, { x: badge.iconBase * 1.4, y: badge.iconBase * 1.4, duration: s(total * 0.12), ease: 'sine.out', yoyo: true, repeat: 1 }, at)
      timeline.to(badge.label.scale, { x: badge.labelBase * 1.25, y: badge.labelBase * 1.25, duration: s(total * 0.12), ease: 'sine.out', yoyo: true, repeat: 1 }, at)
      timeline.call(() => this.setBadgeTier(key, grown.tier), [], at + s(total * 0.12))
    }

    // 새 씨앗이 위에서 떨어져 심긴다.
    plan.planted.forEach((seed, i) => {
      const badge = this.createBadge(seed)
      const iconY = badge.icon.y
      const labelY = badge.label.y
      badge.icon.alpha = 0
      badge.label.alpha = 0
      const at = s(total * 0.5) + i * 0.06
      const fall = s(total * 0.3)
      timeline.set([badge.icon, badge.label], { alpha: 1 }, at)
      timeline.fromTo(badge.icon, { y: iconY - layout.symbolSize * 0.8 }, { y: iconY, duration: fall, ease: 'bounce.out' }, at)
      timeline.fromTo(badge.label, { y: labelY - layout.symbolSize * 0.8 }, { y: labelY, duration: fall, ease: 'bounce.out' }, at)
    })

    let released = false
    return {
      compress: (ms: number): void => {
        if (released) return
        const remaining = (timeline.duration() - timeline.time()) * 1000
        const scale = remaining / Math.max(1, ms)
        if (scale > timeline.timeScale()) timeline.timeScale(scale)
      },
      release: (): void => {
        if (released) return
        released = true
        timeline.kill()
        this.liveTimelines.delete(timeline)
        this.glows.release(wash)
        this.setSeeds(plan.after)
      },
    }
  }

  // ------------------------------------------------------------- 수명

  /** 진단: 지금 쓰는 스프라이트 수와 살아 있는 타임라인 수. 스핀이 끝나면 `liveTweens`는 0이어야 한다. */
  get stats(): { covers: number; badges: number; glows: number; liveTweens: number; seeds: number } {
    return {
      covers: this.covers.live,
      badges: this.badgeSprites.live,
      glows: this.glows.live,
      liveTweens: this.liveTimelines.size,
      seeds: this.badges.size,
    }
  }

  /** 장면 위쪽 판독용: 활성 판 안 스캐터 수(기대감 판정이 같은 규칙을 쓴다). */
  static scatterCount(grid: readonly (readonly SymbolId[])[], bounds: GardenBounds, symbol: SymbolId): number {
    return gardenScatterCount(grid, bounds, symbol)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const timeline of this.liveTimelines) timeline.kill()
    this.liveTimelines.clear()
    for (const key of [...this.badges.keys()]) this.removeBadge(key)
    this.covers.clear()
    this.badgeSprites.clear()
    this.glows.clear()
    for (const node of this.floatTexts) {
      node.removeFromParent()
      node.destroy()
    }
    this.floatTexts.length = 0
    this.floatFree.length = 0
    this.plates.removeFromParent()
    this.plates.destroy()
    for (const layer of [this.glowLayer, this.coverLayer, this.badgeLayer, this.floatLayer]) {
      layer.removeFromParent()
      layer.destroy()
    }
  }
}
