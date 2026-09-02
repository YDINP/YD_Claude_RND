/**
 * StoryLogRules.test.js
 * T-Q4 — 도감 '이야기' 탭 목록 파생. Phaser 렌더는 다루지 않는다.
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-7
 */
import { describe, it, expect } from 'vitest';
import {
  buildStoryLog,
  buildStoryLogSummary,
  getSceneGroupId,
  HERO_GROUP_ID,
  LOCKED_GROUP_TITLE,
} from '../../src/systems/StoryLogRules.js';
import { StoryManager } from '../../src/systems/StoryManager.js';

const SCENES = [
  { id: 'cs_ch1_enter', trigger: 'chapter_enter', chapterId: 'chapter_1', stageId: null, lines: [1, 2] },
  { id: 'cs_1_1_enter', trigger: 'stage_enter', chapterId: 'chapter_1', stageId: '1-1', lines: [1] },
  { id: 'cs_1_1_clear', trigger: 'stage_clear', chapterId: 'chapter_1', stageId: '1-1', lines: [1] },
  { id: 'cs_ch2_enter', trigger: 'chapter_enter', chapterId: 'chapter_2', stageId: null, lines: [1] },
  { id: 'cs_first_hero_iris', trigger: 'first_hero', chapterId: null, heroId: 'base_iris', lines: [1] },
];

const RESOLVERS = {
  chapterName: (id) => ({ chapter_1: '균열의 시작', chapter_2: '신들의 전장' }[id] || null),
  stageName: (id) => ({ '1-1': '어두운 숲 입구' }[id] || null),
  heroName: (id) => ({ base_iris: '아이리스' }[id] || null),
};

describe('도감 이야기 탭 목록 파생', () => {
  it('시청한 컷씬만 목록에 올린다 — 미시청은 제목조차 노출하지 않는다', () => {
    const log = buildStoryLog(SCENES, { viewedCutscenes: ['cs_1_1_enter'], skippedCutscenes: [] }, RESOLVERS);
    const chapter1 = log.groups.find((g) => g.id === 'chapter_1');

    expect(chapter1.entries.map((e) => e.id)).toEqual(['cs_1_1_enter']);
    expect(JSON.stringify(log)).not.toContain('cs_1_1_clear');
    // 분모는 전체를 그대로 보여준다. 몇 편이 남았는지는 알려도 되는 정보다.
    expect(chapter1.total).toBe(3);
    expect(chapter1.viewedCount).toBe(1);
  });

  it('시청 이력이 0인 챕터는 제목까지 감춘다', () => {
    const log = buildStoryLog(SCENES, { viewedCutscenes: ['cs_1_1_enter'] }, RESOLVERS);
    const chapter2 = log.groups.find((g) => g.id === 'chapter_2');

    expect(chapter2.locked).toBe(true);
    expect(chapter2.title).toBe(LOCKED_GROUP_TITLE);
    expect(chapter2.title).not.toContain('신들의 전장');
  });

  it('스킵한 컷씬에 배지를 달고 상단 요약에 편수를 노출한다', () => {
    const log = buildStoryLog(SCENES, {
      viewedCutscenes: ['cs_1_1_enter', 'cs_1_1_clear'],
      skippedCutscenes: ['cs_1_1_clear'],
    }, RESOLVERS);

    const entries = log.groups.find((g) => g.id === 'chapter_1').entries;
    expect(entries.find((e) => e.id === 'cs_1_1_clear').skipped).toBe(true);
    expect(entries.find((e) => e.id === 'cs_1_1_enter').skipped).toBe(false);

    const summary = buildStoryLogSummary(log);
    expect(summary.skippedText).toBe('놓친 이야기 1편');
    expect(summary.progressText).toBe('본 이야기 2 / 5');
    // 스킵이 없으면 그 줄 자체를 만들지 않는다
    expect(buildStoryLogSummary(buildStoryLog(SCENES, { viewedCutscenes: [] })).skippedText).toBe('');
  });

  it('영웅 종속 컷씬은 챕터가 아니라 영웅 이야기 그룹으로 가고 항상 맨 뒤에 놓인다', () => {
    expect(getSceneGroupId(SCENES[4])).toBe(HERO_GROUP_ID);

    const log = buildStoryLog(SCENES, { viewedCutscenes: ['cs_ch1_enter', 'cs_first_hero_iris'] }, RESOLVERS);
    expect(log.groups[log.groups.length - 1].id).toBe(HERO_GROUP_ID);
    expect(log.groups.map((g) => g.id).indexOf('chapter_1')).toBe(0);

    const heroEntry = log.groups.find((g) => g.id === HERO_GROUP_ID).entries[0];
    expect(heroEntry.title).toBe('아이리스');
    expect(heroEntry.anchors.heroId).toBe('base_iris');
    expect(heroEntry.anchors.chapterId).toBeNull();
  });

  it('재생용 앵커가 story.json 실데이터로도 트리거 조회에 맞는다', () => {
    // 재감상은 StoryManager.getPendingScenes 가 앵커 일치로 씬을 찾는다.
    // 목록이 만든 앵커로 실제 씬을 되찾지 못하면 [재생]이 죽은 버튼이 된다.
    const scenes = StoryManager.getAllScenes();
    const target = scenes.find((s) => s.stageId === '1-1' && s.trigger === 'stage_enter');
    const log = buildStoryLog(scenes, { viewedCutscenes: [target.id] });
    const entry = log.groups.flatMap((g) => g.entries).find((e) => e.id === target.id);

    const found = StoryManager.getPendingScenes(entry.trigger, {
      ...entry.anchors,
      allowRepeat: true,
    });
    expect(found.map((s) => s.id)).toContain(target.id);
  });
});
