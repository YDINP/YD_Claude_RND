/**
 * 고리 회전 한 번을 rAF로 돌리는 작은 실행기. 각도 곡선(`angleAt`)은 `rouletteShow`의 순수 함수를 그대로 쓰고,
 * 여기서는 시계·프레임·취소만 다룬다(시계와 rAF는 주입 가능해 테스트가 가짜로 돌린다).
 *
 * - 결과 각도(`to`)는 시작할 때 이미 정해져 있다. `compress`(빠르게 멈춤)는 **남은 감속을 줄일 뿐** 같은 각도로 간다.
 * - 각도는 단조 증가다 — 압축해도 지나친 칸을 되돌아오지 않는다.
 * - `cancel`은 프레임을 즉시 끊고 `done`을 푼다(마지막 각도는 그대로 둔다 — 호출 쪽이 필요하면 `finish`).
 */
import { angleAt } from './rouletteShow'

export interface RotationClock {
  now(): number
  request(callback: (time: number) => void): number
  cancel(handle: number): void
}

const browserClock: RotationClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export interface RotationOptions {
  from: number
  to: number
  /** 감속을 포함한 전체 길이(ms). 0 이하면 그 자리에서 도착한다. */
  ms: number
  /** 각도가 바뀔 때마다 부른다(DOM에 반영). */
  apply(angle: number): void
  /** 프레임마다(도착 프레임 포함) 진행도와 함께 부른다 — 틱 소리용. */
  onFrame?(angle: number, progress: number): void
  clock?: RotationClock
}

export interface RotationRun {
  /** 도착하면(또는 취소되면) resolve. */
  done: Promise<void>
  /** 지금 각도에서 `ms` 안에 같은 목표로 멈추도록 남은 감속을 줄인다. 이미 끝났으면 무동작. */
  compress(ms: number): void
  /** 지금 즉시 목표 각도로 붙인다(건너뛰기). */
  finish(): void
  cancel(): void
  readonly angle: number
  readonly finished: boolean
}

export function runRotation(options: RotationOptions): RotationRun {
  const clock = options.clock ?? browserClock
  const target = options.to
  let from = options.from
  let ms = options.ms
  let startedAt = clock.now()
  let current = options.from
  let handle: number | null = null
  let finished = false
  let resolveDone: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const settle = (): void => {
    if (finished) return
    finished = true
    if (handle !== null) clock.cancel(handle)
    handle = null
    resolveDone()
  }

  const arrive = (): void => {
    current = target
    options.apply(target)
    options.onFrame?.(target, 1)
    settle()
  }

  const frame = (time: number): void => {
    handle = null
    if (finished) return
    const progress = ms <= 0 ? 1 : Math.min(1, (time - startedAt) / ms)
    if (progress >= 1) {
      arrive()
      return
    }
    // 단조 증가를 보장한다 — 프레임 시계가 뒤로 가도 각도는 줄지 않는다.
    current = Math.max(current, angleAt(from, target, progress))
    options.apply(current)
    options.onFrame?.(current, progress)
    handle = clock.request(frame)
  }

  if (ms <= 0 || target <= from) {
    arrive()
  } else {
    handle = clock.request(frame)
  }

  return {
    done,
    compress(remainingMs) {
      if (finished) return
      const elapsed = clock.now() - startedAt
      const progress = ms <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / ms))
      const remaining = ms * (1 - progress)
      // 이미 곧 끝날 회전은 늘리지 않는다.
      if (remaining <= remainingMs) return
      from = current
      ms = remainingMs
      startedAt = clock.now()
    },
    finish() {
      if (finished) return
      arrive()
    },
    cancel() {
      settle()
    },
    get angle() {
      return current
    },
    get finished() {
      return finished
    },
  }
}
