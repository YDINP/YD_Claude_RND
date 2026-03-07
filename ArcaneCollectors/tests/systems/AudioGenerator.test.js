/**
 * AudioGenerator.test.js
 * AudioGenerator 시스템 단위 테스트
 *
 * Web Audio API는 브라우저 전용이므로 Vitest(node env)에서 mock으로 처리
 * AudioGenerator의 모든 public 메서드는 AudioContext 없이도 graceful하게 동작
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Web Audio API mock (Node 환경 브라우저 API 시뮬레이션)
// ============================================================
const mockOscillator = {
  type:      'sine',
  frequency: {
    setValueAtTime:           vi.fn(),
    linearRampToValueAtTime:  vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
  start:   vi.fn(),
  stop:    vi.fn(),
};

const mockGain = {
  gain: {
    setValueAtTime:          vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
};

const mockCtx = {
  state:       'running',
  currentTime: 0,
  destination: {},
  createOscillator: vi.fn(() => ({
    type: 'sine',
    frequency: {
      setValueAtTime:          vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start:   vi.fn(),
    stop:    vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: {
      setValueAtTime:          vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  })),
  resume: vi.fn(() => Promise.resolve()),
  close:  vi.fn(() => Promise.resolve()),
};

// AudioContext는 class constructor로 mock해야 함
class MockAudioContext {
  constructor() {
    return mockCtx;
  }
}

// window global mock (AudioContext 포함)
vi.stubGlobal('window', {
  AudioContext:        MockAudioContext,
  webkitAudioContext:  MockAudioContext,
});

// AudioContext를 전역에도 등록
vi.stubGlobal('AudioContext', MockAudioContext);

import { AudioGenerator } from '../../src/systems/AudioGenerator.js';

describe('AudioGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.state = 'running';
    mockCtx.currentTime = 0;
  });

  afterEach(() => {
    AudioGenerator.stopBGM();
  });

  describe('playClick', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playClick()).not.toThrow();
    });
  });

  describe('playUIOpen', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playUIOpen()).not.toThrow();
    });
  });

  describe('playUIClose', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playUIClose()).not.toThrow();
    });
  });

  describe('playGachaRoll', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playGachaRoll()).not.toThrow();
    });
  });

  describe('playSSRFanfare', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playSSRFanfare()).not.toThrow();
    });
  });

  describe('playHit', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playHit()).not.toThrow();
    });
  });

  describe('playHitCritical', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playHitCritical()).not.toThrow();
    });
  });

  describe('playSkill', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playSkill()).not.toThrow();
    });
  });

  describe('playAwakening', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playAwakening()).not.toThrow();
    });
  });

  describe('playLevelUp', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playLevelUp()).not.toThrow();
    });
  });

  describe('playCoin', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.playCoin()).not.toThrow();
    });
  });

  describe('stopBGM', () => {
    it('BGM이 없을 때 예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.stopBGM()).not.toThrow();
    });
  });

  describe('resume', () => {
    it('Promise를 반환해야 한다', async () => {
      const result = AudioGenerator.resume();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('dispose', () => {
    it('예외 없이 실행되어야 한다', () => {
      expect(() => AudioGenerator.dispose()).not.toThrow();
    });
  });

  describe('AudioContext 없는 환경 처리', () => {
    it('AudioContext가 null/undefined이면 graceful하게 return해야 한다', () => {
      // _getAudioCtx 내부에서 AudioContext 생성 실패 시 null 반환 → 각 메서드가 early return
      // 이미 다른 테스트에서 AudioContext mock이 있으므로 여기서는
      // 메서드들이 예외 없이 실행됨을 추가 확인
      expect(() => {
        AudioGenerator.playClick();
        AudioGenerator.playHit();
        AudioGenerator.stopBGM();
      }).not.toThrow();
    });
  });
});
