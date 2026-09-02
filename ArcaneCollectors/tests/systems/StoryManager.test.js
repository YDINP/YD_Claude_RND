/**
 * StoryManager.test.js
 * 컷씬 트리거 매칭 / 1회 재생 / 스킵 무손실 / 세이브 부재 시 기본값 검증 (T-C4)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 세이브 저장소를 테스트에서 직접 조작한다 */
const saveStore = { current: null };

vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => saveStore.current),
    save: vi.fn((data) => {
      saveStore.current = data;
      return true;
    })
  }
}));

import { StoryManager } from '../../src/systems/StoryManager.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

/** CutsceneScene launch를 관찰하는 가짜 Phaser Scene */
function makeFakeScene(key = 'StageSelectScene') {
  const calls = { launch: [], pause: [], bringToTop: [], resume: [] };
  return {
    calls,
    scene: {
      key,
      launch: (sceneKey, data) => calls.launch.push({ sceneKey, data }),
      pause: (sceneKey) => calls.pause.push(sceneKey),
      resume: (sceneKey) => calls.resume.push(sceneKey),
      bringToTop: (sceneKey) => calls.bringToTop.push(sceneKey)
    }
  };
}

const baseSave = (story = undefined) => ({
  version: 1,
  progress: { currentChapter: 'chapter_1' },
  ascendedHeroes: [],
  ...(story ? { story } : {})
});

beforeEach(() => {
  vi.clearAllMocks();
  saveStore.current = baseSave();
  StoryManager.setEnabled(true);
});

describe('StoryManager — 데이터 조회', () => {
  it('씬 id로 씬을 찾는다', () => {
    const scene = StoryManager.getScene('cs_1_1_enter');
    expect(scene).toBeTruthy();
    expect(scene.trigger).toBe('stage_enter');
    expect(scene.stageId).toBe('1-1');
    expect(StoryManager.getScene('cs_does_not_exist')).toBeNull();
  });
});

describe('StoryManager — 트리거 매칭', () => {
  it('stage_enter는 stageId가 일치하는 씬만 반환한다', () => {
    const pending = StoryManager.getPendingScenes('stage_enter', { stageId: '1-2' });
    expect(pending.map((s) => s.id)).toEqual(['cs_1_2_enter']);
  });

  it('보스 스테이지는 boss_before로만 매칭되고 stage_enter로는 매칭되지 않는다', () => {
    expect(StoryManager.getPendingScenes('stage_enter', { stageId: '1-5' })).toEqual([]);
    expect(StoryManager.getPendingScenes('boss_before', { stageId: '1-5' }).map((s) => s.id)).toEqual([
      'cs_1_5_boss_before'
    ]);
  });

  it('hero_evolve는 heroId와 cultId가 모두 일치해야 한다', () => {
    const match = StoryManager.getPendingScenes('hero_evolve', { heroId: 'base_iris', cultId: 'olympus' });
    expect(match.map((s) => s.id)).toEqual(['cs_evolve_iris_olympus']);

    const wrongCult = StoryManager.getPendingScenes('hero_evolve', { heroId: 'base_iris', cultId: 'yomi' });
    expect(wrongCult).toEqual([]);
  });

  it('앵커가 없는 컨텍스트로는 아무 씬도 매칭되지 않는다', () => {
    expect(StoryManager.getPendingScenes('stage_enter', {})).toEqual([]);
    expect(StoryManager.getPendingScenes('알수없는트리거', { stageId: '1-1' })).toEqual([]);
  });

  it('priority 오름차순으로 정렬한다', () => {
    const pending = StoryManager.getPendingScenes('chapter_enter', { chapterId: 'chapter_1' });
    const priorities = pending.map((s) => s.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
});

describe('StoryManager — 1회 재생 (oncePerAccount)', () => {
  it('시청 이력이 있으면 oncePerAccount 씬은 제외된다 (R2)', () => {
    saveStore.current = baseSave({ viewedCutscenes: ['cs_1_1_enter'], skippedCutscenes: [] });
    expect(StoryManager.getPendingScenes('stage_enter', { stageId: '1-1' })).toEqual([]);
  });

  it('allowRepeat면 시청 이력을 무시한다 (도감 재시청)', () => {
    saveStore.current = baseSave({ viewedCutscenes: ['cs_1_1_enter'], skippedCutscenes: [] });
    const pending = StoryManager.getPendingScenes('stage_enter', { stageId: '1-1', allowRepeat: true });
    expect(pending.map((s) => s.id)).toEqual(['cs_1_1_enter']);
  });

  it('oncePerAccount:false 씬은 시청 이력이 있어도 다시 재생된다', () => {
    const ascend = StoryManager.getScene('cs_hero_ascend_iris');
    expect(ascend.oncePerAccount).toBe(false);
    saveStore.current = baseSave({ viewedCutscenes: ['cs_hero_ascend_iris'], skippedCutscenes: [] });
    const pending = StoryManager.getPendingScenes('hero_ascend', { heroId: 'base_iris' });
    expect(pending.map((s) => s.id)).toEqual(['cs_hero_ascend_iris']);
  });
});

describe('StoryManager — 세이브 기록', () => {
  it('세이브에 story 필드가 없어도 기본값을 반환한다', () => {
    saveStore.current = baseSave();
    const state = StoryManager.getStoryState();
    expect(state.viewedCutscenes).toEqual([]);
    expect(state.skippedCutscenes).toEqual([]);
    expect(state.currentChapterStory).toBe('chapter_1');
  });

  it('세이브 자체가 없어도 예외 없이 기본값을 반환한다', () => {
    saveStore.current = null;
    const state = StoryManager.getStoryState();
    expect(state.viewedCutscenes).toEqual([]);
    expect(StoryManager.hasViewed('cs_1_1_enter')).toBe(false);
  });

  it('markViewed가 story 필드를 생성하고 이력을 남긴다', () => {
    StoryManager.markViewed('cs_1_1_enter');
    expect(SaveManager.save).toHaveBeenCalled();
    expect(saveStore.current.story.viewedCutscenes).toContain('cs_1_1_enter');
    expect(saveStore.current.story.skippedCutscenes).toEqual([]);
    expect(saveStore.current.story.currentChapterStory).toBe('chapter_1');
    expect(StoryManager.hasViewed('cs_1_1_enter')).toBe(true);
  });

  it('스킵해도 시청 이력이 동일하게 남는다 (R6 — 플래그 무손실)', () => {
    StoryManager.markViewed('cs_1_2_enter', { skipped: true });
    expect(saveStore.current.story.viewedCutscenes).toContain('cs_1_2_enter');
    expect(saveStore.current.story.skippedCutscenes).toContain('cs_1_2_enter');
    // 스킵한 씬은 두 번 다시 재생되지 않는다
    expect(StoryManager.getPendingScenes('stage_enter', { stageId: '1-2' })).toEqual([]);
  });

  it('같은 씬을 두 번 기록해도 중복되지 않는다', () => {
    StoryManager.markViewed('cs_1_1_enter');
    StoryManager.markViewed('cs_1_1_enter');
    expect(saveStore.current.story.viewedCutscenes.filter((id) => id === 'cs_1_1_enter')).toHaveLength(1);
  });
});

describe('StoryManager — 변수 치환', () => {
  it('{{var}}를 세이브 기반 값으로 치환한다', () => {
    const vars = { ascendedCount: 7, institutionCount: 4 };
    const text = StoryManager.resolveText(
      '너는 {{ascendedCount}}명을 문 앞에 세웠고, 그중 {{institutionCount}}개의 서로 다른 문을 골랐다.',
      vars
    );
    expect(text).toBe('너는 7명을 문 앞에 세웠고, 그중 4개의 서로 다른 문을 골랐다.');
  });

  it('정의되지 않은 변수는 원문을 유지한다', () => {
    expect(StoryManager.resolveText('{{unknownVar}}', {})).toBe('{{unknownVar}}');
  });

  it('전직 0회에서도 하한 1로 클램프한다 (내러티브 §7 이슈 7)', () => {
    saveStore.current = baseSave();
    expect(StoryManager.buildVars()).toEqual({ ascendedCount: 1, institutionCount: 1 });
  });

  it('서로 다른 기관 수를 센다', () => {
    saveStore.current = {
      ...baseSave(),
      ascendedHeroes: [
        { ascendedHeroId: 'asc_iris_olympus', cultId: 'olympus' },
        { ascendedHeroId: 'asc_leon_olympus', cultId: 'olympus' },
        { ascendedHeroId: 'asc_kai_yomi', cultId: 'yomi' }
      ]
    };
    expect(StoryManager.buildVars()).toEqual({ ascendedCount: 3, institutionCount: 2 });
  });
});

describe('StoryManager — 재생 호출', () => {
  it('trigger가 CutsceneScene을 launch하고 호출 씬을 pause한다', () => {
    const host = makeFakeScene('StageSelectScene');
    const played = StoryManager.trigger('stage_enter', { scene: host, stageId: '1-1' });

    expect(played).toBe(true);
    expect(host.calls.launch).toHaveLength(1);
    expect(host.calls.launch[0].sceneKey).toBe('CutsceneScene');
    expect(host.calls.launch[0].data.scenes.map((s) => s.id)).toEqual(['cs_1_1_enter']);
    expect(host.calls.launch[0].data.parentKey).toBe('StageSelectScene');
    expect(host.calls.pause).toEqual(['StageSelectScene']);
    expect(host.calls.bringToTop).toEqual(['CutsceneScene']);
  });

  it('재생할 씬이 없으면 launch 없이 onComplete를 즉시 호출한다', () => {
    const host = makeFakeScene();
    const onComplete = vi.fn();
    const played = StoryManager.trigger('stage_enter', { scene: host, stageId: '2-2', onComplete });

    expect(played).toBe(false);
    expect(host.calls.launch).toHaveLength(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('setEnabled(false)면 트리거 평가를 건너뛴다 (R3 — 소탕·자동 반복)', () => {
    const host = makeFakeScene();
    const onComplete = vi.fn();
    StoryManager.setEnabled(false);

    const played = StoryManager.trigger('stage_enter', { scene: host, stageId: '1-1', onComplete });

    expect(played).toBe(false);
    expect(host.calls.launch).toHaveLength(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('triggerSequence는 여러 트리거를 순서대로 한 번에 묶는다', () => {
    const host = makeFakeScene();
    StoryManager.triggerSequence(['chapter_enter', 'stage_enter'], {
      scene: host,
      chapterId: 'chapter_1',
      stageId: '1-1'
    });

    expect(host.calls.launch).toHaveLength(1);
    expect(host.calls.launch[0].data.scenes.map((s) => s.id)).toEqual(['cs_ch1_enter', 'cs_1_1_enter']);
  });

  it('보스 클리어는 boss_after → epilogue 순으로 이어진다', () => {
    const host = makeFakeScene('BattleResultScene');
    StoryManager.triggerSequence(['boss_after', 'epilogue'], {
      scene: host,
      chapterId: 'chapter_5',
      stageId: '5-5'
    });

    expect(host.calls.launch[0].data.scenes.map((s) => s.id)).toEqual([
      'cs_5_5_boss_after',
      'cs_5_epilogue'
    ]);
    // 최종 보스 대사는 치환 변수를 함께 전달받는다
    expect(host.calls.launch[0].data.vars).toEqual({ ascendedCount: 1, institutionCount: 1 });
  });

  it('호출 씬이 없으면 경고만 남기고 onComplete를 호출한다', () => {
    const onComplete = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const played = StoryManager.trigger('stage_enter', { stageId: '1-1', onComplete });

    expect(played).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
