/**
 * StoryLogRules — 도감 '이야기' 탭 목록 파생 (T-Q4)
 *
 * SSOT
 *  - docs/story/UX_ONBOARDING_FLOW.md §3-7 (재감상 동선 · 표시 규칙)
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §6-2 (Skip All 문구가 "도감에서 다시 볼 수 있습니다"로 약속)
 *
 * 표시 규칙
 *  - `story.viewedCutscenes`에 있는 것만 제목을 노출한다. 미시청은 스포일러 차단을 위해 감춘다.
 *  - 시청 이력이 0인 그룹은 제목까지 감추고 잠금 행만 남긴다.
 *  - `story.skippedCutscenes`에 있으면 ⏭ 배지 + 상단 "놓친 이야기 N편" 요약.
 *
 * 이 모듈은 **순수 함수만** 둔다. gameConfig/Phaser를 import 하지 않는다
 * (gameConfig가 모든 씬을 import하므로 순환 import TDZ가 난다).
 */

/** 영웅 종속 트리거 — 챕터가 아니라 '영웅 이야기' 그룹으로 묶인다. */
export const HERO_TRIGGERS = Object.freeze(['first_hero', 'hero_ascend', 'evolve_gate', 'hero_evolve']);

/** 영웅 이야기 그룹 식별자 */
export const HERO_GROUP_ID = 'hero_stories';

/** 잠긴(시청 0) 그룹의 제목 대체 문자열 */
export const LOCKED_GROUP_TITLE = '???';

/** 트리거 → 짧은 부제. 같은 스테이지의 진입/클리어 컷씬을 구분한다. */
export const TRIGGER_SUBTITLES = Object.freeze({
  chapter_enter: '챕터 시작',
  stage_enter: '진입',
  stage_clear: '클리어',
  boss_before: '보스 전',
  boss_after: '보스 후',
  epilogue: '에필로그',
  first_hero: '첫 만남',
  hero_ascend: '각인',
  evolve_gate: '기관의 문',
  hero_evolve: '전직',
});

/** 챕터 id → 정렬 키 (`chapter_3` → 3). 알 수 없으면 뒤로 보낸다. */
function chapterOrder(chapterId) {
  const match = /^chapter_(\d+)$/.exec(chapterId || '');
  return match ? Number(match[1]) : 999;
}

/**
 * 씬 하나의 그룹 id. 영웅 종속 씬은 chapterId가 null이므로 별도 그룹으로 보낸다.
 * @param {object} scene
 * @returns {string}
 */
export function getSceneGroupId(scene) {
  if (HERO_TRIGGERS.includes(scene?.trigger)) return HERO_GROUP_ID;
  return scene?.chapterId || HERO_GROUP_ID;
}

/**
 * 씬의 표시 제목. 스테이지 > 영웅 > 챕터 순으로 구체적인 이름을 고른다.
 * 이름을 못 찾으면 씬 id를 그대로 쓴다(끊긴 데이터를 조용히 감추지 않는다).
 * @param {object} scene
 * @param {{stageName?: Function, chapterName?: Function, heroName?: Function}} [resolvers]
 * @returns {string}
 */
export function getSceneTitle(scene, resolvers = {}) {
  if (!scene) return '';
  const { stageName, chapterName, heroName } = resolvers;
  if (scene.stageId && typeof stageName === 'function') {
    const name = stageName(scene.stageId, scene.chapterId);
    if (name) return name;
  }
  if (scene.heroId && typeof heroName === 'function') {
    const name = heroName(scene.heroId);
    if (name) return name;
  }
  if (scene.chapterId && typeof chapterName === 'function') {
    const name = chapterName(scene.chapterId);
    if (name) return name;
  }
  return scene.id;
}

/**
 * 도감 '이야기' 탭 목록을 만든다. **순수 함수** — 세이브도 Phaser도 만지지 않는다.
 *
 * @param {Array<object>} scenes 전체 씬 (`StoryManager.getAllScenes()`)
 * @param {{viewedCutscenes?: string[], skippedCutscenes?: string[]}} storyState
 * @param {{stageName?: Function, chapterName?: Function, heroName?: Function}} [resolvers]
 * @returns {{groups: Array<object>, viewedTotal: number, skippedTotal: number, sceneTotal: number}}
 */
export function buildStoryLog(scenes = [], storyState = {}, resolvers = {}) {
  const viewed = new Set(storyState?.viewedCutscenes || []);
  const skipped = new Set(storyState?.skippedCutscenes || []);
  const groupMap = new Map();

  const sceneList = Array.isArray(scenes) ? scenes : [];

  sceneList.forEach((scene) => {
    const groupId = getSceneGroupId(scene);
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { id: groupId, total: 0, entries: [] });
    }
    const group = groupMap.get(groupId);
    group.total += 1;

    // 스포일러 차단: 미시청 씬은 목록에 아예 넣지 않는다.
    if (!viewed.has(scene.id)) return;

    group.entries.push({
      id: scene.id,
      title: getSceneTitle(scene, resolvers),
      subtitle: TRIGGER_SUBTITLES[scene.trigger] || '',
      trigger: scene.trigger,
      skipped: skipped.has(scene.id),
      lineCount: Array.isArray(scene.lines) ? scene.lines.length : 0,
      anchors: {
        chapterId: scene.chapterId ?? null,
        stageId: scene.stageId ?? null,
        heroId: scene.heroId ?? null,
        cultId: scene.cultId ?? null,
      },
    });
  });

  const groups = Array.from(groupMap.values())
    .map((group) => {
      const locked = group.entries.length === 0;
      const isHero = group.id === HERO_GROUP_ID;
      const rawTitle = isHero
        ? '영웅 이야기'
        : (typeof resolvers.chapterName === 'function' && resolvers.chapterName(group.id)) || group.id;
      return {
        id: group.id,
        title: locked ? LOCKED_GROUP_TITLE : rawTitle,
        locked,
        viewedCount: group.entries.length,
        total: group.total,
        skippedCount: group.entries.filter((entry) => entry.skipped).length,
        entries: group.entries,
      };
    })
    .sort((a, b) => {
      // 영웅 이야기는 항상 챕터 뒤에 붙인다.
      if (a.id === HERO_GROUP_ID) return 1;
      if (b.id === HERO_GROUP_ID) return -1;
      return chapterOrder(a.id) - chapterOrder(b.id);
    });

  return {
    groups,
    viewedTotal: sceneList.filter((scene) => viewed.has(scene.id)).length,
    skippedTotal: sceneList.filter((scene) => skipped.has(scene.id)).length,
    sceneTotal: sceneList.length,
  };
}

/** 상단 요약 문구. 놓친 이야기가 없으면 그 줄을 만들지 않는다(UX §5-3). */
export function buildStoryLogSummary(log) {
  const viewed = log?.viewedTotal ?? 0;
  const total = log?.sceneTotal ?? 0;
  const skipped = log?.skippedTotal ?? 0;
  return {
    progressText: `본 이야기 ${viewed} / ${total}`,
    skippedText: skipped > 0 ? `놓친 이야기 ${skipped}편` : '',
  };
}

export default {
  HERO_TRIGGERS,
  HERO_GROUP_ID,
  LOCKED_GROUP_TITLE,
  TRIGGER_SUBTITLES,
  getSceneGroupId,
  getSceneTitle,
  buildStoryLog,
  buildStoryLogSummary,
};
