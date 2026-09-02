/**
 * 허브 헤더 — 아바타 이니셜 + 이름 + 레벨, 코인/젬 지갑 필(오도미터 애니메이션), 설정 버튼.
 */
import { useState, type ReactNode } from 'react'
import type { PublicUser, Wallet } from '@tgslot/shared'
import { Odometer } from './Odometer'
import { SettingsModal } from './SettingsModal'
import { useT } from '../i18n'
import './Header.css'

interface HeaderProps {
  user: PublicUser
  wallet: Wallet
}

export function Header({ user, wallet }: HeaderProps): ReactNode {
  const t = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const initial = user.firstName.trim().charAt(0).toUpperCase() || '?'

  return (
    <header className="hub-header">
      <div className="hub-header__identity">
        <span className="hub-header__avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="hub-header__identity-text">
          <span className="hub-header__name">{user.firstName}</span>
          <span className="hub-header__level">{t('level', { level: user.level })}</span>
        </div>
      </div>
      <div className="hub-header__wallet">
        <span className="hub-header__pill hub-header__pill--coins" aria-label={t('coins')}>
          <span className="hub-header__pill-icon" aria-hidden="true">
            🪙
          </span>
          <Odometer value={wallet.coins} />
        </span>
        <span className="hub-header__pill hub-header__pill--gems" aria-label={t('gems')}>
          <span className="hub-header__pill-icon" aria-hidden="true">
            💎
          </span>
          <Odometer value={wallet.gems} />
        </span>
        <button
          type="button"
          className="hub-header__settings-btn"
          aria-label={t('settings')}
          onClick={() => setSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙️</span>
        </button>
      </div>
      {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} />}
    </header>
  )
}
