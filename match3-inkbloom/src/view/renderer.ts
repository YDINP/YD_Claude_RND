import { N, W } from '../core/constants'
import { Rng } from '../core/rng'
import { BlobSprites, PALETTE, STAIN_ALPHA, wobblePath } from './blob'
import type { Director } from './director'
import type { Layout } from './layout'
import { makePaperTile, makeStainStamps, STAMP_VARIANTS, tornEdge, tracePoly, type Pt } from './paper'
import { ease } from './tween'

const INK = '#2a2623'
const TEXT_STEPS = 6

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
    this.stamps = makeStainStamps(l.cell, l.dpr, PALETTE, STAIN_ALPHA)
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
      if (c >= 0) paintCell(ctx, this.stamps, m, m, l.cell, i, c, 1)
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
      ctx.globalAlpha = Math.min(1, p * 2.2)
      paintCell(ctx, this.stamps, l.ox, l.oy, l.cell, b.cell, b.color, 0.35 + 0.65 * ease.outQuart(p))
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

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
    ctx.restore()

    dir.particles.draw(ctx, l.ox, l.oy, l.cell, PALETTE)
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
      ctx.strokeStyle = PALETTE[s.color]!
      ctx.lineWidth = l.cell * (0.7 - p * 0.45)
      ctx.beginPath()
      ctx.moveTo(Math.max(l.ox, x - reach), y)
      ctx.lineTo(Math.min(l.ox + l.size, x + reach), y)
      if (s.cross) {
        ctx.moveTo(x, Math.max(l.oy, y - reach))
        ctx.lineTo(x, Math.min(l.oy + l.size, y + reach))
      }
      ctx.stroke()
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
      const x = Math.min(l.ox + l.size - l.cell * 1.5, Math.max(l.ox + l.cell * 1.5, l.ox + tx.x * l.cell))
      const y = l.oy + (tx.y - (dir.reduced ? 0 : ease.outCubic(p) * 0.7)) * l.cell
      const pop = dir.reduced ? 1 : p < 0.18 ? 0.7 + 0.3 * ease.outBack(p / 0.18) : 1
      ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3
      ctx.font = this.fonts[Math.min(TEXT_STEPS - 1, tx.step)]!
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
