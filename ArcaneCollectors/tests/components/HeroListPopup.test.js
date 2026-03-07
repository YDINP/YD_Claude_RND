/**
 * HeroListPopup.test.js
 * Collection Codex UI unit tests (Vitest)
 * Tests pure utility functions without Phaser dependency
 * All Phaser/Supabase/SaveManager deps fully mocked via vi.mock()
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: { Clamp: (v, mn, mx) => Math.min(Math.max(v, mn), mx) },
    GameObjects: { Container: class {} },
    AUTO: 0,
  },
}));

vi.mock('../../src/config/gameConfig.js', () => ({
  COLORS: {
    primary: 0x6366f1, secondary: 0x8b5cf6, accent: 0xf59e0b,
    bg: 0x0f172a, panel: 0x1e293b, text: 0xffffff, subtext: 0x94a3b8,
    border: 0x334155, success: 0x10b981, warning: 0xf59e0b, danger: 0xef4444,
  },
  RARITY: {
    SSR: { color: 0xffd700, glow: 0xffd700 },
    SR:  { color: 0xc084fc, glow: 0xc084fc },
    R:   { color: 0x60a5fa, glow: 0x60a5fa },
    N:   { color: 0x94a3b8, glow: 0x94a3b8 },
  },
  CULT_COLORS: { olympus: 0xf59e0b, valhalla: 0x6366f1, chaos: 0xef4444, avalon: 0x10b981, kunlun: 0x3b82f6 },
  GAME_WIDTH: 1080,
  GAME_HEIGHT: 1920,
  s: (v) => v,
  sf: (v) => v,
}));

vi.mock('../../src/config/scaleConfig.js', () => ({
  GAME_WIDTH: 1080, GAME_HEIGHT: 1920,
  BASE_WIDTH: 720, SCALE_FACTOR: 1.5,
  s: (v) => v, sf: (v) => v,
}));

vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(),
    save: vi.fn(),
    getOwnedAscendedHeroes: vi.fn(() => []),
    getAllBaseHeroes: vi.fn(() => []),
    getPlayerData: vi.fn(() => ({ gems: 0, gold: 0, energy: 100 })),
  },
}));

vi.mock('../../src/components/PopupBase.js', () => ({
  PopupBase: class {
    constructor(scene, options) {
      this.scene = scene;
      this.panelWidth = (options && options.width) || 680;
      this.panelHeight = (options && options.height) || 1100;
      this.isOpen = false;
      this.container = null;
      this.contentContainer = null;
    }
    show() { this.isOpen = true; }
    hide() { this.isOpen = false; }
    addContent() {}
  },
}));

vi.mock('../../src/components/HeroInfoPopup.js', () => ({
  HeroInfoPopup: class { constructor() {} show() {} hide() {} },
}));

vi.mock('../../src/data/index.js', () => ({
  getCharacter: vi.fn((id) => ({ id, name: id, rarity: 'SR' })),
  getBaseHero: vi.fn((id) => ({ id, name: id, ascensionRoutes: [] })),
  getAscendedHero: vi.fn((id) => ({ id, name: id, rarity: 'SR' })),
  getAllBaseHeroes: vi.fn(() => []),
  getAllAscendedHeroes: vi.fn(() => []),
}));

vi.mock('../../src/utils/rarityUtils.js', () => ({
  getRarityKey: vi.fn((r) => (r && r.toUpperCase ? r.toUpperCase() : 'N')),
  getRarityNum: vi.fn((r) => ({ SSR: 5, SR: 4, R: 3, N: 1 }[r] || 1)),
}));

vi.mock('../../src/systems/ProgressionSystem.js', () => ({
  ProgressionSystem: { getLevelFromExp: vi.fn(() => 1) },
}));

vi.mock('../../src/systems/NavigationManager.js', () => ({
  default: { push: vi.fn(), pop: vi.fn(), getCurrentScene: vi.fn() },
}));

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: null,
  isSupabaseConfigured: vi.fn(() => false),
  isOnline: vi.fn(() => false),
}));

import {
  buildOwnedSet,
  calcCodexProgress,
  buildAscendedCardData,
  buildCodexSections,
} from '../../src/components/popups/HeroListPopup.js';

const BASE_IRIS = {
  id: 'base_iris',
  name: '아이리스',
  baseClass: 'warrior',
  ascensionRoutes: [
    { cultId: 'olympus',  ascendedHeroId: 'asc_iris_olympus',  resultRarity: 'SSR', routeKeywords: ['폭딥'],  resonanceBoost: false, loreHint: '올림포스의 빛' },
    { cultId: 'valhalla', ascendedHeroId: 'asc_iris_valhalla', resultRarity: 'SSR', routeKeywords: ['역전'],  resonanceBoost: true,  loreHint: '발할라의 용사' },
    { cultId: 'chaos',    ascendedHeroId: 'asc_iris_chaos',    resultRarity: 'SR',  routeKeywords: [],        resonanceBoost: false, loreHint: '' },
  ],
};

const BASE_SERA = {
  id: 'base_sera',
  name: '세라',
  baseClass: 'healer',
  ascensionRoutes: [
    { cultId: 'avalon', ascendedHeroId: 'asc_sera_avalon', resultRarity: 'SSR', routeKeywords: [], resonanceBoost: true,  loreHint: '아발론의 성녀' },
    { cultId: 'kunlun', ascendedHeroId: 'asc_sera_kunlun', resultRarity: 'SR',  routeKeywords: [], resonanceBoost: false, loreHint: '' },
  ],
};

const BASE_VOID = { id: 'base_void', name: '보이드', baseClass: 'mage', ascensionRoutes: [] };

const OWNED_SAMPLE = [
  { ascendedHeroId: 'asc_iris_olympus', baseHeroId: 'base_iris', cultId: 'olympus', rarity: 'SSR' },
  { ascendedHeroId: 'asc_sera_avalon',  baseHeroId: 'base_sera', cultId: 'avalon',  rarity: 'SSR' },
];

describe('buildOwnedSet', () => {
  it('정상 입력: 소유 영웅 ID Set 반환', () => {
    const result = buildOwnedSet(OWNED_SAMPLE);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(2);
    expect(result.has('asc_iris_olympus')).toBe(true);
    expect(result.has('asc_sera_avalon')).toBe(true);
  });

  it('빈 배열: 빈 Set 반환', () => {
    const result = buildOwnedSet([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('null 입력: 빈 Set 반환', () => {
    expect(buildOwnedSet(null).size).toBe(0);
  });

  it('undefined 입력: 빈 Set 반환', () => {
    expect(buildOwnedSet(undefined).size).toBe(0);
  });

  it('중복 ID: 중복 제거하여 Set 반환', () => {
    const withDup = [
      { ascendedHeroId: 'asc_iris_olympus' },
      { ascendedHeroId: 'asc_iris_olympus' },
    ];
    expect(buildOwnedSet(withDup).size).toBe(1);
  });

  it('숫자 배열 입력: Set 인스턴스 반환', () => {
    expect(buildOwnedSet([1, 2, 3])).toBeInstanceOf(Set);
  });

  it('문자열 배열 입력: Set 인스턴스 반환', () => {
    expect(buildOwnedSet(['a', 'b'])).toBeInstanceOf(Set);
  });
});

describe('calcCodexProgress', () => {
  it('소유 영웅 0명: owned=0, total=3', () => {
    const result = calcCodexProgress(BASE_IRIS, new Set());
    expect(result.owned).toBe(0);
    expect(result.total).toBe(3);
  });

  it('일부 소유: owned=1, total=3', () => {
    const result = calcCodexProgress(BASE_IRIS, new Set(['asc_iris_olympus']));
    expect(result.owned).toBe(1);
    expect(result.total).toBe(3);
  });

  it('전부 소유: owned=total', () => {
    const ownedSet = new Set(['asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos']);
    const result = calcCodexProgress(BASE_IRIS, ownedSet);
    expect(result.owned).toBe(3);
    expect(result.total).toBe(3);
  });

  it('ascensionRoutes 없음: owned=0, total=0', () => {
    const result = calcCodexProgress({ id: 'base_empty' }, new Set());
    expect(result.owned).toBe(0);
    expect(result.total).toBe(0);
  });

  it('빈 ascensionRoutes 배열: owned=0, total=0', () => {
    const result = calcCodexProgress(BASE_VOID, new Set());
    expect(result.owned).toBe(0);
    expect(result.total).toBe(0);
  });

  it('owned <= total 불변 조건 항상 성립', () => {
    const ownedSet = new Set(['asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos']);
    const result = calcCodexProgress(BASE_IRIS, ownedSet);
    expect(result.owned).toBeLessThanOrEqual(result.total);
  });
});

describe('buildAscendedCardData', () => {
  it('루트 수만큼 카드 반환', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    expect(result.length).toBe(3);
  });

  it('소유한 카드는 isOwned=true', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set(['asc_iris_olympus']));
    const card = result.find((c) => c.ascendedHeroId === 'asc_iris_olympus');
    expect(card.isOwned).toBe(true);
  });

  it('미소유 카드는 isOwned=false', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    result.forEach((card) => expect(card.isOwned).toBe(false));
  });

  it('resonanceBoost=true 카드 정확히 복사', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const valhalla = result.find((c) => c.cultId === 'valhalla');
    expect(valhalla.resonanceBoost).toBe(true);
  });

  it('resonanceBoost=false 카드 정확히 복사', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const chaos = result.find((c) => c.cultId === 'chaos');
    expect(chaos.resonanceBoost).toBe(false);
  });

  it('baseHeroId 필드 포함', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    result.forEach((card) => expect(card.baseHeroId).toBe('base_iris'));
  });

  it('baseHeroName 필드 포함', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    result.forEach((card) => expect(card.baseHeroName).toBe('아이리스'));
  });

  it('routeKeywords 배열 복사', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const olympus = result.find((c) => c.cultId === 'olympus');
    expect(olympus.routeKeywords).toEqual(['폭딥']);
  });

  it('routeKeywords 없는 루트: 빈 배열 기본값', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const chaos = result.find((c) => c.cultId === 'chaos');
    expect(chaos.routeKeywords).toEqual([]);
  });

  it('loreHint 필드 포함', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const olympus = result.find((c) => c.cultId === 'olympus');
    expect(olympus.loreHint).toBe('올림포스의 빛');
  });

  it('loreHint 없는 루트: 빈 문자열 기본값', () => {
    const result = buildAscendedCardData(BASE_IRIS.ascensionRoutes, BASE_IRIS, new Set());
    const chaos = result.find((c) => c.cultId === 'chaos');
    expect(chaos.loreHint).toBe('');
  });

  it('빈 루트 배열: 빈 카드 배열 반환', () => {
    const result = buildAscendedCardData([], BASE_IRIS, new Set());
    expect(result).toEqual([]);
  });
});

describe('buildCodexSections', () => {
  it('기본 영웅 수만큼 섹션 반환', () => {
    const sections = buildCodexSections([BASE_IRIS, BASE_SERA], buildOwnedSet(OWNED_SAMPLE));
    expect(sections.length).toBe(2);
  });

  it('각 섹션에 baseHero/cards/progress 포함', () => {
    const sections = buildCodexSections([BASE_IRIS], buildOwnedSet(OWNED_SAMPLE));
    const sec = sections[0];
    expect(sec).toHaveProperty('baseHero');
    expect(sec).toHaveProperty('cards');
    expect(sec).toHaveProperty('progress');
  });

  it('빈 배열 입력: 빈 섹션 배열 반환', () => {
    expect(buildCodexSections([], new Set())).toEqual([]);
  });

  it('null 입력: 빈 섹션 배열 반환', () => {
    expect(buildCodexSections(null, new Set())).toEqual([]);
  });

  it('소유 영웅에 따라 progress 정확히 계산', () => {
    const ownedSet = new Set(['asc_iris_olympus']);
    const sections = buildCodexSections([BASE_IRIS, BASE_SERA], ownedSet);
    const irisSec = sections.find((s) => s.baseHero.id === 'base_iris');
    expect(irisSec.progress.owned).toBe(1);
    expect(irisSec.progress.total).toBe(3);
    const seraSec = sections.find((s) => s.baseHero.id === 'base_sera');
    expect(seraSec.progress.owned).toBe(0);
    expect(seraSec.progress.total).toBe(2);
  });

  it('ascensionRoutes 없는 영웅: cards=[], progress.total=0', () => {
    const sections = buildCodexSections([BASE_VOID], new Set());
    expect(sections[0].cards).toEqual([]);
    expect(sections[0].progress.total).toBe(0);
  });

  it('대용량 입력 (10명): 섹션 10개 반환', () => {
    const heroes = Array.from({ length: 10 }, (_, i) => ({
      id: 'base_hero_' + i,
      name: 'hero' + i,
      ascensionRoutes: [
        { cultId: 'olympus', ascendedHeroId: 'asc_hero_' + i + '_oly', resultRarity: 'SSR', resonanceBoost: false },
      ],
    }));
    const sections = buildCodexSections(heroes, new Set());
    expect(sections.length).toBe(10);
  });

  it('전체 소유 시 모든 섹션 progress.owned === progress.total', () => {
    const allIds = new Set([
      'asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos',
      'asc_sera_avalon', 'asc_sera_kunlun',
    ]);
    const sections = buildCodexSections([BASE_IRIS, BASE_SERA], allIds);
    sections.forEach((sec) => {
      expect(sec.progress.owned).toBe(sec.progress.total);
    });
  });

  it('섹션 cards 배열의 baseHeroId가 모두 해당 영웅 id', () => {
    const sections = buildCodexSections([BASE_IRIS], new Set());
    sections[0].cards.forEach((card) => {
      expect(card.baseHeroId).toBe('base_iris');
    });
  });
});
