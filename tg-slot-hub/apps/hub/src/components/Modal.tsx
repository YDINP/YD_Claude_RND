/**
 * 중앙 정렬 모달 — 하단에서 올라오는 시트(`.hub-sheet`, 게임 도움말/코인 소진 등)와 달리
 * 화면 중앙에 뜨는 카드. 배경 탭 / Esc / 닫기 버튼으로 닫히고, 기본적인 포커스 트랩을 갖는다.
 * 애니메이션은 OS의 `prefers-reduced-motion`과 앱 설정(`settings.reducedMotion`)을 모두 존중한다.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useSettingsStore } from '../store/settings'
import './Modal.css'

interface ModalProps {
  onClose: () => void
  /** 모달 제목 요소의 id — 있으면 aria-labelledby로 연결한다. */
  titleId?: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function Modal({ onClose, titleId, children }: ModalProps): ReactNode {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  // 열릴 때 카드 안 첫 포커스 가능한 요소로 포커스를 옮기고, 닫힐 때 이전 포커스로 되돌린다.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const card = cardRef.current
    if (card) {
      const first = getFocusables(card)[0]
      ;(first ?? card).focus()
    }

    return () => {
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc로 닫기 + Tab/Shift+Tab을 카드 안에 가둔다(기본적인 포커스 트랩).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const nodes = getFocusables(card)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="hub-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={cardRef}
        className={reducedMotion ? 'hub-modal' : 'hub-modal hub-modal--animate'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
