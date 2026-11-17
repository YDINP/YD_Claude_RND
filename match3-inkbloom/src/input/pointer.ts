import { W } from '../core/constants'
import { areAdjacent } from '../core/board'
import { cellAt, type Layout } from '../view/layout'

export interface PointerHandlers {
  layout(): Layout
  select(cell: number): boolean
  swap(a: number, b: number): void
  aim(from: number, to: number): void
  gesture(): void
}

const DRAG_RATIO = 0.35
const AIM_RATIO = 0.12

export function bindPointer(canvas: HTMLCanvasElement, h: PointerHandlers, signal: AbortSignal): void {
  canvas.style.touchAction = 'none'
  let down = -1
  let sx = 0
  let sy = 0
  let selected = -1
  let consumed = false

  const local = (e: PointerEvent): [number, number] => {
    const rc = canvas.getBoundingClientRect()
    return [e.clientX - rc.left, e.clientY - rc.top]
  }
  const pick = (c: number): void => {
    selected = h.select(c) ? c : -1
  }
  const neighbor = (from: number, dx: number, dy: number): number => {
    const horiz = Math.abs(dx) > Math.abs(dy)
    const nc = (from % W) + (horiz ? Math.sign(dx) : 0)
    const nr = Math.floor(from / W) + (horiz ? 0 : Math.sign(dy))
    return nc < 0 || nc >= W || nr < 0 || nr >= W ? -1 : nr * W + nc
  }

  canvas.addEventListener('pointerdown', (e) => {
    h.gesture()
    const [x, y] = local(e)
    down = cellAt(h.layout(), x, y)
    sx = x
    sy = y
    consumed = false
    if (down < 0) return
    canvas.setPointerCapture(e.pointerId)
    if (selected >= 0 && areAdjacent(selected, down)) {
      const a = selected
      pick(-1)
      consumed = true
      h.swap(a, down)
      return
    }
    pick(down)
  }, { signal })

  canvas.addEventListener('pointermove', (e) => {
    const l = h.layout()
    const [x, y] = local(e)
    if (down < 0) {
      if (selected < 0 || e.pointerType !== 'mouse') return
      const c = cellAt(l, x, y)
      h.aim(selected, areAdjacent(selected, c) ? c : -1)
      return
    }
    if (consumed) return
    const dx = x - sx
    const dy = y - sy
    const dist = Math.max(Math.abs(dx), Math.abs(dy))
    if (dist < l.cell * AIM_RATIO) return
    const n = neighbor(down, dx, dy)
    if (dist < l.cell * DRAG_RATIO) {
      if (selected === down) h.aim(down, n)
      return
    }
    consumed = true
    pick(-1)
    if (n >= 0) h.swap(down, n)
  }, { signal })

  const end = (): void => {
    down = -1
  }
  canvas.addEventListener('pointerup', end, { signal })
  canvas.addEventListener('pointercancel', () => {
    end()
    pick(-1)
  }, { signal })
}
