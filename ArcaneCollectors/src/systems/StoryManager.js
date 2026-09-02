/**
 * StoryManager — 스토리 컷씬 트리거/재생 이력 관리 (T-C4)
 *
 * SSOT
 *  - 대본 데이터: `src/data/story.json` (docs/story/NARRATIVE_STORY_MODE.md §5 스키마)
 *  - 재생 규칙:   docs/story/LEVEL_STORY_PLACEMENT.md §3-3 (R1~R7)
 *  - 저장 스키마: docs/story/SYSTEM_ONBOARDING_ECONOMY.md §5-2 `save.story`
 *
 * 주의
 *  - `SaveManager.getDefaultSave()`에 `story` 필드가 아직 없을 수 있다.
 *    없으면 기본값으로 취급하고, 커밋 시점에만 생성한다. SaveManager.js는 수정하지 않는다.
 *  - 이 모듈은 gameConfig.js에서 값을 import하지 않는다(순환 import TDZ 회귀 방지).
 */
import storyData from '../data/story.json';
import { SaveManager } from './SaveManager.js';

/** 스테이지/챕터/영웅 중 무엇으로 씬을 고르는지 — trigger별 앵커 키 */
const TRIGGER_ANCHORS = {
  chapter_enter: ['chapterId'],
  stage_enter: ['stageId'],
  stage_clear: ['stageId'],
  boss_before: ['stageId'],
  boss_after: ['stageId'],
  epilogue: ['chapterId'],
  first_hero: ['heroId'],
  hero_ascend: ['heroId'],
  evolve_gate: ['heroId'],
  hero_evolve: ['heroId', 'cultId']
};

const DEFAULT_STORY_STATE = Object.freeze({
  viewedCutscenes: [],
  skippedCutscenes: [],
  currentChapterStory: 'chapter_1',
  lastViewedAt: null
});

const CUTSCENE_SCENE_KEY = 'CutsceneScene';

export class StoryManager {
  /** 컷씬 전역 비활성화 스위치 (R3: 소탕·자동 반복 중에는 트리거 평가 자체를 건너뛴다) */
  static _enabled = true;

  // ============================================
  // 데이터 조회
  // ============================================

  /** @returns {Array<object>} 전체 씬 목록 */
  static getAllScenes() {
    return storyData.scenes;
  }

  /** @returns {object|null} */
  static getScene(sceneId) {
    return storyData.scenes.find((scene) => scene.id === sceneId) || null;
  }

  static getMeta() {
    return storyData._meta;
  }

  // ============================================
  // 재생 이력 (save.story)
  // ============================================

  /**
   * 저장된 스토리 상태를 읽는다. 세이브에 `story`가 없으면 기본값을 반환한다.
   * @returns {{viewedCutscenes: string[], skippedCutscenes: string[], currentChapterStory: string, lastViewedAt: number|null}}
   */
  static getStoryState() {
    let save = null;
    try {
      save = SaveManager.load();
    } catch (e) {
      console.warn('[StoryManager] 세이브 로드 실패, 기본값 사용:', e?.message);
    }
    const story = (save && save.story) || {};
    return {
      viewedCutscenes: Array.isArray(story.viewedCutscenes) ? [...story.viewedCutscenes] : [],
      skippedCutscenes: Array.isArray(story.skippedCutscenes) ? [...story.skippedCutscenes] : [],
      currentChapterStory:
        story.currentChapterStory || save?.progress?.currentChapter || DEFAULT_STORY_STATE.currentChapterStory,
      lastViewedAt: story.lastViewedAt ?? null
    };
  }

  static hasViewed(sceneId) {
    return this.getStoryState().viewedCutscenes.includes(sceneId);
  }

  /**
   * 재생 이력 커밋. R6에 따라 **컷씬 종료 또는 스킵 시점**에 즉시 호출한다.
   * 스킵해도 시청과 동일하게 기록되므로 플래그·보상이 유실되지 않는다.
   * @param {string} sceneId
   * @param {{skipped?: boolean}} [options]
   * @returns {boolean} 저장 성공 여부
   */
  static markViewed(sceneId, options = {}) {
    if (!sceneId) return false;
    try {
      const save = SaveManager.load();
      if (!save) return false;

      if (!save.story || typeof save.story !== 'object') {
        save.story = { ...DEFAULT_STORY_STATE, viewedCutscenes: [], skippedCutscenes: [] };
      }
      if (!Array.isArray(save.story.viewedCutscenes)) save.story.viewedCutscenes = [];
      if (!Array.isArray(save.story.skippedCutscenes)) save.story.skippedCutscenes = [];

      if (!save.story.viewedCutscenes.includes(sceneId)) {
        save.story.viewedCutscenes.push(sceneId);
      }
      if (options.skipped && !save.story.skippedCutscenes.includes(sceneId)) {
        save.story.skippedCutscenes.push(sceneId);
      }

      const scene = this.getScene(sceneId);
      if (scene?.chapterId) save.story.currentChapterStory = scene.chapterId;
      save.story.lastViewedAt = Date.now();

      return SaveManager.save(save) !== false;
    } catch (e) {
      console.warn('[StoryManager] 재생 이력 저장 실패:', e?.message);
      return false;
    }
  }

  // ============================================
  // 트리거 매칭
  // ============================================

  static isEnabled() {
    return this._enabled;
  }

  /** R3: 소탕·자동 반복 구간에서 컷씬 평가를 통째로 끈다 */
  static setEnabled(enabled) {
    this._enabled = enabled !== false;
  }

  /**
   * 트리거 조건을 만족하고 아직 재생되지 않은 씬 목록 (priority 오름차순).
   * @param {string} triggerName
   * @param {object} [ctx] - { stageId, chapterId, heroId, cultId, allowRepeat }
   * @returns {Array<object>}
   */
  static getPendingScenes(triggerName, ctx = {}) {
    const anchors = TRIGGER_ANCHORS[triggerName];
    if (!anchors) return [];

    const viewed = this.getStoryState().viewedCutscenes;

    return storyData.scenes
      .filter((scene) => scene.trigger === triggerName)
      .filter((scene) => anchors.every((key) => scene[key] === (ctx[key] ?? null)))
      .filter((scene) => {
        if (ctx.allowRepeat) return true;
        // R2: oncePerAccount 씬은 시청 이력이 있으면 화면 자체를 띄우지 않는다
        return !(scene.oncePerAccount && viewed.includes(scene.id));
      })
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  // ============================================
  // 변수 치환 ({{ascendedCount}} / {{institutionCount}})
  // ============================================

  /**
   * 세이브에서 컷씬 치환 변수를 계산한다.
   * 내러티브 §7 이슈 7: `institutionCount`/`ascendedCount` 하한은 1로 클램프한다.
   */
  static buildVars(save = null) {
    let data = save;
    if (!data) {
      try {
        data = SaveManager.load();
      } catch {
        data = null;
      }
    }
    const ascended = Array.isArray(data?.ascendedHeroes) ? data.ascendedHeroes : [];
    const cults = new Set(ascended.map((h) => h.cultId).filter(Boolean));
    return {
      ascendedCount: Math.max(1, ascended.length),
      institutionCount: Math.max(1, cults.size)
    };
  }

  /** `{{var}}` 치환. 정의되지 않은 변수는 원문을 유지한다. */
  static resolveText(text, vars = {}) {
    if (typeof text !== 'string') return '';
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    );
  }

  // ============================================
  // 재생
  // ============================================

  /**
   * 트리거에 걸린 미시청 씬을 찾아 `CutsceneScene`으로 재생한다.
   *
   * 재생할 씬이 없으면 **아무것도 띄우지 않고** `onComplete`를 즉시 동기 호출한다.
   * 따라서 호출부는 반환값과 무관하게 `onComplete` 하나만 신뢰하면 된다.
   *
   * @param {string} triggerName - TRIGGER_ANCHORS의 키
   * @param {object} ctx
   * @param {Phaser.Scene} ctx.scene - 호출한 씬 (일시정지 대상)
   * @param {string}  [ctx.stageId]
   * @param {string}  [ctx.chapterId]
   * @param {string}  [ctx.heroId]
   * @param {string}  [ctx.cultId]
   * @param {boolean} [ctx.allowRepeat] - 시청 이력 무시 (도감 재시청용)
   * @param {Function} [ctx.onComplete] - 컷씬 종료 후 콜백 (재생할 씬이 없어도 호출)
   * @returns {boolean} 실제로 컷씬을 띄웠는지 여부
   */
  static trigger(triggerName, ctx = {}) {
    return this.triggerSequence([triggerName], ctx);
  }

  /**
   * 여러 트리거의 미시청 씬을 **한 번의 launch로 이어서** 재생한다.
   * (예: 챕터 첫 스테이지 = `chapter_enter` → `stage_enter`,
   *      최종 보스 = `boss_after` → `epilogue`)
   * 씬을 두 번 띄우면 stop/launch가 같은 프레임에 겹치므로 반드시 한 번에 묶는다.
   *
   * @param {string[]} triggerNames - 재생 순서대로
   * @param {object} ctx - `trigger()`와 동일
   * @returns {boolean} 실제로 컷씬을 띄웠는지 여부
   */
  static triggerSequence(triggerNames, ctx = {}) {
    const done = typeof ctx.onComplete === 'function' ? ctx.onComplete : null;

    if (!this._enabled) {
      done?.();
      return false;
    }

    const host = ctx.scene;
    if (!host || !host.scene) {
      console.warn('[StoryManager] trigger: 호출 씬(ctx.scene)이 없습니다.', triggerNames);
      done?.();
      return false;
    }

    const seen = new Set();
    const pending = [];
    for (const name of triggerNames) {
      for (const scene of this.getPendingScenes(name, ctx)) {
        if (seen.has(scene.id)) continue;
        seen.add(scene.id);
        pending.push(scene);
      }
    }

    if (pending.length === 0) {
      done?.();
      return false;
    }

    const hostKey = host.scene.key;
    host.scene.launch(CUTSCENE_SCENE_KEY, {
      scenes: pending,
      parentKey: hostKey,
      vars: this.buildVars(),
      onComplete: done
    });
    host.scene.pause(hostKey);
    host.scene.bringToTop(CUTSCENE_SCENE_KEY);
    return true;
  }
}

export default StoryManager;
