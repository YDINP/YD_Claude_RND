import type { Level } from '@tgslot/shared'
import {
  LEVEL_UP_BONUS_MIN,
  LEVEL_UP_BONUS_PER_LEVEL,
  LEVEL_XP_BASE,
  LEVEL_XP_EXPONENT,
  LEVEL_XP_LEGACY_BASE,
  LEVEL_XP_LEGACY_EXPONENT,
  MAX_BET_TIERS,
} from './config.js'

/** 레벨 폭주(무한 루프) 방어용 상한. 누적 베팅으로 여기까지 오려면 천문학적인 xp가 필요하다. */
const MAX_LEVEL = 999

/**
 * 옛 곡선의 레벨 n 문턱. 새 곡선이 옛 곡선 이하임을 테스트로 고정하는 기준이다.
 */
export function legacyXpForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.round(LEVEL_XP_LEGACY_BASE * Math.pow(level, LEVEL_XP_LEGACY_EXPONENT))
}

/**
 * 레벨 n에 필요한 누적 xp. 레벨 1은 0이고, 그 위는 새 곡선과 옛 곡선 중 낮은 쪽이다.
 * min 덕분에 어떤 xp에서도 새 레벨 >= 옛 레벨이다(기존 사용자 레벨이 내려가지 않는다).
 * xp는 누적 베팅액이므로 정수이며, 문턱도 정수로 반올림해 비교를 단순하게 만든다.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  const fresh = Math.round(LEVEL_XP_BASE * Math.pow(level - 1, LEVEL_XP_EXPONENT))
  return Math.min(legacyXpForLevel(level), fresh)
}

/** 누적 xp로 도달한 레벨. 한 번에 여러 레벨을 건너뛸 수 있다. */
export function levelFromXp(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1
  return level
}

/** 이 레벨에서 허용되는 최대 베팅. 구간 표를 minLevel 내림차순으로 훑는다. */
export function maxBetForLevel(level: number): number {
  for (const tier of MAX_BET_TIERS) {
    if (level >= tier.minLevel) return tier.maxBet
  }
  // MAX_BET_TIERS는 minLevel 1 구간을 포함하므로 여기 도달하지 않는다.
  // 표를 잘못 고쳐 구멍이 생기면 조용히 잘못된 상한을 주는 것보다 터지는 편이 낫다.
  throw new Error(`[economy] MAX_BET_TIERS에 레벨 ${level}을 담는 구간이 없다`)
}

/** 레벨업 보너스. 여러 레벨을 한 번에 올려도 도달 레벨 기준으로 한 번만 지급한다. */
export function levelUpBonus(newLevel: number): number {
  return Math.max(LEVEL_UP_BONUS_MIN, LEVEL_UP_BONUS_PER_LEVEL * newLevel)
}

/** API 응답용 레벨 상태. level은 xp에서 파생되므로 저장값이 아니라 계산값을 신뢰한다. */
export function toLevelState(xp: number): Level {
  const level = levelFromXp(xp)
  return {
    level,
    xp,
    nextLevelXp: xpForLevel(level + 1),
    maxBet: maxBetForLevel(level),
    levelStartXp: xpForLevel(level),
    nextLevelBonus: levelUpBonus(level + 1),
    nextUnlock: nextUnlockAfter(level),
  }
}

/** 현재 레벨 다음에 최대 베팅이 늘어나는 첫 구간. 더 없으면 null. */
function nextUnlockAfter(level: number): { level: number; maxBet: number } | null {
  const current = maxBetForLevel(level)
  let found: { level: number; maxBet: number } | null = null
  for (const tier of MAX_BET_TIERS) {
    if (tier.maxBet > current && (found === null || tier.minLevel < found.level)) {
      found = { level: tier.minLevel, maxBet: tier.maxBet }
    }
  }
  return found
}
