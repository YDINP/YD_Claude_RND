/**
 * 텔레그램 밖(일반 브라우저)에서 열렸을 때 보여주는 안내 화면.
 */
import type { ReactNode } from 'react'
import { useT } from '../i18n'
import './OutsideTelegram.css'

export function OutsideTelegram(): ReactNode {
  const t = useT()
  return (
    <div className="hub-outside">
      <span className="hub-outside__icon" aria-hidden="true">
        📵
      </span>
      <h1 className="hub-outside__title">{t('outsideTelegramTitle')}</h1>
      <p className="hub-outside__message">{t('outsideTelegramMessage')}</p>
    </div>
  )
}
