/**
 * MenuGridGate - 메인 메뉴 그리드 점진 해금 로직 (T-C7)
 *
 * 설계 근거:
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §4-2 점진 해금 테이블
 *  - docs/story/UX_ONBOARDING_FLOW.md §2-6(스텝↔노출 수 매핑), §1-2("잠긴 메뉴는 그리지 않는다"), §6-1(가변 열 수)
 *
 * 원칙
 *  - 해금 상태는 **튜토리얼 진행에서 파생**한다. 별도 저장을 하지 않는다.
 *    (세이브의 onboarding.unlockedMenus 가 이미 있으면 합집합으로 존중한다 — 소급 축소 금지)
 *  - 잠긴 항목은 자물쇠로 표시하지 않고 **아예 그리지 않는다**.
 *  - 기존 유저는 `SaveManager` 가 로드 시 `tutorial.completed = true` 로 마이그레이션하므로
 *    그 플래그만 읽어 전량 해금한다. 판정 로직을 여기서 다시 만들지 않는다.
 *  - 메뉴 키 목록은 `SaveManager.ALL_MENU_KEYS`(13종, settings 제외)를 재사용한다.
 *
 * 주의: gameConfig/scaleConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { TutorialManager } from './TutorialManager.js';
import { SaveManager } from './SaveManager.js';

/**
 * 튜토리얼 종료 이후 스테이지 진행도로 열리는 메뉴 (시스템 문서 §4-2 순 8~13).
 * 값은 clearedStages 의 스테이지 ID.
 */
export const STAGE_UNLOCKS = {
  tower: '2-1',
  eventdungeon: '2-3',
  pvp: '2-5',
  guild: '3-1',
  friends: '3-1',
  raid: '3-5',
};

/**
 * 항상 열려 있는 그리드 메뉴 — 현재는 없다.
 * 설정은 시스템 문서 §4-2대로 그리드 밖 상단 아이콘으로 이미 상시 노출되어 있으므로
 * (MainMenuScene.createTopBar 의 ⚙️ 버튼), 그리드에서 상시 노출할 필요가 없다.
 * 덕분에 신규 유저의 그리드를 0개로 유지할 수 있다(UX 문서 §2-7).
 */
export const ALWAYS_UNLOCKED = [];

/** 그리드 열 수 상한 */
export const MAX_COLUMNS = 4;

/** 라벨 폰트 (base px) — 항목이 적을 때는 열을 줄이고 라벨을 키운다(§6-1) */
export const LABEL_FONT_BASE = { WIDE: 13, DENSE: 11 };

/** 스테이지 클리어 여부 */
function isStageCleared(save, stageId) {
  const cleared = save?.progress?.clearedStages || {};
  return cleared[stageId] !== undefined && cleared[stageId] !== null;
}

export class MenuGridGate {
  /**
   * 점진 해금 대상 popupKey 13종 — 호출부가 항목 목록을 주지 않았을 때의 폴백.
   * 목록을 다시 정의하지 않고 `SaveManager.ALL_MENU_KEYS`(§4-2 정본)를 그대로 쓴다.
   */
  static getKnownMenuKeys() {
    return [...SaveManager.ALL_MENU_KEYS];
  }

  /**
   * 해금된 popupKey 집합을 튜토리얼 진행에서 파생한다.
   * @param {object} save SaveManager.load() 결과
   * @param {string[]} allKeys 그리드가 그릴 수 있는 전체 popupKey (완주 유저 판정용)
   * @returns {string[]} 해금된 popupKey (allKeys 순서 유지)
   */
  static deriveUnlockedMenus(save, allKeys = []) {
    const state = TutorialManager.getState(save);

    // 완주 유저 · 기존 유저 → 전량 해금
    if (state.completed) {
      return allKeys.length > 0 ? [...allKeys] : this.getKnownMenuKeys();
    }

    const unlocked = new Set(ALWAYS_UNLOCKED);

    // 1) 완료된 튜토리얼 스텝의 unlockMenus
    state.completedSteps.forEach((stepId) => {
      const step = TutorialManager.getStep(stepId);
      (step?.unlockMenus || []).forEach((key) => unlocked.add(key));
    });

    // 2) 스테이지 진행도 기반 해금 (튜토리얼 이후 콘텐츠)
    Object.entries(STAGE_UNLOCKS).forEach(([key, stageId]) => {
      if (isStageCleared(save, stageId)) unlocked.add(key);
    });

    // 3) 세이브에 이미 기록된 해금 목록 (다른 시스템이 쓴 값을 축소하지 않는다)
    (save?.onboarding?.unlockedMenus || []).forEach((key) => unlocked.add(key));

    if (allKeys.length === 0) return Array.from(unlocked);
    return allKeys.filter((key) => unlocked.has(key));
  }

  /**
   * 메뉴 항목 배열을 해금 상태로 필터링한다. 잠긴 항목은 반환하지 않는다.
   * @param {Array<{popupKey: string}>} items
   * @param {object} save
   */
  static filterMenuItems(items = [], save = null) {
    const allKeys = items.map((item) => item.popupKey);
    const unlocked = new Set(this.deriveUnlockedMenus(save, allKeys));
    return items.filter((item) => unlocked.has(item.popupKey));
  }

  /**
   * 항목 수에 따른 열 수. 3개 이하면 열을 줄여 라벨/탭 타겟을 키운다(§6-1).
   * @param {number} count
   */
  static getColumnCount(count) {
    if (!count || count <= 0) return 0;
    if (count <= 3) return count;
    return MAX_COLUMNS;
  }

  /** 항목 수에 따른 라벨 폰트 크기 (base px) */
  static getLabelFontSize(count) {
    return count <= MAX_COLUMNS ? LABEL_FONT_BASE.WIDE : LABEL_FONT_BASE.DENSE;
  }

  /** 그리드를 그려야 하는지 (0개면 영역 자체를 그리지 않는다) */
  static shouldRenderGrid(count) {
    return count > 0;
  }

  /** popupKey 해금 여부 단건 조회 */
  static isUnlocked(popupKey, save = null, allKeys = []) {
    return this.deriveUnlockedMenus(save, allKeys).includes(popupKey);
  }
}

export default MenuGridGate;
