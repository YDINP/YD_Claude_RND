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
