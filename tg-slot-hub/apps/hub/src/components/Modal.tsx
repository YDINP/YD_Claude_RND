/**
 * 중앙 정렬 모달 — 하단에서 올라오는 시트(`.hub-sheet`, 게임 도움말/코인 소진 등)와 달리
 * 화면 중앙에 뜨는 카드. 배경 탭 / Esc / 닫기 버튼으로 닫히고, 기본적인 포커스 트랩을 갖는다.
 * 애니메이션은 OS의 `prefers-reduced-motion`과 앱 설정(`settings.reducedMotion`)을 모두 존중한다.
 * 포커스 트랩/Esc/스크롤 잠금은 `useDialog` 훅으로 뺐다 — 게임 화면의 바텀시트도 같은 훅을 쓴다.
 */
import type { ReactNode } from 'react'
import { useSettingsStore } from '../store/settings'
import { useDialog } from '../hooks/useDialog'
import './Modal.css'

interface ModalProps {
  onClose: () => void
  /** 모달 제목 요소의 id — 있으면 aria-labelledby로 연결한다. */
  titleId?: string
  children: ReactNode
}

export function Modal({ onClose, titleId, children }: ModalProps): ReactNode {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  // Modal은 부모가 조건부로 렌더링한다(열림 상태 자체가 마운트 여부다) — 항상 enabled.
  const cardRef = useDialog<HTMLDivElement>(onClose, true)

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
