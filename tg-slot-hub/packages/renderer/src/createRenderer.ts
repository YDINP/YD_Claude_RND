import type { RendererMode } from './features.js'
import type {
  RendererOptions,
  ShowWinsOptions,
  SlotRenderer,
  SpinHandle,
  SpinToOptions,
} from './types.js'
import type { RendererCore, ResolvedRendererOptions } from './internal.js'
import type { WinLine } from '@tgslot/slot-engine'
import { DEFAULT_OVERFLOW_X } from './constants.js'
import { resolveReducedMotion } from './motion.js'

/** 릴을 크게 보여주는 쪽이 기본이다. 프레임 가장자리는 잘려도 된다. */
const DEFAULT_FIT = 'window'
/** 선을 긋지 않고 빛으로 훑는 쪽이 기본이다. 선은 심볼을 가린다. */
const DEFAULT_PAYLINE_STYLE = 'effect'

/** promise를 thenable 손잡이로 감싼다. `await`도 되고 `skip()`도 되게 하려는 것이다. */
function makeSpinHandle(done: Promise<void>, skip: () => void): SpinHandle {
  return {
    done,
    skip,
    then: (onFulfilled, onRejected) => done.then(onFulfilled, onRejected),
  }
}

function resolveOptions(options: RendererOptions): ResolvedRendererOptions {
  const initialStops =
    options.initialStops !== undefined && options.initialStops.length === options.math.reels
      ? [...options.initialStops]
      : new Array<number>(options.math.reels).fill(0)
  return {
    ...options,
    reducedMotion: resolveReducedMotion(options.reducedMotion),
    initialStops,
    fit: options.fit ?? DEFAULT_FIT,
    overflowX: options.overflowX ?? DEFAULT_OVERFLOW_X,
    showFreeSpinsPlaque: options.showFreeSpinsPlaque ?? true,
    paylineStyle: options.paylineStyle ?? DEFAULT_PAYLINE_STYLE,
  }
}

/**
 * 슬롯 렌더러를 만든다. 동기적으로 핸들을 돌려주고 실제 초기화는 `ready`에서 끝난다.
 * PixiJS는 여기서 **동적 import** 된다. 순수 로직 테스트가 브라우저 전용 코드를 끌어오지 않게 하려는 것이다.
 */
export function createSlotRenderer(options: RendererOptions): SlotRenderer {
  const resolved = resolveOptions(options)

  let core: RendererCore | null = null
  let destroyed = false
  let pendingMode: RendererMode | null = null

  const ready: Promise<void> = (async () => {
    const module = await import('./pixi/pixiRenderer.js')
    const created = await module.createPixiRendererCore(resolved)
    if (destroyed) {
      created.destroy()
      return
    }
    core = created
    if (pendingMode !== null) core.setMode(pendingMode)
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
    spinTo: (stops: number[], opts?: SpinToOptions): SpinHandle => {
      let coreHandle: SpinHandle | null = null
      let skipRequested = false
      const done = (async () => {
        await ready
        if (core === null || destroyed) return
        const handle = core.spinTo(stops, opts)
        coreHandle = handle
        // 초기화가 끝나기 전에 눌린 스킵도 잃지 않는다.
        if (skipRequested) handle.skip()
        await handle.done
      })()
      void done.catch(() => undefined)
      return makeSpinHandle(done, () => {
        skipRequested = true
        coreHandle?.skip()
      })
    },
    showWins: (wins: WinLine[], opts?: ShowWinsOptions) => withCore((c) => c.showWins(wins, opts), undefined),
    clearWins: () => {
      core?.clearWins()
    },
    setSpinningIdle: (on: boolean) => {
      core?.setSpinningIdle(on)
    },
    setMode: (mode: RendererMode) => {
      // 초기화 전에 불러도 잃지 않도록 기억해 뒀다가 준비되면 적용한다.
      pendingMode = mode
      core?.setMode(mode)
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
