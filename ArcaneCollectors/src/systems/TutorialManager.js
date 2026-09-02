/**
 * TutorialManager - 온보딩 튜토리얼 12스텝 진행 관리 (T-C5)
 *
 * 설계 근거:
 *  - docs/story/UX_ONBOARDING_FLOW.md §2-2(스텝 표), §4-2/4-3(스키마), §4-4(세이브 대응), §5-2(복구 규칙)
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §6-1(commitStep 8단계 규약), §5-2(세이브 스키마)
 *
 * 핵심 규약
 *  - 보상과 플래그는 "컷씬 재생 완료"가 아니라 **스텝 완료 커밋**에 귀속된다.
 *  - `tutorial.completedSteps` 가 멱등성 검사의 SSOT다. 이미 있으면 즉시 종료한다.
 *  - 세이브에 tutorial/story/onboarding 키가 없으면 **기본값으로 취급**한다(SaveManager는 수정하지 않는다).
 *  - 진행도만 있고 튜토리얼 플래그가 없는 기존 유저는 **완주 처리**한다(재노출 금지).
 *
 * 주의: gameConfig/scaleConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import tutorialData from '../data/tutorial.json';
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import { grantTutorialReward } from './TutorialRewards.js';

/** 튜토리얼 전용 이벤트 이름 */
export const TutorialEvents = {
  STEP_STARTED: 'tutorial:step_started',
  STEP_COMMITTED: 'tutorial:step_committed',
  MENUS_UNLOCKED: 'tutorial:menus_unlocked',
  COMPLETED: 'tutorial:completed',
};

/** 커밋 모드 (시스템 문서 §6-1) */
export const COMPLETION_MODE = {
  PLAYED: 'played',
  SKIPPED: 'skipped',
};

/** commitStep 실패 사유 */
export const COMMIT_RESULT = {
  OK: 'ok',
  ALREADY_COMMITTED: 'already_committed',
  UNKNOWN_STEP: 'unknown_step',
  FORCED_STEP: 'forced_step',
  TUTORIAL_COMPLETED: 'tutorial_completed',
};

export class TutorialManager {
  /**
   * 보상 지급 핸들러 오버라이드. 기본값은 `TutorialRewards.grantTutorialReward` 이며,
   * 별도 주입이 없어도 보상이 지급된다(주입 누락으로 보상이 사라지는 사고 방지).
   * @type {((rewardId: string, save: object, stepId: string) => void)|null}
   */
  static rewardHandler = null;

  static _unsubscribers = [];

  /** 실제로 사용되는 보상 핸들러 (오버라이드 > 내장 기본값) */
  static getRewardHandler() {
    return typeof this.rewardHandler === 'function' ? this.rewardHandler : grantTutorialReward;
  }

  // ==================== 데이터 접근 ====================

  /** tutorial.json 의 steps 배열 */
  static getSteps() {
    return tutorialData.steps || [];
  }

  /**
   * 전체 스텝 ID 배열 (정의 순서).
   * 목록을 새로 하드코딩하지 않고 tutorial.json 에서 읽는다.
   * `SaveManager.TUTORIAL_STEP_IDS` 와 일치해야 하며, 이 불변식은 tests/data/tutorial.test.js 가 지킨다.
   */
  static getStepIds() {
    return this.getSteps().map((step) => step.id);
  }

  /** 스텝 정의 조회 */
  static getStep(stepId) {
    return this.getSteps().find((step) => step.id === stepId) || null;
  }

  /** 강제 스텝 여부 (T-03/T-05/T-07/T-09 4개뿐) */
  static isForcedStep(stepId) {
    return this.getStep(stepId)?.forced === true;
  }

  /** 개별 스킵 가능 여부 — skipGroup 이 있고 강제가 아닌 스텝만 */
  static isSkippable(stepId) {
    const step = this.getStep(stepId);
    if (!step) return false;
    return step.forced !== true && !!step.skipGroup;
  }

  // ==================== 세이브 상태 정규화 ====================

  /** tutorial 기본값 (SaveManager에 필드가 없을 때 사용) */
  static getDefaultTutorialState() {
    return {
      currentStep: null,
      completedSteps: [],
      skippedSteps: [],
      skipped: false,
      completed: false,
      startedAt: null,
      completedAt: null,
    };
  }

  /**
   * story 기본값 — **읽기 정규화 전용**이다.
   * 세이브에 써 넣지 않는다(§commitStep 주석 참조).
   */
  static getDefaultStoryState() {
    return {
      viewedCutscenes: [],
      skippedCutscenes: [],
      currentChapterStory: null,
      lastViewedAt: null,
    };
  }

  /**
   * onboarding 기본값 — **읽기 정규화 전용**이다.
   * SaveManager 의 `_createDefaultOnboarding()` 은 신규 계정용(지급 완료 상태)이라 재사용하지 않는다.
   */
  static getDefaultOnboardingState() {
    return {
      unlockedMenus: [],
      idleIntroShown: false,
      returningPlayerTier: null,
    };
  }

  /**
   * 정규화된 튜토리얼 상태. 세이브를 변경하지 않는다.
   *
   * 기존 유저 판정은 여기서 하지 않는다. `SaveManager.load()` 의 `_migrateOnboardingSchema` 가
   * 구세이브를 1회 마이그레이션하며 `tutorial.completed = true` + 메뉴 전량 개방을 이미 수행하므로,
   * 소비 측은 **플래그를 읽기만 한다**. 판정 로직을 두 곳에 두면 규칙이 갈라진다.
   */
  static getState(save = null) {
    const data = save || SaveManager.load();
    const base = { ...this.getDefaultTutorialState(), ...(data?.tutorial || {}) };
    base.completedSteps = Array.isArray(base.completedSteps) ? [...base.completedSteps] : [];
    base.skippedSteps = Array.isArray(base.skippedSteps) ? [...base.skippedSteps] : [];

    // 방어: 12스텝을 모두 완료했는데 플래그가 없으면 완주로 본다
    if (!base.completed && this.getStepIds().every((id) => base.completedSteps.includes(id))) {
      base.completed = true;
      base.currentStep = null;
    }

    return base;
  }

  /** 완료된 스텝 ID 배열 */
  static getCompletedSteps(save = null) {
    return this.getState(save).completedSteps;
  }

  /** 튜토리얼 완주 여부 */
  static isCompleted(save = null) {
    return this.getState(save).completed === true;
  }

  /** 스텝 완료 여부 */
  static isStepCompleted(stepId, save = null) {
    return this.getState(save).completedSteps.includes(stepId);
  }

  /**
   * 현재 진행해야 할 스텝 ID.
   * currentStep 이 이미 완료됐거나 비어 있으면 미완료 첫 스텝으로 보정한다.
   */
  static getCurrentStepId(save = null) {
    const state = this.getState(save);
    if (state.completed) return null;

    const ids = this.getStepIds();
    if (state.currentStep && !state.completedSteps.includes(state.currentStep)) {
      return state.currentStep;
    }
    return ids.find((id) => !state.completedSteps.includes(id)) || null;
  }

  /** 현재 스텝 정의 */
  static getCurrentStep(save = null) {
    const id = this.getCurrentStepId(save);
    return id ? this.getStep(id) : null;
  }

  // ==================== 진행 제어 ====================

  /**
   * 튜토리얼 시작. 신규 계정 진입(`account_created`) 시 1회 호출한다.
   * 완주 유저/기존 유저에게는 아무것도 하지 않는다.
   * @returns {string|null} 시작한 스텝 ID
   */
  static start() {
    const save = SaveManager.load();
    if (this.isCompleted(save)) return null;

    const state = { ...this.getDefaultTutorialState(), ...(save.tutorial || {}) };
    const currentStepId = this.getCurrentStepId(save);
    if (!currentStepId) return null;

    state.startedAt = state.startedAt || Date.now();
    state.currentStep = currentStepId;
    save.tutorial = state;
    SaveManager.save(save);

    EventBus.emit(TutorialEvents.STEP_STARTED, { stepId: currentStepId });
    return currentStepId;
  }

  /**
   * 스텝에 지정된 팝업을 연다 (`targetPopup`).
   * T-05 는 소환 메뉴가 아직 잠긴 상태에서 강제로 열려야 하므로(UXI-04)
   * 메뉴 경로가 아니라 여기서 `GachaPopup` 을 온보딩 모드로 직접 생성한다.
   *
   * 컴포넌트는 **동적 import** 로 가져온다. 정적 import 를 쓰면
   * gameConfig → MainMenuScene → MenuGridGate → TutorialManager → GachaPopup → gameConfig
   * 순환이 생겨 부팅 TDZ 회귀 위험이 커진다.
   *
   * @param {Phaser.Scene} scene 팝업을 띄울 씬 (보통 MainMenuScene)
   * @param {string|null} stepId 생략 시 현재 스텝
   * @returns {Promise<object|null>} 생성된 팝업 인스턴스
   */
  static async openStepPopup(scene, stepId = null) {
    const step = stepId ? this.getStep(stepId) : this.getCurrentStep();
    if (!scene || !step?.targetPopup) return null;

    // 이미 팝업이 열려 있으면 새로 만들지 않는다.
    // 두 번 만들면 앞의 인스턴스가 고아가 되고, 그 전체화면 오버레이가 이후 모든 입력을 삼킨다.
    if (scene.activePopup) return scene.activePopup;

    const onboarding = step.popupOptions?.mode === 'onboarding';
    // 팝업이 닫히는 시점 = 결과 확인. 조건을 재평가해 커밋을 시도한다.
    const onClose = () => {
      if (scene.activePopup) scene.activePopup = null;
      try {
        this.evaluate();
      } catch (error) {
        console.error('[TutorialManager] 팝업 종료 후 재평가 실패', error);
      }
    };

    if (step.targetPopup === 'gacha') {
      const { GachaPopup } = await import('../components/popups/GachaPopup.js');
      const popup = new GachaPopup(scene, { onClose });
      popup.open({ onboarding });
      scene.activePopup = popup;
      return popup;
    }

    // 그 외 스텝은 씬의 표준 팝업 경로를 그대로 쓴다 (해금 필터와 무관하게 열린다)
    scene.openPopup?.(step.targetPopup);
    return scene.activePopup || null;
  }

  /**
   * 스텝 완료 커밋 — 시스템 문서 §6-1 8단계 규약의 구현.
   * @param {string} stepId
   * @param {'played'|'skipped'} mode
   * @returns {{ok: boolean, reason: string, stepId: string, unlockedMenus: string[], completed: boolean}}
   */
  static commitStep(stepId, mode = COMPLETION_MODE.PLAYED) {
    const step = this.getStep(stepId);
    if (!step) {
      return { ok: false, reason: COMMIT_RESULT.UNKNOWN_STEP, stepId, unlockedMenus: [], completed: false };
    }

    const save = SaveManager.load();

    // 완주 유저(마이그레이션된 기존 유저 포함)는 커밋하지 않는다 (재노출·중복 지급 방지)
    if (this.getState(save).completed) {
      return { ok: false, reason: COMMIT_RESULT.TUTORIAL_COMPLETED, stepId, unlockedMenus: [], completed: true };
    }

    const tutorial = { ...this.getDefaultTutorialState(), ...(save.tutorial || {}) };
    tutorial.completedSteps = Array.isArray(tutorial.completedSteps) ? [...tutorial.completedSteps] : [];
    tutorial.skippedSteps = Array.isArray(tutorial.skippedSteps) ? [...tutorial.skippedSteps] : [];

    // 1. 멱등성 검사
    if (tutorial.completedSteps.includes(stepId)) {
      return { ok: false, reason: COMMIT_RESULT.ALREADY_COMMITTED, stepId, unlockedMenus: [], completed: tutorial.completed };
    }

    // 쓰기 경로에서는 기본값을 주입하지 않는다.
    // SaveManager 의 onboarding 기본값은 "신규 계정 = 지급 완료" 의미라서,
    // 섹션이 없는 세이브에 끼워 넣으면 받지 않은 지급을 받은 것으로 기록하게 된다.
    const story = { ...(save.story || {}) };
    story.viewedCutscenes = Array.isArray(story.viewedCutscenes) ? [...story.viewedCutscenes] : [];
    story.skippedCutscenes = Array.isArray(story.skippedCutscenes) ? [...story.skippedCutscenes] : [];

    const onboarding = { ...(save.onboarding || {}) };
    onboarding.unlockedMenus = Array.isArray(onboarding.unlockedMenus) ? [...onboarding.unlockedMenus] : [];

    const skipped = mode === COMPLETION_MODE.SKIPPED;

    // 2. 보상 지급 (핸들러에 위임 — 컷씬 콜백 지급 금지, save 를 in-place 변경한다)
    if (step.rewardId) {
      try {
        this.getRewardHandler()(step.rewardId, save, stepId);
      } catch (error) {
        console.error('[TutorialManager] 보상 지급 실패', step.rewardId, error);
      }
    }

    // 3~4. 완료/스킵 기록
    tutorial.completedSteps.push(stepId);
    if (skipped && !tutorial.skippedSteps.includes(stepId)) {
      tutorial.skippedSteps.push(stepId);
    }

    // 5. 컷씬 기록 (스킵이어도 "본 것"으로 남겨 재노출을 막는다)
    (step.cutsceneIds || []).forEach((cutsceneId) => {
      if (!story.viewedCutscenes.includes(cutsceneId)) story.viewedCutscenes.push(cutsceneId);
      if (skipped && !story.skippedCutscenes.includes(cutsceneId)) story.skippedCutscenes.push(cutsceneId);
    });
    if ((step.cutsceneIds || []).length > 0) story.lastViewedAt = Date.now();

    // 6. 메뉴 해금
    const newlyUnlocked = [];
    (step.unlockMenus || []).forEach((popupKey) => {
      if (!onboarding.unlockedMenus.includes(popupKey)) {
        onboarding.unlockedMenus.push(popupKey);
        newlyUnlocked.push(popupKey);
      }
    });

    // 7. 다음 스텝 — nextStepId 우선, 이미 완료됐으면 미완료 첫 스텝으로 보정
    const allIds = this.getStepIds();
    const allDone = allIds.every((id) => tutorial.completedSteps.includes(id));
    if (allDone) {
      tutorial.completed = true;
      tutorial.completedAt = tutorial.completedAt || Date.now();
      tutorial.currentStep = null;
    } else {
      const next = step.nextStepId;
      tutorial.currentStep =
        next && !tutorial.completedSteps.includes(next)
          ? next
          : allIds.find((id) => !tutorial.completedSteps.includes(id)) || null;
    }
    if (tutorial.skippedSteps.length > 0) tutorial.skipped = true;
    tutorial.startedAt = tutorial.startedAt || Date.now();

    // 8. 단일 save() — 지급과 플래그 기록의 원자성
    save.tutorial = tutorial;
    save.story = story;
    save.onboarding = onboarding;
    SaveManager.save(save);

    EventBus.emit(TutorialEvents.STEP_COMMITTED, { stepId, mode, nextStepId: tutorial.currentStep });
    if (newlyUnlocked.length > 0) {
      EventBus.emit(TutorialEvents.MENUS_UNLOCKED, { popupKeys: newlyUnlocked, stepId });
    }
    if (tutorial.completed) {
      EventBus.emit(TutorialEvents.COMPLETED, { completedAt: tutorial.completedAt });
    } else if (tutorial.currentStep) {
      EventBus.emit(TutorialEvents.STEP_STARTED, { stepId: tutorial.currentStep });
    }

    return {
      ok: true,
      reason: COMMIT_RESULT.OK,
      stepId,
      unlockedMenus: newlyUnlocked,
      completed: tutorial.completed,
    };
  }

  /** 현재 스텝을 재생 완료로 커밋하고 다음 스텝으로 진행 */
  static advance(mode = COMPLETION_MODE.PLAYED) {
    const stepId = this.getCurrentStepId();
    if (!stepId) return { ok: false, reason: COMMIT_RESULT.TUTORIAL_COMPLETED, stepId: null, unlockedMenus: [], completed: true };
    return this.commitStep(stepId, mode);
  }

  /** 스텝 완료(재생) — commitStep 의 의미 별칭 */
  static complete(stepId) {
    return this.commitStep(stepId, COMPLETION_MODE.PLAYED);
  }

  /**
   * 개별 스킵. 강제 스텝(F-1/F-2)은 스킵할 수 없다.
   */
  static skip(stepId) {
    if (this.isForcedStep(stepId)) {
      return { ok: false, reason: COMMIT_RESULT.FORCED_STEP, stepId, unlockedMenus: [], completed: false };
    }
    if (!this.getStep(stepId)) {
      return { ok: false, reason: COMMIT_RESULT.UNKNOWN_STEP, stepId, unlockedMenus: [], completed: false };
    }
    return this.commitStep(stepId, COMPLETION_MODE.SKIPPED);
  }

  /**
   * 튜토리얼 전체 건너뛰기 (T-01 화면에서만 진입 가능).
   * S-* 스텝 전량을 스킵 커밋하고, 강제 4스텝(F-*)은 남긴다.
   * @returns {{skipped: string[], remaining: string[]}}
   */
  static skipAll() {
    const skippedIds = [];
    this.getSteps().forEach((step) => {
      if (step.forced === true) return;
      if (this.isStepCompleted(step.id)) return;
      const result = this.commitStep(step.id, COMPLETION_MODE.SKIPPED);
      if (result.ok) skippedIds.push(step.id);
    });

    const state = this.getState();
    const remaining = this.getStepIds().filter((id) => !state.completedSteps.includes(id));
    return { skipped: skippedIds, remaining };
  }

  // ==================== 완료 조건 평가 ====================

  /**
   * 세이브만으로 판정 가능한 완료 조건인지 검사한다.
   * popup_open / overlay_dismissed 는 화면 이벤트라 여기서 false 이며 notify()로 커밋한다.
   */
  static isConditionMet(step, save = null) {
    const data = save || SaveManager.load();
    const cond = step?.completionCondition;
    if (!cond) return false;

    const cleared = data?.progress?.clearedStages || {};
    const story = { ...this.getDefaultStoryState(), ...(data?.story || {}) };

    switch (cond.type) {
      case 'cutscene_end':
        return (story.viewedCutscenes || []).includes(cond.sceneId);

      case 'stage_clear':
        return cleared[cond.stageId] !== undefined && cleared[cond.stageId] !== null;

      case 'stage_clear_all':
        return (cond.stageIds || []).every(
          (id) => cleared[id] !== undefined && cleared[id] !== null
        );

      case 'gacha_result_confirmed':
        return (
          data?.gacha?.freeTenPullUsed === true || data?.onboarding?.freeMultiPullUsed === true
        );

      case 'ascension_complete': {
        const ascended = data?.ascendedHeroes || [];
        if (ascended.some((entry) => entry && entry.baseHeroId === cond.heroId)) return true;
        const baseEntry = (data?.baseHeroes || []).find(
          (entry) => entry && (entry.baseHeroId || entry.id) === cond.heroId
        );
        return !!baseEntry && (baseEntry.openedRoutes || []).length > 0;
      }

      case 'party_saved': {
        const parties = data?.parties || [];
        const first = parties[0];
        const heroIds = first?.heroIds || (Array.isArray(first) ? first : []);
        return heroIds.filter(Boolean).length > 0;
      }

      case 'popup_open':
      case 'overlay_dismissed':
      default:
        return false;
    }
  }

  /**
   * 조건이 이미 충족된 스텝을 조용히 자동 커밋한다 (UX 문서 §5-2 복구 원칙 3).
   * 연쇄 커밋을 허용하되 스텝 수만큼만 반복한다.
   * @returns {string[]} 자동 커밋된 스텝 ID 목록
   */
  static evaluate() {
    const committed = [];
    const limit = this.getSteps().length;

    for (let i = 0; i < limit; i++) {
      const save = SaveManager.load();
      if (this.isCompleted(save)) break;

      const step = this.getCurrentStep(save);
      if (!step) break;
      if (!this.isConditionMet(step, save)) break;

      const result = this.commitStep(step.id, COMPLETION_MODE.PLAYED);
      if (!result.ok) break;
      committed.push(step.id);
    }

    return committed;
  }

  /**
   * 화면 이벤트 통지. 현재 스텝의 조건과 일치하면 커밋한다.
   * @param {'popup_open'|'overlay_dismissed'|'cutscene_end'|'party_saved'} type
   * @param {object} payload
   */
  static notify(type, payload = {}) {
    const save = SaveManager.load();
    const step = this.getCurrentStep(save);
    if (!step) return null;

    const cond = step.completionCondition || {};
    if (cond.type !== type) return null;

    if (type === 'popup_open' && cond.popupKey && cond.popupKey !== payload.popupKey) return null;
    if (type === 'cutscene_end' && cond.sceneId && cond.sceneId !== payload.sceneId) return null;

    const mode = payload.skipped ? COMPLETION_MODE.SKIPPED : COMPLETION_MODE.PLAYED;
    return this.commitStep(step.id, mode);
  }

  // ==================== 이벤트 구독 ====================

  /**
   * 진행 관련 전역 이벤트를 구독해 조건을 재평가한다.
   * 이벤트는 트리거일 뿐이고 판정의 SSOT 는 항상 세이브다.
   */
  static attachEvents() {
    if (this._unsubscribers.length > 0) return;

    const reevaluate = () => {
      try {
        this.evaluate();
      } catch (error) {
        console.error('[TutorialManager] 조건 재평가 실패', error);
      }
    };

    [
      GameEvents.STAGE_CLEARED,
      GameEvents.GACHA_COMPLETE,
      GameEvents.CHARACTER_ADDED, // T-05 무료 10연 — GachaSystem.pull() 이 발행한다
      GameEvents.EVOLVE,
      GameEvents.CHAPTER_COMPLETED,
    ]
      .filter(Boolean)
      .forEach((eventName) => {
        this._unsubscribers.push(EventBus.on(eventName, reevaluate));
      });
  }

  /** 구독 해제 */
  static detachEvents() {
    this._unsubscribers.forEach((off) => {
      if (typeof off === 'function') off();
    });
    this._unsubscribers = [];
  }
}

export default TutorialManager;
