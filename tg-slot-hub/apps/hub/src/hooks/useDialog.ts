/**
 * 바텀시트/모달 공용 훅 — 포커스 트랩, Esc로 닫기, 열릴 때 첫 포커스 이동 + 닫힐 때 복원,
 * 배경 스크롤 잠금을 한 군데서 관리한다. `Modal.tsx`와 `GameScreen`의 시트(도움말/베팅목록/
 * 코인 소진)가 함께 쓴다.
 *
 * `enabled`가 false면 아무 효과도 걸지 않는다 — 시트가 조건부로 렌더링되지 않고 항상 마운트된
 * 채 `open` 플래그만 갈아 끼우는 컴포넌트(GameScreen처럼)에서도 안전하게 훅 규칙을 지키며 쓸 수 있다.
 */
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  enabled: boolean,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null)

  // 열릴 때 카드 안 첫 포커스 가능한 요소로 포커스를 옮기고, 닫힐 때 이전 포커스로 되돌린다.
  useEffect(() => {
    if (!enabled) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = containerRef.current
    if (container) {
      const first = getFocusables(container)[0]
      ;(first ?? container).focus()
    }

    return () => {
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Esc로 닫기 + Tab/Shift+Tab을 카드 안에 가둔다(기본적인 포커스 트랩).
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const nodes = getFocusables(container)
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
  }, [enabled, onClose])

  // 열려 있는 동안 배경 스크롤을 잠근다.
  useEffect(() => {
    if (!enabled) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [enabled])

  return containerRef
}
