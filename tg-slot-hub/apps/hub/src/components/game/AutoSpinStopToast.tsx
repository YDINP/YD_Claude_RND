/**
 * 오토스핀이 스스로 멈춘 이유를 알리는 토스트 — 당첨 패널 바로 위 가운데, 3초.
 * 같은 이유가 연달아 와도 notice.id가 바뀌므로 다시 뜬다. 문구는 부모가 골라 넘긴다.
 */
import { useEffect, type ReactNode } from 'react'
import './AutoSpinStopToast.css'

export const AUTO_SPIN_STOP_TOAST_MS = 3000

interface AutoSpinStopToastProps {
  /** 토스트가 바뀌었음을 알리는 번호 — 타이머 재시작용. */
  noticeId: number
  text: string
  onDone: () => void
}

export function AutoSpinStopToast({ noticeId, text, onDone }: AutoSpinStopToastProps): ReactNode {
  useEffect(() => {
    const id = setTimeout(onDone, AUTO_SPIN_STOP_TOAST_MS)
    return () => clearTimeout(id)
    // onDone은 매 렌더 새로 만들어질 수 있어 타이머를 다시 걸지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId])

  return (
    <div className="hub-autospin-toast" role="status" aria-live="polite">
      {text}
    </div>
  )
}
