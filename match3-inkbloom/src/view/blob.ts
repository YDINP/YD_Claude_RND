import { Rng } from '../core/rng'
import { BRUSH } from '../core/types'
import { blotPath } from './paper'

export const PALETTE = ['#d9482b', '#2f5d8a', '#e0a82e', '#3f8f7a', '#2a2623'] as const
export const STAIN_ALPHA = [0.85, 0.85, 0.85, 0.85, 0.55] as const

const POINTS = 24
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

function stampPath(ctx: CanvasRenderingContext2D, color: number, s: number): void {
  switch (color) {
    case 0:
      ctx.arc(0, 0, s, 0, Math.PI * 2)
      break
    case 1:
      ctx.roundRect(-s * 0.85, -s * 0.85, s * 1.7, s * 1.7, s * 0.14)
      break
    case 2:
      ctx.moveTo(0, -s)
      ctx.lineTo(s * 0.98, s * 0.72)
      ctx.lineTo(-s * 0.98, s * 0.72)
      ctx.closePath()
      break
    case 3:
      ctx.moveTo(0, -s * 1.08)
      ctx.lineTo(s * 0.86, 0)
      ctx.lineTo(0, s * 1.08)
      ctx.lineTo(-s * 0.86, 0)
      ctx.closePath()
      break
    default:
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2)
  }
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
  const a = color === 4 ? 0.13 : 0.17
  blotPath(ctx, new Rng(color * 7 + 1), r * 1.17, 28, 0.04)
  ctx.fillStyle = tone(PALETTE[color]!, 0, a)
  ctx.fill()
  return cv
}

function makeOverlay(color: number, size: number, r: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = Math.ceil(size * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.translate(size / 2, size / 2)
  const s = r * 0.4
  ctx.beginPath()
  stampPath(ctx, color, s)
  ctx.fillStyle = tone(PALETTE[color]!, color === 4 ? 0.5 : 0.58, 0.9)
  ctx.fill()
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
    this.halos = PALETTE.map((_, i) => makeHalo(i, this.size, r, dpr))
    this.overlays = PALETTE.map((_, i) => makeOverlay(i, this.size, r, dpr))
    this.bodies = PALETTE.map((hex, i) => {
      const g = ctx.createRadialGradient(-r * 0.28, -r * 0.32, 0, 0, 0, r * 1.06)
      const ink = i === 4
      g.addColorStop(0, tone(hex, ink ? 0.22 : 0.2, 0.9))
      g.addColorStop(0.55, tone(hex, 0, 0.92))
      g.addColorStop(0.86, tone(hex, ink ? -0.2 : -0.18, 0.96))
      g.addColorStop(1, tone(hex, ink ? -0.35 : -0.34, 0.98))
      return g
    })
    this.rims = PALETTE.map((hex) => tone(hex, -0.45, 0.55))
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
    ctx.drawImage(this.halos[piece]!, cx - h / 2, cy - h / 2, h, h)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    wobblePath(ctx, 0, 0, this.r, phase, t, sq)
    ctx.fillStyle = this.bodies[piece]!
    ctx.fill()
    ctx.strokeStyle = this.rims[piece]!
    ctx.lineWidth = Math.max(0.8, this.r * 0.05)
    ctx.stroke()
    ctx.restore()
    ctx.drawImage(this.overlays[piece]!, cx - h / 2, cy - h / 2, h, h)
    ctx.globalAlpha = 1
  }
}
