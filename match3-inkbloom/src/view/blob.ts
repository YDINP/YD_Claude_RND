import { partsOf } from '../core/color'
import { Rng } from '../core/rng'
import { BRUSH, KIND_BUCKET, KIND_COL, KIND_ROW, colorOf, kindOf } from '../core/types'
import { blotPath, shapePath } from './paper'

export const PIECE_PALETTE = ['#c8432b', '#e2b13c', '#2f5d8a', '#e07a2e', '#5a8f4a', '#7a4f8f'] as const
export const FLOOR_PALETTE = PIECE_PALETTE
export const FX_PALETTE = [...PIECE_PALETTE, '#2a2623'] as const
export const FX_INK = PIECE_PALETTE.length
export const STAIN_ALPHA = [0.85, 0.8, 0.85, 0.85, 0.85, 0.85] as const
export const fxColor = (piece: number): number => (piece === BRUSH ? FX_INK : colorOf(piece))

const POINTS = 24
const INK_SOFT = 'rgba(42,38,35,0.55)'
const AMP = [0.045, 0.03, 0.02] as const
const OMEGA = [1.3, 1.9, 2.6] as const
const XS = new Float32Array(POINTS)
const YS = new Float32Array(POINTS)

export function wobblePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, phase: number, t: number, squash = 1): void {
  for (let i = 0; i < POINTS; i++) {
    const th = (i / POINTS) * Math.PI * 2
    let k = 1
    for (let j = 0; j < 3; j++) k += AMP[j]! * Math.sin((j + 2) * th + phase * (j + 2) + t * OMEGA[j]!)
    const rad = r * k
    XS[i] = cx + Math.cos(th) * rad * squash
    YS[i] = cy + Math.sin(th) * rad / squash
  }
  ctx.beginPath()
  ctx.moveTo((XS[0]! + XS[POINTS - 1]!) / 2, (YS[0]! + YS[POINTS - 1]!) / 2)
  for (let i = 0; i < POINTS; i++) {
    const n = (i + 1) % POINTS
    ctx.quadraticCurveTo(XS[i]!, YS[i]!, (XS[i]! + XS[n]!) / 2, (YS[i]! + YS[n]!) / 2)
  }
  ctx.closePath()
}

export function tone(hex: string, k: number, a = 1): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number): number => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))
  return `rgba(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)},${a})`
}

function makeHalo(color: number, size: number, r: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = Math.ceil(size * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2 + r * 0.06)
  blotPath(ctx, new Rng(color * 7 + 1), r * 1.17, 28, 0.04)
  ctx.fillStyle = tone(PIECE_PALETTE[color]!, 0, 0.17)
  ctx.fill()
  return cv
}

function makeOverlay(color: number, size: number, r: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = Math.ceil(size * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = tone(PIECE_PALETTE[color]!, 0.58, 0.9)
  const parts = partsOf(color)
  if (parts) {
    const s = r * 0.27
    for (const [k, part] of [[-1, parts[0]], [1, parts[1]]] as const) {
      ctx.save()
      ctx.translate(k * s * 0.95, 0)
      ctx.beginPath()
      shapePath(ctx, part, s)
      ctx.fill()
      ctx.restore()
    }
  } else {
    ctx.beginPath()
    shapePath(ctx, color, r * 0.4)
    ctx.fill()
  }
  ctx.save()
  ctx.translate(-r * 0.36, -r * 0.42)
  ctx.rotate(-0.65)
  ctx.fillStyle = 'rgba(255,253,245,0.55)'
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.15, r * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  return cv
}

function makeBrush(size: number, r: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = Math.ceil(size * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = '#fbf5e6'
  ctx.strokeStyle = 'rgba(42,38,35,0.35)'
  ctx.lineWidth = Math.max(1, r * 0.05)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#2a2623'
  const R = r * 0.6
  for (let i = 0; i < 40; i++) {
    const a0 = 0.5 + (i / 40) * 5.4
    const a1 = 0.5 + ((i + 1.2) / 40) * 5.4
    ctx.lineWidth = r * (0.08 + 0.32 * Math.sin((i / 40) * Math.PI) ** 0.7)
    ctx.beginPath()
    ctx.arc(0, 0, R, a0, a1)
    ctx.stroke()
  }
  ctx.fillStyle = '#c23a20'
  ctx.beginPath()
  ctx.roundRect(R * 0.62, R * 0.55, r * 0.3, r * 0.3, r * 0.05)
  ctx.fill()
  return cv
}

export class BlobSprites {
  readonly r: number
  readonly size: number
  private halos: HTMLCanvasElement[]
  private overlays: HTMLCanvasElement[]
  private bodies: CanvasGradient[]
  private rims: string[]
  private brush: HTMLCanvasElement

  constructor(cell: number, dpr: number, ctx: CanvasRenderingContext2D) {
    this.r = cell * 0.31
    this.size = Math.ceil(cell * 1.05)
    const r = this.r
    this.halos = PIECE_PALETTE.map((_, i) => makeHalo(i, this.size, r, dpr))
    this.overlays = PIECE_PALETTE.map((_, i) => makeOverlay(i, this.size, r, dpr))
    this.bodies = PIECE_PALETTE.map((hex) => {
      const g = ctx.createRadialGradient(-r * 0.28, -r * 0.32, 0, 0, 0, r * 1.06)
      g.addColorStop(0, tone(hex, 0.2, 0.9))
      g.addColorStop(0.55, tone(hex, 0, 0.92))
      g.addColorStop(0.86, tone(hex, -0.18, 0.96))
      g.addColorStop(1, tone(hex, -0.34, 0.98))
      return g
    })
    this.rims = PIECE_PALETTE.map((hex) => tone(hex, -0.45, 0.55))
    this.brush = makeBrush(this.size, r, dpr)
  }

  draw(ctx: CanvasRenderingContext2D, piece: number, cx: number, cy: number, scale: number, phase: number, t: number, sq = 1, alpha = 1): void {
    if (scale <= 0.01 || alpha <= 0.01) return
    const h = this.size * scale
    ctx.globalAlpha = alpha
    if (piece === BRUSH) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.6 + phase)
      ctx.scale(scale, scale)
      ctx.drawImage(this.brush, -this.size / 2, -this.size / 2, this.size, this.size)
      ctx.restore()
      ctx.globalAlpha = 1
      return
    }
    const color = colorOf(piece)
    const kind = kindOf(piece)
    ctx.drawImage(this.halos[color]!, cx - h / 2, cy - h / 2, h, h)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    if (kind === KIND_BUCKET) this.bucketRing(ctx, color, phase, t, sq)
    wobblePath(ctx, 0, 0, this.r, phase, t, sq)
    ctx.fillStyle = this.bodies[color]!
    ctx.fill()
    ctx.strokeStyle = this.rims[color]!
    ctx.lineWidth = Math.max(0.8, this.r * 0.05)
    ctx.stroke()
    if (kind === KIND_ROW || kind === KIND_COL) this.stripes(ctx, kind === KIND_ROW)
    ctx.restore()
    ctx.drawImage(this.overlays[color]!, cx - h / 2, cy - h / 2, h, h)
    ctx.globalAlpha = 1
  }

  private stripes(ctx: CanvasRenderingContext2D, horiz: boolean): void {
    const r = this.r
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgba(255,251,240,0.62)'
    for (const k of [-0.62, 0.62]) {
      if (horiz) ctx.fillRect(-r * 1.2, k * r - r * 0.09, r * 2.4, r * 0.18)
      else ctx.fillRect(k * r - r * 0.09, -r * 1.2, r * 0.18, r * 2.4)
    }
    ctx.restore()
    ctx.fillStyle = INK_SOFT
    const a = r * 1.22
    const w = r * 0.2
    ctx.beginPath()
    if (horiz) {
      ctx.moveTo(-a - w, 0); ctx.lineTo(-a, -w); ctx.lineTo(-a, w)
      ctx.moveTo(a + w, 0); ctx.lineTo(a, -w); ctx.lineTo(a, w)
    } else {
      ctx.moveTo(0, -a - w); ctx.lineTo(-w, -a); ctx.lineTo(w, -a)
      ctx.moveTo(0, a + w); ctx.lineTo(-w, a); ctx.lineTo(w, a)
    }
    ctx.fill()
  }

  private bucketRing(ctx: CanvasRenderingContext2D, color: number, phase: number, t: number, sq: number): void {
    wobblePath(ctx, 0, 0, this.r * 1.3, phase + 2, t * 0.7, sq)
    ctx.strokeStyle = this.rims[color]!
    ctx.lineWidth = Math.max(1.5, this.r * 0.13)
    ctx.setLineDash([this.r * 0.32, this.r * 0.18])
    ctx.stroke()
    ctx.setLineDash([])
  }
}
