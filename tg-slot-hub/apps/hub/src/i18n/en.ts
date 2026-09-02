/** 영어 문자열 — 기본 로케일. 다른 로케일 dictionary의 키 소스(source of truth). */
const en = {
  appTitle: 'Slot Hub',
  tagline: 'Spin, collect coins, and climb the leaderboard',
  coins: 'Coins',
  gems: 'Gems',
  level: 'Lv. {level}',
  lobbyTitle: 'Lobby',
  jackpot: 'Jackpot',
  play: 'Play',
  comingSoon: 'Coming soon',
  loading: 'Loading...',
  errorTitle: 'Something went wrong',
  errorRetry: 'Retry',
  outsideTelegramTitle: 'Open this app inside Telegram',
  outsideTelegramMessage:
    'Slot Hub only works inside the Telegram app. Open it from the bot to start playing.',
} as const

export default en
export type TranslationKey = keyof typeof en
