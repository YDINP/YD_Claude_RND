/**
 * AwakeningPopup.test.js
 * AWAKE-3: 교단 각성 UI 팝업 유닛 테스트 (Vitest)
 * Phaser 의존 없는 순수 로직 헬퍼 함수 중심 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// 모든 Phaser 의존성 모킹
// ============================================
vi.mock('phaser', () => ({
  default: {
    Math: { Clamp: (v, mn, mx) => Math.min(Math.max(v, mn), mx) },
    GameObjects: { Container: class {}, Graphics: class {} },
    Scene: class {},
    AUTO: 0,
  },
}));

vi.mock('../../src/config/scaleConfig.js', () => ({
  GAME_WIDTH: 1080, GAME_HEIGHT: 1920,
  BASE_WIDTH: 720, SCALE_FACTOR: 1.5,
  s: (v) => v, sf: (v) => v,
}));

vi.mock('../../src/config/gameConfig.js', () => ({
  COLORS: {
    primary: 0x6366f1, secondary: 0x8b5cf6, accent: 0xf59e0b,
    bg: 0x0f172a, panel: 0x1e293b, text: 0xffffff, subtext: 0x94a3b8,
    border: 0x334155, success: 0x10b981, warning: 0xf59e0b, danger: 0xef4444,
  },
  RARITY: {
    SSR: { color: 0xffd700 }, SR: { color: 0xc084fc },
    R: { color: 0x60a5fa }, N: { color: 0x94a3b8 },
  },
  GAME_WIDTH: 1080, GAME_HEIGHT: 1920,
  s: (v) => v, sf: (v) => v,
}));

vi.mock('../../src/systems/NavigationManager.js', () => ({
  default: { push: vi.fn(), pop: vi.fn(), getCurrentScene: vi.fn() },
}));

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: null,
  isSupabaseConfigured: vi.fn(() => false),
  isOnline: vi.fn(() => false),
}));

vi.mock('../../src/components/PopupBase.js', () => ({
  PopupBase: class {
    constructor(scene, options) {
      this.scene = scene;
      this.panelWidth = (options && options.width) || 680;
      this.panelHeight = (options && options.height) || 820;
      this.isOpen = false;
      this.contentBounds = {
        left: 0, top: 0, right: 680, bottom: 820,
        width: 680, height: 820, centerX: 340
      };
    }
    show() { this.isOpen = true; if (this.buildContent) this.buildContent(); }
    hide() { this.isOpen = false; }
    destroy() {}
    addText(x, y, text, style) {
      return { x, y, text, style, setOrigin: vi.fn(), destroy: vi.fn() };
    }
    addButton(x, y, w, h, label, color, cb) {
      return { x, y, w, h, label, color, cb, destroy: vi.fn() };
    }
  },
}));

vi.mock('../../src/systems/AwakeningSystem.js', () => {
  const AWAKENING_REQUIREMENTS = {
    prism_stars:     { rarity: 'SSR', affinityLevel: 30, materialCount: 30, materialName: '공명의 별빛 조각', trialStars: 3 },
    neon_crow:       { rarity: 'SSR', affinityLevel: 30, materialCount: 30, materialName: '암호화된 데이터 코어', trialStars: 3 },
    ink_cyclone:     { rarity: 'SR',  affinityLevel: 25, materialCount: 25, materialName: '잊크 정수', trialStars: 2 },
    stella_club:     { rarity: 'SSR', affinityLevel: 30, materialCount: 30, materialName: '별자리 파편', trialStars: 3 },
    card_cartel:     { rarity: 'SR',  affinityLevel: 25, materialCount: 25, materialName: '욘인된 황금 카드', trialStars: 2 },
    cafe_encore:     { rarity: 'R',   affinityLevel: 20, materialCount: 20, materialName: '중립의 커피 원두', trialStars: 1 },
    iron_beat:       { rarity: 'SR',  affinityLevel: 25, materialCount: 25, materialName: '언더그라운드 공연 기록', trialStars: 2 },
    lunatic_circus:  { rarity: 'SSR', affinityLevel: 30, materialCount: 30, materialName: '환상의 마술 인장', trialStars: 3 },
    buddy_garden:    { rarity: 'SR',  affinityLevel: 25, materialCount: 25, materialName: '공생의 씨줸', trialStars: 2 },
    glitch_paradise: { rarity: 'SR',  affinityLevel: 25, materialCount: 25, materialName: '카오스 오류 데이터', trialStars: 2 },
  };
  const AWAKENING_STAGE_NAMES = {
    0: '방랑자', 1: '관심', 2: '입문',
    3: '수련', 4: '서약', 5: '각성 완료'
  };
  return { AWAKENING_REQUIREMENTS, AWAKENING_STAGE_NAMES };
});

// ============================================
// import 대상
// ============================================
import {
  getCultRarity,
  computeLevelCondition,
  computeCanAwaken,
  getMaterialDisplayInfo,
  formatCultName,
  LEVEL_REQUIREMENTS_BY_RARITY,
  AwakeningPopup
} from '../../src/ui/AwakeningPopup.js';

// ============================================
// Mock 헬퍼
// ============================================
function createMockAwakeningSystem({
  affinityOk = false,
  materialCurrent = 0,
  materialRequired = 30,
  materialFulfilled = false,
  trialOk = false,
  affinityVal = 0,
  affinityRequired = 30,
  trialRequired = 3,
  materialInfo = null,
  executeResult = { success: true }
} = {}) {
  return {
    checkAffinityCondition: vi.fn(() => affinityOk),
    checkMaterialCondition: vi.fn(() => ({
      current: materialCurrent,
      required: materialRequired,
      fulfilled: materialFulfilled
    })),
    checkTrialCondition: vi.fn(() => trialOk),
    getAwakeningProgress: vi.fn(() => ({
      stage: 0,
      affinity: affinityVal,
      affinityRequired,
      materials: materialCurrent,
      materialsRequired: materialRequired,
      trialCleared: trialOk,
      trialRequired
    })),
    getMaterialInfo: vi.fn(() => materialInfo),
    executeAwakening: vi.fn(() => executeResult),
  };
}

function createMockScene() {
  const graphicsMock = {
    lineStyle: vi.fn().mockReturnThis(),
    strokeRoundedRect: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    beginPath: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    strokePath: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
  const textMock = {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setText: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    text: '',
    alpha: 1,
    y: 0,
  };
  const circleMock = {
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    alpha: 1,
  };
  return {
    add: {
      graphics: vi.fn(() => ({ ...graphicsMock })),
      container: vi.fn(() => ({ add: vi.fn() })),
      text: vi.fn(() => ({ ...textMock })),
      circle: vi.fn(() => ({ ...circleMock })),
    },
    tweens: {
      add: vi.fn((config) => {
        if (config && config.onComplete) config.onComplete();
        return {};
      }),
    },
    time: {
      delayedCall: vi.fn((delay, cb) => { if (cb) cb(); return {}; }),
    },
    sound: {
      add: vi.fn(() => ({ play: vi.fn(), destroy: vi.fn() })),
    },
    input: {
      enabled: true,
      once: vi.fn(),
      off: vi.fn(),
    },
    scale: { width: 1080, height: 1920 },
  };
}


// ============================================
// 테스트 스위트
// ============================================

describe("LEVEL_REQUIREMENTS_BY_RARITY", () => {
  it("TC-01: SSR 레벨 요건 40", () => {
    expect(LEVEL_REQUIREMENTS_BY_RARITY.SSR).toBe(40);
  });
  it("TC-02: SR 레벨 요건 30", () => {
    expect(LEVEL_REQUIREMENTS_BY_RARITY.SR).toBe(30);
  });
  it("TC-03: R 레벨 요건 20", () => {
    expect(LEVEL_REQUIREMENTS_BY_RARITY.R).toBe(20);
  });
});

describe("getCultRarity", () => {
  it("TC-04: SSR 교단 반환", () => {
    expect(getCultRarity("prism_stars")).toBe("SSR");
  });
  it("TC-05: SR 교단 반환", () => {
    expect(getCultRarity("ink_cyclone")).toBe("SR");
  });
  it("TC-06: R 교단 반환", () => {
    expect(getCultRarity("cafe_encore")).toBe("R");
  });
  it("TC-07: 존재하지 않는 교단 null 반환", () => {
    expect(getCultRarity("unknown_cult")).toBeNull();
  });
  it("TC-08: null 입력 시 null 반환", () => {
    expect(getCultRarity(null)).toBeNull();
  });
});

describe("computeLevelCondition", () => {
  it("TC-09: SSR 교단 레벨 충족 (40 >= 40)", () => {
    const result = computeLevelCondition(40, "prism_stars");
    expect(result.required).toBe(40);
    expect(result.fulfilled).toBe(true);
  });
  it("TC-10: SSR 교단 레벨 미충족 (39 < 40)", () => {
    const result = computeLevelCondition(39, "prism_stars");
    expect(result.fulfilled).toBe(false);
    expect(result.current).toBe(39);
  });
  it("TC-11: R 교단 레벨 요건 20", () => {
    const result = computeLevelCondition(20, "cafe_encore");
    expect(result.required).toBe(20);
    expect(result.fulfilled).toBe(true);
  });
  it("TC-12: 교단 null 시 fulfilled false", () => {
    const result = computeLevelCondition(50, null);
    expect(result.fulfilled).toBe(false);
    expect(result.required).toBe(0);
  });
  it("TC-13: 레벨 undefined 시 current 0", () => {
    const result = computeLevelCondition(undefined, "cafe_encore");
    expect(result.current).toBe(0);
    expect(result.fulfilled).toBe(false);
  });
});

describe("computeCanAwaken", () => {
  it("TC-14: non-SSR 3조건 충족 시 true", () => {
    expect(computeCanAwaken({ affinityOk: true, materialOk: true, trialOk: true, imprintOk: false, isSSR: false })).toBe(true);
  });
  it("TC-15: non-SSR 친밀도 미충족 시 false", () => {
    expect(computeCanAwaken({ affinityOk: false, materialOk: true, trialOk: true, imprintOk: false, isSSR: false })).toBe(false);
  });
  it("TC-16: SSR 4조건 모두 충족 시 true", () => {
    expect(computeCanAwaken({ affinityOk: true, materialOk: true, trialOk: true, imprintOk: true, isSSR: true })).toBe(true);
  });
  it("TC-17: SSR 각인석 없으면 false", () => {
    expect(computeCanAwaken({ affinityOk: true, materialOk: true, trialOk: true, imprintOk: false, isSSR: true })).toBe(false);
  });
  it("TC-18: SSR 소재 미충족 시 false", () => {
    expect(computeCanAwaken({ affinityOk: true, materialOk: false, trialOk: true, imprintOk: true, isSSR: true })).toBe(false);
  });
});

describe("getMaterialDisplayInfo", () => {
  it("TC-19: getMaterialInfo 없으면 null 반환", () => {
    const sys = createMockAwakeningSystem({ materialInfo: null });
    expect(getMaterialDisplayInfo("prism_stars", sys)).toBeNull();
  });
  it("TC-20: getMaterialInfo 있으면 nameKr/icon/imprintStone 반환", () => {
    const sys = createMockAwakeningSystem({
      materialInfo: { nameKr: "별빛 조각", icon: "✨", imprintStone: true }
    });
    const result = getMaterialDisplayInfo("prism_stars", sys);
    expect(result.nameKr).toBe("별빛 조각");
    expect(result.icon).toBe("✨");
    expect(result.imprintStone).toBe(true);
  });
  it("TC-21: awakeningSystem null 시 null 반환", () => {
    expect(getMaterialDisplayInfo("prism_stars", null)).toBeNull();
  });
  it("TC-22: imprintStone false 시 false 반환", () => {
    const sys = createMockAwakeningSystem({
      materialInfo: { nameKr: "잌크 정수", icon: "🎨", imprintStone: false }
    });
    const result = getMaterialDisplayInfo("ink_cyclone", sys);
    expect(result.imprintStone).toBe(false);
  });
});

describe("formatCultName", () => {
  it("TC-23: prism_stars 한국어 변환", () => {
    expect(formatCultName("prism_stars")).toBe("프리즘 스타즈");
  });
  it("TC-24: cafe_encore 한국어 변환", () => {
    expect(formatCultName("cafe_encore")).toBe("카페 앙코르");
  });
  it("TC-25: 미등록 ID는 그대로 반환", () => {
    expect(formatCultName("unknown_cult")).toBe("unknown_cult");
  });
  it("TC-26: null 입력 시 미각성 반환", () => {
    expect(formatCultName(null)).toBe("미각성");
  });
});

describe("AwakeningPopup", () => {
  let scene;
  let character;
  let awakeningSystem;

  beforeEach(() => {
    scene = createMockScene();
    character = { id: "hero_01", name: "아리아", level: 40 };
    awakeningSystem = createMockAwakeningSystem({
      affinityOk: false,
      materialCurrent: 0,
      materialRequired: 30,
      materialFulfilled: false,
      trialOk: false,
      affinityVal: 0,
      affinityRequired: 30,
      trialRequired: 3,
      materialInfo: null
    });
  });

  it("TC-27: 생성자 기본값 확인", () => {
    const popup = new AwakeningPopup(scene, {});
    expect(popup.character).toBeNull();
    expect(popup.cultId).toBeNull();
    expect(popup._canAwaken).toBe(false);
  });

  it("TC-28: options 전달 시 프로퍼티 설정", () => {
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "prism_stars",
      awakeningSystem,
      hasImprintStone: true
    });
    expect(popup.character).toBe(character);
    expect(popup.cultId).toBe("prism_stars");
    expect(popup.hasImprintStone).toBe(true);
  });

  it("TC-29: showAwakeningPopup 정적 메서드 팝업 반환", () => {
    const popup = AwakeningPopup.showAwakeningPopup(scene, character, "iron_beat", awakeningSystem);
    expect(popup).toBeInstanceOf(AwakeningPopup);
    expect(popup.isOpen).toBe(true);
  });

  it("TC-30: show() 호출 시 buildContent 실행 (에러 없음)", () => {
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "cafe_encore",
      awakeningSystem
    });
    expect(() => popup.show()).not.toThrow();
  });

  it("TC-31: 조건 미충족 시 _canAwaken false", () => {
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "prism_stars",
      awakeningSystem
    });
    popup.show();
    expect(popup._canAwaken).toBe(false);
  });

  it("TC-32: non-SSR 3조건 충족 시 _canAwaken true", () => {
    const sys = createMockAwakeningSystem({
      affinityOk: true, materialFulfilled: true, trialOk: true,
      materialCurrent: 25, materialRequired: 25
    });
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "iron_beat",
      awakeningSystem: sys
    });
    popup.show();
    expect(popup._canAwaken).toBe(true);
  });

  it("TC-33: SSR 각인석 없으면 _canAwaken false", () => {
    const sys = createMockAwakeningSystem({
      affinityOk: true, materialFulfilled: true, trialOk: true,
      materialCurrent: 30, materialRequired: 30
    });
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "prism_stars",
      awakeningSystem: sys,
      hasImprintStone: false
    });
    popup.show();
    expect(popup._canAwaken).toBe(false);
  });

  it("TC-34: SSR 각인석 있고 4조건 충족 시 _canAwaken true", () => {
    const sys = createMockAwakeningSystem({
      affinityOk: true, materialFulfilled: true, trialOk: true,
      materialCurrent: 30, materialRequired: 30
    });
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "prism_stars",
      awakeningSystem: sys,
      hasImprintStone: true
    });
    popup.show();
    expect(popup._canAwaken).toBe(true);
  });

  it("TC-35: onAwaken 콜백 호출 executeAwakening 성공 시", () => {
    const onAwaken = vi.fn();
    const sys = createMockAwakeningSystem({
      affinityOk: true, materialFulfilled: true, trialOk: true,
      materialCurrent: 30, materialRequired: 30,
      executeResult: { success: true }
    });
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "iron_beat",
      awakeningSystem: sys,
      onAwaken
    });
    popup._executeAwakening();
    expect(onAwaken).toHaveBeenCalledWith("iron_beat");
  });

  it("TC-36: destroy() 호출 시 _trackedObjects 정리", () => {
    const popup = new AwakeningPopup(scene, {
      character,
      cultId: "cafe_encore",
      awakeningSystem
    });
    popup.show();
    expect(() => popup.destroy()).not.toThrow();
    expect(popup._trackedObjects.length).toBe(0);
  });
});
