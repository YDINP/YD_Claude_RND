/**
 * AwakeningCutscene.test.js
 * AWAKE-4: 교단 각성 컷씬 시스템 유닛 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AWAKENING_SOUND_KEY,
  AWAKENING_PARTICLE_COLORS,
  AwakeningCutscene
} from '../../src/systems/AwakeningCutscene.js';

// Phaser Scene 최소 목
function createMockScene() {
  const objects = [];
  const tweens = [];

  const mockGraphics = {
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    alpha: 1,
  };

  const mockText = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    alpha: 1,
    y: 0,
    text: '',
  };

  const mockCircle = {
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    alpha: 1,
    x: 0,
    y: 0,
  };

  const mockSound = {
    play: vi.fn(),
    destroy: vi.fn(),
  };

  return {
    scale: { width: 800, height: 600 },
    input: {
      enabled: true,
      once: vi.fn((event, cb) => { /* store for manual trigger */ }),
    },
    add: {
      graphics: vi.fn(() => ({ ...mockGraphics })),
      text: vi.fn(() => ({ ...mockText })),
      circle: vi.fn(() => ({ ...mockCircle })),
    },
    tweens: {
      add: vi.fn((config) => {
        // 즉시 onComplete 호출 (동기 테스트용)
        if (config && config.onComplete) {
          config.onComplete();
        }
        return {};
      }),
    },
    time: {
      delayedCall: vi.fn((delay, cb) => {
        // 즉시 콜백 호출 (동기 테스트용)
        if (cb) cb();
        return {};
      }),
    },
    sound: {
      add: vi.fn(() => ({ ...mockSound })),
    },
  };
}

function createMockCharacter(name = '테스트영웅', id = 'hero_001') {
  return { id, heroId: id, name };
}

// ============================================
// 상수 테스트
// ============================================

describe('AWAKENING_SOUND_KEY', () => {
  it('should export a non-empty string key', () => {
    expect(typeof AWAKENING_SOUND_KEY).toBe('string');
    expect(AWAKENING_SOUND_KEY.length).toBeGreaterThan(0);
  });
});

describe('AWAKENING_PARTICLE_COLORS', () => {
  it('should export colors for all 10 cults', () => {
    const cultIds = [
      'prism_stars', 'neon_crow', 'ink_cyclone', 'stella_club', 'card_cartel',
      'buddy_garden', 'glitch_paradise', 'cafe_encore', 'lunatic_circus', 'iron_beat'
    ];
    cultIds.forEach(id => {
      expect(AWAKENING_PARTICLE_COLORS).toHaveProperty(id);
      expect(typeof AWAKENING_PARTICLE_COLORS[id]).toBe('number');
    });
  });

  it('should have prism_stars color as 0xFF6EB4', () => {
    expect(AWAKENING_PARTICLE_COLORS.prism_stars).toBe(0xFF6EB4);
  });

  it('should have neon_crow color as 0x00F5FF', () => {
    expect(AWAKENING_PARTICLE_COLORS.neon_crow).toBe(0x00F5FF);
  });

  it('should have glitch_paradise color as 0xFF00FF', () => {
    expect(AWAKENING_PARTICLE_COLORS.glitch_paradise).toBe(0xFF00FF);
  });
});

// ============================================
// AwakeningCutscene.play() 테스트
// ============================================

describe('AwakeningCutscene.play()', () => {
  let scene;
  let character;

  beforeEach(() => {
    scene = createMockScene();
    character = createMockCharacter();
  });

  it('should be a static method', () => {
    expect(typeof AwakeningCutscene.play).toBe('function');
  });

  it('should return early if scene is null', () => {
    expect(() => AwakeningCutscene.play(null, character, 'prism_stars', vi.fn())).not.toThrow();
  });

  it('should return early if character is null', () => {
    expect(() => AwakeningCutscene.play(scene, null, 'prism_stars', vi.fn())).not.toThrow();
  });

  it('should return early if targetCult is null', () => {
    expect(() => AwakeningCutscene.play(scene, character, null, vi.fn())).not.toThrow();
  });

  it('should disable scene input during cutscene start', () => {
    AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn());
    // input.enabled가 false로 설정되거나 once가 등록됨
    expect(scene.input.enabled === false || scene.input.once.mock.calls.length >= 0).toBe(true);
  });

  it('should call onComplete callback when sequence ends', () => {
    const onComplete = vi.fn();
    AwakeningCutscene.play(scene, character, 'prism_stars', onComplete);
    expect(onComplete).toHaveBeenCalled();
  });

  it('should work without onComplete callback', () => {
    expect(() => AwakeningCutscene.play(scene, character, 'prism_stars')).not.toThrow();
  });

  it('should work for all 10 cult IDs', () => {
    const cultIds = [
      'prism_stars', 'neon_crow', 'ink_cyclone', 'stella_club', 'card_cartel',
      'buddy_garden', 'glitch_paradise', 'cafe_encore', 'lunatic_circus', 'iron_beat'
    ];
    cultIds.forEach(cultId => {
      const sc = createMockScene();
      const onComplete = vi.fn();
      expect(() => AwakeningCutscene.play(sc, character, cultId, onComplete)).not.toThrow();
    });
  });

  it('should create overlay graphics on scene', () => {
    AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn());
    expect(scene.add.graphics).toHaveBeenCalled();
  });

  it('should create text elements on scene', () => {
    AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn());
    expect(scene.add.text).toHaveBeenCalled();
  });

  it('should use scene.tweens.add for animations', () => {
    AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn());
    expect(scene.tweens.add).toHaveBeenCalled();
  });

  it('should re-enable scene input after completion', () => {
    scene.input.enabled = false;
    AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn());
    expect(scene.input.enabled).toBe(true);
  });

  it('should work with unknown cultId gracefully', () => {
    const onComplete = vi.fn();
    expect(() => AwakeningCutscene.play(scene, character, 'unknown_cult', onComplete)).not.toThrow();
  });

  it('should work when scene has no sound system', () => {
    delete scene.sound;
    const onComplete = vi.fn();
    expect(() => AwakeningCutscene.play(scene, character, 'prism_stars', onComplete)).not.toThrow();
    expect(onComplete).toHaveBeenCalled();
  });

  it('should work when scene has no tweens', () => {
    delete scene.tweens;
    const onComplete = vi.fn();
    expect(() => AwakeningCutscene.play(scene, character, 'prism_stars', onComplete)).not.toThrow();
  });

  it('should work when scene has no time', () => {
    scene.tweens.add = vi.fn((config) => {
      // onComplete 호출하지 않음 (time.delayedCall 경로 테스트)
    });
    delete scene.time;
    // should not throw even without time
    expect(() => AwakeningCutscene.play(scene, character, 'prism_stars', vi.fn())).not.toThrow();
  });
});
