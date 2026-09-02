/**
 * 로딩 스피너 화면 — 부트스트랩/게임 목록 로딩 중 표시.
 */
import type { ReactNode } from 'react'
import { useT } from '../i18n'
import './Loading.css'

export function Loading(): ReactNode {
  const t = useT()
  return (
    <div className="hub-loading" role="status" aria-live="polite">
      <span className="hub-loading__spinner" aria-hidden="true" />
      <span className="hub-loading__label">{t('loading')}</span>
    </div>
  )
}
