/**
 * gachaCutins.test.js — 캐릭터별 소환 컷인 프리셋 데이터 검증
 *
 * 이 데이터가 깨지면 SSR 을 뽑은 순간 화면이 비거나 잘못된 캐릭터가 뜬다.
 * 런타임에서 즉시 드러나지 않는(SSR 확률 1.5%) 종류의 결함이라 여기서 못박는다.
 */
import { describe, it, expect } from 'vitest';
import ASCENDED from '../../src/data/ascended-heroes.json';
import CULTS from '../../src/data/cults.json';
import STORY from '../../src/data/story.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import { MOOD_PARTICLE_COLORS } from '../../src/config/particleConfig.js';
import {
  CUTIN_ENTER,
  CUTIN_POSE,
  CUTIN_FORMAT,
  CUTIN_TIMING,
  getCutinData,
  listCutins,
  findCutinEntry,
  cultDefaults,
  moodDefaults,
  formatForRarity,
  resolveCutin,
  normalizeEnter,
  normalizePose,
  cssToHex,
  resolveAssetKey,
  resolveQuoteText,
  stripQuotes,
  typewriterSlice
} from '../../src/utils/gachaCutinPresets.js';

const ASC_HEROES = ASCENDED.ascendedHeroes;
const CULT_IDS = Object.keys(CULTS.cults);
const SCENES = STORY.scenes;

describe('데이터 커버리지', () => {
  it('전직영웅 24종이 빠짐없이 정의돼 있다', () => {
    expect(ASC_HEROES).toHaveLength(24);
    const defined = new Set(listCutins().map((entry) => entry.heroId));
    const missing = ASC_HEROES.filter((hero) => !defined.has(hero.id)).map((hero) => hero.id);
    expect(missing).toEqual([]);
    expect(listCutins()).toHaveLength(24);
  });

  it('heroId 가 중복되지 않는다', () => {
    const ids = listCutins().map((entry) => entry.heroId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cultId·rarity 가 ascended-heroes.json 과 일치한다', () => {
    const byId = new Map(ASC_HEROES.map((hero) => [hero.id, hero]));
    listCutins().forEach((entry) => {
      const hero = byId.get(entry.heroId);
      expect(hero, entry.heroId).toBeTruthy();
      expect(entry.cultId, entry.heroId).toBe(hero.cultId);
      expect(entry.rarity, entry.heroId).toBe(hero.rarity);
    });
  });

  it('교단 기본값이 cults.json 의 12교단 전부를 덮는다', () => {
    CULT_IDS.forEach((cultId) => {
      const defaults = cultDefaults(cultId);
      expect(defaults, cultId).toBeTruthy();
      expect(defaults.bg, cultId).toBeTruthy();
      expect(defaults.emblem, cultId).toBe(`icon_cult_${cultId}`);
    });
  });

  it('액센트 색이 cults.json 의 교단 색과 같다', () => {
    listCutins().forEach((entry) => {
      expect(entry.accent.toUpperCase(), entry.heroId)
        .toBe(CULTS.cults[entry.cultId].color.toUpperCase());
    });
  });
});

describe('참조 무결성', () => {
  it('quote 가 실제 story.json 씬과 대사 인덱스를 가리킨다', () => {
    const byId = new Map(SCENES.map((scene) => [scene.id, scene]));
    listCutins().forEach((entry) => {
      expect(entry.quote, entry.heroId).toBeTruthy();
      const scene = byId.get(entry.quote.sceneId);
      expect(scene, `${entry.heroId} → ${entry.quote.sceneId}`).toBeTruthy();
      expect(entry.quote.line).toBeGreaterThanOrEqual(0);
      expect(entry.quote.line).toBeLessThan(scene.lines.length);
    });
  });

  it('quote 가 가리키는 대사는 캐릭터 대사이고 비어 있지 않다', () => {
    listCutins().forEach((entry) => {
      const text = resolveQuoteText(entry.quote);
      expect(text, entry.heroId).toBeTruthy();
      expect(text.length, entry.heroId).toBeGreaterThan(0);
      expect(text.startsWith('"'), entry.heroId).toBe(false);
    });
  });

  it('quote 씬의 cultId 가 해당 컷인의 교단과 어긋나지 않는다', () => {
    const byId = new Map(SCENES.map((scene) => [scene.id, scene]));
    listCutins().forEach((entry) => {
      const scene = byId.get(entry.quote.sceneId);
      if (scene.cultId) expect(scene.cultId, entry.heroId).toBe(entry.cultId);
    });
  });

  it('particles 가 MOOD_PARTICLE_COLORS 키다', () => {
    listCutins().forEach((entry) => {
      expect(MOOD_PARTICLE_COLORS[entry.particles], entry.heroId).toBeTruthy();
    });
  });

  it('enter·fullbodyPose 가 허용된 값이다', () => {
    const enters = Object.values(CUTIN_ENTER);
    const poses = Object.values(CUTIN_POSE);
    listCutins().forEach((entry) => {
      expect(enters, entry.heroId).toContain(entry.enter);
      expect(poses, entry.heroId).toContain(entry.fullbodyPose);
    });
  });

  it('등장 방식 세 종류가 모두 실제로 쓰인다', () => {
    const used = new Set(listCutins().map((entry) => entry.enter));
    Object.values(CUTIN_ENTER).forEach((value) => expect(used).toContain(value));
  });
});

describe('에셋 키 — 매니페스트에 있거나 폴백이 성립한다', () => {
  it('배경 키가 전부 매니페스트에 있다', () => {
    const missing = listCutins()
      .map((entry) => ({ id: entry.heroId, ...resolveAssetKey(entry.bg, ASSET_MANIFEST) }))
      .filter((info) => !info.available);
    expect(missing).toEqual([]);
  });

  it('문장 키가 없으면 벡터 폴백 대상으로 식별된다', () => {
    // icon_cult_* 는 9교단만 생성돼 있다. 나머지는 available=false 로 나와야 하고,
    // 그 값이 곧 "벡터 룬 문장으로 내려가라" 는 신호다.
    const results = listCutins().map((entry) => ({
      id: entry.heroId,
      cult: entry.cultId,
      ...resolveAssetKey(entry.emblem, ASSET_MANIFEST)
    }));
    results.forEach((info) => {
      expect(typeof info.available, info.id).toBe('boolean');
      expect(info.key, info.id).toMatch(/^icon_cult_/);
    });
    // 최소한 절반 이상은 실제 아트가 있어야 컷인이 밋밋해지지 않는다
    expect(results.filter((info) => info.available).length).toBeGreaterThanOrEqual(12);
  });

  it('없는 키는 available=false 로 답한다', () => {
    expect(resolveAssetKey('bg_존재하지않음', ASSET_MANIFEST).available).toBe(false);
    expect(resolveAssetKey(null, ASSET_MANIFEST).available).toBe(false);
    expect(resolveAssetKey('bg_main', ASSET_MANIFEST).bucket).toBe('textures');
    expect(resolveAssetKey('bg_gacha', ASSET_MANIFEST).bucket).toBe('lazyTextures');
  });
});

describe('해석 — 기본값과 오버라이드', () => {
  it('명시된 영웅은 데이터 값을 그대로 쓴다', () => {
    const entry = findCutinEntry('asc_iris_olympus');
    const resolved = resolveCutin({ id: 'asc_iris_olympus', rarity: 'SSR', name: '올림푸스의 아이리스' });
    expect(resolved.explicit).toBe(true);
    expect(resolved.cultId).toBe('olympus');
    expect(resolved.bg).toBe(entry.bg);
    expect(resolved.emblem).toBe('icon_cult_olympus');
    expect(resolved.accent).toBe(entry.accent);
    expect(resolved.enter).toBe(entry.enter);
  });

  it('목록에 없는 영웅도 교단·분위기 기본값으로 조립된다', () => {
    const resolved = resolveCutin({ id: 'asc_미정_yomi', rarity: 'SSR', cult: 'yomi', mood: 'stoic' });
    expect(resolved.explicit).toBe(false);
    expect(resolved.cultId).toBe('yomi');
    expect(resolved.bg).toBe(cultDefaults('yomi').bg);
    expect(resolved.emblem).toBe('icon_cult_yomi');
    expect(resolved.enter).toBe(moodDefaults('stoic').enter);
    expect(resolved.particles).toBe('stoic');
  });

  it('교단도 분위기도 모르면 하드 폴백으로 내려간다', () => {
    const resolved = resolveCutin({ id: 'unknown', rarity: 'SSR' });
    expect(resolved.bg).toBeNull();
    expect(resolved.emblem).toBeNull();
    expect(resolved.accent).toBe('#06BBFA');
    expect(resolved.enter).toBe(CUTIN_ENTER.SLIDE);
    expect(resolved.particles).toBe('mystic');
  });

  it('빈 입력에도 터지지 않고 프리셋을 돌려준다', () => {
    const resolved = resolveCutin(null);
    expect(resolved.format).toBe(CUTIN_FORMAT.FULL);
    expect(resolved.timing.total).toBeGreaterThan(0);
  });

  it('등급이 격식과 길이를 정한다 — SR 은 간소판', () => {
    expect(formatForRarity('SSR')).toBe(CUTIN_FORMAT.FULL);
    expect(formatForRarity('SR')).toBe(CUTIN_FORMAT.BRIEF);
    expect(formatForRarity('R')).toBeNull();

    const brief = resolveCutin({ id: 'asc_omar_valhalla', rarity: 'SR' });
    expect(brief.format).toBe(CUTIN_FORMAT.BRIEF);
    expect(brief.timing.emblem).toBe(0);
    expect(brief.timing.quote).toBe(0);
    expect(brief.timing.total).toBeLessThan(CUTIN_TIMING[CUTIN_FORMAT.FULL].total);
  });

  it('SSR 컷인 1회는 기획 상한(전체 5초) 안에 들어간다', () => {
    expect(CUTIN_TIMING[CUTIN_FORMAT.FULL].total).toBeLessThanOrEqual(2600);
    expect(CUTIN_TIMING[CUTIN_FORMAT.BRIEF].total).toBeLessThanOrEqual(2000);
  });

  it('알 수 없는 enter·pose 값은 정규화된다', () => {
    expect(normalizeEnter('teleport')).toBe(CUTIN_ENTER.SLIDE);
    expect(normalizeEnter('burst')).toBe(CUTIN_ENTER.BURST);
    expect(normalizePose('center')).toBe(CUTIN_POSE.RIGHT);
    expect(normalizePose('left')).toBe(CUTIN_POSE.LEFT);
  });
});

describe('표시 헬퍼', () => {
  it('CSS 색을 Phaser hex 로 바꾼다', () => {
    expect(cssToHex('#FF6B35')).toBe(0xFF6B35);
    expect(cssToHex('27AE60')).toBe(0x27AE60);
    expect(cssToHex('빨강', 0x123456)).toBe(0x123456);
  });

  it('대사 양끝 따옴표를 벗긴다', () => {
    expect(stripQuotes('"안녕"')).toBe('안녕');
    expect(stripQuotes('  “안녕”  ')).toBe('안녕');
    expect(stripQuotes(null)).toBe('');
  });

  it('타이프라이터가 진행률만큼만 잘라 준다', () => {
    expect(typewriterSlice('가나다라', 0)).toBe('');
    expect(typewriterSlice('가나다라', 0.5)).toBe('가나');
    expect(typewriterSlice('가나다라', 1)).toBe('가나다라');
    expect(typewriterSlice('가나다라', 5)).toBe('가나다라');
    expect(typewriterSlice(null, 0.5)).toBe('');
  });

  it('깨진 quote 참조는 null 로 답한다', () => {
    expect(resolveQuoteText(null)).toBeNull();
    expect(resolveQuoteText({ sceneId: '없는씬', line: 0 })).toBeNull();
    expect(resolveQuoteText({ sceneId: 'cs_evolve_iris_olympus', line: 99 })).toBeNull();
  });
});

describe('문서 메타', () => {
  it('_meta 가 생성기·출처·폴백 규칙을 남긴다', () => {
    const meta = getCutinData()._meta;
    expect(meta.generatedBy).toBeTruthy();
    expect(meta.sources.length).toBeGreaterThanOrEqual(3);
    expect(meta.rules.length).toBeGreaterThan(0);
    expect(meta.fallback.length).toBeGreaterThan(0);
  });
});
