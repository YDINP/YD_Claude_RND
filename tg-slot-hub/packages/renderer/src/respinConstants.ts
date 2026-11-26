/**
 * 코인 리스핀 연출 상수. 순수 모듈(`respin.ts`)과 pixi 쪽(`pixi/respinFx.ts`)이 함께 읽는다.
 * 시간표는 docs/PLAN_kraken-cove.md §7-4. 값을 바꾸면 `respin.test.ts`의 시간 예산 게이트가 먼저 알려 준다.
 */

/** 시간표 행. 스핀 속도 3종에 모션 축소가 하나 더 붙는다. */
export type RespinSpeedRow = 'normal' | 'quick' | 'turbo' | 'reduced'

/**
 * 리스핀 1회의 구성(ms). 코인이 없으면 `spin + settle`, 새 코인이 붙으면 `spin + pin + settle`이다.
 * 합계가 기획서 §7-4 표(normal 800/1,100 · quick 600/820 · turbo 420/560 · 모션 축소 300/380)와 같다.
 * `lastSpinMs`는 «1회 남음» 리스핀의 칸 회전 길이다. normal·quick만 느려지고 turbo·모션 축소는 그대로다.
 */
export const RESPIN_STEP_MS = {
  normal: { spinMs: 600, pinMs: 300, settleMs: 200, lastSpinMs: 900 },
  quick: { spinMs: 400, pinMs: 220, settleMs: 200, lastSpinMs: 600 },
  turbo: { spinMs: 260, pinMs: 140, settleMs: 160, lastSpinMs: 260 },
  reduced: { spinMs: 160, pinMs: 80, settleMs: 140, lastSpinMs: 160 },
} as const

/** 칸마다 늦게 서는 간격(ms). 마지막 칸이 `spinMs`에 선다. */
export const RESPIN_STAGGER_MS = 35
/** 스태거가 회전 시간에서 차지할 수 있는 최대 몫. 나머지는 실제 이동이다. */
export const RESPIN_MAX_STAGGER_PORTION = 0.5

/** 촉수 감기 1줄(ms). 모션 축소는 그림 없이 점멸 200ms 하나다. */
export const RESPIN_WRAP_MS = {
  normal: { riseMs: 350, coilMs: 250, countMs: 300 },
  quick: { riseMs: 260, coilMs: 190, countMs: 230 },
  turbo: { riseMs: 170, coilMs: 120, countMs: 160 },
  reduced: { riseMs: 0, coilMs: 0, countMs: 200 },
} as const

/**
 * 정산(ms). `gapMs`는 코인 하나가 합계로 날아가는 간격, `treasureHoldMs`는 보물 코인이 더 머무는 시간,
 * `topMs`는 15칸을 채웠을 때 «최고 보물» 연출 길이다.
 */
export const RESPIN_COLLECT_MS = {
  normal: { gapMs: 120, treasureHoldMs: 400, topMs: 2000, flyMs: 260 },
  quick: { gapMs: 85, treasureHoldMs: 280, topMs: 1400, flyMs: 200 },
  turbo: { gapMs: 60, treasureHoldMs: 160, topMs: 900, flyMs: 150 },
  reduced: { gapMs: 40, treasureHoldMs: 120, topMs: 500, flyMs: 0 },
} as const

/** 진입 펄스: 코인 하나당 간격(ms)과 전체 상한. 상한을 넘으면 간격을 줄인다. */
export const RESPIN_PULSE_GAP_MS = 80
export const RESPIN_PULSE_MAX_MS = 700
/** 마퀴(프레임) 흔들림 길이(ms). 모션 축소는 흔들지 않는다. */
export const RESPIN_SHAKE_MS = 400

/** 15칸을 다 채운 뒤 정산 전의 쉼(ms). 마지막 촉수가 물러나고 «판 가득!»을 읽는 박자다(STOP·모션 축소에서는 생략). */
export const RESPIN_FULL_HOLD_MS = 700
/** 흔들림 폭(캔버스 폭 대비). */
export const RESPIN_SHAKE_AMPLITUDE = 0.006

/** STOP 압축: 리스핀 1회 = clamp(BUDGET / 남은 수, MIN, MAX). */
export const RESPIN_SKIP_BUDGET_MS = 1500
export const RESPIN_SKIP_MIN_MS = 90
export const RESPIN_SKIP_MAX_MS = 220
/** STOP 뒤 촉수 점멸·정산 길이. 촉수 점멸은 남은 줄 전부가 이 예산을 나눠 쓴다(줄당 하한 `RESPIN_SKIP_WRAP_MIN_MS`). */
export const RESPIN_SKIP_WRAP_MS = 300
export const RESPIN_SKIP_WRAP_MIN_MS = 90
export const RESPIN_SKIP_COLLECT_MS = 600
/** 압축한 리스핀에서 칸 회전이 차지하는 몫과 고정 연출이 차지하는 몫. 남는 시간은 정리다. */
export const RESPIN_SKIP_SPIN_PORTION = 0.55
export const RESPIN_SKIP_PIN_PORTION = 0.25

/** 전환 클립 하나의 길이(기획서 §10, 컷 3.0s). 예산 계산용 기본값이고 실제는 theme의 `durationMs`다. */
export const RESPIN_CLIP_MS = 3000
/**
 * 전환에서 «완전히 덮인 채 머무는» 구간(ms). 허브가 얹는 배너는 없지만, 클립을 틀려면 덮임이 이만큼은 유지돼야 한다
 * (`MODE_CLIP_MIN_COVERED_MS` 이상, 기획서 §10-3 «덮임 0.5s 이상»). 스핀 속도와 무관하게 같다.
 */
export const RESPIN_COVERED_HOLD_MS = 500

/** 비코인 결과 칸을 어둡게 누르는 틴트(밝기 45%). 필터 없이 틴트만 쓴다. */
export const RESPIN_DIM_TINT = 0x737373
/** 코인 얼굴 텍스처 캐시 상한(장). 넘으면 가장 오래 안 쓴 것부터 해제한다. */
export const RESPIN_FACE_CACHE_MAX = 64
/** 촉수 풀 크기 = 세로줄 수의 상한. */
export const RESPIN_TENTACLE_POOL_MAX = 5
/** 촉수 줄의 정점 수. 40을 넘지 않는다(기획서 §13 K6). */
export const RESPIN_TENTACLE_POINTS = 28
/** 촉수 그림에서 몸통이 차지하는 높이 비율(텍스처 높이 대비). 여백을 빼고 굵기를 맞추는 데 쓴다. */
export const RESPIN_TENTACLE_ART_FILL = 0.6
/** 촉수 굵기(칸 한 변 대비). */
export const RESPIN_TENTACLE_THICKNESS = 0.34

/** 기대감: 릴 하나가 멈춘 뒤 이 수 이상의 코인이 쌓여야 남은 릴을 늦춘다(트리거 개수 기준 오프셋). */
export const COIN_ANTICIPATION_TRIGGER_OFFSETS = [2, 1] as const
