import { MOVES, N, W } from '../core/constants'
import type { Game } from '../core/game'
import { Rng } from '../core/rng'
import { NO_FLOOR, type BrushFire, type Cell, type ClearEvent, type TurnEvent, type TurnResult } from '../core/types'
import { Particles } from './particles'
import { ease, Tweens } from './tween'

export type DirState = 'idle' | 'playing' | 'win' | 'lose'
export type SfxName = 'swap' | 'bad' | 'pop' | 'brush' | 'win' | 'lose' | 'shuffle'
export interface Hooks {
  moves(n: number): void
  score(n: number): void
  stained(n: number): void
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

export interface Bleed { active: boolean; cell: Cell; color: number; delay: number; t: number; dur: number; to: number }
export interface Streak { active: boolean; at: Cell; color: number; cross: boolean; delay: number; t: number; dur: number }
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
const hitStop = (chain: number, brush: boolean): number => Math.min(150, 55 + 22 * (chain - 1) + (brush ? 30 : 0))
const fallMs = (rows: number): number => 90 + 85 * Math.sqrt(rows)
const cx = (c: Cell): number => c % W
const cy = (c: Cell): number => Math.floor(c / W)

export class Director {
  state: DirState = 'idle'
  readonly sprites: (Sprite | null)[] = new Array<Sprite | null>(N).fill(null)
  readonly viewFloor = new Int8Array(N).fill(NO_FLOOR)
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
  private movesShown = MOVES
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
    this.hooks.stained(this.countStained())
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

  private countStained(): number {
    let n = 0
    for (let i = 0; i < N; i++) if (this.viewFloor[i] !== NO_FLOOR) n++
    return n
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

  private fireDelays(fires: BrushFire[], stop: number): Map<Cell, number> {
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

  private addStreak(f: BrushFire, delay: number): void {
    const st = this.streaks.find((s) => !s.active) ?? { active: false, at: 0, color: 0, cross: false, delay: 0, t: 0, dur: 0 }
    if (!this.streaks.includes(st)) this.streaks.push(st)
    Object.assign(st, { active: true, at: f.at, color: f.color, cross: f.cross, delay, t: 0, dur: STREAK_MS })
  }

  private onClear(ev: ClearEvent): void {
    const brush = ev.brushes.length > 0
    const stop = this.reduced ? 0 : hitStop(ev.chain, brush)
    const delays = this.fireDelays(ev.brushes, stop)
    const splash = Math.min(16, 5 + ev.chain * 2)
    const speed = 2.2 + Math.min(1.6, ev.chain * 0.3)
    let end = stop
    for (const cell of ev.cleared) {
      const s = this.sprites[cell]
      const d = delays.get(cell) ?? stop
      end = Math.max(end, d + POP_MS)
      if (!s) continue
      this.sprites[cell] = null
      const color = s.piece < 5 ? s.piece : 4
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
    for (const st of ev.stains) {
      const delay = (delays.get(st.cell) ?? stop) + (st.src === 'spread' ? SPREAD_LAG_MS : 30)
      this.addBleed(st.cell, st.to, delay)
      bleedEnd = Math.max(bleedEnd, delay + BLEED_MS)
    }
    this.hooks.score((this.scoreShown += ev.points))
    this.tweens.add(1, stop, ease.linear, () => {}, () => {
      this.kick(Math.min(0.14, 0.03 + 0.025 * (ev.chain - 1) + (brush ? 0.05 : 0)))
      this.floatText(ev)
      this.hooks.sfx(brush ? 'brush' : 'pop', ev.chain)
    })
    this.phaseDur = Math.max(300, end + 50, bleedEnd * 0.55)
  }

  private addBleed(cell: Cell, to: number, delay: number): void {
    const b = this.bleeds.find((x) => !x.active) ?? { active: false, cell: 0, color: 0, delay: 0, t: 0, dur: 0, to: 0 }
    if (!this.bleeds.includes(b)) this.bleeds.push(b)
    Object.assign(b, { active: true, cell, color: to, delay, t: 0, dur: BLEED_MS, to })
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
    for (let i = 0; i < N; i++) if (this.viewFloor[i] !== this.game.floor[i]) bad = true
    if (!bad) return
    console.warn('[inkbloom] 화면과 core 상태가 어긋나 재동기화합니다', this.game.snapshot())
    this.rebuildSprites(false)
    this.viewFloor.set(this.game.floor)
    this.floorVersion++
  }

  private finishFx(result: 'win' | 'lose'): void {
    this.hooks.sfx(result)
    if (result !== 'win') return
    for (let k = 0; k < 40; k++) {
      this.particles.burst(this.rng.next() * W, this.rng.next() * W, this.rng.int(5), 1, 3.2, () => this.rng.next())
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
      b.t += dt
      if (b.t >= b.dur) {
        b.active = false
        this.viewFloor[b.cell] = b.to
        changed = true
      }
    }
    if (changed) {
      this.floorVersion++
      this.hooks.stained(this.countStained())
    }
    for (const s of this.streaks) {
      if (!s.active) continue
      if (s.delay > 0) s.delay -= dt
      else if ((s.t += dt) >= s.dur) s.active = false
    }
    for (const t of this.texts) if (t.active && (t.t += dt) >= t.dur) t.active = false
  }

  dispose(): void {
    this.tweens.clear()
  }
}
