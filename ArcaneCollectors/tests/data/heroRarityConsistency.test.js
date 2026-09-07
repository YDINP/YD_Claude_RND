/**
 * heroRarityConsistency.test.js — 등급 표시 일관성
 *
 * ## 왜 이 파일이 있는가
 * `base-heroes.json` 의 기본영웅 10인에는 `rarity` 필드가 **없다**. 이것은 누락이 아니라
 * 설계다 — EVOLUTION_SYSTEM_GDD §2-1 의 계층(미정령 → 기본영웅 → 전직영웅)에서
 * N/R/SR/SSR 등급 사다리는 전직영웅부터 적용되고, 기본영웅은 등급 대신 계층 속성
 * (`maxLevel: 30`, `statModifier: 0.55`)을 갖는다.
 *
 * 그래도 화면에는 등급을 하나 보여줘야 한다. 그 값은 이미 코드·기획이 'R' 로 합의했다
 * (가챠 R 풀 편입 / `getRarityStars('R')` = 3성 / 온보딩 밸런스 표). 그래서 파생 등급의
 * SSOT 를 `rarityUtils.BASE_HERO_RARITY` 한 곳에 두고, 영웅 객체가 만들어지는
 * `data/index` 접근자에서 한 번만 얹는다.
 *
 * 이 테스트는 그 계약이 깨지는 두 가지 방식을 잡는다.
 *   1. 데이터 접근자가 등급을 안 얹는다 → `getRarityKey(undefined)` 의 'N' 폴백으로 떨어짐
 *   2. 표시 경로가 원본 `hero.rarity` 를 정규화 없이 직접 비교한다 → 화면마다 등급이 갈림
 *
 * 표시 경로 넷은 전부 Phaser 클래스라 node 환경에서 인스턴스화할 수 없다. 그래서
 * **각 경로가 쓰는 계산식을 그대로 옮겨 놓고**(주석에 출처 명시) 같은 영웅에 대해
 * 네 값이 일치하는지 본다. 계산식이 소스에서 바뀌면 아래 "계약" 절이 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  getAllBaseHeroes, getAllAscendedHeroes, getCharacterOrHero, getAllCharacters
} from '../../src/data/index.js';
import { getRarityKey, getRarityNum, BASE_HERO_RARITY } from '../../src/utils/rarityUtils.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf-8');

/**
 * gameConfig.js 는 씬 전체 + Phaser 를 import 하는 TDZ 허브라 node 환경에서 import 할 수
 * 없다(gameConfigCultColors.test.js 와 같은 제약). RARITY 의 stars 만 소스에서 읽는다.
 */
function readRarityStarsTable() {
  const source = read('src/config/gameConfig.js');
  const block = source.match(/export const RARITY = \{([\s\S]*?)\n\};/);
  const table = {};
  for (const [, key, stars] of block[1].matchAll(/(\w+):\s*\{[^}]*stars:\s*(\d+)/g)) {
    table[key] = Number(stars);
  }
  return table;
}

const RARITY_STARS = readRarityStarsTable();

// ============================================================
// 표시 경로 4종의 계산식 (출처 표기 — 소스가 바뀌면 아래 "계약" 절이 잡는다)
// ============================================================

/** HeroCard.createFrame() / createStarRating() — src/components/HeroCard.js */
const asHeroCard = (hero) => {
  const key = getRarityKey(hero.rarity);
  return { key, stars: RARITY_STARS[key] };
};

/** HeroInfoPopup._loadHero() — src/components/HeroInfoPopup.js */
const asHeroInfoPopup = (hero) => {
  const key = getRarityKey(hero.rarity);
  return { key, stars: hero.stars || getRarityNum(hero.rarity) || 1 };
};

/** GachaResultOverlay._createCard() — src/components/GachaResultOverlay.js */
const asGachaCard = (hero) => {
  const key = getRarityKey(hero.rarity);
  return { key, stars: hero.stars || getRarityNum(hero.rarity) || RARITY_STARS[key] || 1 };
};

/** HeroDetailScene.create() / refreshDerivedData() — src/scenes/HeroDetailScene.js */
const asHeroDetail = (hero, details = null) => {
  const key = getRarityKey(hero.rarity);
  return { key, stars: details?.stars ?? hero.stars ?? getRarityNum(hero.rarity) ?? 1 };
};

const PATHS = {
  '카드': asHeroCard,
  '정보팝업': asHeroInfoPopup,
  '가챠결과': asGachaCard,
  '상세씬': asHeroDetail
};

/** 전직영웅 표본 — 세 등급을 모두 덮는다 */
const ASCENDED_SAMPLE = ['asc_iris_olympus', 'asc_sera_kunlun', 'asc_lin_balance'];

// ============================================================

describe('기본영웅 파생 등급 (데이터 접근자)', () => {
  const baseHeroes = getAllBaseHeroes();

  it('기본영웅은 10인이다', () => {
    expect(baseHeroes).toHaveLength(10);
  });

  it('원본 JSON 에는 rarity 가 없다 — 파생 규칙이 SSOT 라는 전제', () => {
    const raw = JSON.parse(read('src/data/base-heroes.json'));
    expect(raw.baseHeroes.every((h) => h.rarity === undefined)).toBe(true);
  });

  it('접근자를 거치면 10인 전원이 BASE_HERO_RARITY 를 갖는다', () => {
    expect(BASE_HERO_RARITY).toBe('R');
    baseHeroes.forEach((hero) => {
      expect(hero.rarity, hero.id).toBe(BASE_HERO_RARITY);
    });
  });

  it('getCharacterOrHero 로 조회해도 같은 등급이 나온다', () => {
    baseHeroes.forEach((hero) => {
      expect(getCharacterOrHero(hero.id)?.rarity, hero.id).toBe(BASE_HERO_RARITY);
    });
  });

  it('등급을 얹어도 계층 속성(maxLevel 30 · statModifier 0.55)은 그대로다', () => {
    baseHeroes.forEach((hero) => {
      expect(hero.maxLevel, hero.id).toBe(30);
      expect(hero.statModifier, hero.id).toBe(0.55);
    });
  });

  it('같은 id 를 두 번 조회해도 같은 객체다 (매 호출 새 배열을 만들지 않는다)', () => {
    expect(getAllBaseHeroes()).toBe(getAllBaseHeroes());
    expect(getCharacterOrHero('base_iris')).toBe(getCharacterOrHero('base_iris'));
  });
});

describe('표시 경로 4종이 같은 등급·성급을 본다', () => {
  const subjects = [
    ...getAllBaseHeroes().map((h) => ({ id: h.id, hero: getCharacterOrHero(h.id) })),
    ...ASCENDED_SAMPLE.map((id) => ({ id, hero: getCharacterOrHero(id) })),
    ...getAllCharacters().map((c) => ({ id: c.id, hero: getCharacterOrHero(c.id) }))
  ];

  it('표본이 기본영웅 10 + 전직 3 + 레거시 4 다', () => {
    expect(subjects).toHaveLength(17);
    expect(subjects.every((s) => !!s.hero)).toBe(true);
  });

  it.each(subjects)('$id — 네 경로의 등급 키가 같다', ({ hero }) => {
    const keys = Object.entries(PATHS).map(([name, fn]) => [name, fn(hero).key]);
    const unique = new Set(keys.map(([, key]) => key));
    expect(Object.fromEntries(keys)).toBeTruthy();
    expect(unique.size, JSON.stringify(Object.fromEntries(keys))).toBe(1);
  });

  it.each(subjects)('$id — 네 경로의 성급이 같다', ({ hero }) => {
    const stars = Object.entries(PATHS).map(([name, fn]) => [name, fn(hero).stars]);
    const unique = new Set(stars.map(([, value]) => value));
    expect(unique.size, JSON.stringify(Object.fromEntries(stars))).toBe(1);
  });

  it('세이브 레코드에 stars 가 없어도 네 경로가 갈리지 않는다 (신규 계정 경로)', () => {
    const record = { ...getCharacterOrHero('base_iris'), stars: undefined, level: 1 };
    const stars = Object.values(PATHS).map((fn) => fn(record).stars);
    expect(new Set(stars).size).toBe(1);
    expect(stars[0]).toBe(3);
  });

  it('등급이 N 으로 떨어지는 영웅이 하나도 없다 — N 은 "모르는 값"의 폴백이다', () => {
    subjects.forEach(({ id, hero }) => {
      expect(getRarityKey(hero.rarity), id).not.toBe('N');
    });
  });

  it('기본영웅은 전부 R, 전직 표본은 데이터에 적힌 등급 그대로다', () => {
    getAllBaseHeroes().forEach((h) => expect(getRarityKey(h.rarity), h.id).toBe('R'));
    ASCENDED_SAMPLE.forEach((id) => {
      const hero = getCharacterOrHero(id);
      expect(getRarityKey(hero.rarity), id).toBe(hero.rarity);
    });
  });
});

describe('가챠 풀 편입', () => {
  it('기본영웅 10인이 전부 R 풀로 간다 (SYSTEM_ONBOARDING_ECONOMY §0-6)', () => {
    const pool = { SSR: [], SR: [], R: [], N: [] };
    getAllBaseHeroes().forEach((hero) => pool[getRarityKey(hero.rarity)].push(hero.id));

    expect(pool.R).toHaveLength(10);
    expect(pool.N).toHaveLength(0);
  });

  it('전직영웅은 자기 등급 그대로 분류된다', () => {
    const counts = { SSR: 0, SR: 0, R: 0, N: 0 };
    getAllAscendedHeroes().forEach((hero) => { counts[getRarityKey(hero.rarity)] += 1; });

    expect(counts).toEqual({ SSR: 13, SR: 8, R: 3, N: 0 });
  });
});

describe('계약 — 표시 경로가 원본 등급을 직접 비교하지 않는다', () => {
  const files = {
    'HeroCard.js': read('src/components/HeroCard.js'),
    'GachaResultOverlay.js': read('src/components/GachaResultOverlay.js'),
    'HeroInfoPopup.js': read('src/components/HeroInfoPopup.js'),
    'GachaPopup.js': read('src/components/popups/GachaPopup.js')
  };

  // 영웅 객체의 rarity 는 문자열·숫자·없음이 섞여 있다. 반면 `gacha-cutins.json` 의
  // preset.rarity 처럼 기획이 직접 적은 설정값은 항상 유효한 키라 비교해도 된다.
  const HERO_RARITY_COMPARE = /\b(hero|heroData|entry\.hero|char|charData|r)\.rarity\s*===\s*'(N|R|SR|SSR)'/;

  it.each(Object.entries(files))('%s — 영웅 등급을 원본 그대로 비교하지 않는다', (_name, source) => {
    expect(source).not.toMatch(HERO_RARITY_COMPARE);
  });

  it.each(Object.entries(files))('%s — getRarityKey 를 거친다', (_name, source) => {
    expect(source).toContain('getRarityKey');
  });

  it('데이터 접근자가 파생 등급을 얹는다 (호출부 개별 폴백이 아니라)', () => {
    const source = read('src/data/index.ts');
    expect(source).toContain('BASE_HERO_RARITY');
    expect(source).toMatch(/function withBaseRarity/);
  });

  it('가챠 풀 초기화가 자체 폴백을 두지 않는다', () => {
    expect(read('src/systems/GachaSystem.js')).not.toContain("hero.rarity || 'R'");
  });
});
