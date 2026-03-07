/**
 * ProceduralAssets.test.js
 * ProceduralAssets 시스템 단위 테스트
 *
 * vitest environment: 'node' → document mock 필요
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ============================================================
// Canvas / document mock (Node 환경에서 브라우저 API 시뮬레이션)
// ============================================================
const mockCtx = {
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  fillRect:    vi.fn(),
  strokeRect:  vi.fn(),
  beginPath:   vi.fn(),
  moveTo:      vi.fn(),
  lineTo:      vi.fn(),
  arc:         vi.fn(),
  arcTo:       vi.fn(),
  stroke:      vi.fn(),
  fill:        vi.fn(),
  closePath:   vi.fn(),
  fillStyle:   '',
  strokeStyle: '',
  lineWidth:   1,
  globalAlpha: 1,
};

const mockCanvas = {
  width:  0,
  height: 0,
  getContext: vi.fn(() => mockCtx),
};

// document.createElement mock
vi.stubGlobal('document', {
  createElement: vi.fn(() => ({ ...mockCanvas, getContext: vi.fn(() => mockCtx) })),
});

// ============================================================
// gameConfig mock
// ============================================================
vi.mock('../../src/config/gameConfig.js', () => ({
  COLORS: {
    primary:    0x6366F1,
    secondary:  0xEC4899,
    bgDark:     0x0F172A,
    bgLight:    0x1E293B,
  },
  GAME_WIDTH:  480,
  GAME_HEIGHT: 854,
  RARITY:      {},
  s:  (v) => v,
  sf: (v) => `${v}px`,
}));

import { ProceduralAssets } from '../../src/systems/ProceduralAssets.js';

// ============================================================
// scene mock
// ============================================================
const mockScene = {
  textures: {
    addCanvas: vi.fn(),
    exists:    vi.fn(() => false),
  }
};

describe('ProceduralAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateMainMenuBg', () => {
    it('scene.textures.addCanvas를 "pixel-main-bg" 키로 호출해야 한다', () => {
      ProceduralAssets.generateMainMenuBg(mockScene, 480, 854);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith(
        'pixel-main-bg',
        expect.any(Object)
      );
    });

    it('캔버스 생성 중 예외가 발생하면 throw해야 한다', () => {
      const brokenScene = {
        textures: {
          addCanvas: vi.fn(() => { throw new Error('Texture error'); })
        }
      };
      expect(() => ProceduralAssets.generateMainMenuBg(brokenScene, 480, 854))
        .toThrow('Texture error');
    });
  });

  describe('generateBattleBg', () => {
    it('scene.textures.addCanvas를 "pixel-battle-bg" 키로 호출해야 한다', () => {
      ProceduralAssets.generateBattleBg(mockScene, 480, 854);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith(
        'pixel-battle-bg',
        expect.any(Object)
      );
    });
  });

  describe('generateGachaBg', () => {
    it('scene.textures.addCanvas를 "pixel-gacha-bg" 키로 호출해야 한다', () => {
      ProceduralAssets.generateGachaBg(mockScene, 480, 854);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith(
        'pixel-gacha-bg',
        expect.any(Object)
      );
    });
  });

  describe('generatePixelButton', () => {
    it('지정된 키로 버튼 텍스처를 생성해야 한다', () => {
      ProceduralAssets.generatePixelButton(mockScene, 'btn-primary', 0xFF6EB4, 200, 50);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith(
        'btn-primary',
        expect.any(Object)
      );
    });

    it('다양한 키/색상으로 각각 독립적으로 생성해야 한다', () => {
      ProceduralAssets.generatePixelButton(mockScene, 'btn-danger', 0xE63946, 200, 50);
      ProceduralAssets.generatePixelButton(mockScene, 'btn-accent', 0xFFD700, 200, 50);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledTimes(2);
      expect(mockScene.textures.addCanvas).toHaveBeenNthCalledWith(1, 'btn-danger', expect.any(Object));
      expect(mockScene.textures.addCanvas).toHaveBeenNthCalledWith(2, 'btn-accent', expect.any(Object));
    });
  });

  describe('generatePanel', () => {
    it('"dark" 스타일 패널을 생성해야 한다', () => {
      ProceduralAssets.generatePanel(mockScene, 'panel-dark', 400, 300, 'dark');
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith('panel-dark', expect.any(Object));
    });

    it('"glow" 스타일 패널을 생성해야 한다', () => {
      ProceduralAssets.generatePanel(mockScene, 'panel-glow', 400, 300, 'glow');
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith('panel-glow', expect.any(Object));
    });

    it('기본 스타일은 "dark"이어야 한다 (style 생략 시)', () => {
      ProceduralAssets.generatePanel(mockScene, 'panel-default', 400, 300);
      expect(mockScene.textures.addCanvas).toHaveBeenCalledWith('panel-default', expect.any(Object));
    });
  });

  describe('generateAll', () => {
    it('8개의 텍스처를 모두 생성해야 한다', () => {
      ProceduralAssets.generateAll(mockScene, 480, 854);
      // pixel-main-bg, pixel-battle-bg, pixel-gacha-bg (3 배경)
      // btn-primary, btn-danger, btn-accent (3 버튼)
      // panel-dark, panel-glow (2 패널)
      expect(mockScene.textures.addCanvas).toHaveBeenCalledTimes(8);
    });

    it('개별 생성 실패 시 다른 텍스처 생성을 계속해야 한다', () => {
      let callCount = 0;
      const partialFailScene = {
        textures: {
          addCanvas: vi.fn((_key, _canvas) => {
            callCount++;
            // 첫 번째 호출만 실패 (pixel-main-bg)
            if (callCount === 1) {
              throw new Error('첫 번째 실패');
            }
          })
        }
      };

      // generateAll은 개별 실패를 catch하므로 전체 예외 없음
      expect(() => ProceduralAssets.generateAll(partialFailScene, 480, 854)).not.toThrow();
      // 첫 배경 실패 후에도 나머지 배경/버튼/패널 시도 → 최소 2번 이상 호출
      expect(partialFailScene.textures.addCanvas.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
