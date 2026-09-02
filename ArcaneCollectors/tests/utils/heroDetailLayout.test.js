/**
 * heroDetailLayout.test.js — T-15
 * 영웅 상세 §3-3 배치 계산. Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  HERO_DETAIL_LAYOUT,
  HERO_DETAIL_TABS,
  STAT_MAX,
  EQUIP_SLOT_ORDER,
  MIN_TOUCH,
  BASE_WIDTH,
  getTabIds,
  resolveTabId,
  computeSlotRow,
  computeTabSlots,
  computeActionSlots,
  meetsTouchTarget,
  resolveFullbodyKey,
  fullbodyPath,
  hasFullbodyAsset,
  computeFullbodyFit,
  computeFullbodyAnchor,
  barRatio,
  splitStatArea,
  computeStatRows,
  computeRadarPlacement,
  computeGrid,
  computeEquipSlots,
  computeCardStack,
  fitsInContent,
  formatNumber,
  truncate,
  buildSubtitle
} from '../../src/utils/heroDetailLayout.js';

describe('화면 구획 — 겹침 해소', () => {
  it('헤더·스테이지·탭바·콘텐츠·액션바가 위에서 아래로 겹치지 않는다', () => {
    const L = HERO_DETAIL_LAYOUT;
    const bands = [L.header, L.stage, L.tabBar, L.content, L.actionBar];
    for (let i = 1; i < bands.length; i++) {
      const prevBottom = bands[i - 1].y + bands[i - 1].h;
      expect(bands[i].y).toBeGreaterThanOrEqual(prevBottom);
    }
  });

  it('액션 바가 화면 밖으로 나가지 않는다', () => {
    const bar = HERO_DETAIL_LAYOUT.actionBar;
    expect(bar.y + bar.h).toBeLessThanOrEqual(HERO_DETAIL_LAYOUT.height);
  });

  it('하단 55% 공백 회귀 방지 — 탭 콘텐츠가 화면 하단부를 실제로 채운다', () => {
    const L = HERO_DETAIL_LAYOUT;
    const filled = L.content.h + L.tabBar.h + L.actionBar.h;
    const lowerHalf = L.height - L.stage.y - L.stage.h; // 660 아래 영역
    expect(filled / lowerHalf).toBeGreaterThan(0.85);
  });
});

describe('탭 정의', () => {
  it('탭은 4개이고 id 가 중복되지 않는다', () => {
    const ids = getTabIds();
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('모든 탭에 라벨과 아이콘 키가 있다', () => {
    HERO_DETAIL_TABS.forEach((tab) => {
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.icon.length).toBeGreaterThan(0);
    });
  });

  it('알 수 없는 탭 id 는 첫 탭으로 폴백한다', () => {
    expect(resolveTabId('stats')).toBe('stats');
    expect(resolveTabId('nope')).toBe('stats');
    expect(resolveTabId(undefined)).toBe('stats');
  });
});

describe('computeSlotRow', () => {
  it('여백과 간격을 뺀 폭을 균등 분할한다', () => {
    const slots = computeSlotRow(4, { width: 720, margin: 20, gap: 8 });
    expect(slots).toHaveLength(4);
    const total = slots.reduce((sum, s) => sum + s.w, 0) + 8 * 3 + 40;
    expect(total).toBeCloseTo(720, 6);
  });

  it('첫 칸은 좌측 여백에서 시작하고 마지막 칸은 우측 여백에서 끝난다', () => {
    const slots = computeSlotRow(3, { width: 720, margin: 20, gap: 8 });
    expect(slots[0].x).toBe(20);
    const last = slots[slots.length - 1];
    expect(last.x + last.w).toBeCloseTo(700, 6);
  });

  it('칸 수가 유효하지 않으면 빈 배열이다', () => {
    expect(computeSlotRow(0)).toEqual([]);
    expect(computeSlotRow(-2)).toEqual([]);
    expect(computeSlotRow(undefined)).toEqual([]);
  });
});

describe('터치 타겟', () => {
  it('탭 4칸이 모두 최소 터치 타겟을 만족한다', () => {
    computeTabSlots().forEach((slot) => {
      expect(meetsTouchTarget(slot)).toBe(true);
    });
  });

  it('액션 버튼 3개가 모두 최소 터치 타겟을 만족한다', () => {
    computeActionSlots(3).forEach((slot) => {
      expect(meetsTouchTarget(slot)).toBe(true);
    });
  });

  it('장비 슬롯이 최소 터치 타겟 이상이다', () => {
    computeEquipSlots().forEach((slot) => {
      expect(slot.w).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(slot.h).toBeGreaterThanOrEqual(MIN_TOUCH);
    });
  });

  it('하한 미달 슬롯은 걸러낸다', () => {
    expect(meetsTouchTarget({ w: 40, h: 60 })).toBe(false);
    expect(meetsTouchTarget(null)).toBe(false);
  });

  it('탭 슬롯에 탭 메타데이터가 합쳐진다', () => {
    const slots = computeTabSlots();
    expect(slots.map((s) => s.id)).toEqual(getTabIds());
    expect(slots[0].y).toBe(HERO_DETAIL_LAYOUT.tabBar.y);
  });
});

describe('전신 시트 키·경로', () => {
  const map = { base_iris: 'hero_005', char_1: 'hero_001' };

  it('포트레이트 매핑을 재사용해 fb_ 키를 만든다', () => {
    expect(resolveFullbodyKey('base_iris', map)).toBe('fb_hero_005');
  });

  it('매핑이 없으면 null 이다', () => {
    expect(resolveFullbodyKey('unknown', map)).toBeNull();
    expect(resolveFullbodyKey('base_iris', null)).toBeNull();
    expect(resolveFullbodyKey(undefined, map)).toBeNull();
  });

  it('키에서 webp 경로를 되돌린다', () => {
    expect(fullbodyPath('fb_hero_005')).toBe('assets/characters/fullbody/hero_005.webp');
  });

  it('fb_ 접두사가 없는 키는 경로를 만들지 않는다', () => {
    expect(fullbodyPath('hero_005')).toBeNull();
    expect(fullbodyPath(null)).toBeNull();
  });

  it('매니페스트에 없는 키는 로드 대상이 아니다 (404 가드 회피)', () => {
    const manifest = { fb_hero_005: { path: 'x' } };
    expect(hasFullbodyAsset('fb_hero_005', manifest)).toBe(true);
    expect(hasFullbodyAsset('fb_hero_001', manifest)).toBe(false);
    expect(hasFullbodyAsset('fb_hero_005', null)).toBe(false);
  });
});

describe('computeFullbodyFit — 1024x1536 알파 시트', () => {
  it('세로를 스테이지 높이보다 살짝 크게 잡아 오버스캔한다', () => {
    const fit = computeFullbodyFit(1024, 1536, { overscan: 1.12 });
    expect(fit.height).toBeCloseTo(HERO_DETAIL_LAYOUT.stage.h * 1.12, 6);
    expect(fit.widthLimited).toBe(false);
  });

  it('가로가 허용 폭을 넘으면 가로 기준으로 다시 줄인다', () => {
    const fit = computeFullbodyFit(2000, 1000, { maxW: 500 });
    expect(fit.width).toBeCloseTo(500, 6);
    expect(fit.widthLimited).toBe(true);
    expect(fit.height).toBeLessThan(HERO_DETAIL_LAYOUT.stage.h * 1.12);
  });

  it('가로세로 비율을 유지한다', () => {
    const fit = computeFullbodyFit(683, 1024);
    expect(fit.width / fit.height).toBeCloseTo(683 / 1024, 6);
  });

  it('크기가 유효하지 않으면 배율 1 로 안전 복귀한다', () => {
    expect(computeFullbodyFit(0, 0).scale).toBe(1);
    expect(computeFullbodyFit(undefined, 1024).scale).toBe(1);
  });
});

describe('computeFullbodyAnchor', () => {
  it('발끝을 스테이지 바닥에 붙이고 리본이 그 위를 덮는다', () => {
    const anchor = computeFullbodyAnchor();
    const L = HERO_DETAIL_LAYOUT;
    const stageBottom = L.stage.y + L.stage.h;
    expect(anchor.y).toBe(stageBottom);
    expect(anchor.originY).toBe(1);
    // 리본이 발치를 덮어 오버스캔이 잘린 것처럼 보이지 않게 한다
    expect(L.ribbon.y).toBeLessThan(stageBottom);
    expect(L.ribbon.y + L.ribbon.h).toBeLessThanOrEqual(L.tabBar.y);
  });

  it('페이드 띠가 전신 하단과 리본 사이를 잇는다', () => {
    const L = HERO_DETAIL_LAYOUT;
    expect(L.fade.y).toBeGreaterThan(L.stage.y);
    expect(L.fade.y + L.fade.h).toBeGreaterThanOrEqual(L.ribbon.y);
  });

  it('가로 중앙보다 오른쪽에 선다 (좌측은 성급·전투력 열)', () => {
    expect(computeFullbodyAnchor().x).toBeGreaterThan(BASE_WIDTH / 2);
  });
});

describe('능력치 탭 좌우 분할', () => {
  it('좌측 수치 열과 우측 레이더 열이 겹치지 않는다', () => {
    const { left, right } = splitStatArea();
    expect(left.x + left.w).toBeLessThanOrEqual(right.x + 0.000001);
  });

  it('좌우 열이 콘텐츠 패널 안에 들어간다', () => {
    const { left, right } = splitStatArea();
    const content = HERO_DETAIL_LAYOUT.content;
    expect(left.y).toBeGreaterThanOrEqual(content.y);
    expect(right.y + right.h).toBeLessThanOrEqual(content.y + content.h);
    expect(right.x + right.w).toBeLessThanOrEqual(BASE_WIDTH - HERO_DETAIL_LAYOUT.margin);
  });

  it('스탯 4행이 순서대로 아래로 쌓이고 콘텐츠를 넘지 않는다', () => {
    const rows = computeStatRows({ hp: 900, atk: 90, def: 65, spd: 95 });
    expect(rows.map((r) => r.key)).toEqual(['hp', 'atk', 'def', 'spd']);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y).toBeGreaterThan(rows[i - 1].y);
    }
    const content = HERO_DETAIL_LAYOUT.content;
    expect(rows[rows.length - 1].y).toBeLessThan(content.y + content.h);
  });

  it('바 길이는 상한 대비 비율이고 상한을 넘어도 꽉 찬 상태에서 멈춘다', () => {
    const rows = computeStatRows({ hp: STAT_MAX.hp / 2, atk: STAT_MAX.atk * 3, def: 0, spd: -10 });
    expect(rows[0].fillW).toBeCloseTo(rows[0].barW / 2, 6);
    expect(rows[1].fillW).toBeCloseTo(rows[1].barW, 6);
    expect(rows[2].fillW).toBe(0);
    expect(rows[3].fillW).toBe(0);
  });

  it('스탯이 없어도 4행을 0 으로 만들어낸다', () => {
    const rows = computeStatRows(null);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });

  it('barRatio 는 0~1 로 잘린다', () => {
    expect(barRatio(50, 100)).toBe(0.5);
    expect(barRatio(500, 100)).toBe(1);
    expect(barRatio(-5, 100)).toBe(0);
    expect(barRatio(5, 0)).toBe(0);
    expect(barRatio(NaN, 100)).toBe(0);
  });

  it('레이더는 우측 열 안에 완전히 들어간다', () => {
    const { right } = splitStatArea();
    const radar = computeRadarPlacement(right);
    expect(radar.radius).toBeGreaterThan(0);
    expect(radar.cx - radar.radius).toBeGreaterThanOrEqual(right.x);
    expect(radar.cx + radar.radius).toBeLessThanOrEqual(right.x + right.w);
    expect(radar.cy + radar.radius).toBeLessThanOrEqual(right.y + right.h);
  });
});

describe('격자·카드 스택', () => {
  it('computeGrid 는 행과 열을 순서대로 채운다', () => {
    const cells = computeGrid(5, { columns: 2, cellW: 100, cellH: 50, gapX: 10, gapY: 10 });
    expect(cells).toHaveLength(5);
    expect(cells[1]).toMatchObject({ row: 0, col: 1, x: 110, y: 0 });
    expect(cells[4]).toMatchObject({ row: 2, col: 0, x: 0, y: 120 });
  });

  it('장비 슬롯 4칸이 콘텐츠 폭 안에 들어간다', () => {
    const slots = computeEquipSlots(EQUIP_SLOT_ORDER.length);
    expect(slots).toHaveLength(4);
    const last = slots[slots.length - 1];
    expect(last.x + last.w).toBeLessThanOrEqual(BASE_WIDTH - HERO_DETAIL_LAYOUT.margin);
  });

  it('스킬 카드 3장이 콘텐츠 구획을 넘지 않는다', () => {
    const cards = computeCardStack(3);
    expect(cards).toHaveLength(3);
    expect(fitsInContent(cards)).toBe(true);
  });

  it('카드가 너무 많으면 콘텐츠를 넘는 것을 감지한다', () => {
    expect(fitsInContent(computeCardStack(9))).toBe(false);
    expect(fitsInContent([])).toBe(true);
  });

  it('카드 수가 유효하지 않으면 빈 배열이다', () => {
    expect(computeCardStack(0)).toEqual([]);
  });
});

describe('표시 문자열', () => {
  it('전투력에 천 단위 구분 기호를 넣는다', () => {
    expect(formatNumber(1735)).toBe('1,735');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });

  it('긴 설명을 자르고 말줄임표를 붙인다', () => {
    expect(truncate('가나다라마', 3)).toBe('가나다…');
    expect(truncate('가나', 5)).toBe('가나');
    expect(truncate(null, 5)).toBe('');
  });

  it('부제는 빈 조각을 건너뛴다', () => {
    expect(buildSubtitle({ rarity: 'SSR', level: 12, cultName: '올림푸스' })).toBe('SSR · Lv.12 · 올림푸스');
    expect(buildSubtitle({ rarity: 'N', level: 1 })).toBe('N · Lv.1');
    expect(buildSubtitle({})).toBe('');
  });
});
