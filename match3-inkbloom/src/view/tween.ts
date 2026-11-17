export type Ease = (t: number) => number

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inQuad: (t: number) => t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outBack: (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  inBack: (t: number) => 2.2 * t * t * t - 1.2 * t * t,
} satisfies Record<string, Ease>

class Tween {
  active = false
  t = 0
  dur = 1
  delay = 0
  ease: Ease = ease.linear
  fn: (p: number) => void = () => {}
  done: (() => void) | undefined
}

export class Tweens {
  private pool: Tween[] = []

  add(dur: number, delay: number, e: Ease, fn: (p: number) => void, done?: () => void): void {
    let tw = this.pool.find((x) => !x.active)
    if (!tw) {
      tw = new Tween()
      this.pool.push(tw)
    }
    tw.active = true
    tw.t = 0
    tw.dur = Math.max(1, dur)
    tw.delay = delay
    tw.ease = e
    tw.fn = fn
    tw.done = done
  }

  update(dt: number): void {
    for (const tw of this.pool) {
      if (!tw.active) continue
      let step = dt
      if (tw.delay > 0) {
        tw.delay -= dt
        if (tw.delay > 0) continue
        step = -tw.delay
        tw.delay = 0
      }
      tw.t += step
      const p = Math.min(1, tw.t / tw.dur)
      tw.fn(tw.ease(p))
      if (p >= 1) {
        tw.active = false
        tw.done?.()
      }
    }
  }

  clear(): void {
    for (const tw of this.pool) tw.active = false
  }
}
