import {
  TRANSITION_CLIP_DURATION_MS,
  TRANSITION_CLIP_DURATION_TOLERANCE_MS,
  TRANSITION_CLIP_HEIGHT,
  TRANSITION_CLIP_HOLD_FRAME_MS,
  TRANSITION_CLIP_LOOP_COUNT,
  TRANSITION_CLIP_MAX_HOLD_RATIO,
  TRANSITION_CLIP_WIDTH,
} from './constants.js'

/**
 * 전환 클립(애니메이션 WebP) 검사 — **순수 계산만** 한다. 파일 읽기는 호출 측이 한다.
 *
 * 이 검사가 존재하는 이유는 눈으로 못 잡는 결함이 하나 있기 때문이다: **정지 구간**.
 * libwebp는 동일한 연속 프레임을 한 장으로 합치고 지속시간만 늘린다. 그래서 프레임 하나가
 * 유난히 길면 그 구간은 **화면이 멈춰 있었다**는 뜻이다. 전면을 덮는 커튼에서 이게 길어지면
 * 연출이 아니라 로딩 화면으로 읽힌다 — shiba가 3초 중 1.3초를 단색 정지로 채운 채
 * 배선까지 끝났던 적이 있고, 그때 이 수치가 유일한 단서였다.
 *
 * 다만 **프레임 하나가 길다는 것만으로는 실패가 아니다.** 복귀 클립의 머리(스왑을 가려야 한다)와
 * 진입 클립의 꼬리(교체 후 커튼이 버틴다)는 정지가 정상이다. 그래서 판정은 정지의 **총량 비율**로
 * 한다 — 「어딘가 멈춘 프레임이 있는가」가 아니라 「전환의 상당 부분이 멈춰 있는가」를 본다.
 *
 * 파싱은 RIFF 청크만 훑는다. 프레임 픽셀은 디코딩하지 않는다 —
 * 필요한 정보(캔버스 크기·루프·프레임별 지속시간)가 전부 청크 헤더에 있다.
 */

/** RIFF 청크 헤더 크기: FourCC 4바이트 + 페이로드 길이 4바이트. */
const CHUNK_HEADER_BYTES = 8
/** `RIFF` 컨테이너 헤더(`RIFF` + 길이 + `WEBP`) 다음, 첫 청크가 시작하는 오프셋. */
const FIRST_CHUNK_OFFSET = 12
/** VP8X 페이로드에서 캔버스 폭(-1, 3바이트 LE)이 시작하는 위치. */
const VP8X_WIDTH_OFFSET = 4
/** VP8X 페이로드에서 캔버스 높이(-1, 3바이트 LE)가 시작하는 위치. */
const VP8X_HEIGHT_OFFSET = 7
/** ANIM 페이로드에서 루프 횟수(2바이트 LE)가 시작하는 위치. 앞 4바이트는 배경색이다. */
const ANIM_LOOP_OFFSET = 4
/** ANMF 페이로드에서 프레임 지속시간(3바이트 LE)이 시작하는 위치. */
const ANMF_DURATION_OFFSET = 12

/** 애니메이션 WebP에서 읽어낸 사실. 판정은 하지 않는다. */
export interface AnimatedWebpInfo {
  width: number
  height: number
  /** `ANIM` 청크의 루프 횟수. 0은 무한 반복이다. 청크가 없으면 `null`(애니메이션이 아님). */
  loopCount: number | null
  /** `ANMF` 프레임별 지속시간(ms), 파일에 담긴 순서 그대로. */
  frameDurationsMs: number[]
}

/** `frameDurationsMs`를 시각과 함께 보고 싶을 때 쓰는 한 칸. */
export interface ClipHold {
  /** 클립 시작으로부터 이 프레임이 표시되기 시작하는 시각(ms). */
  atMs: number
  /** 이 프레임이 머무는 시간(ms). */
  durationMs: number
}

export interface TransitionClipReport {
  info: AnimatedWebpInfo
  totalDurationMs: number
  frameCount: number
  maxFrameDurationMs: number
  /** `TRANSITION_CLIP_HOLD_FRAME_MS`를 넘는 프레임들 = 정지 구간. */
  holds: ClipHold[]
  /** 정지 구간 합계(ms). */
  holdMs: number
  /** `holdMs / totalDurationMs`. 이 값이 판정 기준이다. */
  holdRatio: number
  /** 사람이 읽는 실패 사유. 비어 있으면 통과다. */
  problems: string[]
}

/** 파일이 애니메이션 WebP가 아닐 때 던진다. 호출 측이 경로를 붙여 다시 던지기 좋게 사유만 담는다. */
export class NotAnimatedWebpError extends Error {}

/**
 * RIFF 청크를 순회하며 필요한 것만 줍는다.
 *
 * 알 수 없는 청크(`VP8 `, `VP8L`, `ALPH`, `EXIF` 등)는 길이만 보고 건너뛴다 —
 * 여기서 하려는 일에 필요 없고, 모르는 청크에 걸려 멈추면 인코더가 바뀔 때마다 깨진다.
 */
export function parseAnimatedWebp(buffer: Buffer): AnimatedWebpInfo {
  if (buffer.length < FIRST_CHUNK_OFFSET) throw new NotAnimatedWebpError('파일이 너무 짧아 RIFF 헤더가 없다')
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new NotAnimatedWebpError('RIFF/WEBP 헤더가 아니다')
  }

  let width = 0
  let height = 0
  let loopCount: number | null = null
  const frameDurationsMs: number[] = []

  let offset = FIRST_CHUNK_OFFSET
  while (offset + CHUNK_HEADER_BYTES <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const payload = offset + CHUNK_HEADER_BYTES
    // 길이가 파일을 넘어서면 잘린 파일이다. 여기서 멈추지 않으면 아래 read가 범위를 벗어난다.
    if (payload + size > buffer.length) throw new NotAnimatedWebpError(`청크 ${id}의 길이가 파일을 벗어난다`)

    if (id === 'VP8X') {
      width = buffer.readUIntLE(payload + VP8X_WIDTH_OFFSET, 3) + 1
      height = buffer.readUIntLE(payload + VP8X_HEIGHT_OFFSET, 3) + 1
    } else if (id === 'ANIM') {
      loopCount = buffer.readUInt16LE(payload + ANIM_LOOP_OFFSET)
    } else if (id === 'ANMF') {
      frameDurationsMs.push(buffer.readUIntLE(payload + ANMF_DURATION_OFFSET, 3))
    }

    // RIFF 청크 페이로드는 짝수 바이트로 패딩된다.
    offset = payload + size + (size % 2)
  }

  if (frameDurationsMs.length === 0) throw new NotAnimatedWebpError('ANMF 프레임이 없다 (정지 WebP다)')
  return { width, height, loopCount, frameDurationsMs }
}

/** 지속시간이 `maxFrameDurationMs`를 넘는 프레임을 시각과 함께 모은다. */
export function findHolds(frameDurationsMs: readonly number[], maxFrameDurationMs: number): ClipHold[] {
  const holds: ClipHold[] = []
  let atMs = 0
  for (const durationMs of frameDurationsMs) {
    if (durationMs > maxFrameDurationMs) holds.push({ atMs, durationMs })
    atMs += durationMs
  }
  return holds
}

export interface CheckTransitionClipOptions {
  width?: number
  height?: number
  durationMs?: number
  durationToleranceMs?: number
  loopCount?: number
  /** 이보다 긴 프레임을 정지 한 칸으로 센다. */
  holdFrameMs?: number
  /** 정지 총량이 클립 길이에서 차지할 수 있는 최대 비율. */
  maxHoldRatio?: number
}

/**
 * 전환 클립 계약(`docs/TRANSITION_DESIGN.md` 5-1)을 만족하는지 본다.
 *
 * 과도한 정지는 **경고가 아니라 실패**로 다룬다. 다른 항목(크기·길이·루프)은 틀리면 재생이
 * 눈에 띄게 깨지지만, 정지 구간은 «잘 돌아가는데 이상해 보이는» 결함이라 실패로 세우지 않으면
 * 아무도 안 본다. 실제로 그렇게 한 번 배선까지 갔다.
 */
export function checkTransitionClip(buffer: Buffer, options: CheckTransitionClipOptions = {}): TransitionClipReport {
  const width = options.width ?? TRANSITION_CLIP_WIDTH
  const height = options.height ?? TRANSITION_CLIP_HEIGHT
  const durationMs = options.durationMs ?? TRANSITION_CLIP_DURATION_MS
  const toleranceMs = options.durationToleranceMs ?? TRANSITION_CLIP_DURATION_TOLERANCE_MS
  const loopCount = options.loopCount ?? TRANSITION_CLIP_LOOP_COUNT
  const holdFrameMs = options.holdFrameMs ?? TRANSITION_CLIP_HOLD_FRAME_MS
  const maxHoldRatio = options.maxHoldRatio ?? TRANSITION_CLIP_MAX_HOLD_RATIO

  const info = parseAnimatedWebp(buffer)
  const totalDurationMs = info.frameDurationsMs.reduce((sum, value) => sum + value, 0)
  const maxFrameDurationFound = Math.max(...info.frameDurationsMs)
  const holds = findHolds(info.frameDurationsMs, holdFrameMs)
  const holdMs = holds.reduce((sum, hold) => sum + hold.durationMs, 0)
  const holdRatio = totalDurationMs === 0 ? 0 : holdMs / totalDurationMs
  const problems: string[] = []

  if (info.width !== width || info.height !== height) {
    problems.push(`해상도가 ${info.width}x${info.height}다. ${width}x${height}여야 한다`)
  }
  if (Math.abs(totalDurationMs - durationMs) > toleranceMs) {
    problems.push(`길이가 ${totalDurationMs}ms다. ${durationMs}ms ±${toleranceMs}ms여야 한다`)
  }
  if (info.loopCount !== loopCount) {
    // 0은 무한 반복이다 — 커튼이 3초 뒤에 멈추지 않고 계속 돌면 화면을 영영 가린다.
    const shown = info.loopCount === 0 ? '0(무한 반복)' : String(info.loopCount)
    problems.push(`루프 횟수가 ${shown}다. ${loopCount}이어야 한다`)
  }
  if (holdRatio > maxHoldRatio) {
    const where = holds.map((hold) => `${(hold.atMs / 1000).toFixed(2)}s에서 ${hold.durationMs}ms`).join(', ')
    problems.push(
      `정지 구간이 ${holdMs}ms로 클립의 ${(holdRatio * 100).toFixed(1)}%다 ` +
        `(상한 ${(maxHoldRatio * 100).toFixed(0)}%). 그 동안 화면이 멈춰 있다 — ${where}`,
    )
  }

  return {
    info,
    totalDurationMs,
    frameCount: info.frameDurationsMs.length,
    maxFrameDurationMs: maxFrameDurationFound,
    holds,
    holdMs,
    holdRatio,
    problems,
  }
}

/** 한 줄 요약. CLI와 테스트가 같은 문장을 쓴다. */
export function formatTransitionClipReport(label: string, report: TransitionClipReport): string {
  const { info, frameCount, totalDurationMs, maxFrameDurationMs, holdRatio } = report
  const status = report.problems.length === 0 ? 'OK  ' : 'FAIL'
  return (
    `${status} ${label} — ${info.width}x${info.height}, ${frameCount}프레임, ` +
    `${(totalDurationMs / 1000).toFixed(2)}초, loop=${info.loopCount}, ` +
    `최대 프레임 ${maxFrameDurationMs}ms, 정지 ${(holdRatio * 100).toFixed(1)}%`
  )
}
