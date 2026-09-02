/**
 * tutorial.test.js
 * T-C5 — src/data/tutorial.json 스키마 검증
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §4-2(필드 정의) / §4-3(실사용 샘플) / §2-6(해금 매핑)
 * cutsceneIds 의 SSOT 는 src/data/story.json 이므로 본 파일은 참조만 한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { STAGE_UNLOCKS } from '../../src/systems/MenuGridGate.js';

const tutorial = JSON.parse(
  readFileSync(new URL('../../src/data/tutorial.json', import.meta.url), 'utf-8')
);

const STEPS = tutorial.steps;
const STEP_IDS = STEPS.map((s) => s.id);

const HIGHLIGHT_TYPES = [
  'none', 'coach_tooltip', 'coach_arrow', 'mask_pulse',
  'mask_choice', 'spotlight_sequence', 'cutscene_only',
];
const TRIGGER_TYPES = ['account_created', 'step_complete', 'stage_clear', 'scene_enter', 'popup_open'];
const COMPLETION_TYPES = [
  'cutscene_end', 'stage_clear', 'stage_clear_all', 'gacha_result_confirmed',
  'popup_open', 'ascension_complete', 'party_saved', 'overlay_dismissed',
];

describe('tutorial.json 스키마', () => {
  it('_meta 가 좌표 기준과 강제 스텝 상한을 명시한다', () => {
    expect(tutorial._meta.coordinateBase).toBe('720x1280');
    expect(tutorial._meta.forcedStepLimit).toBe(4);
    expect(tutorial._meta.forcedStepIds).toEqual(['T-03', 'T-05', 'T-07', 'T-09']);
  });

  it('T-01 ~ T-12 12스텝이 순서대로 정의된다', () => {
    expect(STEPS).toHaveLength(12);
    expect(STEP_IDS).toEqual([
      'T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06',
      'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12',
    ]);
    expect(new Set(STEP_IDS).size).toBe(12);
  });

  it('모든 스텝이 필수 필드를 갖는다', () => {
    const required = [
      'id', 'trigger', 'targetScene', 'targetElement', 'forced',
      'highlightType', 'completionCondition', 'rewardId', 'unlockMenus',
      'resumeAt', 'nextStepId',
    ];
    STEPS.forEach((step) => {
      required.forEach((field) => {
        expect(step, `${step.id}.${field}`).toHaveProperty(field);
      });
      expect(Array.isArray(step.unlockMenus), `${step.id}.unlockMenus`).toBe(true);
    });
  });

  it('trigger / highlightType / completionCondition 이 정의된 enum 안에 있다', () => {
    STEPS.forEach((step) => {
      expect(TRIGGER_TYPES, step.id).toContain(step.trigger.type);
      expect(HIGHLIGHT_TYPES, step.id).toContain(step.highlightType);
      expect(COMPLETION_TYPES, step.id).toContain(step.completionCondition.type);
    });
  });

  it('강제 스텝은 정확히 4개이며 forceRule 을 갖고 skipGroup 이 없다', () => {
    const forced = STEPS.filter((s) => s.forced === true);
    expect(forced.map((s) => s.id)).toEqual(['T-03', 'T-05', 'T-07', 'T-09']);
    forced.forEach((step) => {
      expect(['F-1', 'F-2'], step.id).toContain(step.forceRule);
      expect(step.skipGroup, step.id).toBeNull();
    });
  });

  it('안내 스텝 8개는 전부 skipGroup(S-1~S-4)을 갖는다', () => {
    const guided = STEPS.filter((s) => s.forced !== true);
    expect(guided).toHaveLength(8);
    guided.forEach((step) => {
      expect(['S-1', 'S-2', 'S-3', 'S-4'], step.id).toContain(step.skipGroup);
    });
  });

  it('nextStepId 체인이 T-01 → … → T-12(null) 로 이어진다', () => {
    STEPS.forEach((step, i) => {
      const expected = i === STEPS.length - 1 ? null : STEP_IDS[i + 1];
      expect(step.nextStepId, step.id).toBe(expected);
    });
  });

  it('trigger.after 는 직전 스텝을 가리킨다', () => {
    STEPS.slice(1).forEach((step, i) => {
      expect(step.trigger.type, step.id).toBe('step_complete');
      expect(step.trigger.after, step.id).toBe(STEP_IDS[i]);
    });
    expect(STEPS[0].trigger.type).toBe('account_created');
  });

  it('instructionText 길이 규정 — 강제 20자 / 안내 40자 이내', () => {
    STEPS.forEach((step) => {
      if (!step.instructionText) return;
      const limit = step.forced ? 20 : 40;
      expect(step.instructionText.length, `${step.id}: ${step.instructionText}`).toBeLessThanOrEqual(limit);
    });
  });

  it('fallbackAnchor 는 base 720x1280 범위 안의 사각형이다', () => {
    STEPS.forEach((step) => {
      if (!step.fallbackAnchor) return;
      const { x, y, w, h } = step.fallbackAnchor;
      [x, y, w, h].forEach((v) => expect(Number.isFinite(v), step.id).toBe(true));
      expect(x, step.id).toBeGreaterThanOrEqual(0);
      expect(y, step.id).toBeGreaterThanOrEqual(0);
      expect(x + w, step.id).toBeLessThanOrEqual(720);
      expect(y + h, step.id).toBeLessThanOrEqual(1280);
    });
  });

  it('targetElement 는 TID 명명 규칙({scope}.{group}.{item})을 따른다', () => {
    STEPS.forEach((step) => {
      if (!step.targetElement) return;
      expect(step.targetElement, step.id).toMatch(/^[a-z]+\.[a-z_]+\.[a-z0-9_-]+$/);
    });
  });

  it('unlockMenus 합계가 시스템 문서 §4-2 온보딩 구간 해금 순서와 일치한다', () => {
    const unlockOrder = STEPS.flatMap((s) => s.unlockMenus);
    expect(unlockOrder).toEqual([
      'herolist', 'partyedit',      // T-05
      'ascension',                  // T-06
      'quest',                      // T-10
      'inventory', 'gacha', 'collection', // T-11
    ]);
    expect(new Set(unlockOrder).size).toBe(unlockOrder.length);
  });

  it('보상은 스텝에만 귀속되며 rewardId 는 중복되지 않는다', () => {
    const rewards = STEPS.map((s) => s.rewardId).filter(Boolean);
    expect(new Set(rewards).size).toBe(rewards.length);
    expect(rewards).toContain('grant_starter_iris');
    expect(rewards).toContain('grant_tutorial_complete');
  });

  it('예상 소요 시간 합계가 목표 12~15분 구간에 들어간다', () => {
    const total = STEPS.reduce((sum, s) => sum + (s.estimatedSec || 0), 0);
    expect(total).toBeGreaterThanOrEqual(720);
    expect(total).toBeLessThanOrEqual(900);
  });

  it('T-12 의 오프라인 상한은 ISS-01 미해결 플레이스홀더다 (릴리스 전 확정 필요)', () => {
    const t12 = STEPS.find((s) => s.id === 'T-12');
    expect(t12.offlineCapHours).toBe('TBD_ISS-01');
  });
});

describe('story.json 과의 정합성', () => {
  const story = JSON.parse(
    readFileSync(new URL('../../src/data/story.json', import.meta.url), 'utf-8')
  );
  const SCENE_IDS = new Set(story.scenes.map((scene) => scene.id));

  it('tutorial.json 이 참조하는 모든 컷씬 id 가 story.json 에 존재한다', () => {
    // 컷씬 id 의 SSOT 는 story.json 이다. 본 파일은 참조만 하므로 끊긴 참조는 곧 버그다.
    const refs = [...new Set(STEPS.flatMap((s) => s.cutsceneIds || []))];

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((id) => !SCENE_IDS.has(id))).toEqual([]);
  });

  it('completionCondition.sceneId 도 story.json 에 존재하며 해당 스텝의 cutsceneIds 안에 있다', () => {
    STEPS.forEach((step) => {
      const cond = step.completionCondition;
      if (cond.type !== 'cutscene_end') return;
      expect(SCENE_IDS.has(cond.sceneId), `${step.id}: ${cond.sceneId}`).toBe(true);
      expect(step.cutsceneIds, step.id).toContain(cond.sceneId);
    });
  });

  it('T-09 는 기관 선택 직전 컷씬 cs_evolve_gate_first 를 참조한다', () => {
    const t9 = STEPS.find((s) => s.id === 'T-09');
    expect(t9.cutsceneIds).toEqual(['cs_evolve_gate_first']);
    expect(t9.cutsceneTiming).toBe('before_route_list');
  });
});

describe('SaveManager 상수와의 정합성', () => {
  it('스텝 ID 목록이 SaveManager.TUTORIAL_STEP_IDS 와 일치한다', () => {
    expect(STEP_IDS).toEqual(SaveManager.TUTORIAL_STEP_IDS);
  });

  it('튜토리얼 해금 + 스테이지 해금의 합이 SaveManager.ALL_MENU_KEYS 13종과 정확히 같다', () => {
    const fromTutorial = STEPS.flatMap((s) => s.unlockMenus);
    const fromStages = Object.keys(STAGE_UNLOCKS);
    const union = [...new Set([...fromTutorial, ...fromStages])];

    expect(union.sort()).toEqual([...SaveManager.ALL_MENU_KEYS].sort());
    expect(union).toHaveLength(13);
  });

  it('해금 대상에 settings 는 포함되지 않는다 (그리드 밖 상단 아이콘)', () => {
    expect(SaveManager.ALL_MENU_KEYS).not.toContain('settings');
    expect(STEPS.flatMap((s) => s.unlockMenus)).not.toContain('settings');
    expect(Object.keys(STAGE_UNLOCKS)).not.toContain('settings');
  });
});
