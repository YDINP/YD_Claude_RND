/**
 * "N번 빠르게 탭" 제스처의 순수 판정 로직 — 게임 제목을 5번 빠르게 눌러 디버그 패널을 여는 숨은
 * 제스처(디버그 패널 참고)에 쓴다. 컴포넌트는 탭마다 지금까지의 타임스탬프 배열에 새 탭을 더해
 * 이 함수에 넘기고, true가 돌아오면 제스처가 완성된 것이다 — 그 뒤엔 배열을 비우고 다시 센다.
 */

/** 탭 사이 최대 간격(ms). 이보다 느리게 누르면 처음부터 다시 센다. */
export const TAP_GESTURE_MAX_GAP_MS = 600
/** 이 횟수를 채우면 제스처 완성. */
export const TAP_GESTURE_COUNT = 5

/**
 * `timestamps`(오름차순, 이번 탭 포함)에서 "연속으로 빠르게 눌린" 꼬리만 남기고, 그 길이가
 * 목표 횟수에 닿았는지 판정한다. 순수 함수라 타이머 없이 테스트하기 쉽다.
 */
export function evaluateTapGesture(timestamps: readonly number[]): { complete: boolean; remaining: number[] } {
  if (timestamps.length === 0) return { complete: false, remaining: [] }

  // 뒤에서부터 훑어 간격이 벌어지는 지점에서 끊는다 — 그 앞의 오래된 탭은 이번 시퀀스가 아니다.
  let start = timestamps.length - 1
  while (start > 0) {
    const gap = timestamps[start]! - timestamps[start - 1]!
    if (gap > TAP_GESTURE_MAX_GAP_MS) break
    start -= 1
  }
  const tail = timestamps.slice(start)

  if (tail.length >= TAP_GESTURE_COUNT) return { complete: true, remaining: [] }
  return { complete: false, remaining: tail }
}
