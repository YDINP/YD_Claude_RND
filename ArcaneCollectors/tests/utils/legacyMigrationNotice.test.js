/**
 * legacyMigrationNotice.test.js — QA P1-5
 * 레거시 통합 안내 문구 조립. 순수 함수만 다룬다.
 */
import { describe, it, expect } from 'vitest';
import {
  LEGACY_NOTICE_TITLE,
  buildLegacyMigrationLines,
  formatLegacyMigrationNotice
} from '../../src/utils/legacyMigrationNotice.js';

/** SaveManager._migrateLegacyStarters 가 남기는 것과 같은 모양 */
const NOTICE = Object.freeze({
  removedCount: 4,
  removedIds: ['char_1', 'char_2', 'char_3', 'char_4'],
  heirId: 'base_iris',
  heirLevel: 27,
  equipmentReturned: 1,
  partyIds: ['base_iris'],
  at: 1700000000000
});

const NAMES = { base_iris: '아이리스' };
const OPTS = { resolveName: (id) => NAMES[id] };

describe('buildLegacyMigrationLines', () => {
  it('정리 수 · 레벨 승계 · 장비 반환 · 파티 재구성을 모두 알린다', () => {
    const lines = buildLegacyMigrationLines(NOTICE, OPTS);

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('4명');
    expect(lines[1]).toContain('아이리스');
    expect(lines[1]).toContain('Lv.27');
    expect(lines[2]).toContain('1개');
    expect(lines[3]).toContain('아이리스');
  });

  it('통지할 것이 없으면 빈 배열이다 (null · 0건 · 잘못된 값)', () => {
    expect(buildLegacyMigrationLines(null)).toEqual([]);
    expect(buildLegacyMigrationLines({ removedCount: 0 })).toEqual([]);
    expect(buildLegacyMigrationLines('nope')).toEqual([]);
  });

  it('비어 있는 항목은 줄을 만들지 않는다', () => {
    const lines = buildLegacyMigrationLines(
      { removedCount: 2, heirId: null, equipmentReturned: 0, partyIds: [] },
      OPTS
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('2명');
  });

  it('이름을 못 찾으면 id 를 그대로 쓴다 (문구가 사라지지 않는다)', () => {
    const lines = buildLegacyMigrationLines(NOTICE);

    expect(lines[1]).toContain('base_iris');
  });

  it('formatLegacyMigrationNotice 는 줄바꿈으로 잇고, 없으면 빈 문자열이다', () => {
    expect(formatLegacyMigrationNotice(NOTICE, OPTS).split('\n')).toHaveLength(4);
    expect(formatLegacyMigrationNotice(null)).toBe('');
  });

  it('제목 상수가 비어 있지 않다', () => {
    expect(LEGACY_NOTICE_TITLE.length).toBeGreaterThan(0);
  });
});
