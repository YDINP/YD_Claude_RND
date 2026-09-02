/**
 * gachaRateDisclosure - 소환 확률 상시 고지 데이터 변환 (순수 함수, Phaser 비의존)
 *
 * 법적 요구(docs/story/SYSTEM_ONBOARDING_ECONOMY.md GA-4) + 가챠 재활성화 차단 조건.
 * 확률/피티 수치는 반드시 GachaSystem.RATES / GachaSystem.PITY_CONFIG (SSOT)에서 읽는다.
 * 하드코딩 금지.
 *
 * Phaser를 import하지 않는다 — RateDisclosurePanel.js(PopupBase 상속, Phaser 의존)와
 * 분리해 vitest node 환경에서 단위 테스트 가능하게 한다.
 */
import { GachaSystem } from '../systems/GachaSystem.js';
import { SaveManager } from '../systems/SaveManager.js';

const GRADE_ORDER = ['SSR', 'SR', 'R', 'N'];

/**
 * 확률/피티/카운터 데이터를 표시용 행(row) 배열로 변환한다.
 *
 * @param {Object} rates GachaSystem.RATES 형태 { SSR, SR, R, N } (0~1 소수)
 * @param {Object} pityConfig GachaSystem.PITY_CONFIG 형태 { softPity, hardPity, softPityBonus, pickupPity }
 * @param {Object} counters { pityCounter, pickupPityCounter, hasPickup }
 * @returns {Array<Object>} row 배열 (type: 'rarity' | 'pity' | 'pickup' | 'guarantee')
 */
export function buildRateRows(rates = {}, pityConfig = {}, counters = {}) {
  const safeCounters = counters || {};
  const pityCounter = Number.isFinite(safeCounters.pityCounter) ? safeCounters.pityCounter : 0;
  const pickupPityCounter = Number.isFinite(safeCounters.pickupPityCounter) ? safeCounters.pickupPityCounter : 0;
  const hasPickup = !!safeCounters.hasPickup;

  const softPity = pityConfig.softPity ?? 0;
  const hardPity = pityConfig.hardPity ?? 0;
  const softPityBonus = pityConfig.softPityBonus ?? 0;
  const pickupPity = pityConfig.pickupPity ?? 0;

  // 등급별 확률 행 — 0% 등급(N)은 표시 대상에서 제외 (GA-1: N풀 공백으로 확률 0 배정)
  const rarityRows = GRADE_ORDER
    .filter((grade) => (rates[grade] ?? 0) > 0)
    .map((grade) => ({
      type: 'rarity',
      grade,
      rate: rates[grade],
      ratePercent: Math.round((rates[grade] ?? 0) * 10000) / 100
    }));

  const pityRows = [
    {
      type: 'pity',
      key: 'soft',
      current: pityCounter,
      threshold: softPity,
      bonus: softPityBonus,
      remaining: Math.max(0, softPity - pityCounter),
      active: softPity > 0 && pityCounter >= softPity
    },
    {
      type: 'pity',
      key: 'hard',
      current: pityCounter,
      threshold: hardPity,
      remaining: Math.max(0, hardPity - pityCounter),
      active: hardPity > 0 && pityCounter >= hardPity
    }
  ];

  const pickupRows = hasPickup
    ? [{
        type: 'pickup',
        key: 'pickup',
        current: pickupPityCounter,
        threshold: pickupPity,
        remaining: Math.max(0, pickupPity - pickupPityCounter),
        active: pickupPity > 0 && pickupPityCounter >= pickupPity
      }]
    : [];

  const guaranteeRows = [{ type: 'guarantee', key: 'ten_pull_sr' }];

  return [...rarityRows, ...pityRows, ...pickupRows, ...guaranteeRows];
}

/**
 * 현재 세이브 상태 기준으로 buildRateRows()에 넣을 데이터를 조회해 조합한다.
 * @param {string|null} bannerId 조회할 배너 ID (null이면 현재 활성 배너)
 */
export function collectLiveRateRows(bannerId = null) {
  const gachaInfo = SaveManager.getGachaInfo();
  const pickupInfo = GachaSystem.isPickupGuaranteed(bannerId);
  return buildRateRows(GachaSystem.RATES, GachaSystem.PITY_CONFIG, {
    pityCounter: gachaInfo.pityCounter || 0,
    pickupPityCounter: pickupInfo.pickupPityCount || 0,
    hasPickup: pickupInfo.hasPickup
  });
}
