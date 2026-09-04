/**
 * 디버그 패널의 스핀 결과 프리셋 — 다음 한 판만 이 결과가 나오도록 서버에 요청한다(원샷).
 * 프리셋 값 자체는 `@tgslot/shared`의 `SpinDebugPreset`(서버 계약)과 정확히 같아야 한다 —
 * 여기서 별도 유니온을 새로 선언하지 않고 그 타입을 그대로 재수출한다.
 */
import type { SpinDebugPreset } from '@tgslot/shared'

export type DebugPreset = SpinDebugPreset

export const DEBUG_PRESETS: readonly DebugPreset[] = ['win', 'bigWin', 'freeSpins', 'gamble', 'lose']
