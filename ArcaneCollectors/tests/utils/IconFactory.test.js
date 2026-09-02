/**
 * IconFactory.test.js — T-07 벡터 아이콘 21종 확장 검증
 *
 * IconFactory는 Phaser를 import하지 않고 씬이 넘겨준 Graphics 객체만 호출하므로
 * node 환경에서 목(mock) 씬으로 실제 렌더 경로까지 그대로 검증할 수 있다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { IconFactory } from '../../src/utils/IconFactory.js';
import {
  ICON_SHAPES,
  ICON_SIZES,
  ICON_SIZE_TOKENS,
  REQUIRED_ICON_KEYS,
  MENU_ICON_KEYS,
  CLASS_ICON_KEYS,
  STAT_ICON_KEYS,
  buildTextureKey,
  derivePalette,
  hasIcon,
  normalizeIconKey,
  resolveIconSize,
  scaleOps,
  shadeColor,
  strokeWidthFor
} from '../../src/utils/iconPaths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

// ------------------------------------------------------------
// 목 씬: Phaser Graphics API 호출을 기록한다
// ------------------------------------------------------------
function makeMockScene() {
  const textures = new Map();
  const calls = [];

  const GRAPHICS_METHODS = [
    'fillStyle', 'lineStyle', 'fillPoints', 'strokePoints',
    'fillCircle', 'strokeCircle', 'fillEllipse', 'strokeEllipse',
    'fillRect', 'strokeRect', 'fillRoundedRect', 'strokeRoundedRect',
    'fillTriangle', 'strokeTriangle', 'lineBetween',
    'beginPath', 'closePath', 'arc', 'lineTo', 'strokePath', 'fillPath',
    'destroy'
  ];

  return {
    calls,
    textures: {
      exists: (k) => textures.has(k),
      map: textures
    },
    add: {
      graphics() {
        const g = {};
        GRAPHICS_METHODS.forEach((name) => {
          g[name] = (...args) => {
            calls.push({ name, args });
            return g;
          };
        });
        g.generateTexture = (key, w, h) => {
          textures.set(key, { w, h });
          calls.push({ name: 'generateTexture', args: [key, w, h] });
          return g;
        };
        return g;
      },
      image(x, y, key) {
        return {
          x,
          y,
          textureKey: key,
          setOrigin() {
            return this;
          }
        };
      }
    }
  };
}

const countGenerated = (scene) => scene.calls.filter((c) => c.name === 'generateTexture').length;

beforeEach(() => {
  IconFactory.clearCache();
});

// ============================================================
describe('T-07 아이콘 키 21종', () => {
  it('요구 21종(메뉴 13 + 클래스 4 + 스탯 4)이 모두 정의되어 있다', () => {
    expect(REQUIRED_ICON_KEYS).toHaveLength(21);
    expect(MENU_ICON_KEYS).toHaveLength(13);
    expect(CLASS_ICON_KEYS).toEqual(['warrior', 'mage', 'archer', 'healer']);
    expect(STAT_ICON_KEYS).toEqual(['hp', 'atk', 'def', 'spd']);

    REQUIRED_ICON_KEYS.forEach((key) => {
      expect(ICON_SHAPES[key], `${key} 아이콘 기하 누락`).toBeDefined();
      expect(Array.isArray(ICON_SHAPES[key])).toBe(true);
      expect(ICON_SHAPES[key].length).toBeGreaterThan(0);
    });
  });

  it('요구 키에 중복이 없다', () => {
    expect(new Set(REQUIRED_ICON_KEYS).size).toBe(REQUIRED_ICON_KEYS.length);
  });

  it('MainMenuScene 하단 메뉴의 모든 popupKey가 아이콘으로 해석된다 (이모지 완전 대체)', () => {
    const src = readFileSync(path.join(REPO, 'src/scenes/MainMenuScene.js'), 'utf-8');
    const popupKeys = [...src.matchAll(/popupKey:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);

    expect(popupKeys.length).toBeGreaterThanOrEqual(13);
    popupKeys.forEach((key) => {
      expect(hasIcon(key), `popupKey '${key}'에 대응하는 아이콘이 없다`).toBe(true);
    });
  });

  it('모든 아이콘은 최소 1개의 채움(fill) 명령을 가진다 — 빈 실루엣 방지', () => {
    Object.entries(ICON_SHAPES).forEach(([key, ops]) => {
      const filled = ops.filter((op) => op.fill);
      expect(filled.length, `${key}에 채움 명령이 없다`).toBeGreaterThan(0);
    });
  });

  it('별칭(popupKey·관용 표기)이 정식 키로 정규화된다', () => {
    expect(normalizeIconKey('herolist')).toBe('heroes');
    expect(normalizeIconKey('partyedit')).toBe('party');
    expect(normalizeIconKey('PvP')).toBe('pvp');
    expect(normalizeIconKey(' Settings ')).toBe('settings');
    expect(normalizeIconKey('attack')).toBe('atk');
    expect(normalizeIconKey('없는키')).toBeNull();
    expect(normalizeIconKey(null)).toBeNull();
  });
});

// ============================================================
describe('크기 프리셋 5단계 (§2-5)', () => {
  it('xs/sm/md/lg/xl 정확히 5단계이며 값이 16·24·32·48·64다', () => {
    expect(ICON_SIZE_TOKENS).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
    expect(Object.keys(ICON_SIZES)).toHaveLength(5);
    expect(ICON_SIZES).toEqual({ xs: 16, sm: 24, md: 32, lg: 48, xl: 64 });
  });

  it('프리셋은 단조 증가한다', () => {
    const values = ICON_SIZE_TOKENS.map((t) => ICON_SIZES[t]);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('resolveIconSize는 토큰·숫자·잘못된 입력을 모두 안전하게 처리한다', () => {
    expect(resolveIconSize('lg')).toBe(48);
    expect(resolveIconSize('XL')).toBe(64);
    expect(resolveIconSize(40)).toBe(40);
    expect(resolveIconSize(40.4)).toBe(40);
    expect(resolveIconSize(undefined)).toBe(ICON_SIZES.md);
    expect(resolveIconSize('없는토큰')).toBe(ICON_SIZES.md);
    expect(resolveIconSize(-5)).toBe(ICON_SIZES.md);
  });

  it('스트로크 두께는 md(32px)에서 정확히 2px이고 크기에 비례한다', () => {
    expect(strokeWidthFor(32)).toBe(2);
    expect(strokeWidthFor(64)).toBe(4);
    expect(strokeWidthFor(16)).toBe(1);
  });

  it('5단계 전부에서 21종을 구울 수 있다', () => {
    const scene = makeMockScene();
    ICON_SIZE_TOKENS.forEach((token) => {
      REQUIRED_ICON_KEYS.forEach((key) => {
        const texKey = IconFactory.create(scene, key, token);
        expect(texKey, `${key}@${token} 생성 실패`).toBeTruthy();
      });
    });
    expect(scene.textures.map.size).toBe(REQUIRED_ICON_KEYS.length * ICON_SIZE_TOKENS.length);
  });
});

// ============================================================
describe('텍스처 캐시 재사용', () => {
  it('같은 key+size는 텍스처를 두 번 굽지 않는다', () => {
    const scene = makeMockScene();
    const a = IconFactory.create(scene, 'gacha', 'lg');
    const b = IconFactory.create(scene, 'gacha', 'lg');

    expect(a).toBe(b);
    expect(countGenerated(scene)).toBe(1);
    expect(IconFactory._stats.created).toBe(1);
    expect(IconFactory._stats.reused).toBe(1);
  });

  it('별칭으로 요청해도 정식 키와 같은 텍스처를 재사용한다', () => {
    const scene = makeMockScene();
    const a = IconFactory.create(scene, 'heroes', 'md');
    const b = IconFactory.create(scene, 'herolist', 'md');

    expect(b).toBe(a);
    expect(countGenerated(scene)).toBe(1);
  });

  it('크기·tint·배경이 다르면 각각 별도 텍스처가 된다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'settings', 'md');
    IconFactory.create(scene, 'settings', 'lg');
    IconFactory.create(scene, 'settings', 'md', { tint: 0x06bbfa });
    IconFactory.create(scene, 'settings', 'md', { tint: 0x06bbfa, bg: true });

    expect(countGenerated(scene)).toBe(4);
    expect(new Set(scene.textures.map.keys()).size).toBe(4);
  });

  it('buildTextureKey는 순수 함수다 — 같은 입력이면 항상 같은 키', () => {
    const k1 = buildTextureKey('herolist', 'lg', { tint: 0x06bbfa });
    const k2 = buildTextureKey('heroes', 48, { tint: 0x06bbfa });
    expect(k1).toBe(k2);
    expect(k1).toBe('vicon_heroes_48_06bbfa');

    expect(buildTextureKey('heroes', 48, { tint: 0x06bbfa, bg: true })).not.toBe(k1);
  });

  it('정의 없는 키는 null을 돌려주고 텍스처를 만들지 않는다', () => {
    const scene = makeMockScene();
    expect(IconFactory.create(scene, 'nope', 'md')).toBeNull();
    expect(countGenerated(scene)).toBe(0);
  });
});

// ============================================================
describe('tint 팔레트 파생', () => {
  it('shadeColor는 0x000000~0xFFFFFF 범위를 벗어나지 않는다', () => {
    expect(shadeColor(0x808080, 1)).toBe(0xffffff);
    expect(shadeColor(0x808080, -1)).toBe(0x000000);
    expect(shadeColor(0x123456, 0)).toBe(0x123456);
  });

  it('base > dark > deep 순으로 어두워지고 light가 가장 밝다', () => {
    const p = derivePalette(0x06bbfa);
    const lum = (hex) => ((hex >> 16) & 0xff) + ((hex >> 8) & 0xff) + (hex & 0xff);
    expect(lum(p.light)).toBeGreaterThan(lum(p.base));
    expect(lum(p.base)).toBeGreaterThan(lum(p.dark));
    expect(lum(p.dark)).toBeGreaterThan(lum(p.deep));
    expect(lum(p.stroke)).toBeLessThan(lum(p.base));
  });

  it('tint를 주면 실제 드로우 색이 그 색 계열로 바뀐다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'def', 'lg', { tint: 0xff4d6d });
    const fills = scene.calls.filter((c) => c.name === 'fillStyle').map((c) => c.args[0]);
    expect(fills).toContain(0xff4d6d);
  });
});

// ============================================================
describe('기하 변환 (scaleOps)', () => {
  it('모든 아이콘의 좌표가 아이콘 박스 근처를 크게 벗어나지 않는다', () => {
    const px = 48;
    Object.entries(ICON_SHAPES).forEach(([key, ops]) => {
      scaleOps(ops, px).forEach((op) => {
        const coords = [];
        if (op.p) op.p.forEach(([x, y]) => coords.push(x, y));
        if (op.x !== undefined) coords.push(op.x, op.y);
        coords.forEach((v) => {
          expect(Number.isFinite(v), `${key}에 NaN 좌표`).toBe(true);
          expect(v, `${key} 좌표 ${v}가 범위를 크게 이탈`).toBeGreaterThan(-px * 0.4);
          expect(v).toBeLessThan(px * 1.4);
        });
      });
    });
  });

  it('크기를 2배로 하면 좌표도 2배가 된다 (선형 스케일)', () => {
    const [small] = scaleOps([ICON_SHAPES.def[0]], 32);
    const [large] = scaleOps([ICON_SHAPES.def[0]], 64);
    small.p.forEach(([x, y], i) => {
      expect(large.p[i][0]).toBeCloseTo(x * 2, 5);
      expect(large.p[i][1]).toBeCloseTo(y * 2, 5);
    });
  });

  it('원본 ICON_SHAPES를 변형하지 않는다 (불변)', () => {
    const before = JSON.stringify(ICON_SHAPES.tower);
    scaleOps(ICON_SHAPES.tower, 64);
    expect(JSON.stringify(ICON_SHAPES.tower)).toBe(before);
  });
});

// ============================================================
describe('렌더링 · 이미지 생성', () => {
  it('generateTexture가 요청 크기와 같은 정사각형으로 호출된다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'raid', 'xl');
    const call = scene.calls.find((c) => c.name === 'generateTexture');
    expect(call.args[1]).toBe(64);
    expect(call.args[2]).toBe(64);
  });

  it('그린 뒤 Graphics를 반드시 destroy한다 (누수 방지)', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'quest', 'md');
    expect(scene.calls.some((c) => c.name === 'destroy')).toBe(true);
  });

  it('bg 옵션은 원형 배경을 먼저 깐다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'guild', 'lg', { bg: true, bgColor: 0x141627 });
    const firstFill = scene.calls.find((c) => c.name === 'fillStyle');
    const firstShape = scene.calls.find((c) => c.name === 'fillCircle');
    expect(firstFill.args[0]).toBe(0x141627);
    expect(firstShape.args[2]).toBe(24); // 반지름 = 48 / 2
  });

  it('stroke:false면 스트로크를 그리지 않는다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'def', 'md', { stroke: false });
    const strokes = scene.calls.filter((c) => c.name.startsWith('stroke'));
    expect(strokes).toHaveLength(0);
  });

  it('createImage는 생성한 텍스처 키를 가진 이미지를 돌려준다', () => {
    const scene = makeMockScene();
    const img = IconFactory.createImage(scene, 10, 20, 'friends', 'lg');
    expect(img.textureKey).toBe(buildTextureKey('friends', 'lg', {}));
    expect(img.x).toBe(10);
    expect(IconFactory.createImage(scene, 0, 0, 'nope', 'lg')).toBeNull();
  });
});

// ============================================================
describe('레거시 API 하위 호환', () => {
  it('createIcon의 텍스처 키 규약(icon_{type}_{size})이 유지된다', () => {
    const scene = makeMockScene();
    expect(IconFactory.createIcon(scene, 'sword', 32)).toBe('icon_sword_32');
    expect(IconFactory.createIcon(scene, 'coin', 24)).toBe('icon_coin_24');
  });

  it('기존 7종을 모두 그릴 수 있고 같은 키는 재사용된다', () => {
    const scene = makeMockScene();
    const types = ['sword', 'shield', 'heart', 'star', 'coin', 'gem', 'energy'];
    types.forEach((t) => IconFactory.createIcon(scene, t, 32));
    types.forEach((t) => IconFactory.createIcon(scene, t, 32));
    expect(countGenerated(scene)).toBe(7);
  });

  it('createCurrencyIcon·createStatIcon의 매핑이 그대로다', () => {
    const scene = makeMockScene();
    expect(IconFactory.createCurrencyIcon(scene, 'gold', 24)).toBe('icon_coin_24');
    expect(IconFactory.createCurrencyIcon(scene, 'gem', 24)).toBe('icon_gem_24');
    expect(IconFactory.createStatIcon(scene, 'hp', 24)).toBe('icon_heart_24');
    expect(IconFactory.createStatIcon(scene, 'atk', 24)).toBe('icon_sword_24');
    expect(IconFactory.createStatIcon(scene, 'def', 24)).toBe('icon_shield_24');
    expect(IconFactory.createStatIcon(scene, 'spd', 24)).toBe('icon_star_24');
  });

  it('신규 벡터 스탯 아이콘은 레거시 스탯 아이콘과 키가 충돌하지 않는다', () => {
    const scene = makeMockScene();
    const legacy = IconFactory.createStatIcon(scene, 'hp', 32);
    const vector = IconFactory.create(scene, 'hp', 'md');
    expect(legacy).not.toBe(vector);
    expect(countGenerated(scene)).toBe(2);
  });

  it('preloadAllIcons는 레거시 7종과 벡터 전체를 굽는다', () => {
    const scene = makeMockScene();
    IconFactory.preloadAllIcons(scene, [32], { vectorSizes: ['lg'] });
    expect(scene.textures.map.has('icon_sword_32')).toBe(true);
    expect(scene.textures.map.has(buildTextureKey('gacha', 'lg', {}))).toBe(true);
    expect(countGenerated(scene)).toBe(7 + Object.keys(ICON_SHAPES).length);
  });

  it('clearCache는 캐시와 통계를 비운다', () => {
    const scene = makeMockScene();
    IconFactory.create(scene, 'tower', 'md');
    expect(IconFactory._cache.size).toBe(1);
    IconFactory.clearCache();
    expect(IconFactory._cache.size).toBe(0);
    expect(IconFactory._stats).toEqual({ created: 0, reused: 0 });
  });
});

// ============================================================
describe('부팅 안전성 (TDZ 회귀 방지)', () => {
  it('IconFactory·iconPaths는 씬 그래프(gameConfig)를 import하지 않는다', () => {
    ['src/utils/IconFactory.js', 'src/utils/iconPaths.js'].forEach((rel) => {
      const src = readFileSync(path.join(REPO, rel), 'utf-8');
      const imports = [...src.matchAll(/^import .*from\s+'([^']+)'/gm)].map((m) => m[1]);
      expect(imports, `${rel}이 gameConfig를 import한다`).not.toContain('../config/gameConfig.js');
      expect(imports.some((i) => i.includes('scenes/'))).toBe(false);
    });
  });

  it('static 필드에 designSystem 값이 즉시 평가되어 있지 않다', () => {
    const src = readFileSync(path.join(REPO, 'src/utils/IconFactory.js'), 'utf-8');
    const staticFields = [...src.matchAll(/^\s{2}static\s+(\w+)\s*=\s*(.+)$/gm)];
    staticFields.forEach(([, name, value]) => {
      expect(value, `static ${name}이 DESIGN을 즉시 평가한다`).not.toMatch(/DESIGN|COLORS/);
    });
  });
});
