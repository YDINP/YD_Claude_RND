/**
 * 말판의 DOM 이펙트 도우미 — 엽전이 바구니로 날아가기, 불꽃, 화면 흔들림, 숫자 펀치.
 *
 * 전부 Web Animations API(WAAPI)로 짠다. 이유는 둘이다: ① 요소를 **풀로 재사용**해 판마다 DOM이 늘지 않고
 * ② 진행 중인 `Animation`을 한곳에서 들고 있어 «빨리 감기»·언마운트 때 한 번에 끝내거나 취소할 수 있다.
 * WAAPI가 없는 환경(jsdom 등)에서는 전부 아무 일도 하지 않는다 — 결과는 숫자로 이미 그려졌다.
 */

/** 풀 크기. 엽전은 한 칸에 최대 6개이고 불꽃은 결승에서만 쓴다(탑 12 + 판 안쪽 10이 겹쳐 터진다). */
export const FX_POOL_SIZE = 24

export interface FxPoint {
  x: number
  y: number
}

function canAnimate(el: Element): el is Element & { animate: Element['animate'] } {
  return typeof (el as { animate?: unknown }).animate === 'function'
}

/**
 * 이펙트 풀. `container` 안에 고정 개수의 `<span>`을 미리 만들어 두고 쓸 때마다 꺼내 쓴다.
 * 컨테이너는 이펙트 레이어(`position: absolute; inset: 0; pointer-events: none`)여야 한다.
 */
export interface FxPool {
  /** 엽전 `count`개를 `from`→`to`로 날린다. 좌표는 컨테이너 기준 px. 다 도착하면 resolve. */
  flyCoins(from: FxPoint, to: FxPoint, count: number, durationMs: number): Promise<void>
  /** `at`에서 사방으로 퍼지는 불꽃. */
  burstSparks(at: FxPoint, count: number, radius: number, durationMs: number): Promise<void>
  /** 진행 중인 것을 전부 끝 상태로 접는다(빨리 감기). */
  finishAll(): void
  /** 진행 중인 것을 취소하고 요소를 숨긴다. */
  cancelAll(): void
  /** 풀 요소를 DOM에서 걷어낸다. */
  dispose(): void
}

export function createFxPool(container: HTMLElement, size: number = FX_POOL_SIZE): FxPool {
  const elements: HTMLElement[] = []
  const free: HTMLElement[] = []
  const running = new Set<Animation>()

  for (let i = 0; i < size; i += 1) {
    const el = document.createElement('span')
    el.className = 'board-fx'
    el.setAttribute('aria-hidden', 'true')
    el.style.display = 'none'
    container.appendChild(el)
    elements.push(el)
    free.push(el)
  }

  function acquire(): HTMLElement | null {
    return free.pop() ?? null
  }

  function release(el: HTMLElement): void {
    el.style.display = 'none'
    el.className = 'board-fx'
    if (!free.includes(el)) free.push(el)
  }

  function run(el: HTMLElement, keyframes: Keyframe[], durationMs: number, delayMs: number): Promise<void> {
    if (!canAnimate(el)) {
      release(el)
      return Promise.resolve()
    }
    el.style.display = 'block'
    const anim = el.animate(keyframes, { duration: Math.max(1, durationMs), delay: delayMs, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' })
    running.add(anim)
    return new Promise<void>((resolve) => {
      const done = (): void => {
        running.delete(anim)
        release(el)
        resolve()
      }
      anim.addEventListener('finish', done, { once: true })
      anim.addEventListener('cancel', done, { once: true })
    })
  }

  return {
    flyCoins(from, to, count, durationMs) {
      const jobs: Promise<void>[] = []
      for (let i = 0; i < count; i += 1) {
        const el = acquire()
        if (el === null) break
        el.className = 'board-fx board-fx--coin'
        // 출발 지점에서 살짝 흩어졌다가 한곳으로 모인다.
        const spread = (i - (count - 1) / 2) * 7
        const lift = -14 - (i % 3) * 5
        jobs.push(
          run(
            el,
            [
              { transform: `translate(${from.x}px, ${from.y}px) scale(0.4)`, opacity: 0 },
              { transform: `translate(${from.x + spread}px, ${from.y + lift}px) scale(1)`, opacity: 1, offset: 0.25 },
              { transform: `translate(${to.x}px, ${to.y}px) scale(0.55)`, opacity: 1, offset: 0.9 },
              { transform: `translate(${to.x}px, ${to.y}px) scale(0.2)`, opacity: 0 },
            ],
            durationMs,
            i * 55,
          ),
        )
      }
      return Promise.all(jobs).then(() => undefined)
    },

    burstSparks(at, count, radius, durationMs) {
      const jobs: Promise<void>[] = []
      for (let i = 0; i < count; i += 1) {
        const el = acquire()
        if (el === null) break
        el.className = `board-fx board-fx--spark board-fx--spark${i % 3}`
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.2
        const reach = radius * (0.7 + (i % 4) * 0.12)
        jobs.push(
          run(
            el,
            [
              { transform: `translate(${at.x}px, ${at.y}px) scale(0.3)`, opacity: 1 },
              { transform: `translate(${at.x + Math.cos(angle) * reach}px, ${at.y + Math.sin(angle) * reach - 10}px) scale(1.1)`, opacity: 1, offset: 0.55 },
              { transform: `translate(${at.x + Math.cos(angle) * reach * 1.15}px, ${at.y + Math.sin(angle) * reach * 1.15 + 8}px) scale(0.2)`, opacity: 0 },
            ],
            durationMs,
            (i % 4) * 30,
          ),
        )
      }
      return Promise.all(jobs).then(() => undefined)
    },

    finishAll() {
      for (const anim of [...running]) {
        try {
          anim.finish()
        } catch {
          anim.cancel()
        }
      }
    },

    cancelAll() {
      for (const anim of [...running]) anim.cancel()
      running.clear()
      for (const el of elements) release(el)
    },

    dispose() {
      for (const anim of [...running]) anim.cancel()
      running.clear()
      for (const el of elements) el.remove()
      elements.length = 0
      free.length = 0
    },
  }
}

/** 요소를 한 번 «톡» 키웠다 줄인다(숫자 펀치). 진행 중이던 펀치는 끝내고 다시 친다. */
export function punch(el: HTMLElement | null, scale = 1.25, durationMs = 260): Animation | null {
  if (el === null || !canAnimate(el)) return null
  return el.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: durationMs, easing: 'cubic-bezier(.3,1.4,.5,1)' },
  )
}

/** 판 전체를 6px 흔든다(함정). */
export function shake(el: HTMLElement | null, amplitude = 6, durationMs = 320): Animation | null {
  if (el === null || !canAnimate(el)) return null
  const a = amplitude
  return el.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-a}px, ${a / 3}px)`, offset: 0.15 },
      { transform: `translate(${a}px, ${-a / 3}px)`, offset: 0.35 },
      { transform: `translate(${-a * 0.6}px, 0)`, offset: 0.55 },
      { transform: `translate(${a * 0.4}px, 0)`, offset: 0.75 },
      { transform: 'translate(0, 0)' },
    ],
    { duration: durationMs, easing: 'ease-out' },
  )
}
