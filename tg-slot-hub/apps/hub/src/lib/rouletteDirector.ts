/**
 * 무대 룰렛 한 판의 진행 순서. «무엇을 어떤 순서로 보여 주나»만 정하고, 실제 그리기·소리·타이머는 호스트(화면)가 한다.
 * 호스트를 가짜로 바꿔 끼우면 순서·이어 보기·취소를 타이머 없이 검증할 수 있다.
 *
 *   (이어 보기면 상태 복원) → 판이 떠오름(E5) → 불빛 점등(E6)
 *   → 회전마다 [고리 맞춤 → 돌리기 대기 → 회전 → 결과 연출 → 기록]
 *   → 요약(X1)
 *
 * 결과(칸·금액)는 계획(`RoulettePlan`)에 이미 들어 있다. 호스트의 대기·건너뛰기·빠르게 멈춤은 시간만 바꾼다.
 */
import type { PlannedStep, RoulettePlan } from './rouletteShow'

export interface RouletteHost {
  /** 언마운트·게임 이탈로 취소됐나. 매 await 뒤에 확인한다. */
  aborted(): boolean
  /** 이어 보기: 끝까지 본 `shown`회전의 상태(고리 각도·불빛·합계·남은 돌리기)를 연출 없이 그린다. */
  restore(shown: number): void
  /** E5: 판이 떠오른다. */
  rise(): Promise<void>
  /** E6: 응원봉 불빛이 하나씩 칸을 켠다. 이어 보기에서는 `restore`가 이미 켜 두었으니 부르지 않는다. */
  lightUp(): Promise<void>
  /** 이 회전을 돌릴 고리·포인터·줌을 맞춘다. 고리가 바뀌지 않았으면 바로 끝난다. */
  focus(step: PlannedStep): Promise<void>
  /** 돌리기 탭 또는 자동 대기가 끝날 때까지. 오토스핀·건너뛰기·«위로» 직후는 바로 끝난다. */
  awaitSpin(step: PlannedStep): Promise<void>
  spin(step: PlannedStep): Promise<void>
  reveal(step: PlannedStep): Promise<void>
  /** 회전 하나를 끝까지 보여 줬다(`shown`은 지금까지 본 회전 수) — 이어 보기 캐시용. */
  commit(shown: number): void
  /** X1: 요약 카드. 탭하거나 자동 시간이 지나면 끝난다. */
  summary(): Promise<void>
}

export interface DirectorOptions {
  /** 이미 끝까지 본 회전 수(이어 보기). 기본 0. */
  startAt?: number
}

export type DirectorResult = 'done' | 'aborted'

export async function runRouletteShow(
  plan: RoulettePlan,
  host: RouletteHost,
  options: DirectorOptions = {},
): Promise<DirectorResult> {
  const startAt = Math.max(0, Math.min(options.startAt ?? 0, plan.steps.length))
  const resumed = startAt > 0

  if (resumed) {
    host.restore(startAt)
    await host.rise()
    if (host.aborted()) return 'aborted'
  } else {
    await host.rise()
    if (host.aborted()) return 'aborted'
    await host.lightUp()
    if (host.aborted()) return 'aborted'
  }

  for (let i = startAt; i < plan.steps.length; i += 1) {
    const step = plan.steps[i] as PlannedStep
    await host.focus(step)
    if (host.aborted()) return 'aborted'
    await host.awaitSpin(step)
    if (host.aborted()) return 'aborted'
    await host.spin(step)
    if (host.aborted()) return 'aborted'
    await host.reveal(step)
    if (host.aborted()) return 'aborted'
    host.commit(i + 1)
  }

  await host.summary()
  return host.aborted() ? 'aborted' : 'done'
}
