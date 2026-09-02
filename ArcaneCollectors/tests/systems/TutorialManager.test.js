/**
 * TutorialManager.test.js
 * T-C5 / T-C7 — 튜토리얼 12스텝 진행, commitStep 규약, 스킵 정책, 메뉴 점진 해금
 *
 * 설계 근거:
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §6-1 (commitStep 8단계), §4-2 (해금 테이블), §5-2 (기존 유저 처리)
 *  - docs/story/UX_ONBOARDING_FLOW.md §2-2, §4-3, §4-4, §5-2
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TutorialManager,
  COMPLETION_MODE,
  COMMIT_RESULT,
  TutorialEvents,
} from '../../src/systems/TutorialManager.js';
import { MenuGridGate, STAGE_UNLOCKS } from '../../src/systems/MenuGridGate.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus, GameEvents } from '../../src/systems/EventBus.js';

/** 그리드가 그릴 수 있는 전체 메뉴 (MainMenuScene.createBottomMenu 와 동일 구성) */
const ALL_MENU_ITEMS = [
  { popupKey: 'gacha' },
  { popupKey: 'herolist' },
  { popupKey: 'partyedit' },
  { popupKey: 'quest' },
  { popupKey: 'tower' },
  { popupKey: 'ascension' },
  { popupKey: 'eventdungeon' },
  { popupKey: 'inventory' },
  { popupKey: 'settings' },
  { popupKey: 'pvp' },
  { popupKey: 'guild' },
  { popupKey: 'raid' },
  { popupKey: 'friends' },
  { popupKey: 'collection' },
];

/** 세이브를 직접 주입한다 (SaveManager 는 수정하지 않는다) */
function putSave(partial = {}) {
  const base = SaveManager.getDefaultSave();
  const save = { ...base, ...partial };
  localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));
  return save;
}

/**
 * 구버전 유저 세이브 — tutorial/story/onboarding 섹션이 아예 없고 진행 이력만 있다.
 * SaveManager.load() 의 마이그레이션이 완주 처리 + 메뉴 전량 개방을 수행한다.
 */
function putLegacySave(progress = {}) {
  const base = SaveManager.getDefaultSave();
  delete base.tutorial;
  delete base.story;
  delete base.onboarding;
  base.progress = {
    currentChapter: 'chapter_3',
    clearedStages: { '1-1': 3 },
    towerFloor: 9,
    totalBattles: 300,
    ...progress,
  };
  localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(base));
  return base;
}

/** 여러 스텝을 순서대로 커밋 */
function commitAll(stepIds, mode = COMPLETION_MODE.PLAYED) {
  return stepIds.map((id) => TutorialManager.commitStep(id, mode));
}

describe('TutorialManager', () => {
  let mockLocalStorage;

  beforeEach(() => {
    mockLocalStorage = {
      data: {},
      getItem(key) { return this.data[key] ?? null; },
      setItem(key, value) { this.data[key] = value; },
      removeItem(key) { delete this.data[key]; },
      clear() { this.data = {}; },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    TutorialManager.rewardHandler = null;
    TutorialManager.detachEvents();
  });

  afterEach(() => {
    TutorialManager.detachEvents();
    TutorialManager.rewardHandler = null;
    vi.unstubAllGlobals();
  });

  // ==================== 데이터 · 기본값 ====================

  describe('스텝 정의', () => {
    it('12스텝이며 강제 스텝은 T-03/T-05/T-07/T-09 4개뿐', () => {
      const ids = TutorialManager.getStepIds();
      expect(ids).toHaveLength(12);
      expect(ids[0]).toBe('T-01');
      expect(ids[11]).toBe('T-12');

      const forced = ids.filter((id) => TutorialManager.isForcedStep(id));
      expect(forced).toEqual(['T-03', 'T-05', 'T-07', 'T-09']);
    });

    it('강제 스텝은 개별 스킵 불가, 안내 스텝은 skipGroup 을 가진다', () => {
      expect(TutorialManager.isSkippable('T-03')).toBe(false);
      expect(TutorialManager.isSkippable('T-04')).toBe(true);
      expect(TutorialManager.isSkippable('T-12')).toBe(true);
    });
  });

  describe('세이브 기본값 취급', () => {
    it('세이브에 tutorial 키가 없으면 기본값으로 읽고 T-01 부터 시작한다', () => {
      // SaveManager 를 거치지 않은 원본을 그대로 넘긴다
      const raw = { progress: { clearedStages: {}, totalBattles: 0 } };

      const state = TutorialManager.getState(raw);
      expect(state.completedSteps).toEqual([]);
      expect(state.completed).toBe(false);
      expect(TutorialManager.getCurrentStepId(raw)).toBe('T-01');
    });

    it('start() 가 startedAt 과 currentStep 을 기록한다', () => {
      putSave();

      const stepId = TutorialManager.start();
      expect(stepId).toBe('T-01');

      const saved = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      expect(saved.tutorial.currentStep).toBe('T-01');
      expect(saved.tutorial.startedAt).toBeGreaterThan(0);
    });

    it('currentStep 이 이미 완료된 값이면 미완료 첫 스텝으로 보정한다', () => {
      putSave({
        tutorial: {
          currentStep: 'T-01',
          completedSteps: ['T-01', 'T-02'],
          skippedSteps: [],
          skipped: false,
          completed: false,
          startedAt: 1,
          completedAt: null,
        },
      });

      expect(TutorialManager.getCurrentStepId()).toBe('T-03');
    });
  });

  // ==================== commitStep 규약 ====================

  describe('commitStep', () => {
    it('완료 기록 + 다음 스텝 전이 (nextStepId)', () => {
      putSave();

      const result = TutorialManager.commitStep('T-01');
      expect(result.ok).toBe(true);

      const state = TutorialManager.getState();
      expect(state.completedSteps).toEqual(['T-01']);
      expect(state.currentStep).toBe('T-02');
    });

    it('멱등성 — 같은 스텝 재커밋은 거부되고 보상도 1회만 지급된다', () => {
      putSave();
      const handler = vi.fn();
      TutorialManager.rewardHandler = handler;

      TutorialManager.commitStep('T-01');
      const first = TutorialManager.commitStep('T-02');
      const second = TutorialManager.commitStep('T-02');

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      expect(second.reason).toBe(COMMIT_RESULT.ALREADY_COMMITTED);
      // T-02 의 rewardId = grant_starter_iris 는 정확히 1회만 호출된다
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toBe('grant_starter_iris');
      expect(TutorialManager.getState().completedSteps).toEqual(['T-01', 'T-02']);
    });

    it('정의되지 않은 스텝은 unknown_step 으로 거부한다', () => {
      putSave();
      const result = TutorialManager.commitStep('T-99');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(COMMIT_RESULT.UNKNOWN_STEP);
    });

    it('스킵 커밋도 컷씬을 시청한 것으로 기록한다 (재노출 방지)', () => {
      putSave();

      TutorialManager.commitStep('T-01', COMPLETION_MODE.SKIPPED);

      const saved = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      expect(saved.tutorial.skippedSteps).toContain('T-01');
      expect(saved.tutorial.skipped).toBe(true);
      expect(saved.story.viewedCutscenes).toContain('cs_ch1_enter');
      expect(saved.story.skippedCutscenes).toContain('cs_ch1_enter');
    });

    it('unlockMenus 를 onboarding.unlockedMenus 에 누적한다', () => {
      putSave();

      commitAll(['T-01', 'T-02', 'T-03', 'T-04']);
      const result = TutorialManager.commitStep('T-05');

      // 각인 아이콘은 T-06 안내 대상이므로 T-05 커밋에서 함께 열린다(2026-09-02 정정)
      expect(result.unlockedMenus).toEqual(['herolist', 'partyedit', 'ascension']);
      const saved = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      expect(saved.onboarding.unlockedMenus).toEqual(['herolist', 'partyedit', 'ascension']);
    });

    it('T-12 까지 전부 커밋하면 completed=true, currentStep=null', () => {
      putSave();
      commitAll(TutorialManager.getStepIds());

      const state = TutorialManager.getState();
      expect(state.completed).toBe(true);
      expect(state.currentStep).toBeNull();
      expect(TutorialManager.getCurrentStepId()).toBeNull();

      const saved = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      expect(saved.tutorial.completedAt).toBeGreaterThan(0);
    });

    it('커밋 시 STEP_COMMITTED 이벤트를 발행한다', () => {
      putSave();
      const spy = vi.fn();
      const off = EventBus.on(TutorialEvents.STEP_COMMITTED, spy);

      TutorialManager.commitStep('T-01');
      off();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toMatchObject({ stepId: 'T-01', nextStepId: 'T-02' });
    });
  });

  // ==================== 스텝 팝업 ====================

  describe('openStepPopup', () => {
    it('targetPopup 이 없는 스텝은 아무것도 열지 않는다', async () => {
      putSave();
      const scene = { openPopup: vi.fn(), activePopup: null };

      expect(await TutorialManager.openStepPopup(scene)).toBeNull(); // T-01 은 컷씬 스텝
      expect(scene.openPopup).not.toHaveBeenCalled();
    });

    it('gacha 외 스텝은 씬의 표준 팝업 경로로 넘긴다', async () => {
      putSave();
      commitAll(['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06']);
      expect(TutorialManager.getCurrentStepId()).toBe('T-07');

      const scene = {
        activePopup: null,
        openPopup: vi.fn(function open(key) { this.activePopup = { key }; }),
      };

      const popup = await TutorialManager.openStepPopup(scene);
      expect(scene.openPopup).toHaveBeenCalledWith('ascension');
      expect(popup).toEqual({ key: 'ascension' });
    });

    it('T-05 는 온보딩 모드로 여는 스텝이다 (popupOptions.mode)', () => {
      const step = TutorialManager.getStep('T-05');
      expect(step.targetPopup).toBe('gacha');
      expect(step.popupOptions.mode).toBe('onboarding');
      expect(step.popupOptions.lockCloseButton).toBe(true);
      expect(step.targetElement).toBe('gacha.button.multi_ticket');
    });
  });

  // ==================== 스킵 정책 ====================

  describe('스킵 정책', () => {
    it('강제 스텝은 skip() 으로 건너뛸 수 없다', () => {
      putSave();
      commitAll(['T-01', 'T-02']);

      const result = TutorialManager.skip('T-03');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(COMMIT_RESULT.FORCED_STEP);
      expect(TutorialManager.getCurrentStepId()).toBe('T-03');
    });

    it('skipAll 은 S-* 8개를 전부 커밋하고 강제 4스텝만 남긴다', () => {
      putSave();

      const { skipped, remaining } = TutorialManager.skipAll();

      expect(skipped).toHaveLength(8);
      expect(remaining).toEqual(['T-03', 'T-05', 'T-07', 'T-09']);
      expect(TutorialManager.getCurrentStepId()).toBe('T-03');
      expect(TutorialManager.isCompleted()).toBe(false);
    });

    it('skipAll 이후 강제 4스텝을 마치면 완주 처리된다', () => {
      putSave();
      TutorialManager.skipAll();
      commitAll(['T-03', 'T-05', 'T-07', 'T-09']);

      expect(TutorialManager.isCompleted()).toBe(true);
    });
  });

  // ==================== 조건 재평가 ====================

  describe('완료 조건 재평가', () => {
    it('이미 1-1 을 클리어한 상태로 T-03 에 복귀하면 조용히 자동 커밋한다', () => {
      putSave({
        progress: { currentChapter: 'chapter_1', clearedStages: { '1-1': 3 }, towerFloor: 1, totalBattles: 0 },
      });
      commitAll(['T-01', 'T-02']);

      const committed = TutorialManager.evaluate();

      expect(committed).toContain('T-03');
      expect(TutorialManager.getCurrentStepId()).toBe('T-04');
    });

    it('조건이 충족되지 않으면 커밋하지 않는다', () => {
      putSave();
      commitAll(['T-01', 'T-02']);

      expect(TutorialManager.evaluate()).toEqual([]);
      expect(TutorialManager.getCurrentStepId()).toBe('T-03');
    });

    it('notify(popup_open) 은 현재 스텝의 popupKey 가 일치할 때만 커밋한다', () => {
      putSave();
      commitAll(['T-01', 'T-02', 'T-03', 'T-04', 'T-05']);
      expect(TutorialManager.getCurrentStepId()).toBe('T-06');

      expect(TutorialManager.notify('popup_open', { popupKey: 'herolist' })).toBeNull();
      expect(TutorialManager.getCurrentStepId()).toBe('T-06');

      const result = TutorialManager.notify('popup_open', { popupKey: 'ascension' });
      expect(result.ok).toBe(true);
      expect(TutorialManager.getCurrentStepId()).toBe('T-07');
    });

    it('T-05 는 무료 10연 플래그(gacha.freeTenPullUsed)로 완료 판정한다', () => {
      putSave();
      commitAll(['T-01', 'T-02', 'T-03', 'T-04']);
      expect(TutorialManager.getCurrentStepId()).toBe('T-05');

      // 아직 뽑지 않았으면 커밋되지 않는다
      expect(TutorialManager.evaluate()).toEqual([]);

      const save = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      save.gacha.freeTenPullUsed = true;
      localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));

      expect(TutorialManager.evaluate()).toContain('T-05');
      expect(TutorialManager.getCurrentStepId()).toBe('T-06');
      expect(SaveManager.load().onboarding.unlockedMenus).toEqual(['herolist', 'partyedit', 'ascension']);
    });

    it('CHARACTER_ADDED 이벤트가 T-05 완료를 트리거한다', () => {
      putSave();
      commitAll(['T-01', 'T-02', 'T-03', 'T-04']);
      TutorialManager.attachEvents();

      const save = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      save.gacha.freeTenPullUsed = true;
      localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));

      EventBus.emit(GameEvents.CHARACTER_ADDED, { characterId: 'base_omar' });

      expect(TutorialManager.isStepCompleted('T-05')).toBe(true);
      expect(TutorialManager.getCurrentStepId()).toBe('T-06');
    });

    it('전역 이벤트 구독 시 조건을 재평가한다', () => {
      putSave({
        progress: { currentChapter: 'chapter_1', clearedStages: {}, towerFloor: 1, totalBattles: 0 },
      });
      commitAll(['T-01', 'T-02']);
      TutorialManager.attachEvents();

      const save = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
      save.progress.clearedStages['1-1'] = 2;
      localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));

      EventBus.emit(GameEvents.STAGE_CLEARED, { stageId: '1-1' });

      expect(TutorialManager.getCurrentStepId()).toBe('T-04');
    });
  });

  // ==================== 기존 유저 ====================

  describe('기존 유저 처리', () => {
    it('구버전 세이브는 SaveManager 마이그레이션으로 완주 처리되고 스텝 12개가 채워진다', () => {
      putLegacySave();
      const migrated = SaveManager.load();

      expect(migrated.tutorial.completed).toBe(true);
      expect(migrated.tutorial.completedSteps).toEqual(SaveManager.TUTORIAL_STEP_IDS);
      expect(migrated.onboarding.unlockedMenus).toEqual(SaveManager.ALL_MENU_KEYS);
    });

    it('완주 플래그만 읽어 튜토리얼을 다시 띄우지 않는다 (별도 판정 없음)', () => {
      putLegacySave();

      expect(TutorialManager.isCompleted()).toBe(true);
      expect(TutorialManager.getCurrentStepId()).toBeNull();
      expect(TutorialManager.start()).toBeNull();

      const result = TutorialManager.commitStep('T-01');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(COMMIT_RESULT.TUTORIAL_COMPLETED);
    });

    it('신규 유저(진행도 0)는 기존 유저로 오판되지 않는다', () => {
      putSave();
      expect(SaveManager.load().tutorial.completed).toBe(false);
      expect(TutorialManager.isCompleted()).toBe(false);
      expect(TutorialManager.getCurrentStepId()).toBe('T-01');
    });
  });
});

describe('MenuGridGate', () => {
  let mockLocalStorage;

  beforeEach(() => {
    mockLocalStorage = {
      data: {},
      getItem(key) { return this.data[key] ?? null; },
      setItem(key, value) { this.data[key] = value; },
      removeItem(key) { delete this.data[key]; },
      clear() { this.data = {}; },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('신규 유저의 그리드는 0개다 (설정은 상단바 아이콘)', () => {
    putSave();
    const visible = MenuGridGate.filterMenuItems(ALL_MENU_ITEMS, SaveManager.load());

    expect(visible).toHaveLength(0);
    expect(MenuGridGate.shouldRenderGrid(visible.length)).toBe(false);
  });

  it('UX 문서 §2-6 노출 수 추이를 따른다 (T-05→3, T-06→3, T-10→4, T-11→7)', () => {
    putSave();
    const count = () => MenuGridGate.filterMenuItems(ALL_MENU_ITEMS, SaveManager.load()).length;

    commitAll(['T-01', 'T-02', 'T-03', 'T-04', 'T-05']);
    expect(count()).toBe(3);

    TutorialManager.commitStep('T-06');
    expect(count()).toBe(3);

    commitAll(['T-07', 'T-08', 'T-09', 'T-10']);
    expect(count()).toBe(4);

    TutorialManager.commitStep('T-11');
    // 소환 메뉴 복구 후 문서 기준 7개와 실제 렌더 수가 일치한다
    expect(count()).toBe(7);

    const visibleKeys = MenuGridGate.filterMenuItems(ALL_MENU_ITEMS, SaveManager.load())
      .map((item) => item.popupKey);
    expect(visibleKeys).toContain('gacha');
    expect(visibleKeys.sort()).toEqual(
      ['herolist', 'partyedit', 'ascension', 'quest', 'inventory', 'gacha', 'collection'].sort()
    );
  });

  it('해금 목록은 튜토리얼 진행에서 파생된다 (별도 저장 없이 재계산)', () => {
    putSave();
    commitAll(['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06']);

    // onboarding.unlockedMenus 를 비워도 완료 스텝에서 다시 도출된다
    const save = JSON.parse(localStorage.getItem(SaveManager.SAVE_KEY));
    save.onboarding.unlockedMenus = [];
    localStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(save));

    const unlocked = MenuGridGate.deriveUnlockedMenus(SaveManager.load(), ALL_MENU_ITEMS.map((i) => i.popupKey));
    expect(unlocked).toEqual(['herolist', 'partyedit', 'ascension']);
  });

  it('튜토리얼 이후 메뉴는 스테이지 진행도로 열린다', () => {
    putSave({
      progress: {
        currentChapter: 'chapter_2',
        clearedStages: { [STAGE_UNLOCKS.tower]: 3 },
        towerFloor: 1,
        totalBattles: 0,
      },
      tutorial: {
        currentStep: 'T-12', completedSteps: ['T-01'], skippedSteps: [], skipped: false,
        completed: false, startedAt: 1, completedAt: null,
      },
    });

    const unlocked = MenuGridGate.deriveUnlockedMenus(SaveManager.load(), ALL_MENU_ITEMS.map((i) => i.popupKey));
    expect(unlocked).toContain('tower');
    expect(unlocked).not.toContain('pvp');
  });

  it('기존 유저는 13개 메뉴가 전부 해금된다', () => {
    putLegacySave();

    const visible = MenuGridGate.filterMenuItems(ALL_MENU_ITEMS, SaveManager.load());
    expect(visible).toHaveLength(ALL_MENU_ITEMS.length);
  });

  it('열 수와 라벨 크기는 항목 수에 따라 가변이다', () => {
    expect(MenuGridGate.getColumnCount(0)).toBe(0);
    expect(MenuGridGate.getColumnCount(2)).toBe(2);
    expect(MenuGridGate.getColumnCount(3)).toBe(3);
    expect(MenuGridGate.getColumnCount(7)).toBe(4);

    expect(MenuGridGate.getLabelFontSize(3)).toBe(13);
    expect(MenuGridGate.getLabelFontSize(13)).toBe(11);
  });
});
