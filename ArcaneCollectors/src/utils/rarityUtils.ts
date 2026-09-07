/**
 * rarityUtils.ts - Rarity 타입 통합 유틸리티
 *
 * 캐릭터, 장비, 아이템 등 모든 시스템에서 rarity 접근 시 이 모듈을 사용합니다.
 *
 * 캐릭터 rarity: 숫자 (1~5) ↔ 문자열 키 ('N', 'R', 'SR', 'SSR', 'UR')
 * 장비 rarity: 문자열 키 ('N', 'R', 'SR', 'SSR')
 * 아이템 rarity: 별도 체계 ('common', 'uncommon', 'rare', 'epic')
 */

// ============================================
// 캐릭터/장비 등급 표준 정의
// ============================================

/** 표준 등급 상수 (숫자값) */
export const RARITY = {
  N: 1,
  R: 2,
  SR: 3,
  SSR: 4,
  UR: 5
} as const;

/** 등급 순서 배열 (진화 등에서 사용) */
export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'] as const;

export type RarityKey = typeof RARITY_ORDER[number];
export type RarityNum = 1 | 2 | 3 | 4 | 5;
export type RarityValue = RarityKey | RarityNum;

/**
 * 기본영웅(base_*)의 표시 등급.
 *
 * `base-heroes.json` 에 `rarity` 필드가 **없는 것은 의도다**. EVOLUTION_SYSTEM_GDD §2-1 의
 * 계층(미정령 → 기본영웅 → 전직영웅)에서 N/R/SR/SSR 등급 사다리는 **전직영웅부터** 적용되고,
 * 기본영웅은 그 아래 계층이라 등급 대신 계층 속성(`maxLevel: 30`, `statModifier: 0.55`)을 갖는다.
 *
 * 그래도 화면에는 등급을 하나 보여줘야 하므로, 이미 코드·기획이 합의한 값을 여기 한 곳에 둔다.
 *   - `GachaSystem.initializePool()` — 기본영웅을 R 풀에 편입
 *   - `SaveManager.getBaseStars()` / `_createStarterHeroRecord()` — `getRarityStars('R')` = 3성
 *   - `docs/story/SYSTEM_ONBOARDING_ECONOMY.md` §0-6·§1-5 — 온보딩 전투력 표 전체가 stars=3(R) 기준
 *
 * `getRarityKey(undefined)` 의 'N' 폴백은 "모르는 값"의 폴백이지 기본영웅 규칙이 아니다.
 * 그 폴백에 기대면 화면마다 등급이 갈린다(카드 N / 가챠 R).
 */
export const BASE_HERO_RARITY: RarityKey = 'R';

// ============================================
// 숫자 ↔ 문자열 변환 매핑
// ============================================

const KEY_TO_NUM: Record<string, number> = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 };

// 레거시 호환: characters.json의 기존 매핑 (1=N, 2=N, 3=R, 4=SR, 5=SSR)
const LEGACY_NUM_TO_KEY: Record<number, string> = { 1: 'N', 2: 'N', 3: 'R', 4: 'SR', 5: 'SSR' };
const LEGACY_KEY_TO_NUM: Record<string, number> = { N: 1, R: 3, SR: 4, SSR: 5 };

// ============================================
// 변환 함수
// ============================================

/**
 * 숫자 rarity를 문자열 등급 키로 변환합니다.
 * 이미 문자열이면 유효성 체크 후 그대로 반환합니다.
 *
 * 레거시 모드(기본값): characters.json의 기존 매핑 사용
 *   1,2 → 'N', 3 → 'R', 4 → 'SR', 5 → 'SSR'
 *
 * @param rarity - 숫자 또는 문자열 등급
 * @returns 'N' | 'R' | 'SR' | 'SSR' | 'UR'
 */
export function getRarityKey(rarity: RarityValue): RarityKey {
  if (typeof rarity === 'string') {
    return KEY_TO_NUM[rarity] !== undefined ? (rarity as RarityKey) : 'N';
  }
  return (LEGACY_NUM_TO_KEY[rarity] || 'N') as RarityKey;
}

/**
 * 문자열 등급을 숫자 rarity로 변환합니다.
 * 이미 숫자이면 범위 체크 후 그대로 반환합니다.
 *
 * @param rarity - 숫자 또는 문자열 등급
 * @returns 1~5
 */
export function getRarityNum(rarity: RarityValue): RarityNum {
  if (typeof rarity === 'number') {
    return (rarity >= 1 && rarity <= 5 ? rarity : 1) as RarityNum;
  }
  return (LEGACY_KEY_TO_NUM[rarity] || 1) as RarityNum;
}

/**
 * 주어진 rarity 값이 유효한지 검사합니다.
 *
 * @param value - 검사할 값
 * @returns 유효 여부
 */
export function isValidRarity(value: any): value is RarityValue {
  if (typeof value === 'number') {
    return value >= 1 && value <= 5;
  }
  if (typeof value === 'string') {
    return KEY_TO_NUM[value] !== undefined;
  }
  return false;
}

/**
 * 등급 기반 별(stars) 수를 반환합니다.
 * characters.json에서 숫자 rarity를 그대로 stars로 사용하는 패턴을 통합합니다.
 *
 * @param rarity - 숫자 또는 문자열 등급
 * @returns 별 수 (1~5)
 */
export function getRarityStars(rarity: RarityValue): RarityNum {
  if (typeof rarity === 'number') return rarity as RarityNum;
  return (LEGACY_KEY_TO_NUM[rarity] || 1) as RarityNum;
}

/**
 * 등급 비교 함수 (정렬용). 높은 등급이 앞으로 옵니다.
 *
 * @param a - 등급 A
 * @param b - 등급 B
 * @returns 정렬용 비교값 (음수: a가 상위)
 */
export function compareRarity(a: RarityValue, b: RarityValue): number {
  return getRarityNum(b) - getRarityNum(a);
}
