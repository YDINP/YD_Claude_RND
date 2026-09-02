/**
 * 봇 메시지 다국어 리소스.
 * packages/shared의 SUPPORTED_LOCALES(en, ko)와 동일한 범위를 유지한다.
 */
export type Locale = 'en' | 'ko'

export interface BotMessages {
  welcome: (name: string) => string
  openHub: string
  help: string
  referralNoted: string
}

const messages: Record<Locale, BotMessages> = {
  en: {
    welcome: (name) =>
      `Welcome, ${name}! 🎰\n\nTap the button below to open the Slot Hub and start spinning.`,
    openHub: '🎰 Open Hub',
    help: 'Slot Hub commands:\n/start — open the mini app\n/help — show this message',
    referralNoted: "You joined via a friend's invite. Thanks for spinning with us!",
  },
  ko: {
    welcome: (name) =>
      `${name}님, 환영합니다! 🎰\n\n아래 버튼을 눌러 슬롯 허브를 열고 스핀을 시작하세요.`,
    openHub: '🎰 허브 열기',
    help: '슬롯 허브 명령어:\n/start — 미니앱 열기\n/help — 도움말 보기',
    referralNoted: '친구 초대로 입장하셨네요. 함께해 주셔서 감사합니다!',
  },
}

/** Telegram의 language_code(예: 'ko', 'ko-KR', 'en-US')에서 지원 locale을 고른다. 미지원/미상은 en. */
export function resolveLocale(languageCode: string | undefined): Locale {
  return languageCode?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function t(locale: Locale): BotMessages {
  return messages[locale]
}
