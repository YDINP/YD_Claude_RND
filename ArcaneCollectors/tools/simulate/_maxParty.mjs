/**
 * ============================================================
 * 최대 성장 4인 파티 전투력 계산 (공유 모듈)
 * ============================================================
 *
 * docs/BALANCE_REPORT.md §5-2 "최대 성장 4인 파티" 방법론을 그대로 이식한다.
 * 조건: 각 영웅 자기 만렙 · 6성 · 스킬 3종 전부 Lv10 · SSR 장비 4슬롯 전부 +15강 ·
 *       컬렉션 보너스 최대(hp +6% / atk·def +8% / spd +6%).
 *
 * 검증: docs/BALANCE_REPORT.md §5-2의 4개 수치(3733/3713/3519/3383, 합계 14,348)를
 *       "변경 전" ascended-heroes.json으로 그대로 재현함을 확인했다
 *       (tools/simulate 작성 과정의 수동 검증 — 이 파일 자체에는 테스트 코드 없음).
 *
 * SSOT: src/systems/ProgressionSystem.js
 *   - getBaseStatsAtLevel L241-255, getStarBonus L502-512,
 *     getFinalStats L539-558 (기본→성급→장비 가산→컬렉션 곱), calculatePower L632-649
 *
 * 장비/컬렉션 상수 출처: docs/BALANCE_REPORT.md §5-2, §5-3
 *   - equipBonus (SSR+15 4슬롯 합, 컬렉션 이전): { hp:3150, atk:750, def:450, spd:120 }
 *     (power 기여 계산: 3150/10 + 750 + 450 + 120 = 1,635 — 리포트 문구와 일치)
 *   - collectionBonus (최대): { hp:0.06, atk:0.08, def:0.08, spd:0.06 }
 *   - stars = 6 (MAX_STARS), skillLevelsSum = 30 (3종 × Lv10) → skillBonus = 300
 */

const STAT_KEYS = ['hp', 'atk', 'def', 'spd'];

export const MAX_PARTY_EQUIP_BONUS = { hp: 3150, atk: 750, def: 450, spd: 120 };
export const MAX_PARTY_COLLECTION_BONUS = { hp: 0.06, atk: 0.08, def: 0.08, spd: 0.06 };
export const MAX_PARTY_STARS = 6;
export const MAX_PARTY_SKILL_LEVELS_SUM = 30; // 3종 스킬 × Lv10

/**
 * 영웅 1명의 "완전 성장" 전투력 계산 (만렙·6성·풀스킬·풀장비·풀컬렉션)
 * @param {Object} hero ascended-heroes.json의 영웅 객체 (stats/growthStats/maxLevel 필요)
 * @returns {number} 전투력
 */
export function calcFullyGearedPower(hero) {
  const maxLevel = hero.maxLevel;
  const levelSteps = maxLevel - 1;

  const base = {};
  for (const key of STAT_KEYS) {
    base[key] = Math.floor(hero.stats[key] + hero.growthStats[key] * levelSteps);
  }

  const bonusPercent = (MAX_PARTY_STARS - 1) * 5;
  const starBonus = { hp: bonusPercent, atk: bonusPercent, def: bonusPercent, spd: Math.floor(bonusPercent / 2) };

  const final = {};
  for (const key of STAT_KEYS) {
    const withStars = base[key] * (1 + starBonus[key] / 100);
    const withEquip = withStars + MAX_PARTY_EQUIP_BONUS[key];
    final[key] = Math.floor(withEquip * (1 + MAX_PARTY_COLLECTION_BONUS[key]));
  }

  const skillBonus = MAX_PARTY_SKILL_LEVELS_SUM * 10;
  return Math.floor(final.hp / 10 + final.atk + final.def + final.spd + skillBonus);
}

/**
 * 전체 전직영웅 중 "완전 성장" 전투력 상위 4명을 뽑아 파티 전투력 상한을 계산한다.
 * @param {Array} ascendedHeroesArr ascended-heroes.json의 ascendedHeroes 배열
 * @returns {{ maxPartyPower: number, top4: Array<{id:string, rarity:string, power:number}> }}
 */
export function computeMaxPartyPower(ascendedHeroesArr) {
  const rows = ascendedHeroesArr
    .map(hero => ({ id: hero.id, rarity: hero.rarity, power: calcFullyGearedPower(hero) }))
    .sort((a, b) => b.power - a.power);

  const top4 = rows.slice(0, 4);
  const maxPartyPower = top4.reduce((sum, r) => sum + r.power, 0);

  return { maxPartyPower, top4, allRows: rows };
}
