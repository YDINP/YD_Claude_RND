/**
 * 카운트다운 유틸 — 보너스/리더보드/미션 리셋 등 목표 시각(ISO 8601)까지 남은 시간을
 * 1초 간격으로 갱신한다. target이 null이면(이미 수령 가능 등) 타이머를 돌리지 않는다.
 */
import { useEffect, useState } from 'react'

function remainingMs(targetIso: string | null): number {
  if (!targetIso) return 0
  const target = new Date(targetIso).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, target - Date.now())
}

export function useCountdown(targetIso: string | null): number {
  const [ms, setMs] = useState<number>(() => remainingMs(targetIso))

  useEffect(() => {
    setMs(remainingMs(targetIso))
    if (!targetIso) return
    const id = setInterval(() => setMs(remainingMs(targetIso)), 1000)
    return () => clearInterval(id)
  }, [targetIso])

  return ms
}

/**
 * 남은 시간을 사람이 읽기 쉬운 형태로 포맷한다.
 * 1시간 미만이면 `m:ss`, 1시간 이상이면 `h:mm`.
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * 다음 UTC 자정(미션 리셋 기준 시각)의 ISO 문자열.
 * 서버의 `MissionsResponse.day`는 UTC 일자 키(`utcDayKey`, 예: `2026-09-02`)이므로
 * 로컬 자정이 아니라 UTC 자정을 기준으로 계산해야 시간대에 따라 카운트다운이 어긋나지 않는다.
 */
export function nextUtcMidnightIso(): string {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return new Date(next).toISOString()
}
