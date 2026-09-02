import { describe, it, expect } from 'vitest';
// 순수 함수는 Phaser 비의존 src/utils/gachaRateDisclosure.js에 정의되어 있다.
// RateDisclosurePanel.js(PopupBase 상속)는 이를 re-export하지만, 그 파일은 Phaser를
// import하므로(PopupBase → phaser) vitest node 환경에서 직접 import할 수 없다.
import { buildRateRows } from '../../src/utils/gachaRateDisclosure.js';
import { GachaSystem } from '../../src/systems/GachaSystem.js';

// SSOT 검증: 테스트도 하드코딩하지 않고 GachaSystem에서 읽는다.
const RATES = GachaSystem.RATES;
const PITY_CONFIG = GachaSystem.PITY_CONFIG;

describe('buildRateRows (RateDisclosurePanel 순수 함수)', () => {
  it('등급별 확률 합이 100%가 된다 (N등급 0%는 표시에서 제외되어도 합계는 변하지 않음)', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, { pityCounter: 0 });
    const rarityRows = rows.filter((r) => r.type === 'rarity');
    const sum = rarityRows.reduce((acc, r) => acc + r.ratePercent, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('확률이 0%인 등급(N)은 rarityRows에서 제외된다 (GA-1: N풀 공백)', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, {});
    const rarityGrades = rows.filter((r) => r.type === 'rarity').map((r) => r.grade);
    expect(rarityGrades).not.toContain('N');
    expect(rarityGrades).toEqual(expect.arrayContaining(['SSR', 'SR', 'R']));
  });

  it('소프트 천장 남은 횟수를 정확히 계산한다 (소프트 도달 전)', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, { pityCounter: 60 });
    const soft = rows.find((r) => r.type === 'pity' && r.key === 'soft');
    expect(soft.remaining).toBe(PITY_CONFIG.softPity - 60);
    expect(soft.active).toBe(false);
  });

  it('소프트 천장 도달 후에는 remaining이 0이고 active가 true다', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, { pityCounter: PITY_CONFIG.softPity + 5 });
    const soft = rows.find((r) => r.type === 'pity' && r.key === 'soft');
    expect(soft.remaining).toBe(0);
    expect(soft.active).toBe(true);
  });

  it('하드 천장 남은 횟수를 정확히 계산한다', () => {
    const pityCounter = PITY_CONFIG.hardPity - 5;
    const rows = buildRateRows(RATES, PITY_CONFIG, { pityCounter });
    const hard = rows.find((r) => r.type === 'pity' && r.key === 'hard');
    expect(hard.remaining).toBe(5);
    expect(hard.active).toBe(false);
  });

  it('하드 천장 도달 시 확정(active) 상태가 된다', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, { pityCounter: PITY_CONFIG.hardPity });
    const hard = rows.find((r) => r.type === 'pity' && r.key === 'hard');
    expect(hard.active).toBe(true);
    expect(hard.remaining).toBe(0);
  });

  it('픽업 배너(hasPickup: true)에서는 pickup 행이 생성된다', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, {
      hasPickup: true,
      pickupPityCounter: 100
    });
    const pickup = rows.find((r) => r.type === 'pickup');
    expect(pickup).toBeDefined();
    expect(pickup.remaining).toBe(PITY_CONFIG.pickupPity - 100);
  });

  it('일반(standard) 배너(hasPickup: false)에서는 pickup 행이 없다', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, { hasPickup: false });
    const pickup = rows.find((r) => r.type === 'pickup');
    expect(pickup).toBeUndefined();
  });

  it('10연 SR 이상 확정 보장 행이 항상 포함된다', () => {
    const rows = buildRateRows(RATES, PITY_CONFIG, {});
    const guarantee = rows.find((r) => r.type === 'guarantee' && r.key === 'ten_pull_sr');
    expect(guarantee).toBeDefined();
  });

  it('카운터 미제공 시 기본값 0으로 안전하게 동작한다 (crash 없음)', () => {
    expect(() => buildRateRows(RATES, PITY_CONFIG, undefined)).not.toThrow();
    const rows = buildRateRows(RATES, PITY_CONFIG, undefined);
    const soft = rows.find((r) => r.type === 'pity' && r.key === 'soft');
    expect(soft.current).toBe(0);
  });
});
