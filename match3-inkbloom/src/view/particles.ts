const CAP = 256

export class Particles {
  private x = new Float32Array(CAP)
  private y = new Float32Array(CAP)
  private vx = new Float32Array(CAP)
  private vy = new Float32Array(CAP)
  private life = new Float32Array(CAP)
  private max = new Float32Array(CAP)
  private size = new Float32Array(CAP)
  private col = new Uint8Array(CAP)
  private head = 0

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number): void {
    const i = this.head
    this.head = (this.head + 1) % CAP
    this.x[i] = x
    this.y[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.life[i] = this.max[i] = life
    this.size[i] = size
    this.col[i] = color
  }

  burst(x: number, y: number, color: number, count: number, speed: number, rnd: () => number): void {
    for (let k = 0; k < count; k++) {
      const a = rnd() * Math.PI * 2
      const s = speed * (0.4 + rnd() * 0.8)
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.3, 380 + rnd() * 280, 0.05 + rnd() * 0.09, color)
    }
  }

  update(dt: number): void {
    const s = dt / 1000
    for (let i = 0; i < CAP; i++) {
      if (this.life[i]! <= 0) continue
      this.life[i]! -= dt
      this.x[i]! += this.vx[i]! * s
      this.y[i]! += this.vy[i]! * s
      this.vy[i]! += 5.5 * s
      this.vx[i]! *= 0.985
    }
  }

  clear(): void {
    this.life.fill(0)
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, cell: number, colors: readonly string[]): void {
    for (let i = 0; i < CAP; i++) {
      const l = this.life[i]!
      if (l <= 0) continue
      const k = l / this.max[i]!
      ctx.globalAlpha = Math.min(1, k * 1.6)
      ctx.fillStyle = colors[this.col[i]!]!
      ctx.beginPath()
      ctx.arc(ox + this.x[i]! * cell, oy + this.y[i]! * cell, this.size[i]! * cell * (0.4 + k * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}
