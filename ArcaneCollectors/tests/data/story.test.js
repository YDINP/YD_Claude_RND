/**
 * story.test.js
 * `src/data/story.json`이 NARRATIVE_STORY_MODE.md §5 스키마를 만족하는지 검증한다. (T-C3)
 *
 * vi.mock을 우회하고 실제 파일을 fs로 직접 읽는다 (tests/data/stagesEnemies.test.js 패턴).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const story = JSON.parse(readFileSync(new URL('../../src/data/story.json', import.meta.url), 'utf-8'));
const stages = JSON.parse(readFileSync(new URL('../../src/data/stages.json', import.meta.url), 'utf-8'));
const portraitMap = JSON.parse(
  readFileSync(new URL('../../src/data/portrait-mapping.json', import.meta.url), 'utf-8')
);

const TRIGGERS = [
  'chapter_enter',
  'stage_enter',
  'stage_clear',
  'boss_before',
  'boss_after',
  'epilogue',
  'first_hero',
  'hero_ascend',
  'evolve_gate',
  'hero_evolve'
];
const SPEAKER_TYPES = ['narrator', 'hero', 'enemy', 'npc', 'player', 'unknown'];
const EMOTIONS = ['neutral', 'calm', 'tense', 'angry', 'sad', 'joy', 'awe', 'resolute'];
const SPEAKER_SIDES = ['left', 'right'];
/** 화자 슬롯(좌/우)을 차지하지 않는 화자 유형 */
const NON_ACTOR_TYPES = ['narrator', 'player'];

/** 26장면(스토리) 집합: 영웅 전용 트리거를 제외하고, 아이리스 첫 만남 씬만 추가로 포함 */
const STORY_SCENE_TRIGGERS = [
  'chapter_enter',
  'stage_enter',
  'stage_clear',
  'boss_before',
  'boss_after',
  'epilogue',
  'evolve_gate'
];
const HERO_SCENE_TRIGGERS = ['first_hero', 'hero_ascend', 'hero_evolve'];
const SHARED_SCENE_IDS = ['cs_first_hero_iris'];

const scenes = story.scenes;
const stageById = new Map();
const stageChapter = new Map();
for (const chapter of stages.chapters) {
  for (const stage of chapter.stages) {
    stageById.set(stage.id, stage);
    stageChapter.set(stage.id, chapter.id);
  }
}

describe('story.json 스키마 (real file)', () => {
  it('_meta와 scenes 배열을 가진다', () => {
    expect(story._meta).toBeTruthy();
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBeGreaterThan(0);
  });

  it('씬 id가 고유하고 cs_ 접두 snake_case를 따른다', () => {
    const ids = scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const invalid = ids.filter((id) => !/^cs_[a-z0-9_]+$/.test(id));
    expect(invalid).toEqual([]);
  });

  it('모든 씬이 필수 필드를 갖는다', () => {
    const missing = [];
    for (const scene of scenes) {
      for (const key of ['id', 'trigger', 'priority', 'skipable', 'oncePerAccount', 'lines']) {
        if (!(key in scene)) missing.push(`${scene.id}.${key}`);
      }
      for (const key of ['chapterId', 'stageId', 'heroId', 'cultId', 'background', 'bgm', 'varsUsed']) {
        if (!(key in scene)) missing.push(`${scene.id}.${key}`);
      }
      if (typeof scene.priority !== 'number') missing.push(`${scene.id}.priority:type`);
      if (!Array.isArray(scene.varsUsed)) missing.push(`${scene.id}.varsUsed:type`);
      if (!Array.isArray(scene.lines) || scene.lines.length === 0) missing.push(`${scene.id}.lines:empty`);
    }
    expect(missing).toEqual([]);
  });

  it('trigger가 enum 안에 있다', () => {
    const invalid = scenes.filter((s) => !TRIGGERS.includes(s.trigger)).map((s) => `${s.id}:${s.trigger}`);
    expect(invalid).toEqual([]);
  });

  it('skipable은 전 씬 true다 (Pillar ② — 막지 않는 진행)', () => {
    const blocking = scenes.filter((s) => s.skipable !== true).map((s) => s.id);
    expect(blocking).toEqual([]);
  });

  it('트리거별 앵커 필드가 채워져 있다', () => {
    const problems = [];
    for (const scene of scenes) {
      const t = scene.trigger;
      if (['chapter_enter', 'epilogue'].includes(t) && !scene.chapterId) problems.push(`${scene.id}:chapterId`);
      if (['stage_enter', 'stage_clear', 'boss_before', 'boss_after'].includes(t) && !scene.stageId) {
        problems.push(`${scene.id}:stageId`);
      }
      if (['first_hero', 'hero_ascend', 'evolve_gate', 'hero_evolve'].includes(t) && !scene.heroId) {
        problems.push(`${scene.id}:heroId`);
      }
      if (t === 'hero_evolve' && !scene.cultId) problems.push(`${scene.id}:cultId`);
      if (t !== 'hero_evolve' && scene.cultId) problems.push(`${scene.id}:cultId-unexpected`);
    }
    expect(problems).toEqual([]);
  });

  it('stageId가 stages.json에 실재한다', () => {
    const unknown = scenes
      .filter((s) => s.stageId)
      .filter((s) => !stageById.has(s.stageId))
      .map((s) => `${s.id}:${s.stageId}`);
    expect(unknown).toEqual([]);
  });

  it('stageId의 챕터와 chapterId가 일치한다', () => {
    const mismatched = scenes
      .filter((s) => s.stageId && s.chapterId)
      .filter((s) => stageChapter.get(s.stageId) !== s.chapterId)
      .map((s) => `${s.id}:${s.chapterId}≠${stageChapter.get(s.stageId)}`);
    expect(mismatched).toEqual([]);
  });

  it('보스 스테이지는 boss_before/boss_after만 쓴다 (§5-3 배타 규칙)', () => {
    const violations = scenes
      .filter((s) => ['stage_enter', 'stage_clear'].includes(s.trigger))
      .filter((s) => stageById.get(s.stageId)?.isBoss === true)
      .map((s) => s.id);
    expect(violations).toEqual([]);

    const bossSceneOnNonBoss = scenes
      .filter((s) => ['boss_before', 'boss_after'].includes(s.trigger))
      .filter((s) => stageById.get(s.stageId)?.isBoss !== true)
      .map((s) => s.id);
    expect(bossSceneOnNonBoss).toEqual([]);
  });

  it('한 스테이지에 같은 트리거의 씬이 중복되지 않는다', () => {
    const seen = new Set();
    const dup = [];
    for (const scene of scenes) {
      const key = [scene.trigger, scene.chapterId, scene.stageId, scene.heroId, scene.cultId].join('|');
      if (seen.has(key)) dup.push(scene.id);
      seen.add(key);
    }
    expect(dup).toEqual([]);
  });

  it('모든 라인이 speaker/speakerType/portraitId/text를 갖는다', () => {
    const problems = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        const at = `${scene.id}[${i}]`;
        if (typeof line.speaker !== 'string') problems.push(`${at}.speaker`);
        if (!SPEAKER_TYPES.includes(line.speakerType)) problems.push(`${at}.speakerType:${line.speakerType}`);
        if (!('portraitId' in line)) problems.push(`${at}.portraitId`);
        if (typeof line.text !== 'string' || line.text.length === 0) problems.push(`${at}.text`);
        if ('emotion' in line && !EMOTIONS.includes(line.emotion)) problems.push(`${at}.emotion:${line.emotion}`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('speakerSide는 있으면 left/right이고, 내레이터·수집가 줄에는 없다', () => {
    const problems = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (!('speakerSide' in line)) return;
        const at = `${scene.id}[${i}]`;
        if (!SPEAKER_SIDES.includes(line.speakerSide)) problems.push(`${at}:${line.speakerSide}`);
        // 슬롯을 차지하지 않는 화자에게 side를 주면 무대 배치가 어긋난다
        if (NON_ACTOR_TYPES.includes(line.speakerType)) problems.push(`${at}:${line.speakerType}`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('expression은 있으면 비어 있지 않은 문자열이다 (자산 없으면 무시되는 선택 필드)', () => {
    const problems = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (!('expression' in line)) return;
        if (typeof line.expression !== 'string' || line.expression.length === 0) {
          problems.push(`${scene.id}[${i}]:${line.expression}`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('같은 화자는 한 씬 안에서 같은 쪽에 선다', () => {
    const problems = [];
    for (const scene of scenes) {
      const assigned = new Map();
      scene.lines.forEach((line, i) => {
        if (!line.speakerSide) return;
        const identity = line.portraitId || `${line.speakerType}:${line.speaker}`;
        const prev = assigned.get(identity);
        if (prev && prev !== line.speakerSide) problems.push(`${scene.id}[${i}]:${identity}`);
        assigned.set(identity, line.speakerSide);
      });
    }
    expect(problems).toEqual([]);
  });

  it('portraitId는 null이거나 portrait-mapping.json에 존재한다', () => {
    const unknown = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (line.portraitId === null) return;
        if (!portraitMap[line.portraitId]) unknown.push(`${scene.id}[${i}]:${line.portraitId}`);
      });
    }
    expect(unknown).toEqual([]);
  });

  it('내레이터는 이름표가 없고 포트레이트도 없다 (§4-1 표기 규칙)', () => {
    const problems = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (line.speakerType !== 'narrator') return;
        if (line.speaker !== '') problems.push(`${scene.id}[${i}].speaker`);
        if (line.portraitId !== null) problems.push(`${scene.id}[${i}].portraitId`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('미공개 화자는 ??? 표기 + revealAs를 갖는다 (§4-4 R1/R4)', () => {
    const problems = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (line.speakerType !== 'unknown') return;
        if (line.speaker !== '???') problems.push(`${scene.id}[${i}].speaker`);
        if (!line.revealAs) problems.push(`${scene.id}[${i}].revealAs`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('varsUsed와 본문의 {{var}} 사용이 일치한다', () => {
    const problems = [];
    for (const scene of scenes) {
      const used = new Set();
      for (const line of scene.lines) {
        for (const match of line.text.matchAll(/\{\{(\w+)\}\}/g)) used.add(match[1]);
      }
      const declared = new Set(scene.varsUsed);
      for (const v of used) if (!declared.has(v)) problems.push(`${scene.id}:undeclared:${v}`);
      for (const v of declared) if (!used.has(v)) problems.push(`${scene.id}:unused:${v}`);
      for (const v of declared) {
        if (!Object.prototype.hasOwnProperty.call(story._meta.vars, v)) problems.push(`${scene.id}:unknownVar:${v}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('story.json 물량 (내러티브 산출 요약)', () => {
  it('스토리 컷씬은 26장면이다', () => {
    const storyScenes = scenes.filter(
      (s) => STORY_SCENE_TRIGGERS.includes(s.trigger) || SHARED_SCENE_IDS.includes(s.id)
    );
    expect(storyScenes.length).toBe(26);
  });

  it('영웅 대사 세트는 44종이다 (첫 만남 10 / 각성 10 / 전직 24)', () => {
    const heroScenes = scenes.filter((s) => HERO_SCENE_TRIGGERS.includes(s.trigger));
    expect(heroScenes.length).toBe(44);
    expect(scenes.filter((s) => s.trigger === 'first_hero').length).toBe(10);
    expect(scenes.filter((s) => s.trigger === 'hero_ascend').length).toBe(10);
    expect(scenes.filter((s) => s.trigger === 'hero_evolve').length).toBe(24);
  });

  it('챕터 1은 13장면을 갖는다', () => {
    const ch1 = scenes.filter(
      (s) => s.chapterId === 'chapter_1' || ['cs_first_hero_iris', 'cs_evolve_gate_first'].includes(s.id)
    );
    expect(ch1.length).toBe(13);
  });

  it('5개 챕터 전부 chapter_enter를 갖고, 5개 보스 전부 boss_before/after를 갖는다', () => {
    for (let i = 1; i <= 5; i += 1) {
      expect(scenes.some((s) => s.trigger === 'chapter_enter' && s.chapterId === `chapter_${i}`)).toBe(true);
      expect(scenes.some((s) => s.trigger === 'boss_before' && s.stageId === `${i}-5`)).toBe(true);
      expect(scenes.some((s) => s.trigger === 'boss_after' && s.stageId === `${i}-5`)).toBe(true);
    }
  });

  it('챕터 1 13씬은 화자 줄마다 speakerSide가 명시되어 있다', () => {
    const CH1_IDS = [
      'cs_ch1_enter', 'cs_1_1_enter', 'cs_1_1_clear', 'cs_1_2_enter', 'cs_1_2_clear',
      'cs_first_hero_iris', 'cs_1_3_enter', 'cs_1_3_clear', 'cs_evolve_gate_first',
      'cs_1_4_enter', 'cs_1_4_clear', 'cs_1_5_boss_before', 'cs_1_5_boss_after'
    ];
    const missing = [];
    for (const id of CH1_IDS) {
      const scene = scenes.find((s) => s.id === id);
      expect(scene, id).toBeTruthy();
      scene.lines.forEach((line, i) => {
        if (NON_ACTOR_TYPES.includes(line.speakerType)) return;
        if (!SPEAKER_SIDES.includes(line.speakerSide)) missing.push(`${id}[${i}]`);
      });
    }
    expect(missing).toEqual([]);
  });

  it('영웅은 오른쪽, 조력자·적·미공개 화자는 왼쪽에 선다 (챕터 1 규약)', () => {
    const wrong = [];
    for (const scene of scenes) {
      scene.lines.forEach((line, i) => {
        if (!line.speakerSide) return;
        const expected = line.speakerType === 'hero' ? 'right' : 'left';
        if (line.speakerSide !== expected) wrong.push(`${scene.id}[${i}]:${line.speakerType}=${line.speakerSide}`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('전직 씬 24종이 서로 다른 (heroId, cultId) 조합을 덮는다', () => {
    const combos = scenes
      .filter((s) => s.trigger === 'hero_evolve')
      .map((s) => `${s.heroId}:${s.cultId}`);
    expect(new Set(combos).size).toBe(24);
  });
});

describe('stages.json 캡션 (T-Q2)', () => {
  it('챕터 1~2의 story_intro/story_clear가 재작성본으로 교체되었다', () => {
    const broken = [];
    for (const chapter of stages.chapters.slice(0, 2)) {
      for (const stage of chapter.stages) {
        for (const field of ['story_intro', 'story_clear']) {
          const text = stage[field];
          if (typeof text !== 'string' || text.trim().length === 0) broken.push(`${stage.id}.${field}:empty`);
          // 기계번역 파손 잔재 표지
          if (/이그드라실에 이상한|띄이기는데|아인헤르야르|어둠과라와|막키려|나타에 걸려있다/.test(text)) {
            broken.push(`${stage.id}.${field}:legacy`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('캡션은 컷씬 대본과 모순되지 않는다 (1-1/2-5 표본)', () => {
    const stage11 = stageById.get('1-1');
    expect(stage11.story_intro).toContain('새소리가 없다는 것만 빼면');
    const stage25 = stageById.get('2-5');
    expect(stage25.story_clear).toContain('갑주 안은 비어 있었다');
  });
});
