/**
 * 공통 에러 화면 — 메시지 + 선택적 재시도 버튼.
 */
import type { ReactNode } from 'react'
import { useT } from '../i18n'
import './ErrorView.css'

interface ErrorViewProps {
  message?: string
  onRetry?: () => void
}

export function ErrorView({ message, onRetry }: ErrorViewProps): ReactNode {
  const t = useT()
  return (
    <div className="hub-error" role="alert">
      <span className="hub-error__icon" aria-hidden="true">
        ⚠️
      </span>
      <h1 className="hub-error__title">{t('errorTitle')}</h1>
      {message && <p className="hub-error__message">{message}</p>}
      {onRetry && (
        <button type="button" className="hub-error__retry" onClick={onRetry}>
          {t('errorRetry')}
        </button>
      )}
    </div>
  )
}
