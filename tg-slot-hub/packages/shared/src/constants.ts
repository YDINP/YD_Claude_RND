/** 신규 유저 초기 지급 코인 */
export const STARTING_COINS = 10_000
/** 신규 유저 초기 젬 */
export const STARTING_GEMS = 0
/** initData auth_date 허용 최대 경과 시간 (초) */
export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60
/** JWT 만료 */
export const JWT_TTL = '7d'
export const SUPPORTED_LOCALES = ['en', 'ko'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
