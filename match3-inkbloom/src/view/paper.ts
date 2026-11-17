import { Rng } from '../core/rng'

export const PAPER = '#efe6d2'
const TILE = 256

export interface Pt { x: number; y: number }

export function makePaperTile(seed = 11): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = TILE
  const ctx = cv.getContext('2d')!
  const rng = new Rng(seed)
  const img = ctx.createImageData(TILE, TILE)
  const phase = [rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28]
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const u = (x / TILE) * Math.PI * 2
      const v = (y / TILE) * Math.PI * 2
      const blotch = Math.sin(u * 2 + phase[0]!) * Math.sin(v * 3 + phase[1]!) + Math.sin(u * 5 + v * 4 + phase[2]!) * 0.5
      const n = (rng.next() - 0.5) * 12 + blotch * 3
      const i = (y * TILE + x) * 4
      img.data[i] = 239 + n
      img.data[i + 1] = 230 + n
      img.data[i + 2] = 210 + n * 1.2
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.lineCap = 'round'
  for (let f = 0; f < 70; f++) {
    const x = rng.next() * TILE
    const y = rng.next() * TILE
    const len = 8 + rng.next() * 26
    const ang = rng.next() * Math.PI * 2
    const bend = (rng.next() - 0.5) * 12
    ctx.strokeStyle = rng.next() < 0.5 ? 'rgba(255,252,240,0.45)' : 'rgba(120,96,60,0.12)'
    ctx.lineWidth = 0.6 + rng.next() * 0.6
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        ctx.beginPath()
        ctx.moveTo(x + dx, y + dy)
        ctx.quadraticCurveTo(x + dx + Math.cos(ang) * len * 0.5 + bend, y + dy + Math.sin(ang) * len * 0.5 - bend, x + dx + Math.cos(ang) * len, y + dy + Math.sin(ang) * len)
        ctx.stroke()
      }
    }
  }
  return cv
}

export function tornEdge(seed: number, x: number, y: number, w: number, h: number, amp: number, step: number): Pt[] {
  const rng = new Rng(seed)
  const pts: Pt[] = []
  const wave = (i: number, ph: number): number => Math.sin(i * 0.7 + ph) * 0.5 + Math.sin(i * 1.9 + ph * 2) * 0.3 + (rng.next() - 0.5) * 0.8
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(2, Math.round(len / step))
    const ph = rng.next() * 6.28
    for (let i = 0; i < n; i++) {
      const t = i / n
      const o = wave(i, ph) * amp
      pts.push({ x: x0 + (x1 - x0) * t + nx * o, y: y0 + (y1 - y0) * t + ny * o })
    }
  }
  edge(x, y, x + w, y, 0, -1)
  edge(x + w, y, x + w, y + h, 1, 0)
  edge(x + w, y + h, x, y + h, 0, 1)
  edge(x, y + h, x, y, -1, 0)
  return pts
}

export function tracePoly(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

export const STAMP_VARIANTS = 4

export function shapePath(ctx: CanvasRenderingContext2D, shape: number, s: number): void {
  switch (shape) {
    case 0:
      ctx.arc(0, 0, s, 0, Math.PI * 2)
      break
    case 1:
      ctx.moveTo(0, -s * 1.05)
      ctx.lineTo(s * 1.02, s * 0.75)
      ctx.lineTo(-s * 1.02, s * 0.75)
      ctx.closePath()
      break
    case 2:
      ctx.roundRect(-s * 0.85, -s * 0.85, s * 1.7, s * 1.7, s * 0.14)
      break
    default:
      ctx.moveTo(0, -s * 1.15)
      ctx.bezierCurveTo(s * 0.35, -s * 0.6, s * 0.92, -s * 0.05, s * 0.92, s * 0.32)
      ctx.arc(0, s * 0.32, s * 0.92, 0, Math.PI)
      ctx.bezierCurveTo(-s * 0.92, -s * 0.05, -s * 0.35, -s * 0.6, 0, -s * 1.15)
      ctx.closePath()
  }
}

export function blotPath(ctx: CanvasRenderingContext2D, rng: Rng, R: number, n: number, rough: number): void {
  const ph = [rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28]
  ctx.beginPath()
  let px = 0
  let py = 0
  let fx = 0
  let fy = 0
  for (let i = 0; i <= n; i++) {
    const th = (i % n) / n * Math.PI * 2
    const k = 1 + 0.07 * Math.sin(2 * th + ph[0]!) + 0.05 * Math.sin(3 * th + ph[1]!) + 0.035 * Math.sin(5 * th + ph[2]!) + 0.02 * Math.sin(9 * th + ph[3]!) + (i === n ? 0 : (rng.next() - 0.5) * rough)
    const x = Math.cos(th) * R * k
    const y = Math.sin(th) * R * k
    if (i === 0) {
      fx = x
      fy = y
      ctx.moveTo(x, y)
    } else if (i === n) {
      ctx.quadraticCurveTo(px, py, fx, fy)
    } else {
      ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2)
    }
    px = x
    py = y
  }
  ctx.closePath()
}

export function makeStainStamps(cell: number, dpr: number, colors: readonly string[], alphas: readonly number[]): HTMLCanvasElement[][] {
  const size = cell * 2
  const R = cell * 0.66
  return colors.map((hex, ci) => {
    const n = parseInt(hex.slice(1), 16)
    const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`
    const A = alphas[ci]! / 0.85
    const out: HTMLCanvasElement[] = []
    for (let v = 0; v < STAMP_VARIANTS; v++) {
      const rng = new Rng(ci * 131 + v * 17 + 3)
      const cv = document.createElement('canvas')
      cv.width = cv.height = Math.ceil(size * dpr)
      const ctx = cv.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.translate(size / 2, size / 2)

      const bloom = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.42)
      bloom.addColorStop(0, `rgba(${rgb},${0.2 * A})`)
      bloom.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = bloom
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.42, 0, Math.PI * 2)
      ctx.fill()

      blotPath(ctx, rng, R, 48, 0.05)
      const body = ctx.createRadialGradient(R * 0.12, -R * 0.1, 0, 0, 0, R * 1.08)
      body.addColorStop(0, `rgba(${rgb},${0.4 * A})`)
      body.addColorStop(0.7, `rgba(${rgb},${0.5 * A})`)
      body.addColorStop(0.93, `rgba(${rgb},${0.58 * A})`)
      body.addColorStop(1, `rgba(${rgb},${0.46 * A})`)
      ctx.fillStyle = body
      ctx.fill()
      ctx.strokeStyle = `rgba(${rgb},${0.2 * A})`
      ctx.lineWidth = cell * 0.018
      ctx.stroke()

      ctx.globalCompositeOperation = 'destination-out'
      for (let k = 0; k < 3; k++) {
        const x = (rng.next() - 0.5) * R
        const y = (rng.next() - 0.5) * R
        const rr = R * (0.25 + rng.next() * 0.3)
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
        g.addColorStop(0, 'rgba(0,0,0,0.3)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      ctx.lineCap = 'round'
      for (let k = 0; k < 12; k++) {
        const th = rng.next() * Math.PI * 2
        const r0 = R * (0.92 + rng.next() * 0.06)
        const len = cell * (0.03 + rng.next() * 0.09)
        const bend = (rng.next() - 0.5) * 0.5
        ctx.strokeStyle = `rgba(${rgb},${(0.1 + rng.next() * 0.14) * A})`
        ctx.lineWidth = 0.5 + rng.next() * 0.7
        ctx.beginPath()
        ctx.moveTo(Math.cos(th) * r0, Math.sin(th) * r0)
        ctx.quadraticCurveTo(Math.cos(th + bend * 0.2) * (r0 + len * 0.5), Math.sin(th + bend * 0.2) * (r0 + len * 0.5), Math.cos(th + bend * 0.35) * (r0 + len), Math.sin(th + bend * 0.35) * (r0 + len))
        ctx.stroke()
      }

      for (let k = 0; k < 70; k++) {
        const th = rng.next() * Math.PI * 2
        const rr = Math.sqrt(rng.next()) * R * 0.9
        ctx.fillStyle = `rgba(${rgb},${(0.08 + rng.next() * 0.14) * A})`
        ctx.beginPath()
        ctx.arc(Math.cos(th) * rr, Math.sin(th) * rr, 0.4 + rng.next() * 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
      out.push(cv)
    }
    return out
  })
}
