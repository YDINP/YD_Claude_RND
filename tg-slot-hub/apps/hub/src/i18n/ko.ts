/** 한국어 문자열. en.ts의 키 집합을 그대로 따른다 (누락 시 타입 에러). */
import type { TranslationKey } from './en'

const ko: Record<TranslationKey, string> = {
  appTitle: '슬롯 허브',
  tagline: '스핀하고 코인을 모아 순위를 올려보세요',
  coins: '코인',
  gems: '젬',
  level: 'Lv. {level}',
  lobbyTitle: '로비',
  jackpot: '잭팟',
  play: '플레이',
  comingSoon: '출시 예정',
  loading: '불러오는 중...',
  errorTitle: '문제가 발생했어요',
  errorRetry: '다시 시도',
  outsideTelegramTitle: '텔레그램 안에서 열어주세요',
  outsideTelegramMessage: '슬롯 허브는 텔레그램 앱 안에서만 실행돼요. 봇에서 다시 열어주세요.',
}

export default ko
