/**
 * 첫 실행 안내 — 가상 코인 전용·현금 가치 없음·성인용. 세션 준비가 끝난 뒤 한 번만 뜨고,
 * 바깥 탭·Esc로는 닫히지 않는다(버튼으로만). 확인하면 localStorage tgslot.notice.age.v1 에 기억한다.
 * 저장소 접근이 막혀 있으면 그 탭(앱 인스턴스)에서만 한 번 보여 준다.
 */
import { useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Modal } from './Modal'
import './AgeNotice.css'

export const AGE_NOTICE_KEY = 'tgslot.notice.age.v1'

/** 이 탭에서 이미 확인했는가 — 저장소가 막혀 있을 때 탭당 1회를 지키는 메모리 백업. */
let acknowledgedInThisTab = false

export function hasSeenAgeNotice(): boolean {
  if (acknowledgedInThisTab) return true
  try {
    return localStorage.getItem(AGE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberAgeNotice(): void {
  acknowledgedInThisTab = true
  try {
    localStorage.setItem(AGE_NOTICE_KEY, '1')
  } catch {
    /* 저장 불가 — 이 탭에서만 한 번 */
  }
}

/** 테스트에서 탭 메모리 백업을 되돌린다. */
export function resetAgeNoticeForTest(): void {
  acknowledgedInThisTab = false
}

const TITLE_ID = 'hub-age-notice-title'

export function AgeNotice(): ReactNode {
  const t = useT()
  const [open, setOpen] = useState(() => !hasSeenAgeNotice())
  if (!open) return null

  return (
    <Modal onClose={() => {}} titleId={TITLE_ID}>
      <h2 id={TITLE_ID} className="hub-sheet__title">
        {t('ageNoticeTitle')}
      </h2>
      <ul className="hub-age-notice__list">
        <li>{t('ageNoticeVirtual')}</li>
        <li>{t('ageNoticeNoCash')}</li>
        <li>{t('ageNoticeAdult')}</li>
      </ul>
      <button
        type="button"
        className="hub-sheet__reveal hub-age-notice__confirm"
        onClick={() => {
          rememberAgeNotice()
          setOpen(false)
        }}
      >
        {t('ageNoticeConfirm')}
      </button>
    </Modal>
  )
}
