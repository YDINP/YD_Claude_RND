import type { RendererOptions, ShowWinsOptions, SlotRenderer, SpinToOptions } from './types.js'
import type { RendererCore, ResolvedRendererOptions } from './internal.js'
import type { WinLine } from '@tgslot/slot-engine'
import { resolveReducedMotion } from './motion.js'

function resolveOptions(options: RendererOptions): ResolvedRendererOptions {
  const initialStops =
    options.initialStops !== undefined && options.initialStops.length === options.math.reels
      ? [...options.initialStops]
      : new Array<number>(options.math.reels).fill(0)
  return { ...options, reducedMotion: resolveReducedMotion(options.reducedMotion), initialStops }
}

/**
 * 슬롯 렌더러를 만든다. 동기적으로 핸들을 돌려주고 실제 초기화는 `ready`에서 끝난다.
 * PixiJS는 여기서 **동적 import** 된다. 순수 로직 테스트가 브라우저 전용 코드를 끌어오지 않게 하려는 것이다.
 */
export function createSlotRenderer(options: RendererOptions): SlotRenderer {
  const resolved = resolveOptions(options)

  let core: RendererCore | null = null
  let destroyed = false

  const ready: Promise<void> = (async () => {
    const module = await import('./pixi/pixiRenderer.js')
    const created = await module.createPixiRendererCore(resolved)
    if (destroyed) {
      created.destroy()
      return
    }
    core = created
  })()
  // ready를 구독하지 않는 호출자 때문에 unhandled rejection이 뜨지 않도록 한 번 삼킨다.
  // 실제 오류는 ready를 await 한 쪽에서 그대로 다시 던져진다.
  void ready.catch(() => undefined)

  const withCore = async <T>(fn: (c: RendererCore) => T | Promise<T>, fallback: T): Promise<T> => {
    await ready
    if (core === null || destroyed) return fallback
    return await fn(core)
  }

  return {
    ready,
    spinTo: (stops: number[], opts?: SpinToOptions) => withCore((c) => c.spinTo(stops, opts), undefined),
    showWins: (wins: WinLine[], opts?: ShowWinsOptions) => withCore((c) => c.showWins(wins, opts), undefined),
    clearWins: () => {
      core?.clearWins()
    },
    setSpinningIdle: (on: boolean) => {
      core?.setSpinningIdle(on)
    },
    resize: () => {
      core?.resize()
    },
    destroy: () => {
      destroyed = true
      core?.destroy()
      core = null
    },
  }
}
