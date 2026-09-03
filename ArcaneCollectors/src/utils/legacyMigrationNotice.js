/**
 * legacyMigrationNotice.js — 레거시 스타터 통합 1회성 안내 문구 (QA P1-5)
 *
 * `SaveManager._migrateLegacyStarters()` 는 폐지된 임시 동료(char_1~4)를 정리하면서
 * 레벨을 승계하고 장비를 반환하고 파티를 다시 맞춘다. 그 결과 레거시 유저는 보유 영웅이
 * 예고 없이 4명에서 1명으로 줄어든 화면을 보게 된다. 무엇이 어디로 갔는지 한 번은 말해야 한다.
 *
 * 이 모듈은 **순수 함수만** 둔다. Phaser·세이브 I/O·데이터 조회를 하지 않으며,
 * 영웅 표시 이름은 호출부가 `resolveName` 으로 넘긴다.
 */

/** 안내 제목 */
export const LEGACY_NOTICE_TITLE = '동료 정비 안내';

/** 확인 버튼 라벨 */
export const LEGACY_NOTICE_CONFIRM = '확인';

/**
 * 안내 문구 줄 목록.
 * 통지할 내용이 없으면 빈 배열을 돌려준다 — 호출부는 이때 아무것도 띄우지 않는다.
 *
 * @param {Object|null} notice - `onboarding.legacyMigrationNotice` 값
 * @param {number} [notice.removedCount] - 정리된 레거시 동료 수
 * @param {string|null} [notice.heirId] - 레벨을 승계한 영웅 id
 * @param {number} [notice.heirLevel] - 승계 후 레벨
 * @param {number} [notice.equipmentReturned] - 가방으로 돌아간 장비 수
 * @param {Array<string>} [notice.partyIds] - 재구성된 파티 편성
 * @param {Object} [options]
 * @param {(id: string) => string} [options.resolveName] - id → 표시 이름
 * @returns {Array<string>} 줄 목록
 */
export function buildLegacyMigrationLines(notice, options = {}) {
  if (!notice || typeof notice !== 'object') return [];

  const removed = Math.max(0, Math.floor(Number(notice.removedCount) || 0));
  if (removed <= 0) return [];

  const nameOf = typeof options.resolveName === 'function'
    ? (id) => String(options.resolveName(id) || id)
    : (id) => String(id);

  const lines = [`초기 버전의 임시 동료 ${removed}명을 정리했습니다.`];

  const heirLevel = Math.max(0, Math.floor(Number(notice.heirLevel) || 0));
  if (notice.heirId && heirLevel > 0) {
    lines.push(`· 최고 레벨은 ${nameOf(notice.heirId)} Lv.${heirLevel}로 이어졌습니다.`);
  }

  const returned = Math.max(0, Math.floor(Number(notice.equipmentReturned) || 0));
  if (returned > 0) {
    lines.push(`· 장착 중이던 장비 ${returned}개는 가방으로 돌아갔습니다.`);
  }

  const party = (Array.isArray(notice.partyIds) ? notice.partyIds : []).filter(Boolean);
  if (party.length > 0) {
    lines.push(`· 파티는 ${party.map(nameOf).join(', ')}(으)로 다시 맞췄습니다.`);
  }

  return lines;
}

/**
 * 안내 문구 전체 (줄바꿈 결합). 통지할 내용이 없으면 빈 문자열.
 * @param {Object|null} notice
 * @param {Object} [options]
 * @param {(id: string) => string} [options.resolveName]
 * @returns {string}
 */
export function formatLegacyMigrationNotice(notice, options = {}) {
  return buildLegacyMigrationLines(notice, options).join('\n');
}

export default {
  LEGACY_NOTICE_TITLE,
  LEGACY_NOTICE_CONFIRM,
  buildLegacyMigrationLines,
  formatLegacyMigrationNotice
};
