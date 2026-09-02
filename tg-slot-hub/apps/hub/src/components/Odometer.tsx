/**
 * 코인/젬 숫자 오도미터 — silkworm Odometer의 정수 카운터용 단순화 버전.
 * RAF 기반 ease-out 보간으로 값이 바뀔 때 자연스럽게 롤링된다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import './Odometer.css'

interface OdometerProps {
  value: number
  className?: string
}

const ANIM_DURATION_MS = 600

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function formatInt(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function Odometer({ value, className }: OdometerProps): ReactNode {
  const [displayValue, setDisplayValue] = useState(value)
  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const fromValueRef = useRef(value)
  const toValueRef = useRef(value)

  useEffect(() => {
    if (value === toValueRef.current) return

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    fromValueRef.current = displayValue
    toValueRef.current = value
    startTimeRef.current = null

    const animate = (timestamp: number): void => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const t = Math.min(elapsed / ANIM_DURATION_MS, 1)
      const eased = easeOut(t)
      const current =
        fromValueRef.current + (toValueRef.current - fromValueRef.current) * eased

      setDisplayValue(current)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // displayValue를 의존성에 넣으면 매 렌더마다 애니메이션이 재시작되므로 제외 (ref로 추적)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <span className={['hub-odometer', className].filter(Boolean).join(' ')}>
      {formatInt(displayValue)}
    </span>
  )
}
