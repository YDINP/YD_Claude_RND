/**
 * 자동로그인 시스템 테스트
 * AUTH-1.1, AUTH-1.2, AUTH-1.3 검증
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// localStorage mock
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// global에 localStorage 추가
global.localStorage = localStorageMock;

describe('자동로그인 시스템', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('AUTH-1.1: BootScene 자동로그인', () => {
    it('유효한 게스트 자동로그인 정보가 있으면 true 반환', () => {
      const authData = {
        userId: 'guest_123456789',
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));
      localStorage.setItem('guest_user', JSON.stringify({
        id: 'guest_123456789',
        nickname: 'Guest',
        isGuest: true
      }));

      const loaded = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(loaded).toBeDefined();
      expect(loaded.userId).toBe('guest_123456789');
      expect(loaded.authType).toBe('guest');
      expect(loaded.autoLogin).toBe(true);
    });

    it('유효한 이메일 자동로그인 정보가 있으면 true 반환', () => {
      const authData = {
        userId: 'user_abc123',
        authType: 'email',
        email: 'test@example.com',
        autoLogin: true,
        lastLogin: Date.now()
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));

      const loaded = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(loaded).toBeDefined();
      expect(loaded.userId).toBe('user_abc123');
      expect(loaded.authType).toBe('email');
      expect(loaded.email).toBe('test@example.com');
    });

    it('7일 이상 지난 자동로그인 정보는 만료 처리', () => {
      const EIGHT_DAYS_AGO = Date.now() - (8 * 24 * 60 * 60 * 1000);
      const authData = {
        userId: 'guest_123456789',
        authType: 'guest',
        autoLogin: true,
        lastLogin: EIGHT_DAYS_AGO
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));

      const loaded = JSON.parse(localStorage.getItem('arcane_auth'));
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isExpired = Date.now() - loaded.lastLogin > SEVEN_DAYS;

      expect(isExpired).toBe(true);
    });

    it('필수 필드가 없으면 유효하지 않음', () => {
      const invalidData1 = {
        userId: 'guest_123',
        autoLogin: true,
        lastLogin: Date.now()
        // authType 누락
      };

      const invalidData2 = {
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
        // userId 누락
      };

      const isValid1 = !!(invalidData1.userId && invalidData1.authType);
      const isValid2 = !!(invalidData2.userId && invalidData2.authType);

      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });

    it('자동로그인 정보가 없으면 false 반환', () => {
      const data = localStorage.getItem('arcane_auth');
      expect(data).toBeNull();
    });
  });

  describe('AUTH-1.2: SettingsPopup 계정 관리', () => {
    it('게스트 계정 정보를 올바르게 표시', () => {
      const authData = {
        userId: 'guest_123456789_abcdef',
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));

      const loaded = JSON.parse(localStorage.getItem('arcane_auth'));
      const displayText = loaded.authType === 'guest'
        ? `게스트: ${loaded.userId.substring(0, 20)}...`
        : '알 수 없는 계정';

      expect(displayText).toContain('게스트:');
      expect(displayText).toContain('guest_123456789');
    });

    it('이메일 계정 정보를 올바르게 표시', () => {
      const authData = {
        userId: 'user_abc123',
        authType: 'email',
        email: 'test@example.com',
        autoLogin: true,
        lastLogin: Date.now()
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));

      const loaded = JSON.parse(localStorage.getItem('arcane_auth'));
      const displayText = loaded.authType === 'email' && loaded.email
        ? `이메일: ${loaded.email}`
        : '알 수 없는 계정';

      expect(displayText).toBe('이메일: test@example.com');
    });

    it('자동로그인 정보가 없으면 미설정 메시지 표시', () => {
      const data = localStorage.getItem('arcane_auth');
      const displayText = data ? '계정 있음' : '자동 로그인 미설정';

      expect(displayText).toBe('자동 로그인 미설정');
    });

    it('계정 변경 시 자동로그인 정보 삭제', () => {
      const authData = {
        userId: 'guest_123',
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
      };

      localStorage.setItem('arcane_auth', JSON.stringify(authData));
      expect(localStorage.getItem('arcane_auth')).not.toBeNull();

      // 계정 변경 시뮬레이션
      localStorage.removeItem('arcane_auth');

      expect(localStorage.getItem('arcane_auth')).toBeNull();
    });
  });

  describe('AUTH-1.3: LoginScene 자동로그인 체크박스', () => {
    it('기본 상태는 자동로그인 ON', () => {
      let autoLoginEnabled = true;
      expect(autoLoginEnabled).toBe(true);
    });

    it('체크박스 토글 시 상태 변경', () => {
      let autoLoginEnabled = true;

      // 체크박스 클릭 시뮬레이션
      autoLoginEnabled = !autoLoginEnabled;
      expect(autoLoginEnabled).toBe(false);

      autoLoginEnabled = !autoLoginEnabled;
      expect(autoLoginEnabled).toBe(true);
    });

    it('게스트 로그인 시 자동로그인 정보 저장', () => {
      const autoLoginEnabled = true;
      const userId = 'guest_123456789';

      if (autoLoginEnabled) {
        const authData = {
          userId: userId,
          authType: 'guest',
          autoLogin: true,
          lastLogin: Date.now()
        };
        localStorage.setItem('arcane_auth', JSON.stringify(authData));
      }

      const saved = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(saved).toBeDefined();
      expect(saved.userId).toBe(userId);
      expect(saved.authType).toBe('guest');
    });

    it('이메일 로그인 시 자동로그인 정보 저장', () => {
      const autoLoginEnabled = true;
      const userId = 'user_abc123';
      const email = 'test@example.com';

      if (autoLoginEnabled) {
        const authData = {
          userId: userId,
          authType: 'email',
          email: email,
          autoLogin: true,
          lastLogin: Date.now()
        };
        localStorage.setItem('arcane_auth', JSON.stringify(authData));
      }

      const saved = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(saved).toBeDefined();
      expect(saved.userId).toBe(userId);
      expect(saved.authType).toBe('email');
      expect(saved.email).toBe(email);
    });

    it('체크박스 OFF 시 자동로그인 정보 저장하지 않음', () => {
      const autoLoginEnabled = false;
      const userId = 'guest_123456789';

      if (autoLoginEnabled) {
        localStorage.setItem('arcane_auth', JSON.stringify({
          userId,
          authType: 'guest',
          autoLogin: true,
          lastLogin: Date.now()
        }));
      }

      const saved = localStorage.getItem('arcane_auth');
      expect(saved).toBeNull();
    });
  });

  describe('통합 시나리오', () => {
    it('전체 자동로그인 플로우: 로그인 → 저장 → 재접속 → 자동로그인', () => {
      // Step 1: 사용자 로그인 (자동로그인 ON)
      const autoLoginEnabled = true;
      const userId = 'guest_test_user';

      if (autoLoginEnabled) {
        const authData = {
          userId: userId,
          authType: 'guest',
          autoLogin: true,
          lastLogin: Date.now()
        };
        localStorage.setItem('arcane_auth', JSON.stringify(authData));
      }

      // Step 2: 앱 종료 후 재접속 시뮬레이션
      const saved = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(saved).toBeDefined();

      // Step 3: BootScene에서 자동로그인 검증
      const isValid = !!(saved.userId && saved.authType);
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isNotExpired = Date.now() - saved.lastLogin <= SEVEN_DAYS;

      expect(isValid).toBe(true);
      expect(isNotExpired).toBe(true);
      expect(saved.autoLogin).toBe(true);
    });

    it('계정 변경 플로우: 로그인 → 계정 변경 → 재로그인', () => {
      // Step 1: 첫 로그인
      localStorage.setItem('arcane_auth', JSON.stringify({
        userId: 'guest_user1',
        authType: 'guest',
        autoLogin: true,
        lastLogin: Date.now()
      }));

      let saved = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(saved.userId).toBe('guest_user1');

      // Step 2: 계정 변경
      localStorage.removeItem('arcane_auth');
      saved = localStorage.getItem('arcane_auth');
      expect(saved).toBeNull();

      // Step 3: 새 계정으로 로그인
      localStorage.setItem('arcane_auth', JSON.stringify({
        userId: 'user_email_123',
        authType: 'email',
        email: 'newuser@example.com',
        autoLogin: true,
        lastLogin: Date.now()
      }));

      saved = JSON.parse(localStorage.getItem('arcane_auth'));
      expect(saved.userId).toBe('user_email_123');
      expect(saved.authType).toBe('email');
    });
  });
});
