import { W } from '../core/constants'
import { areAdjacent } from '../core/board'
import { cellAt, type Layout } from '../view/layout'

export interface PointerHandlers {
  layout(): Layout
  select(cell: number): boolean
  swap(a: number, b: number): void
  gesture(): void
}

const DRAG_RATIO = 0.35

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
    if (down < 0 || consumed) return
    const l = h.layout()
    const [x, y] = local(e)
    const dx = x - sx
    const dy = y - sy
    if (Math.max(Math.abs(dx), Math.abs(dy)) < l.cell * DRAG_RATIO) return
    const horiz = Math.abs(dx) > Math.abs(dy)
    const c = down % W
    const r = Math.floor(down / W)
    const nc = c + (horiz ? Math.sign(dx) : 0)
    const nr = r + (horiz ? 0 : Math.sign(dy))
    consumed = true
    pick(-1)
    if (nc < 0 || nc >= W || nr < 0 || nr >= W) return
    h.swap(down, nr * W + nc)
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
