/**
 * TutorialTargetRegistry.test.js
 * T-C5 — TID 등록/해제와 3단 해석 (UX 문서 §4-1)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TutorialTargetRegistry,
  RESOLUTION_TIER,
  TID_NAME_PREFIX,
} from '../../src/systems/TutorialTargetRegistry.js';
import { SCALE_FACTOR } from '../../src/config/scaleConfig.js';

/** Phaser GameObject 최소 스텁 */
function makeObject(bounds, sceneKey = 'MainMenuScene') {
  return {
    scene: { scene: { key: sceneKey } },
    active: true,
    name: '',
    setName(value) { this.name = value; return this; },
    getBounds() { return { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h }; },
    destroy() { this.scene = null; },
  };
}

/** scene.children.getByName 스텁 */
function makeScene(objects = []) {
  return {
    children: {
      getByName: (name) => objects.find((o) => o.name === name) || null,
    },
  };
}

describe('TutorialTargetRegistry', () => {
  beforeEach(() => {
    TutorialTargetRegistry.clearAll();
  });

  it('등록 시 tid: 접두사 이름을 붙여 2단계 해석 폴백을 준비한다', () => {
    const obj = makeObject({ x: 10, y: 20, w: 30, h: 40 });
    TutorialTargetRegistry.register('mainmenu.menu.ascension', obj, 'MainMenuScene');

    expect(obj.name).toBe(`${TID_NAME_PREFIX}mainmenu.menu.ascension`);
    expect(TutorialTargetRegistry.has('mainmenu.menu.ascension')).toBe(true);
  });

  it('1단계 — 레지스트리 조회로 월드 바운드를 돌려준다', () => {
    const obj = makeObject({ x: 100, y: 200, w: 120, h: 135 });
    TutorialTargetRegistry.register('mainmenu.menu.quest', obj);

    const result = TutorialTargetRegistry.resolve('mainmenu.menu.quest');
    expect(result.tier).toBe(RESOLUTION_TIER.REGISTRY);
    expect(result.bounds).toEqual({ x: 100, y: 200, w: 120, h: 135 });
  });

  it('2단계 — 레지스트리에 없으면 scene.children.getByName 으로 찾는다', () => {
    const obj = makeObject({ x: 5, y: 6, w: 7, h: 8 });
    obj.setName(`${TID_NAME_PREFIX}mainmenu.idle.view`);
    const scene = makeScene([obj]);

    const result = TutorialTargetRegistry.resolve('mainmenu.idle.view', { scene });
    expect(result.tier).toBe(RESOLUTION_TIER.SCENE_NAME);
    expect(result.bounds.w).toBe(7);
  });

  it('3단계 — fallbackAnchor 는 s() 를 통과해 1080x1920 좌표가 된다', () => {
    const result = TutorialTargetRegistry.resolve('gacha.button.multi_ticket', {
      fallbackAnchor: { x: 380, y: 900, w: 180, h: 50 },
    });

    expect(result.tier).toBe(RESOLUTION_TIER.FALLBACK_ANCHOR);
    expect(result.bounds).toEqual({
      x: Math.round(380 * SCALE_FACTOR),
      y: Math.round(900 * SCALE_FACTOR),
      w: Math.round(180 * SCALE_FACTOR),
      h: Math.round(50 * SCALE_FACTOR),
    });
    expect(result.bounds.x).toBe(570);
  });

  it('전부 실패하면 null — 호출부는 마스킹을 해제하고 코치마크로 강등한다', () => {
    expect(TutorialTargetRegistry.resolve('ascension.button.ascend')).toBeNull();
  });

  it('파괴된 오브젝트는 조회 시 정리되고 폴백으로 강등된다', () => {
    const obj = makeObject({ x: 1, y: 2, w: 3, h: 4 });
    TutorialTargetRegistry.register('mainmenu.menu.tower', obj);
    obj.destroy();

    expect(TutorialTargetRegistry.get('mainmenu.menu.tower')).toBeNull();
    const result = TutorialTargetRegistry.resolve('mainmenu.menu.tower', {
      fallbackAnchor: { x: 0, y: 0, w: 80, h: 90 },
    });
    expect(result.tier).toBe(RESOLUTION_TIER.FALLBACK_ANCHOR);
  });

  it('clearScope 는 같은 scopeKey 의 항목만 제거한다', () => {
    TutorialTargetRegistry.register('mainmenu.menu.herolist', makeObject({ x: 0, y: 0, w: 1, h: 1 }));
    TutorialTargetRegistry.register('mainmenu.menu.partyedit', makeObject({ x: 0, y: 0, w: 1, h: 1 }));
    TutorialTargetRegistry.register('ascension.button.ascend', makeObject({ x: 0, y: 0, w: 1, h: 1 }));

    expect(TutorialTargetRegistry.clearScope('mainmenu')).toBe(2);
    expect(TutorialTargetRegistry.has('ascension.button.ascend')).toBe(true);
    expect(TutorialTargetRegistry.size).toBe(1);
  });

  it('padding 옵션으로 hitArea 와 시각 요소의 크기 차이를 보정한다 (UXI-11)', () => {
    const obj = makeObject({ x: 100, y: 100, w: 50, h: 50 });
    TutorialTargetRegistry.register('mainmenu.menu.inventory', obj, null, { padding: 6 });

    const { bounds } = TutorialTargetRegistry.resolve('mainmenu.menu.inventory');
    expect(bounds).toEqual({ x: 94, y: 94, w: 62, h: 62 });
  });

  it('sceneScopeKey 는 Scene 접미사를 떼고 소문자로 만든다', () => {
    expect(TutorialTargetRegistry.sceneScopeKey('MainMenuScene')).toBe('mainmenu');
    expect(TutorialTargetRegistry.scopeOf('gacha.button.multi_ticket')).toBe('gacha');
  });
});
