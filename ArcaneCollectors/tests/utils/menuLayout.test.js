/**
 * menuLayout.test.js — 카테고리 도크 + 펼침 시트의 불변식 고정
 *
 * 지키는 것
 *   - 분류가 정본과 어긋나지 않는다 (13종 전부, 중복 없음, settings 없음)
 *   - 해금 필터가 카테고리째 숨긴다 (튜토리얼 0/3/4/7/13 단계)
 *   - 배지 롤업이 개수 합 + 우선순위 색을 지킨다
 *   - 펼침 상태 전이가 "한 번에 하나"를 지킨다
 *   - 좌표가 화면 안, 보상받기 버튼 아래, 터치 하한 위에 있다
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_W,
  BASE_H,
  MIN_TOUCH,
  MENU_CATEGORIES,
  MAX_ITEMS_PER_CATEGORY,
  MENU_DOCK,
  MENU_SHEET,
  categoryIdOf,
  getCategory,
  allMenuKeys,
  buildMenuCategories,
  resolveInitialExpanded,
  toggleExpanded,
  rollupCategoryBadges,
  computeCategoryDock,
  computeCategorySheet,
  computeMenuBand,
  menuIconTextureKey
} from '../../src/utils/menuLayout.js';
import { MAIN_LAYOUT } from '../../src/utils/mainMenuLayout.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { MenuGridGate } from '../../src/systems/MenuGridGate.js';

/** 튜토리얼 단계별 해금 목록 (src/data/tutorial.json 의 unlockMenus 누적) */
const UNLOCK_STAGES = {
  0: [],
  3: ['herolist', 'partyedit', 'ascension'],
  4: ['herolist', 'partyedit', 'ascension', 'quest'],
  7: ['herolist', 'partyedit', 'ascension', 'quest', 'inventory', 'gacha', 'collection'],
  13: [...SaveManager.ALL_MENU_KEYS]
};

describe('menuLayout — 카테고리 분류', () => {
  it('13종 메뉴를 빠짐없이, 중복 없이 담는다 (SaveManager.ALL_MENU_KEYS 정본)', () => {
    const keys = allMenuKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...SaveManager.ALL_MENU_KEYS].sort());
  });

  it('settings 는 카테고리에 없다 (상단바 톱니로 상시 접근)', () => {
    expect(allMenuKeys()).not.toContain('settings');
    expect(categoryIdOf('settings')).toBeNull();
  });

  it('popupKey → 카테고리 매핑이 팀 리드 확정안과 같다', () => {
    expect(categoryIdOf('herolist')).toBe('growth');
    expect(categoryIdOf('inventory')).toBe('growth');
    expect(categoryIdOf('quest')).toBe('challenge');
    expect(categoryIdOf('raid')).toBe('challenge');
    expect(categoryIdOf('pvp')).toBe('social');
    expect(categoryIdOf('friends')).toBe('social');
    expect(categoryIdOf('gacha')).toBe('collect');
    expect(categoryIdOf('collection')).toBe('collect');
    expect(categoryIdOf('unknown_key')).toBeNull();
  });

  it('카테고리는 4개이고 한 카테고리의 항목은 4개를 넘지 않는다 (시트가 항상 한 줄)', () => {
    expect(MENU_CATEGORIES).toHaveLength(4);
    expect(MAX_ITEMS_PER_CATEGORY).toBeLessThanOrEqual(4);
    MENU_CATEGORIES.forEach((c) => {
      expect(c.items.length, c.id).toBeGreaterThan(0);
      expect(c.items.length, c.id).toBeLessThanOrEqual(4);
    });
  });

  it('각 카테고리의 대표 아이콘 키가 그 카테고리 항목 중 하나다', () => {
    MENU_CATEGORIES.forEach((c) => {
      expect(c.items.map((i) => i.popupKey), c.id).toContain(c.representative);
      expect(typeof c.icon).toBe('string');
    });
  });
});

describe('menuLayout — 해금 필터', () => {
  it.each([
    [0, []],
    [3, ['growth']],
    [4, ['growth', 'challenge']],
    [7, ['growth', 'challenge', 'collect']],
    [13, ['growth', 'challenge', 'social', 'collect']]
  ])('해금 %i종이면 카테고리가 %j 만 보인다', (stage, expected) => {
    const categories = buildMenuCategories(UNLOCK_STAGES[stage]);
    expect(categories.map((c) => c.id)).toEqual(expected);
  });

  it('잠긴 항목은 카테고리 안에도 남지 않는다', () => {
    const categories = buildMenuCategories(UNLOCK_STAGES[7]);
    const growth = categories.find((c) => c.id === 'growth');
    expect(growth.items.map((i) => i.popupKey)).toEqual(['herolist', 'partyedit', 'ascension', 'inventory']);
    const challenge = categories.find((c) => c.id === 'challenge');
    expect(challenge.items.map((i) => i.popupKey)).toEqual(['quest']);
  });

  it('대표 아이콘이 잠겨 있으면 해금된 첫 항목으로 대체한다', () => {
    const categories = buildMenuCategories(['quest']);
    expect(categories).toHaveLength(1);
    expect(categories[0].representative).toBe('quest');   // tower 는 아직 잠김
  });

  it('MenuGridGate 가 파생한 해금 목록을 그대로 먹는다 (완주 유저 = 4카테고리 13항목)', () => {
    const save = { tutorial: { completed: true } };
    const unlocked = MenuGridGate.deriveUnlockedMenus(save, allMenuKeys());
    const categories = buildMenuCategories(unlocked);
    expect(categories).toHaveLength(4);
    expect(categories.reduce((n, c) => n + c.items.length, 0)).toBe(13);
  });
});

describe('menuLayout — 펼침 상태', () => {
  it('카테고리가 하나뿐이면 자동으로 펼친다 (온보딩 초반의 헛탭 제거)', () => {
    expect(resolveInitialExpanded(buildMenuCategories(UNLOCK_STAGES[3]))).toBe('growth');
  });

  it('카테고리가 둘 이상이면 전부 접은 채 시작한다', () => {
    expect(resolveInitialExpanded(buildMenuCategories(UNLOCK_STAGES[4]))).toBeNull();
    expect(resolveInitialExpanded(buildMenuCategories(UNLOCK_STAGES[13]))).toBeNull();
    expect(resolveInitialExpanded([])).toBeNull();
  });

  it('같은 카테고리를 다시 누르면 접히고, 다른 것을 누르면 갈아탄다 (한 번에 하나)', () => {
    expect(toggleExpanded(null, 'growth')).toBe('growth');
    expect(toggleExpanded('growth', 'growth')).toBeNull();
    expect(toggleExpanded('growth', 'challenge')).toBe('challenge');
    expect(toggleExpanded('growth', '')).toBe('growth');
  });
});

describe('menuLayout — 배지 롤업', () => {
  const categories = buildMenuCategories(UNLOCK_STAGES[13]);

  it('카테고리 배지 개수는 하위 항목 배지의 합이다', () => {
    const rollup = rollupCategoryBadges(categories, {
      ascension: { type: 'alert', count: 2 },
      inventory: { type: 'new', count: 3 }
    });
    expect(rollup.growth.count).toBe(5);
    expect(rollup.growth.keys.sort()).toEqual(['ascension', 'inventory']);
  });

  it('색은 우선순위가 높은 종류를 따른다 (reward > alert > new)', () => {
    const rollup = rollupCategoryBadges(categories, {
      herolist: { type: 'new', count: 1 },
      ascension: { type: 'alert', count: 1 },
      inventory: { type: 'reward', count: 1 }
    });
    expect(rollup.growth.type).toBe('reward');

    const noReward = rollupCategoryBadges(categories, {
      herolist: { type: 'new', count: 1 },
      ascension: { type: 'alert', count: 1 }
    });
    expect(noReward.growth.type).toBe('alert');
  });

  it('배지가 없는 카테고리는 아예 키가 생기지 않는다 (빈 점 방지)', () => {
    const rollup = rollupCategoryBadges(categories, { pvp: { type: 'alert', count: 1 } });
    expect(Object.keys(rollup)).toEqual(['social']);
  });

  it('count 0 인 배지도 항목이 존재하면 최소 1로 센다 (점은 찍혀야 한다)', () => {
    const rollup = rollupCategoryBadges(categories, { tower: { type: 'alert', count: 0 } });
    expect(rollup.challenge.count).toBe(1);
  });

  it('보이지 않는 카테고리의 항목 배지는 롤업되지 않는다', () => {
    const early = buildMenuCategories(UNLOCK_STAGES[3]);
    const rollup = rollupCategoryBadges(early, {
      ascension: { type: 'alert', count: 1 },
      guild: { type: 'reward', count: 9 }
    });
    expect(Object.keys(rollup)).toEqual(['growth']);
    expect(rollup.growth.count).toBe(1);
  });
});

describe('menuLayout — 도크 좌표', () => {
  it('도크는 화면 바닥에 닿는다 (고정 내비게이션으로 읽히는 근거)', () => {
    expect(MENU_DOCK.plate.y + MENU_DOCK.plate.h).toBe(BASE_H);
  });

  it('보이는 카테고리 수가 1~4 어느 쪽이든 가운데 정렬되고 화면 안에 있다', () => {
    for (let n = 1; n <= 4; n++) {
      const dock = computeCategoryDock(n);
      expect(dock.cells, `n=${n}`).toHaveLength(n);
      const mid = (dock.cells[0].x + dock.cells[n - 1].x) / 2;
      expect(mid, `n=${n}`).toBeCloseTo(BASE_W / 2, 5);
      dock.cells.forEach((cell) => {
        expect(cell.tile.x - cell.tile.w / 2).toBeGreaterThanOrEqual(0);
        expect(cell.tile.x + cell.tile.w / 2).toBeLessThanOrEqual(BASE_W);
        expect(cell.tile.y + cell.tile.h / 2).toBeLessThanOrEqual(BASE_H);
      });
    }
  });

  it('0개면 타일을 만들지 않는다 (신규 유저 첫 화면)', () => {
    expect(computeCategoryDock(0).cells).toHaveLength(0);
    expect(computeCategoryDock(undefined).cells).toHaveLength(0);
  });

  it('도크 타일이 터치 하한을 넘고 아이콘·라벨·갈매기가 타일 안에 들어간다', () => {
    computeCategoryDock(4).cells.forEach((cell) => {
      expect(Math.min(cell.hit.w, cell.hit.h)).toBeGreaterThanOrEqual(MIN_TOUCH);
      const top = cell.tile.y - cell.tile.h / 2;
      const bottom = cell.tile.y + cell.tile.h / 2;
      // 갈매기는 타일 위쪽 바깥에서 시트를 가리킨다 — 타일 상단 경계 근처에 붙어 있어야 한다
      expect(Math.abs(cell.caretY - top)).toBeLessThanOrEqual(16);
      expect(cell.iconY - cell.iconSize / 2).toBeGreaterThanOrEqual(top);
      expect(cell.iconY + cell.iconSize / 2).toBeLessThan(cell.labelY);
      expect(cell.labelY).toBeLessThan(bottom);
      expect(cell.badge.x).toBeGreaterThan(cell.tile.x);
      expect(cell.badge.y).toBeLessThan(cell.tile.y);
    });
  });
});

describe('menuLayout — 시트 좌표', () => {
  it('시트는 도크 위에 뜨고 서로 겹치지 않는다', () => {
    const sheet = computeCategorySheet(4);
    expect(sheet.panel.y + sheet.panel.h).toBeLessThanOrEqual(MENU_DOCK.plate.y);
  });

  it('항목 1~4개가 모두 한 줄 가운데 정렬로 패널 안에 들어간다', () => {
    for (let n = 1; n <= MAX_ITEMS_PER_CATEGORY; n++) {
      const { panel, cells } = computeCategorySheet(n);
      expect(cells, `n=${n}`).toHaveLength(n);
      const mid = (cells[0].x + cells[n - 1].x) / 2;
      expect(mid, `n=${n}`).toBeCloseTo(BASE_W / 2, 5);
      cells.forEach((cell) => {
        expect(cell.tile.x - cell.tile.w / 2, `n=${n}`).toBeGreaterThanOrEqual(panel.x);
        expect(cell.tile.x + cell.tile.w / 2, `n=${n}`).toBeLessThanOrEqual(panel.x + panel.w);
        expect(cell.tile.y - cell.tile.h / 2).toBeGreaterThanOrEqual(panel.y);
        expect(cell.tile.y + cell.tile.h / 2).toBeLessThanOrEqual(panel.y + panel.h);
      });
    }
  });

  it('시트 타일도 터치 하한을 넘는다', () => {
    computeCategorySheet(4).cells.forEach((cell) => {
      expect(Math.min(cell.hit.w, cell.hit.h)).toBeGreaterThanOrEqual(MIN_TOUCH);
    });
  });

  it('펼침 애니메이션은 200ms 를 넘지 않는다 (요구 상한)', () => {
    expect(MENU_SHEET.animMs).toBeLessThanOrEqual(200);
  });

  it('0개면 셀이 없다', () => {
    expect(computeCategorySheet(0).cells).toHaveLength(0);
  });
});

describe('menuLayout — 대역 · 아이콘 키', () => {
  it('접힘·펼침 어느 쪽도 보상받기 버튼을 침범하지 않는다', () => {
    const claimBottom = MAIN_LAYOUT.claim.y + MAIN_LAYOUT.claim.h;
    expect(computeMenuBand(false).y).toBeGreaterThan(claimBottom);
    expect(computeMenuBand(true).y).toBeGreaterThan(claimBottom);
  });

  it('접으면 펼쳤을 때보다 세로 점유가 줄고, 기존 그리드(315)보다도 작다', () => {
    const collapsed = computeMenuBand(false);
    const expanded = computeMenuBand(true);
    expect(collapsed.h).toBeLessThan(expanded.h);
    expect(collapsed.h).toBeLessThan(315);
  });

  it('이미지 아이콘 텍스처 키는 menu_ 접두사를 쓴다 (매니페스트 menuIcons 버킷 키와 동일)', () => {
    expect(menuIconTextureKey('gacha')).toBe('menu_gacha');
    expect(menuIconTextureKey('herolist')).toBe('menu_herolist');
  });

  it('getCategory 는 정의를 그대로 돌려주고 없는 id 는 null 이다', () => {
    expect(getCategory('growth').label).toBe('성장');
    expect(getCategory('nope')).toBeNull();
  });
});
