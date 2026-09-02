/**
 * 승리 배너 등급 — 라벨 매핑 + 로컬 폴백 + 배너 유지(hold) 시간.
 * 등급 자체는 렌더러가 `winTotal` 이벤트에 실어 보내는 값을 우선 신뢰한다(`@tgslot/renderer`의
 * `winTier()`, `docs/REFERENCE_PRAGMATIC.md` 기준 10/20/50/100배 = big/mega/epic/max).
 * 다만 이벤트에 유효한 tier가 없는(구버전 렌더러 등) 경우를 대비해 같은 임계값으로 로컬 폴백도 둔다 —
 * 임계값을 두 곳에서 따로 정의하지 않도록 `WIN_TIER_MULTIPLIERS`를 그대로 가져다 쓴다.
 */
import { WIN_TIER_MULTIPLIERS, type WinTier } from '@tgslot/renderer'
import type { TranslationKey } from '../i18n'

const KNOWN_TIERS: readonly WinTier[] = ['none', 'big', 'mega', 'epic', 'max']

function isWinTier(value: unknown): value is WinTier {
  return typeof value === 'string' && (KNOWN_TIERS as readonly string[]).includes(value)
}

/** 베팅액 대비 배수로 등급을 로컬 계산한다 — `event.tier`가 없을 때만 쓰는 폴백. */
function fallbackTierOf(multiple: number): WinTier {
  if (multiple >= WIN_TIER_MULTIPLIERS.max) return 'max'
  if (multiple >= WIN_TIER_MULTIPLIERS.epic) return 'epic'
  if (multiple >= WIN_TIER_MULTIPLIERS.mega) return 'mega'
  if (multiple >= WIN_TIER_MULTIPLIERS.big) return 'big'
  return 'none'
}

/**
 * 렌더러가 보낸 tier가 유효하면 그대로 쓰고, 아니면 `multiple`(총배당/베팅액)로 로컬 계산한다.
 */
export function resolveWinTier(eventTier: unknown, multiple: number): WinTier {
  if (isWinTier(eventTier)) return eventTier
  return fallbackTierOf(multiple)
}

export function winTierLabelKey(tier: WinTier): TranslationKey {
  switch (tier) {
    case 'max':
      return 'winMax'
    case 'epic':
      return 'winEpic'
    case 'mega':
      return 'winMega'
    case 'big':
      return 'winBig'
    default:
      return 'winPlain'
  }
}

/**
 * 등급 배너(릴 위 오버레이)를 화면에 붙잡아두는 시간(ms).
 * 배너는 이제 금액 없이 등급 단어만 보여준다(실제 금액은 WinStrip이 맡는다) — 그래서 "크고 짧게"
 * 1.2~2초 범위 안에서만 등급별로 살짝 차이를 둔다. 카운터 롤업 자체(그리고 WinStrip에 남는 최종
 * 금액)는 이 타이머와 무관하게 다음 스핀이 시작되기 전까지 그대로 유지된다.
 */
export const WIN_HOLD_MS: Record<WinTier, number> = {
  none: 1200,
  big: 1400,
  mega: 1600,
  epic: 1800,
  max: 2000,
}
