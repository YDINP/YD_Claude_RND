import { isSecondary } from '../core/color'
import { N, POINT_LUCKY, W } from '../core/constants'
import { orderProgress, type Game } from '../core/game'
import { Rng } from '../core/rng'
import { MUDDY, NO_FLOOR, WATER, type Cell, type ClearEvent, type Fire, type FireShape, type OrderProgress, type TurnEvent, type TurnResult } from '../core/types'
import { FLOOR_NAMES } from '../ui/names'
import { FX_PALETTE, FX_WATER, fxColor } from './blob'
import { Particles } from './particles'
import { ease, Tweens } from './tween'

export type DirState = 'idle' | 'playing' | 'win' | 'lose'
export type SfxName = 'swap' | 'bad' | 'pop' | 'brush' | 'win' | 'lose' | 'shuffle'
export interface Hooks {
  moves(n: number): void
  score(n: number): void
  order(p: OrderProgress[]): void
  sfx(name: SfxName, arg?: number): void
}

export class Sprite {
  piece = 0
  x = 0
  y = 0
  scale = 1
  phase = 0
  sq = 1
  alpha = 1
}

export interface Bleed { active: boolean; started: boolean; cell: Cell; from: number; to: number; ring: boolean; delay: number; t: number; dur: number }
export interface Streak { active: boolean; at: Cell; color: number; shape: FireShape; delay: number; t: number; dur: number }
export interface PreviewMark { cell: Cell; to: number }
export interface FloatText { active: boolean; x: number; y: number; text: string; t: number; dur: number; big: boolean; step: number }

const BLEED_MS = 560
const SPREAD_LAG_MS = 120
const STREAK_MS = 460
const TEXT_MS = 950
const FIRE_STEP_MS = 40
const POP_MS = 210
const SWAP_MS = 150
const LAND_MS = 240
const SHAKE_DECAY_MS = 70
const MIX_TEXT_LAG_MS = 260
const MIX_SFX_STEP = 4
const hitStop = (chain: number, brush: boolean): number => Math.min(150, 55 + 22 * (chain - 1) + (brush ? 30 : 0))
const fallMs = (rows: number): number => 90 + 85 * Math.sqrt(rows)
const cx = (c: Cell): number => c % W
const cy = (c: Cell): number => Math.floor(c / W)

export class Director {
  state: DirState = 'idle'
  readonly sprites: (Sprite | null)[] = new Array<Sprite | null>(N).fill(null)
  readonly viewFloor = new Int8Array(N).fill(NO_FLOOR)
  readonly hidden = new Uint8Array(N)
  preview: PreviewMark[] = []
  readonly bleeds: Bleed[] = []
  readonly streaks: Streak[] = []
  readonly texts: FloatText[] = []
  readonly particles = new Particles()
  floorVersion = 0
  selected = -1
  shake = 0
  readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  private tweens = new Tweens()
  private free: Sprite[] = []
  private rng = new Rng(2024)
  private events: TurnEvent[] = []
  private idx = 0
  private phaseT = 0
  private phaseDur = 0
  private movesShown = 0
  private scoreShown = 0

  constructor(private game: Game, private hooks: Hooks) {
    this.reset()
  }

  reset(): void {
    this.tweens.clear()
    this.particles.clear()
    this.bleeds.length = this.streaks.length = this.texts.length = 0
    for (let i = 0; i < N; i++) this.drop(i)
    this.viewFloor.set(this.game.floor)
    this.hidden.fill(0)
    this.preview = []
    this.floorVersion++
    this.movesShown = this.game.movesLeft
    this.scoreShown = this.game.score
    this.state = this.game.status === 'playing' ? 'idle' : this.game.status
    this.selected = -1
    for (let i = 0; i < N; i++) {
      const s = this.spawn(this.game.pieces[i]!, i)
      if (this.reduced) {
        s.alpha = 0
        this.tweens.add(200, 0, ease.linear, (p) => (s.alpha = p))
        continue
      }
      s.scale = 0
      this.tweens.add(320, (cx(i) + cy(i)) * 26, ease.outBack, (p) => (s.scale = p))
    }
    this.hooks.moves(this.movesShown)
    this.hooks.score(this.scoreShown)
    this.hooks.order(this.viewProgress())
  }

  play(res: TurnResult): void {
    if (res.events.length === 0 || this.state !== 'idle') return
    this.events = res.events
    this.idx = -1
    this.state = 'playing'
    this.next()
  }

  update(dt: number, _t: number): void {
    this.tweens.update(dt)
    this.particles.update(dt)
    this.updateEffects(dt)
    if (this.shake > 0) this.shake = this.shake < 0.002 ? 0 : this.shake * Math.exp(-dt / SHAKE_DECAY_MS)
    if (this.state === 'playing') {
      this.phaseT += dt
      if (this.phaseT >= this.phaseDur) this.next()
    }
  }

  private viewProgress(): OrderProgress[] {
    return orderProgress(this.viewFloor, this.game.order)
  }

  private spawn(piece: number, cell: Cell, y = cy(cell)): Sprite {
    const s = this.free.pop() ?? new Sprite()
    s.piece = piece
    s.x = cx(cell)
    s.y = y
    s.scale = 1
    s.sq = 1
    s.alpha = 1
    s.phase = this.rng.next() * 6.28
    this.sprites[cell] = s
    return s
  }

  private drop(cell: Cell): void {
    const s = this.sprites[cell]
    if (s) this.free.push(s)
    this.sprites[cell] = null
  }

  private move(s: Sprite, tx: number, ty: number, dur: number, delay: number, e = ease.outCubic, done?: () => void): void {
    const fx = s.x
    const fy = s.y
    this.tweens.add(dur, delay, e, (p) => {
      s.x = fx + (tx - fx) * p
      s.y = fy + (ty - fy) * p
    }, done)
  }

  private fallTo(s: Sprite, cell: Cell, rows: number, delay: number): number {
    if (this.reduced) {
      const d = 120 + 30 * rows
      this.move(s, cx(cell), cy(cell), d, delay, ease.outCubic)
      return d + delay
    }
    const d = fallMs(rows)
    const k = Math.min(1, 0.45 + rows * 0.12)
    this.move(s, cx(cell), cy(cell), d, delay, ease.inQuad, () => {
      this.tweens.add(LAND_MS, 0, ease.linear, (p) => (s.sq = 1 + 0.24 * k * Math.exp(-5 * p) * Math.cos(p * 10)), () => (s.sq = 1))
    })
    return d + delay
  }

  private kick(amount: number): void {
    if (!this.reduced) this.shake = Math.max(this.shake, amount)
  }

  private next(): void {
    this.idx++
    this.phaseT = 0
    this.phaseDur = 0
    const ev = this.events[this.idx]
    if (!ev) {
      this.state = this.game.status === 'playing' ? 'idle' : this.game.status
      if (this.state === 'win' || this.state === 'lose') this.finishFx(this.state)
      return
    }
    switch (ev.k) {
      case 'swap': return this.onSwap(ev.a, ev.b, ev.valid)
      case 'clear': return this.onClear(ev)
      case 'fall': return this.onFall(ev.moves)
      case 'refill': return this.onRefill(ev.spawns)
      case 'shuffle': return this.onShuffle(ev)
      case 'end': return this.onEnd(ev)
    }
  }

  private onSwap(a: Cell, b: Cell, valid: boolean): void {
    const sa = this.sprites[a]
    const sb = this.sprites[b]
    if (!sa || !sb) return
    this.selected = -1
    this.preview = []
    if (valid) {
      this.sprites[a] = sb
      this.sprites[b] = sa
      this.move(sa, cx(b), cy(b), SWAP_MS, 0, ease.inOutCubic)
      this.move(sb, cx(a), cy(a), SWAP_MS, 0, ease.inOutCubic)
      if (!this.reduced) {
        const horiz = cy(a) === cy(b)
        this.tweens.add(SWAP_MS, 0, ease.linear, (p) => {
          const k = Math.sin(p * Math.PI) * 0.14
          sa.sq = sb.sq = horiz ? 1 + k : 1 / (1 + k)
        }, () => (sa.sq = sb.sq = 1))
      }
      this.hooks.moves(--this.movesShown)
      this.hooks.sfx('swap')
      this.phaseDur = SWAP_MS + 10
      return
    }
    const [ax, ay, bx, by] = [sa.x, sa.y, sb.x, sb.y]
    const reach = this.reduced ? 0.15 : 0.38
    this.tweens.add(280, 0, ease.linear, (p) => {
      const k = Math.sin(ease.outCubic(p) * Math.PI) * reach
      sa.x = ax + (bx - ax) * k
      sa.y = ay + (by - ay) * k
      sb.x = bx + (ax - bx) * k
      sb.y = by + (ay - by) * k
    })
    this.hooks.sfx('bad')
    this.phaseDur = 290
  }

  private fireDelays(fires: Fire[], stop: number): Map<Cell, number> {
    const delay = new Map<Cell, number>()
    for (const f of fires) {
      const base = delay.get(f.at) ?? stop
      for (const c of f.cells) {
        const d = base + (Math.abs(cx(c) - cx(f.at)) + Math.abs(cy(c) - cy(f.at))) * FIRE_STEP_MS
        delay.set(c, Math.min(delay.get(c) ?? Infinity, d))
      }
      this.addStreak(f, base)
    }
    return delay
  }

  private addStreak(f: Fire, delay: number): void {
    const st = this.streaks.find((s) => !s.active) ?? { active: false, at: 0, color: 0, shape: 'row' as FireShape, delay: 0, t: 0, dur: 0 }
    if (!this.streaks.includes(st)) this.streaks.push(st)
    Object.assign(st, { active: true, at: f.at, color: f.color === WATER ? FX_WATER : f.color, shape: f.shape, delay, t: 0, dur: STREAK_MS })
  }

  private onClear(ev: ClearEvent): void {
    const brush = ev.fires.length > 0
    const stop = this.reduced ? 0 : hitStop(ev.chain, brush)
    const delays = this.fireDelays(ev.fires, stop)
    const splash = Math.min(16, 5 + ev.chain * 2)
    const speed = 2.2 + Math.min(1.6, ev.chain * 0.3)
    let end = stop
    for (const cell of ev.cleared) {
      const s = this.sprites[cell]
      const d = delays.get(cell) ?? stop
      end = Math.max(end, d + POP_MS)
      if (!s) continue
      this.sprites[cell] = null
      const color = fxColor(s.piece)
      if (stop > 0 && d === stop) this.tweens.add(stop, 0, ease.outCubic, (p) => (s.scale = 1 + 0.2 * p))
      this.tweens.add(POP_MS, d, ease.outCubic, (p) => {
        s.scale = this.reduced ? 1 : 1.2 + 0.35 * p
        s.alpha = 1 - p
      }, () => this.free.push(s))
      if (!this.reduced) this.tweens.add(1, d, ease.linear, () => {}, () => this.particles.burst(cx(cell) + 0.5, cy(cell) + 0.5, color, splash, speed, () => this.rng.next()))
    }
    for (const c of ev.created) {
      const s = this.sprites[c.cell]
      if (!s) continue
      s.piece = c.piece
      s.scale = 0.4
      this.tweens.add(340, stop + 120, ease.outBack, (p) => (s.scale = 0.4 + 0.6 * p))
      end = Math.max(end, stop + 460)
    }
    let bleedEnd = 0
    const mixed: Cell[] = []
    const muddy: Cell[] = []
    for (const st of ev.stains) {
      if (st.from === st.to && st.to === NO_FLOOR) continue
      const delay = (delays.get(st.cell) ?? stop) + (st.src === 'spread' ? SPREAD_LAG_MS : 30)
      const changed = st.from !== NO_FLOOR && st.from !== st.to
      this.addBleed(st.cell, st.from, st.to, changed, delay)
      bleedEnd = Math.max(bleedEnd, delay + BLEED_MS)
      if (isSecondary(st.to) && changed) mixed.push(st.cell)
      if (st.to === MUDDY && st.from !== MUDDY) muddy.push(st.cell)
    }
    this.hooks.score((this.scoreShown += ev.points))
    this.tweens.add(1, stop, ease.linear, () => {}, () => {
      this.kick(Math.min(0.14, 0.03 + 0.025 * (ev.chain - 1) + (brush ? 0.05 : 0)))
      this.floatText(ev)
      this.hooks.sfx(brush ? 'brush' : 'pop', ev.chain)
    })
    if (mixed.length > 0 || muddy.length > 0) {
      const targets = new Map(ev.stains.map((st) => [st.cell, st.to]))
      this.tweens.add(1, stop + MIX_TEXT_LAG_MS, ease.linear, () => {}, () => this.mixFx(ev, mixed, muddy, targets))
    }
    this.phaseDur = Math.max(300, end + 50, bleedEnd * 0.55)
  }

  private mixFx(ev: ClearEvent, mixed: Cell[], muddy: Cell[], targets: Map<Cell, number>): void {
    const cells = mixed.length > 0 ? mixed : muddy
    let sx = 0
    let sy = 0
    for (const c of cells) {
      sx += cx(c) + 0.5
      sy += cy(c) + 0.5
    }
    const x = sx / cells.length
    const y = sy / cells.length - 0.9
    if (mixed.length === 0) {
      this.pushText(x, y, '탁해졌어요', false, 0)
      return
    }
    const kinds = new Set(mixed.map((c) => targets.get(c)!))
    if (!this.reduced) for (const c of mixed) this.particles.burst(cx(c) + 0.5, cy(c) + 0.5, targets.get(c)!, 4, 1.6, () => this.rng.next())
    const name = kinds.size === 1 ? FLOOR_NAMES[[...kinds][0]!] : ''
    if (ev.lucky > 0) this.pushText(x, y, `우연히 섞였다! +${Math.floor((ev.lucky * POINT_LUCKY * (ev.chain + 1)) / 2)}`, true, 3)
    else this.pushText(x, y, name ? `섞였다! ${name}` : '섞였다!', true, 1)
    this.hooks.sfx('pop', ev.chain + MIX_SFX_STEP)
  }

  private addBleed(cell: Cell, from: number, to: number, ring: boolean, delay: number): void {
    const b = this.bleeds.find((x) => !x.active) ?? { active: false, started: false, cell: 0, from: 0, to: 0, ring: false, delay: 0, t: 0, dur: 0 }
    if (!this.bleeds.includes(b)) this.bleeds.push(b)
    Object.assign(b, { active: true, started: false, cell, from, to, ring, delay, t: 0, dur: BLEED_MS })
  }

  private floatText(ev: ClearEvent): void {
    if (ev.points <= 0 || ev.cleared.length === 0) return
    let sx = 0
    let sy = 0
    for (const c of ev.cleared) {
      sx += cx(c) + 0.5
      sy += cy(c) + 0.5
    }
    const n = ev.cleared.length
    this.pushText(sx / n, sy / n, ev.chain > 1 ? `연쇄 x${ev.chain}  +${ev.points}` : `+${ev.points}`, ev.chain > 1, ev.chain - 1)
  }

  private pushText(x: number, y: number, text: string, big: boolean, step = 2): void {
    const t = this.texts.find((v) => !v.active) ?? { active: false, x: 0, y: 0, text: '', t: 0, dur: 0, big: false, step: 0 }
    if (!this.texts.includes(t)) this.texts.push(t)
    Object.assign(t, { active: true, x, y, text, t: 0, dur: TEXT_MS, big, step })
  }

  private onFall(moves: { from: Cell; to: Cell }[]): void {
    let maxDur = 0
    for (const m of moves) {
      const s = this.sprites[m.from]
      if (!s) continue
      this.sprites[m.from] = null
      this.sprites[m.to] = s
      maxDur = Math.max(maxDur, this.fallTo(s, m.to, cy(m.to) - cy(m.from), 0))
    }
    this.phaseDur = maxDur * 0.75
  }

  private onRefill(spawns: { cell: Cell; piece: number; rowsAbove: number }[]): void {
    let maxDur = 0
    for (const sp of spawns) {
      const s = this.spawn(sp.piece, sp.cell, cy(sp.cell) - sp.rowsAbove)
      maxDur = Math.max(maxDur, this.fallTo(s, sp.cell, sp.rowsAbove, cx(sp.cell) * 12))
    }
    this.phaseDur = maxDur * 0.9
  }

  private onShuffle(ev: Extract<TurnEvent, { k: 'shuffle' }>): void {
    this.hooks.sfx('shuffle')
    this.pushText(W / 2, W / 2, '섞었어요', true)
    if (ev.recolor || ev.moves.length === 0) {
      this.rebuildSprites(true)
      this.phaseDur = 500
      return
    }
    const old = [...this.sprites]
    for (const m of ev.moves) {
      const s = old[m.from]
      if (!s) continue
      this.sprites[m.to] = s
      this.move(s, cx(m.to), cy(m.to), 480, 0, ease.inOutQuad)
    }
    this.phaseDur = 500
  }

  private rebuildSprites(pop: boolean): void {
    for (let i = 0; i < N; i++) this.drop(i)
    for (let i = 0; i < N; i++) {
      const s = this.spawn(this.game.pieces[i]!, i)
      if (!pop) continue
      s.scale = 0
      this.tweens.add(300, cx(i) * 18, ease.outBack, (p) => (s.scale = p))
    }
  }

  private onEnd(ev: Extract<TurnEvent, { k: 'end' }>): void {
    if (ev.bonus > 0) {
      this.hooks.score((this.scoreShown += ev.bonus))
      this.pushText(W / 2, W / 2, `남은 이동 보너스 +${ev.bonus}`, true)
    }
    this.verify()
    this.phaseDur = ev.result === 'continue' ? 0 : 200
  }

  private verify(): void {
    if (!import.meta.env.DEV) return
    let bad = false
    for (let i = 0; i < N; i++) if (this.sprites[i]?.piece !== this.game.pieces[i]) bad = true
    for (const b of this.bleeds) if (b.active) b.delay = 0, b.t = b.dur
    this.updateEffects(0)
    this.hidden.fill(0)
    for (let i = 0; i < N; i++) if (this.viewFloor[i] !== this.game.floor[i]) bad = true
    if (!bad) return
    console.warn('[inkbloom] 화면과 core 상태가 어긋나 재동기화합니다', this.game.snapshot())
    this.rebuildSprites(false)
    this.viewFloor.set(this.game.floor)
    this.hidden.fill(0)
    this.floorVersion++
    this.hooks.order(this.viewProgress())
  }

  private finishFx(result: 'win' | 'lose'): void {
    this.hooks.sfx(result)
    if (result !== 'win') return
    for (let k = 0; k < 40; k++) {
      this.particles.burst(this.rng.next() * W, this.rng.next() * W, this.rng.int(FX_PALETTE.length), 1, 3.2, () => this.rng.next())
    }
  }

  private updateEffects(dt: number): void {
    let changed = false
    for (const b of this.bleeds) {
      if (!b.active) continue
      if (b.delay > 0) {
        b.delay -= dt
        continue
      }
      if (!b.started) {
        b.started = true
        this.commitOthers(b)
        this.hidden[b.cell] = 1
        changed = true
      }
      b.t += dt
      if (b.t >= b.dur) {
        b.active = false
        this.viewFloor[b.cell] = b.to
        this.hidden[b.cell] = 0
        changed = true
      }
    }
    if (changed) {
      this.floorVersion++
      this.hooks.order(this.viewProgress())
    }
    for (const s of this.streaks) {
      if (!s.active) continue
      if (s.delay > 0) s.delay -= dt
      else if ((s.t += dt) >= s.dur) s.active = false
    }
    for (const t of this.texts) if (t.active && (t.t += dt) >= t.dur) t.active = false
  }

  private commitOthers(b: Bleed): void {
    for (const o of this.bleeds) {
      if (o === b || !o.active || !o.started || o.cell !== b.cell) continue
      o.active = false
      this.viewFloor[o.cell] = o.to
    }
  }

  dispose(): void {
    this.tweens.clear()
  }
}
