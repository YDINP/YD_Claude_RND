import { N, W } from '../core/constants'
import { Rng } from '../core/rng'
import { BLUE, MUDDY, NO_FLOOR, RED, YELLOW } from '../core/types'
import { isSecondary } from '../core/color'
import { BlobSprites, FLOOR_PALETTE, FX_PALETTE, STAIN_ALPHA, tone, wobblePath } from './blob'
import type { Director } from './director'
import type { Layout } from './layout'
import { makePaperTile, makeStainStamps, shapePath, STAMP_VARIANTS, tornEdge, tracePoly, type Pt } from './paper'
import { ease } from './tween'

const INK = '#2a2623'
const PAPER_HI = '#faf4e4'
const TEXT_STEPS = 6
const MIX_PARTS: Record<number, [number, number]> = { 3: [RED, YELLOW], 4: [YELLOW, BLUE], 5: [RED, BLUE] }

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, color: number): void {
  const s = cell * 0.075
  ctx.save()
  ctx.translate(x - cell * 0.31, y - cell * 0.31)
  ctx.lineWidth = Math.max(0.8, cell * 0.018)
  ctx.strokeStyle = tone(FLOOR_PALETTE[color]!, -0.5, 0.55)
  ctx.fillStyle = ctx.strokeStyle
  if (isSecondary(color)) {
    const [a, b] = MIX_PARTS[color]!
    ctx.beginPath()
    ctx.translate(-s * 0.45, 0)
    shapePath(ctx, a, s)
    ctx.stroke()
    ctx.beginPath()
    ctx.translate(s * 0.9, s * 0.2)
    shapePath(ctx, b, s)
    ctx.stroke()
  } else if (color === MUDDY) {
    for (const [dx, dy, r] of [[-0.6, -0.3, 0.32], [0.5, -0.5, 0.24], [0.1, 0.55, 0.36], [0.9, 0.4, 0.2]] as const) {
      ctx.beginPath()
      ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function paintCell(ctx: CanvasRenderingContext2D, stamps: HTMLCanvasElement[][], bx: number, by: number, cell: number, idx: number, color: number, k: number): void {
  if (k <= 0.01) return
  const h = ((idx + 1) * 2654435761) >>> 0
  const img = stamps[color]![(h >>> 3) % STAMP_VARIANTS]!
  const x = bx + (idx % W) * cell + cell / 2 + (((h >>> 8) & 15) - 7.5) * cell * 0.012
  const y = by + Math.floor(idx / W) * cell + cell / 2 + (((h >>> 12) & 15) - 7.5) * cell * 0.012
  const s = cell * 2 * k * (0.94 + ((h >>> 16) & 7) * 0.02)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(((h >>> 19) & 63) * 0.0997)
  ctx.drawImage(img, -s / 2, -s / 2, s, s)
  ctx.restore()
}

export class Renderer {
  private tile = makePaperTile()
  private staticLayer = document.createElement('canvas')
  private floorLayer = document.createElement('canvas')
  private floorVer = -1
  private blobs: BlobSprites | null = null
  private stamps: HTMLCanvasElement[][] = []
  private fonts: string[] = []
  private l: Layout | null = null
  private sheet: Pt[] = []

  constructor(private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D) {}

  resize(l: Layout): void {
    this.l = l
    this.canvas.width = Math.round(l.w * l.dpr)
    this.canvas.height = Math.round(l.h * l.dpr)
    this.canvas.style.width = `${l.w}px`
    this.canvas.style.height = `${l.h}px`
    this.blobs = new BlobSprites(l.cell, l.dpr, this.ctx)
    this.stamps = makeStainStamps(l.cell, l.dpr, FLOOR_PALETTE, STAIN_ALPHA)
    this.fonts.length = 0
    for (let i = 0; i < TEXT_STEPS; i++) this.fonts.push(`700 ${Math.round(l.cell * (0.34 + i * 0.06))}px "Noto Serif KR","Nanum Myeongjo",serif`)
    this.floorLayer.width = this.floorLayer.height = Math.round((l.size + l.cell) * l.dpr)
    this.floorVer = -1
    this.buildStatic(l)
  }

  private buildStatic(l: Layout): void {
    const cv = this.staticLayer
    cv.width = Math.round(l.w * l.dpr)
    cv.height = Math.round(l.h * l.dpr)
    const ctx = cv.getContext('2d')!
    ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0)
    const pat = ctx.createPattern(this.tile, 'repeat')!

    const pad = l.cell * 0.22
    const poly = (this.sheet = tornEdge(7, l.ox - pad, l.oy - pad, l.size + pad * 2, l.size + pad * 2, l.cell * 0.07, l.cell * 0.2))
    ctx.save()
    ctx.shadowColor = 'rgba(70,45,20,0.28)'
    ctx.shadowBlur = l.cell * 0.35
    ctx.shadowOffsetY = l.cell * 0.08
    tracePoly(ctx, poly)
    ctx.fillStyle = '#faf4e4'
    ctx.fill()
    ctx.restore()
    tracePoly(ctx, poly)
    ctx.globalAlpha = 0.45
    ctx.fillStyle = pat
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(150,120,80,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()

    const rng = new Rng(31)
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(42,38,35,0.26)'
    ctx.lineWidth = Math.max(1, l.cell * 0.025)
    const arm = l.cell * 0.09
    for (let i = 0; i <= W; i++) {
      for (let j = 0; j <= W; j++) {
        const x = l.ox + i * l.cell + (rng.next() - 0.5) * 1.2
        const y = l.oy + j * l.cell + (rng.next() - 0.5) * 1.2
        ctx.globalAlpha = i === 0 || j === 0 || i === W || j === W ? 0.7 : 1
        ctx.beginPath()
        ctx.moveTo(x - (i === 0 ? 0 : arm), y)
        ctx.lineTo(x + (i === W ? 0 : arm), y)
        ctx.moveTo(x, y - (j === 0 ? 0 : arm))
        ctx.lineTo(x, y + (j === W ? 0 : arm))
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  private bakeFloor(dir: Director, l: Layout): void {
    const ctx = this.floorLayer.getContext('2d')!
    const m = l.cell / 2
    ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0)
    ctx.clearRect(0, 0, l.size + l.cell, l.size + l.cell)
    for (let i = 0; i < N; i++) {
      const c = dir.viewFloor[i]!
      if (c >= 0 && !dir.hidden[i]) paintCell(ctx, this.stamps, m, m, l.cell, i, c, 1)
    }
    for (let i = 0; i < N; i++) {
      const c = dir.viewFloor[i]!
      if (c >= 3 && !dir.hidden[i]) drawMark(ctx, m + ((i % W) + 0.5) * l.cell, m + (Math.floor(i / W) + 0.5) * l.cell, l.cell, c)
    }
    this.floorVer = dir.floorVersion
  }

  draw(dir: Director, t: number): void {
    const l = this.l
    const blobs = this.blobs
    if (!l || !blobs) return
    const ctx = this.ctx
    const tt = dir.reduced ? 0 : t
    if (this.floorVer !== dir.floorVersion) this.bakeFloor(dir, l)
    const sx = dir.shake * l.cell * Math.sin(t * 71)
    const sy = dir.shake * l.cell * Math.cos(t * 59) * 0.7
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.staticLayer, sx * l.dpr, sy * l.dpr)
    ctx.setTransform(l.dpr, 0, 0, l.dpr, sx * l.dpr, sy * l.dpr)

    ctx.save()
    tracePoly(ctx, this.sheet)
    ctx.clip()
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(this.floorLayer, l.ox - l.cell / 2, l.oy - l.cell / 2, l.size + l.cell, l.size + l.cell)
    for (const b of dir.bleeds) {
      if (!b.active || b.delay > 0) continue
      const p = Math.min(1, b.t / b.dur)
      if (b.from >= 0) {
        ctx.globalAlpha = 1 - ease.outCubic(p)
        paintCell(ctx, this.stamps, l.ox, l.oy, l.cell, b.cell, b.from, 1)
      }
      if (b.to >= 0) {
        ctx.globalAlpha = Math.min(1, p * 2.2)
        paintCell(ctx, this.stamps, l.ox, l.oy, l.cell, b.cell, b.to, (b.from >= 0 ? 0.2 : 0.35) + (b.from >= 0 ? 0.8 : 0.65) * ease.outQuart(p))
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    this.drawRipples(ctx, dir, l)

    this.drawStreaks(ctx, dir, l)

    for (const s of dir.sprites) {
      if (!s || s.scale <= 0) continue
      const px = l.ox + (s.x + 0.5) * l.cell
      const py = l.oy + (s.y + 0.5) * l.cell + blobs.r * s.scale * (1 - 1 / s.sq)
      const sel = dir.sprites[dir.selected] === s
      const pulse = sel ? 1.1 + Math.sin(t * 8) * 0.035 : 1
      blobs.draw(ctx, s.piece, px, py, s.scale * pulse, s.phase, tt, s.sq, s.alpha)
      if (sel) {
        wobblePath(ctx, px, py, blobs.r * 1.42, s.phase + 1, t * 1.5)
        ctx.strokeStyle = INK
        ctx.lineWidth = Math.max(1.5, l.cell * 0.04)
        ctx.stroke()
      }
    }
    this.drawPreview(ctx, dir, l, t)
    ctx.restore()

    dir.particles.draw(ctx, l.ox, l.oy, l.cell, FX_PALETTE)
    this.drawTexts(ctx, dir, l)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  private drawStreaks(ctx: CanvasRenderingContext2D, dir: Director, l: Layout): void {
    ctx.lineCap = 'round'
    for (const s of dir.streaks) {
      if (!s.active || s.delay > 0) continue
      const p = Math.min(1, s.t / s.dur)
      const reach = ease.outQuart(p) * W * l.cell
      const x = l.ox + ((s.at % W) + 0.5) * l.cell
      const y = l.oy + (Math.floor(s.at / W) + 0.5) * l.cell
      ctx.globalAlpha = 0.6 * (1 - p * p)
      ctx.strokeStyle = FX_PALETTE[s.color]!
      ctx.lineWidth = l.cell * (0.7 - p * 0.45)
      ctx.beginPath()
      if (s.shape === 'box') {
        const half = l.cell * (0.5 + ease.outQuart(p) * 1)
        ctx.lineWidth = l.cell * (0.4 - p * 0.3)
        ctx.roundRect(x - half, y - half, half * 2, half * 2, l.cell * 0.3)
      }
      if (s.shape === 'row' || s.shape === 'cross') {
        ctx.moveTo(Math.max(l.ox, x - reach), y)
        ctx.lineTo(Math.min(l.ox + l.size, x + reach), y)
      }
      if (s.shape === 'col' || s.shape === 'cross') {
        ctx.moveTo(x, Math.max(l.oy, y - reach))
        ctx.lineTo(x, Math.min(l.oy + l.size, y + reach))
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private drawRipples(ctx: CanvasRenderingContext2D, dir: Director, l: Layout): void {
    for (const b of dir.bleeds) {
      if (!b.active || b.delay > 0 || !b.ring) continue
      const p = Math.min(1, b.t / b.dur)
      const x = l.ox + ((b.cell % W) + 0.5) * l.cell
      const y = l.oy + (Math.floor(b.cell / W) + 0.5) * l.cell
      ctx.globalAlpha = 0.75 * (1 - p)
      ctx.strokeStyle = b.to >= 0 ? FLOOR_PALETTE[b.to]! : FX_PALETTE[FX_PALETTE.length - 1]!
      ctx.lineWidth = l.cell * 0.06 * (1 - p) + 1
      wobblePath(ctx, x, y, l.cell * (0.25 + 0.3 * ease.outCubic(p)), b.cell, p * 3)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private drawPreview(ctx: CanvasRenderingContext2D, dir: Director, l: Layout, t: number): void {
    if (dir.preview.length === 0) return
    const r = l.cell * 0.11
    ctx.globalAlpha = 0.82 + 0.18 * Math.sin(t * 5)
    ctx.lineWidth = Math.max(1, l.cell * 0.025)
    for (const pv of dir.preview) {
      const x = l.ox + ((pv.cell % W) + 0.82) * l.cell
      const y = l.oy + (Math.floor(pv.cell / W) + 0.82) * l.cell
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = pv.to === NO_FLOOR ? PAPER_HI : FLOOR_PALETTE[pv.to]!
      ctx.fill()
      ctx.strokeStyle = INK
      if (pv.to === NO_FLOOR) ctx.setLineDash([r * 0.5, r * 0.35])
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.globalAlpha = 1
  }

  private drawTexts(ctx: CanvasRenderingContext2D, dir: Director, l: Layout): void {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const tx of dir.texts) {
      if (!tx.active) continue
      const p = tx.t / tx.dur
      ctx.font = this.fonts[Math.min(TEXT_STEPS - 1, tx.step)]!
      const half = Math.min(l.size / 2, ctx.measureText(tx.text).width / 2 + l.cell * 0.15)
      const x = Math.min(l.ox + l.size - half, Math.max(l.ox + half, l.ox + tx.x * l.cell))
      const y = l.oy + (tx.y - (dir.reduced ? 0 : ease.outCubic(p) * 0.7)) * l.cell
      const pop = dir.reduced ? 1 : p < 0.18 ? 0.7 + 0.3 * ease.outBack(p / 0.18) : 1
      ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(pop, pop)
      ctx.lineWidth = 4
      ctx.strokeStyle = '#faf4e4'
      ctx.strokeText(tx.text, 0, 0)
      ctx.fillStyle = tx.big ? '#b8321a' : INK
      ctx.fillText(tx.text, 0, 0)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }
}
