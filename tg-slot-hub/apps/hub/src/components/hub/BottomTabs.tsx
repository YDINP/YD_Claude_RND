/**
 * 하단 탭 바 — 로비 / 미션 / 리더보드. 해시 라우팅으로 전환한다.
 */
import type { ReactNode } from 'react'
import { useRoute, navigateToLobby, navigateToMissions, navigateToLeaderboard, type Route } from '../../router'
import { useT } from '../../i18n'
import './BottomTabs.css'

interface Tab {
  name: Route['name']
  label: string
  icon: string
  onClick: () => void
}

export function BottomTabs(): ReactNode {
  const t = useT()
  const route = useRoute()

  const tabs: Tab[] = [
    { name: 'lobby', label: t('tabLobby'), icon: '🎰', onClick: navigateToLobby },
    { name: 'missions', label: t('tabMissions'), icon: '📋', onClick: navigateToMissions },
    { name: 'leaderboard', label: t('tabLeaderboard'), icon: '🏆', onClick: navigateToLeaderboard },
  ]

  return (
    <nav className="hub-bottom-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.name}
          type="button"
          className="hub-bottom-tabs__tab"
          data-active={route.name === tab.name}
          onClick={tab.onClick}
        >
          <span className="hub-bottom-tabs__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="hub-bottom-tabs__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
