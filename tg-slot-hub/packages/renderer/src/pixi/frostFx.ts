import { Container, Sprite, type Texture } from 'pixi.js'
import { gsap } from 'gsap'
import type { GridPosition, SymbolId } from '@tgslot/slot-engine'
import { DIM_ALPHA } from '../constants.js'
import { symbolCenter, type Layout } from '../layout.js'
import type { TextureRegistry } from '../textureRegistry.js'
import type { ParticlePool } from './particles.js'
import { createCanvasTexture } from './textures.js'

/**
 * 얼림(얼려 두기 프리스핀) 화면 효과. 전부 코드 드로잉이라 그림 에셋이 없어도 동작한다.
 *
 * - 얼음 덮개: 얼린 칸 위에 앉는 반투명 청백 판(스프라이트 풀, 최대 칸 수).
 * - 칸 회전: 얼지 않은 칸만 심볼이 빠르게 바뀌며 돌고 차례로 서서 자리를 잡는다(칸 스프라이트 그대로 쓴다).
 * - 쩡 파편, 녹음(아래로 부서짐), 오로라 커튼(세로 막대), 궁전 완성 번쩍임.
 *
 * 메모리: 텍스처 3장(덮개·파편·오로라 막대)은 `TextureRegistry`가 소유해 렌더러가 내려갈 때 함께 파괴된다.
 * 스프라이트는 칸 수만큼만 만들어 돌려 쓰고, 파편은 공용 `ParticlePool`을 빌려 쓰고 반드시 돌려준다.
 * 모든 트윈은 `track`을 지나 `clear`·`destroy`가 한꺼번에 끊는다.
 */

const CAP_TEXTURE_PX = 128
const SHARD_TEXTURE_PX = 32
const AURORA_BAR_COUNT = 7
/** 한 칸이 얼 때 터지는 파편 수. */
const SHARDS_PER_CELL = 5
/** 칸 회전에서 심볼이 바뀌는 간격(ms). */
const ROLL_SWAP_MS = 70
/** 얼지 않은 칸을 눌러 두는 밝기. 다시 뽑힌 칸이 다른 그림 줄을 우연히 만들어도 당첨처럼 읽히지 않게 한다. */
export const FROST_DIM_ALPHA = Math.max(DIM_ALPHA, 0.6)
/** STOP 압축 때 남은 트윈을 몰아가는 배속. */
const COMPRESS_TIME_SCALE = 10

/** 결정이 늘 같게 그려지도록 쓰는 작은 난수. */
function hash(a: number, b: number): number {
  let x = (a * 374761393 + b * 668265263) | 0
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295
}

function paintCap(ctx: CanvasRenderingContext2D, size: number): void {
  const pad = size * 0.04
  const r = size * 0.16
  const x0 = pad
  const y0 = pad
  const w = size - pad * 2
  ctx.clearRect(0, 0, size, size)
  const path = (): void => {
    ctx.beginPath()
    ctx.moveTo(x0 + r, y0)
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + w, r)
    ctx.arcTo(x0 + w, y0 + w, x0, y0 + w, r)
    ctx.arcTo(x0, y0 + w, x0, y0, r)
    ctx.arcTo(x0, y0, x0 + w, y0, r)
    ctx.closePath()
  }
  // 얼음 몸통: 가운데가 밝은 방사형(사선 광택 없음).
  const body = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72)
  body.addColorStop(0, 'rgba(235, 249, 255, 0.34)')
  body.addColorStop(0.6, 'rgba(150, 214, 245, 0.42)')
  body.addColorStop(1, 'rgba(96, 170, 226, 0.6)')
  path()
  ctx.fillStyle = body
  ctx.fill()
  // 서리 테두리.
  path()
  ctx.lineWidth = size * 0.045
  ctx.strokeStyle = 'rgba(244, 252, 255, 0.95)'
  ctx.stroke()
  path()
  ctx.lineWidth = size * 0.012
  ctx.strokeStyle = 'rgba(80, 160, 220, 0.9)'
  ctx.stroke()
  // 네 모서리에서 자라 들어오는 결정 가지.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineCap = 'round'
  const corners: [number, number, number, number][] = [
    [x0, y0, 1, 1],
    [x0 + w, y0, -1, 1],
    [x0, y0 + w, 1, -1],
    [x0 + w, y0 + w, -1, -1],
  ]
  corners.forEach(([cx, cy, dx, dy], index) => {
    for (let i = 0; i < 3; i += 1) {
      const angle = (0.15 + 0.35 * i + 0.1 * hash(index, i)) * (Math.PI / 2)
      const len = size * (0.16 + 0.1 * hash(index + 7, i))
      const ex = cx + dx * Math.cos(angle) * len
      const ey = cy + dy * Math.sin(angle) * len
      ctx.lineWidth = size * 0.014
      ctx.beginPath()
      ctx.moveTo(cx + dx * size * 0.03, cy + dy * size * 0.03)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      const mx = (cx + ex) / 2
      const my = (cy + ey) / 2
      ctx.lineWidth = size * 0.009
      ctx.beginPath()
      ctx.moveTo(mx, my)
      ctx.lineTo(mx + dx * size * 0.05, my + dy * size * 0.012)
      ctx.moveTo(mx, my)
      ctx.lineTo(mx + dx * size * 0.012, my + dy * size * 0.05)
      ctx.stroke()
    }
  })
  // 작은 반짝점.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath()
    ctx.arc(size * (0.25 + 0.5 * hash(3, i)), size * (0.25 + 0.5 * hash(5, i)), size * 0.012, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintShard(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.04)
  ctx.lineTo(size * 0.86, size * 0.62)
  ctx.lineTo(size * 0.5, size * 0.96)
  ctx.lineTo(size * 0.14, size * 0.62)
  ctx.closePath()
  const g = ctx.createLinearGradient(size * 0.5, 0, size * 0.5, size)
  g.addColorStop(0, 'rgba(255,255,255,0.98)')
  g.addColorStop(1, 'rgba(150,216,248,0.9)')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.stroke()
}

function paintAuroraBar(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(120, 255, 220, 0.0)')
  g.addColorStop(0.12, 'rgba(70, 240, 205, 0.55)')
  g.addColorStop(0.55, 'rgba(140, 110, 255, 0.28)')
  g.addColorStop(1, 'rgba(255, 143, 199, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export interface FrostCellAccess {
  view: Container
  sprite: Sprite
}

export interface FrostSceneDeps {
  /** 얼음 덮개가 사는 층(콘텐츠 좌표). */
  layer: Container
  /** 오로라 막대가 사는 층(캔버스 좌표, 프레임 위). */
  topLayer: Container
  /** 칸 스프라이트 접근. 판 밖이거나 없으면 null. */
  cell: (reel: number, row: number) => FrostCellAccess | null
  /** 칸 그림을 바로 바꾼다(회전 프레임·착지). 크기도 맞춘다. */
  setSymbol: (reel: number, row: number, symbol: SymbolId) => void
  getLayout: () => Layout
  getCanvas: () => { width: number; height: number }
  /** 칸 회전에서 지나갈 심볼(릴별 `respinStrips`의 고유 심볼). */
  fillers: readonly (readonly SymbolId[])[]
  particles: ParticlePool
  registry: TextureRegistry
  reducedMotion: boolean
}

interface Cap {
  sprite: Sprite
  reel: number
  row: number
}

const keyOf = (reel: number, row: number): string => `${reel}:${row}`

export class FrostScene {
  private readonly capTexture: Texture
  private readonly shardTexture: Texture
  private readonly auroraTexture: Texture
  private readonly caps = new Map<string, Cap>()
  private readonly freeCaps: Sprite[] = []
  private readonly bars: Sprite[] = []
  private readonly tweens = new Set<gsap.core.Tween | gsap.core.Timeline>()
  private readonly dimmed = new Set<string>()
  private fast = false
  private destroyed = false
  private shardSets = new Set<ReturnType<ParticlePool['acquire']>>()

  constructor(private readonly deps: FrostSceneDeps) {
    this.capTexture = createCanvasTexture(CAP_TEXTURE_PX, CAP_TEXTURE_PX, (ctx, w) => paintCap(ctx, w), deps.registry)
    this.shardTexture = createCanvasTexture(SHARD_TEXTURE_PX, SHARD_TEXTURE_PX, (ctx, w) => paintShard(ctx, w), deps.registry)
    this.auroraTexture = createCanvasTexture(16, 128, (ctx, w, h) => paintAuroraBar(ctx, w, h), deps.registry)
  }

  // ------------------------------------------------------------ 보조

  private track<T extends gsap.core.Tween | gsap.core.Timeline>(tween: T): T {
    this.tweens.add(tween)
    if (this.fast) tween.timeScale(COMPRESS_TIME_SCALE)
    return tween
  }

  private untrack(tween: gsap.core.Tween | gsap.core.Timeline): void {
    this.tweens.delete(tween)
  }

  /** 트윈 하나를 돌리고 끝나면 풀린다. 끊기면(clear) 그 자리에서 풀린다. */
  private run(vars: gsap.TweenVars, target: object): Promise<void> {
    return new Promise((resolve) => {
      let tween: gsap.core.Tween | null = null
      const done = (): void => {
        if (tween !== null) this.untrack(tween)
        resolve()
      }
      tween = this.track(gsap.to(target, { ...vars, onComplete: done, onInterrupt: done }))
    })
  }

  /** 지금 도는 것과 앞으로 만들 것을 모두 빠르게 몰아간다(STOP). 결과는 그대로다. */
  compress(): void {
    this.fast = true
    for (const tween of this.tweens) tween.timeScale(COMPRESS_TIME_SCALE)
  }

  private capSize(): number {
    return this.deps.getLayout().symbolSize
  }

  /** 얼음 덮개 위치·크기를 레이아웃에 다시 맞춘다(리사이즈). */
  layout(): void {
    const size = this.capSize()
    for (const cap of this.caps.values()) {
      const c = symbolCenter(this.deps.getLayout(), cap.reel, cap.row)
      cap.sprite.position.set(c.x, c.y)
      cap.sprite.width = size
      cap.sprite.height = size
    }
  }

  // ------------------------------------------------------------ 칸 밝기

  /** 얼지 않은 칸을 눌러 둔다. `frozen`에 든 칸은 그대로 밝다. */
  dimExcept(cells: readonly GridPosition[], frozen: ReadonlySet<string>): void {
    for (const [reel, row] of cells) {
      const access = this.deps.cell(reel, row)
      if (access === null) continue
      const key = keyOf(reel, row)
      if (frozen.has(key)) {
        access.view.alpha = 1
        this.dimmed.delete(key)
      } else {
        access.view.alpha = FROST_DIM_ALPHA
        this.dimmed.add(key)
      }
    }
  }

  /** 눌러 둔 칸을 모두 되돌린다. */
  undim(): void {
    for (const key of this.dimmed) {
      const [reel, row] = key.split(':').map(Number) as [number, number]
      const access = this.deps.cell(reel, row)
      if (access !== null) access.view.alpha = 1
    }
    this.dimmed.clear()
  }

  // ------------------------------------------------------------ 대상 강조

  /** 대상 칸이 한 번 빛난다(키우고 되돌림). 정적·얼음은 호출 쪽이 이어 붙인다. */
  async glow(cells: readonly GridPosition[], ms: number): Promise<void> {
    if (this.deps.reducedMotion || ms <= 0) return
    const state = { t: 0 }
    const views = cells.map(([reel, row]) => this.deps.cell(reel, row)).filter((a): a is FrostCellAccess => a !== null)
    const apply = (): void => {
      const lift = Math.sin(Math.PI * state.t)
      for (const access of views) {
        const scale = 1 + 0.16 * lift
        access.view.scale.set(scale)
        access.sprite.tint = lift > 0.05 ? mixToWhite(lift) : 0xffffff
      }
    }
    await this.run({ t: 1, duration: ms / 1000, ease: 'sine.inOut', onUpdate: apply }, state)
    for (const access of views) {
      access.view.scale.set(1)
      access.sprite.tint = 0xffffff
    }
  }

  // ------------------------------------------------------------ 얼음 덮개

  private takeCap(reel: number, row: number): Cap {
    const key = keyOf(reel, row)
    const existing = this.caps.get(key)
    if (existing !== undefined) return existing
    const sprite = this.freeCaps.pop() ?? this.deps.layer.addChild(new Sprite(this.capTexture))
    sprite.texture = this.capTexture
    sprite.anchor.set(0.5)
    sprite.visible = true
    sprite.alpha = 1
    sprite.rotation = 0
    const cap: Cap = { sprite, reel, row }
    this.caps.set(key, cap)
    const c = symbolCenter(this.deps.getLayout(), reel, row)
    sprite.position.set(c.x, c.y)
    sprite.width = this.capSize()
    sprite.height = this.capSize()
    return cap
  }

  private giveCap(key: string): void {
    const cap = this.caps.get(key)
    if (cap === undefined) return
    cap.sprite.visible = false
    this.freeCaps.push(cap.sprite)
    this.caps.delete(key)
  }

  isFrozen(reel: number, row: number): boolean {
    return this.caps.has(keyOf(reel, row))
  }

  frozenKeys(): ReadonlySet<string> {
    return new Set(this.caps.keys())
  }

  /**
   * 칸들을 얼린다. 칸마다 `staggerMs`씩 늦게 «쩡» 하고 덮개가 앉고 파편이 튄다.
   * 모션 축소는 덮개만 곧장 놓는다.
   */
  async freeze(cells: readonly GridPosition[], popMs: number, staggerMs: number): Promise<void> {
    const reduced = this.deps.reducedMotion
    const pending: Promise<void>[] = []
    cells.forEach(([reel, row], index) => {
      if (this.isFrozen(reel, row)) return
      const cap = this.takeCap(reel, row)
      if (reduced || popMs <= 0) return
      const size = this.capSize()
      cap.sprite.alpha = 0
      cap.sprite.width = size * 1.35
      cap.sprite.height = size * 1.35
      const state = { t: 0 }
      pending.push(
        this.run(
          {
            t: 1,
            duration: popMs / 1000,
            delay: (index * staggerMs) / 1000,
            ease: 'back.out(2)',
            onStart: () => this.burst(reel, row),
            onUpdate: () => {
              const k = 1.35 - 0.35 * state.t
              cap.sprite.alpha = Math.min(1, state.t * 1.8)
              cap.sprite.width = size * k
              cap.sprite.height = size * k
            },
          },
          state,
        ).then(() => {
          cap.sprite.alpha = 1
          cap.sprite.width = size
          cap.sprite.height = size
        }),
      )
    })
    await Promise.all(pending)
  }

  /** 칸 하나에서 파편이 튄다. 공용 파티클 풀을 빌려 쓰고 끝나면 돌려준다. */
  private burst(reel: number, row: number): void {
    if (this.deps.reducedMotion || this.destroyed) return
    const sprites = this.deps.particles.acquire(SHARDS_PER_CELL, this.shardTexture)
    if (sprites.length === 0) return
    this.shardSets.add(sprites)
    const c = symbolCenter(this.deps.getLayout(), reel, row)
    const size = this.capSize()
    const state = { t: 0 }
    const seeds = sprites.map((_, i) => ({
      angle: (i / sprites.length) * Math.PI * 2 + hash(reel * 7 + row, i) * 0.9,
      dist: size * (0.45 + 0.4 * hash(i, reel + row)),
      scale: 0.35 + 0.35 * hash(row + 3, i + reel),
    }))
    sprites.forEach((s, i) => {
      const seed = seeds[i]
      if (seed === undefined) return
      s.position.set(c.x, c.y)
      s.alpha = 1
      s.scale.set(seed.scale * (size / 80))
      s.rotation = seed.angle
    })
    void this.run(
      {
        t: 1,
        duration: 0.42,
        ease: 'power2.out',
        onUpdate: () => {
          sprites.forEach((s, i) => {
            const seed = seeds[i]
            if (seed === undefined) return
            s.position.set(c.x + Math.cos(seed.angle) * seed.dist * state.t, c.y + Math.sin(seed.angle) * seed.dist * state.t + 14 * state.t * state.t)
            s.alpha = 1 - state.t
            s.rotation = seed.angle + state.t * 2
          })
        },
      },
      state,
    ).then(() => this.releaseShards(sprites))
  }

  private releaseShards(sprites: ReturnType<ParticlePool['acquire']>): void {
    if (!this.shardSets.delete(sprites)) return
    this.deps.particles.release(sprites)
  }

  // ------------------------------------------------------------ 칸 회전

  /**
   * 얼지 않은 칸만 회전한다. 칸마다 `landed`에 정해진 새 심볼로 선다. 판 밖 칸은 호출 쪽이 거른다.
   * 심볼이 `ROLL_SWAP_MS`마다 바뀌며 위아래로 떨리고(회전), 정해진 시각에 차례로 서며 살짝 부푼다.
   */
  async roll(cells: readonly { reel: number; row: number; symbol: SymbolId }[], ms: number): Promise<void> {
    const land = (): void => {
      for (const c of cells) this.deps.setSymbol(c.reel, c.row, c.symbol)
    }
    if (this.deps.reducedMotion || ms <= 0 || cells.length === 0) {
      land()
      return
    }
    const size = this.capSize()
    const ordered = cells.map((c, i) => ({ ...c, stopAt: 0.5 + 0.42 * (i / Math.max(1, cells.length - 1)) }))
    const state = { t: 0 }
    const landedSet = new Set<number>()
    const onUpdate = (): void => {
      const elapsed = state.t * ms
      const frame = Math.floor(elapsed / ROLL_SWAP_MS)
      ordered.forEach((c, i) => {
        const access = this.deps.cell(c.reel, c.row)
        if (access === null) return
        if (state.t < c.stopAt) {
          const list = this.deps.fillers[c.reel]
          if (list !== undefined && list.length > 0) {
            const filler = list[(frame * 3 + c.reel * 5 + c.row * 7) % list.length]
            if (filler !== undefined) this.deps.setSymbol(c.reel, c.row, filler)
          }
          access.sprite.y = Math.sin(elapsed / 28 + i) * size * 0.08
          access.sprite.scale.y = access.sprite.scale.x * 1.12
          return
        }
        if (!landedSet.has(i)) {
          landedSet.add(i)
          this.deps.setSymbol(c.reel, c.row, c.symbol)
          access.sprite.scale.y = access.sprite.scale.x
        }
        const since = Math.min(1, (state.t - c.stopAt) / 0.14)
        access.sprite.y = 0
        access.view.scale.set(1 + 0.12 * Math.sin(Math.PI * since))
      })
    }
    await this.run({ t: 1, duration: ms / 1000, ease: 'none', onUpdate }, state)
    land()
    for (const c of cells) {
      const access = this.deps.cell(c.reel, c.row)
      if (access === null) continue
      access.sprite.y = 0
      access.sprite.scale.y = access.sprite.scale.x
      access.view.scale.set(1)
    }
  }

  // ------------------------------------------------------------ 끝 연출

  /** 판 전체가 번쩍인다(궁전 완성). */
  async palace(ms: number): Promise<void> {
    if (this.deps.reducedMotion || ms <= 0) return
    const state = { t: 0 }
    const size = this.capSize()
    await this.run(
      {
        t: 1,
        duration: ms / 1000,
        ease: 'sine.inOut',
        onUpdate: () => {
          const pulse = Math.sin(Math.PI * state.t)
          for (const cap of this.caps.values()) {
            cap.sprite.tint = mixToWhite(pulse)
            const k = size * (1 + 0.06 * pulse)
            cap.sprite.width = k
            cap.sprite.height = k
          }
        },
      },
      state,
    )
    for (const cap of this.caps.values()) {
      cap.sprite.tint = 0xffffff
      cap.sprite.width = size
      cap.sprite.height = size
    }
  }

  /** 위쪽 가장자리에서 세로 빛 막대가 물결친다(오로라 상승). 사선이 아니라 세로 커튼이다. */
  async aurora(ms: number): Promise<void> {
    if (this.deps.reducedMotion || ms <= 0 || this.destroyed) return
    const { width, height } = this.deps.getCanvas()
    const barW = width / AURORA_BAR_COUNT
    while (this.bars.length < AURORA_BAR_COUNT) {
      const bar = this.deps.topLayer.addChild(new Sprite(this.auroraTexture))
      bar.visible = false
      this.bars.push(bar)
    }
    this.bars.forEach((bar, i) => {
      bar.visible = true
      bar.anchor.set(0.5, 0)
      bar.position.set(barW * (i + 0.5), 0)
      bar.width = barW * 1.05
      bar.height = height * 0.5
      bar.alpha = 0
    })
    const state = { t: 0 }
    await this.run(
      {
        t: 1,
        duration: ms / 1000,
        ease: 'none',
        onUpdate: () => {
          this.bars.forEach((bar, i) => {
            const phase = state.t * 1.4 - i * 0.09
            const wave = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, phase))))
            bar.alpha = wave * 0.95
            bar.height = height * (0.32 + 0.22 * wave)
          })
        },
      },
      state,
    )
    for (const bar of this.bars) bar.visible = false
  }

  /**
   * 얼음이 아래로 부서져 사라진다. 덮개가 아래로 떨어지며 옅어지고 칸 밝기도 되돌린다.
   * 모션 축소는 곧장 걷는다.
   */
  async melt(ms: number): Promise<void> {
    const entries = [...this.caps.entries()]
    if (this.deps.reducedMotion || ms <= 0 || entries.length === 0) {
      this.clear()
      return
    }
    const size = this.capSize()
    const origin = entries.map(([, cap]) => cap.sprite.y)
    const state = { t: 0 }
    await this.run(
      {
        t: 1,
        duration: ms / 1000,
        ease: 'power2.in',
        onUpdate: () => {
          entries.forEach(([, cap], i) => {
            cap.sprite.y = (origin[i] ?? 0) + size * 0.5 * state.t
            cap.sprite.alpha = 1 - state.t
            cap.sprite.scale.y = (size / CAP_TEXTURE_PX) * (1 - 0.35 * state.t)
          })
        },
      },
      state,
    )
    this.clear()
  }

  /** 덮개·밝기·진행 중 트윈을 모두 거둔다. 풀에 빌린 파편도 돌려준다. */
  clear(): void {
    for (const tween of [...this.tweens]) tween.kill()
    this.tweens.clear()
    for (const sprites of [...this.shardSets]) this.releaseShards(sprites)
    for (const key of [...this.caps.keys()]) this.giveCap(key)
    for (const bar of this.bars) bar.visible = false
    this.undim()
    this.fast = false
  }

  /** 덮개 수(진단·테스트용). */
  get capCount(): number {
    return this.caps.size
  }

  get stats(): { caps: number; pooled: number; tweens: number; shardSets: number } {
    return { caps: this.caps.size, pooled: this.freeCaps.length, tweens: this.tweens.size, shardSets: this.shardSets.size }
  }

  destroy(): void {
    if (this.destroyed) return
    this.clear()
    this.destroyed = true
    for (const sprite of this.freeCaps) sprite.destroy()
    this.freeCaps.length = 0
    for (const bar of this.bars) bar.destroy()
    this.bars.length = 0
  }
}

/** 0(원색)~1(흰색) 틴트. */
function mixToWhite(amount: number): number {
  // 흰색을 향해 밝아지는 게 아니라 «푸른 흰빛»으로 번쩍이게 한다. 곱 틴트는 어두워지기만 하므로 원색(흰색)을 그대로 둔다.
  const v = Math.round(255 - 40 * (1 - amount))
  return (v << 16) | (v << 8) | 255
}
