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
import { OFFLINE_REWARD_CAP_HOURS } from '../../src/config/onboardingConfig.js';

const tutorial = JSON.parse(
  readFileSync(new URL('../../src/data/tutorial.json', import.meta.url), 'utf-8')
);

const ALL_STEPS = tutorial.steps;
const ALL_STEP_IDS = ALL_STEPS.map((s) => s.id);

/** 메인 트랙(T-01~T-12) — 계정 진행 체인 */
const STEPS = ALL_STEPS.filter((s) => (s.track || 'main') === 'main');
const STEP_IDS = STEPS.map((s) => s.id);

/** 전투 트랙(B-1~B-5) — 첫 전투 안에서만 1회 재생 */
const BATTLE_STEPS = ALL_STEPS.filter((s) => s.track === 'battle');
const BATTLE_STEP_IDS = BATTLE_STEPS.map((s) => s.id);

const HIGHLIGHT_TYPES = [
  'none', 'coach_tooltip', 'coach_arrow', 'mask_pulse',
  'mask_choice', 'spotlight_sequence', 'cutscene_only',
];
const TRIGGER_TYPES = ['account_created', 'step_complete', 'stage_clear', 'scene_enter', 'popup_open', 'battle_start'];
const COMPLETION_TYPES = [
  'cutscene_end', 'stage_clear', 'stage_clear_all', 'gacha_result_confirmed',
  'popup_open', 'ascension_complete', 'party_saved', 'overlay_dismissed', 'skill_used',
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
    ALL_STEPS.forEach((step) => {
      required.forEach((field) => {
        expect(step, `${step.id}.${field}`).toHaveProperty(field);
      });
      expect(Array.isArray(step.unlockMenus), `${step.id}.unlockMenus`).toBe(true);
    });
  });

  it('trigger / highlightType / completionCondition 이 정의된 enum 안에 있다 (전 트랙)', () => {
    ALL_STEPS.forEach((step) => {
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

  it('안내 스텝 8개는 전부 skipGroup(S-1~S-4)을 갖는다 (메인 트랙)', () => {
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

  it('trigger.after 는 직전 스텝을 가리킨다 (메인 트랙)', () => {
    STEPS.slice(1).forEach((step, i) => {
      expect(step.trigger.type, step.id).toBe('step_complete');
      expect(step.trigger.after, step.id).toBe(STEP_IDS[i]);
    });
    expect(STEPS[0].trigger.type).toBe('account_created');
  });

  it('instructionText 길이 규정 — 강제 20자 / 안내 40자 이내 (전 트랙)', () => {
    ALL_STEPS.forEach((step) => {
      if (!step.instructionText) return;
      const limit = step.forced ? 20 : 40;
      expect(step.instructionText.length, `${step.id}: ${step.instructionText}`).toBeLessThanOrEqual(limit);
    });
  });

  it('fallbackAnchor 는 base 720x1280 범위 안의 사각형이다 (전 트랙)', () => {
    ALL_STEPS.forEach((step) => {
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
    ALL_STEPS.forEach((step) => {
      if (!step.targetElement) return;
      expect(step.targetElement, step.id).toMatch(/^[a-z]+\.[a-z_]+\.[A-Za-z0-9_-]+$/);
    });
  });

  it('unlockMenus 합계가 시스템 문서 §4-2 온보딩 구간 해금 순서와 일치한다', () => {
    const unlockOrder = STEPS.flatMap((s) => s.unlockMenus);
    expect(unlockOrder).toEqual([
      'herolist', 'partyedit', 'ascension', // T-05 (각인 아이콘은 T-06 안내 대상이라 함께 열린다)
      'quest',                              // T-10
      'inventory', 'gacha', 'collection',   // T-11
    ]);
    expect(new Set(unlockOrder).size).toBe(unlockOrder.length);
  });

  it('보상은 스텝에만 귀속되며 rewardId 는 중복되지 않는다', () => {
    const rewards = ALL_STEPS.map((s) => s.rewardId).filter(Boolean);
    expect(new Set(rewards).size).toBe(rewards.length);
    expect(rewards).toContain('grant_starter_iris');
    expect(rewards).toContain('grant_tutorial_complete');
  });

  it('예상 소요 시간 합계가 목표 12~15분 구간에 들어간다 (메인 트랙)', () => {
    const total = STEPS.reduce((sum, s) => sum + (s.estimatedSec || 0), 0);
    expect(total).toBeGreaterThanOrEqual(720);
    expect(total).toBeLessThanOrEqual(900);
  });

  it('T-12 의 오프라인 상한은 ISS-01 확정값(24h)이며 코드 SSOT 와 일치한다', () => {
    const t12 = STEPS.find((s) => s.id === 'T-12');
    expect(t12.offlineCapHours).toBe(OFFLINE_REWARD_CAP_HOURS);
    expect(t12.offlineCapHours).toBe(24);
  });
});

describe('전투 트랙 (B-1~B-5)', () => {
  it('5스텝이며 전부 BattleScene 대상이다', () => {
    expect(BATTLE_STEP_IDS).toEqual(['B-1', 'B-2', 'B-3', 'B-4', 'B-5']);
    BATTLE_STEPS.forEach((step) => {
      expect(step.targetScene, step.id).toBe('BattleScene');
      expect(step.targetPopup, step.id).toBeNull();
    });
  });

  it('강제 스텝이 없다 — 전투 진행을 막지 않는다', () => {
    BATTLE_STEPS.forEach((step) => {
      expect(step.forced, step.id).toBe(false);
      expect(step.skipGroup, step.id).toBe('S-1');
    });
  });

  it('B-2 만 입력을 기다리며, 대기가 길어지면 자동 커밋된다', () => {
    const b2 = BATTLE_STEPS.find((s) => s.id === 'B-2');
    expect(b2.waitForInput).toBe(true);
    expect(b2.completionCondition.type).toBe('skill_used');
    expect(b2.fallbackPolicy.autoCommitAfterSec).toBeGreaterThan(0);

    BATTLE_STEPS.filter((s) => s.id !== 'B-2').forEach((step) => {
      expect(step.waitForInput, step.id).toBeUndefined();
      expect(step.completionCondition.type, step.id).toBe('overlay_dismissed');
    });
  });

  it('첫 전투(1-1)에서만 시작되고 체인이 B-5(null)로 끝난다', () => {
    expect(BATTLE_STEPS[0].trigger).toEqual({ type: 'battle_start', stageId: '1-1' });
    BATTLE_STEPS.forEach((step, i) => {
      const expected = i === BATTLE_STEPS.length - 1 ? null : BATTLE_STEP_IDS[i + 1];
      expect(step.nextStepId, step.id).toBe(expected);
    });
  });

  it('보상과 메뉴 해금을 건드리지 않는다 (계정 진행도와 독립)', () => {
    BATTLE_STEPS.forEach((step) => {
      expect(step.rewardId, step.id).toBeNull();
      expect(step.unlockMenus, step.id).toEqual([]);
      expect(step.cutsceneIds, step.id).toEqual([]);
    });
  });

  it('전투 타깃 키 6종을 참조한다', () => {
    const targets = BATTLE_STEPS.flatMap((s) => s.highlightSequence || [s.targetElement]);
    ['battle.turn.badge', 'battle.skill.slot1', 'battle.button.auto',
     'battle.button.speed', 'battle.enemy.moodBadge', 'battle.unit.hp']
      .forEach((tid) => expect(targets, tid).toContain(tid));
  });
});

describe('story.json 과의 정합성', () => {
  const story = JSON.parse(
    readFileSync(new URL('../../src/data/story.json', import.meta.url), 'utf-8')
  );
  const SCENE_IDS = new Set(story.scenes.map((scene) => scene.id));

  it('tutorial.json 이 참조하는 모든 컷씬 id 가 story.json 에 존재한다', () => {
    // 컷씬 id 의 SSOT 는 story.json 이다. 본 파일은 참조만 하므로 끊긴 참조는 곧 버그다.
    const refs = [...new Set(ALL_STEPS.flatMap((s) => s.cutsceneIds || []))];

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((id) => !SCENE_IDS.has(id))).toEqual([]);
  });

  it('completionCondition.sceneId 도 story.json 에 존재하며 해당 스텝의 cutsceneIds 안에 있다', () => {
    ALL_STEPS.forEach((step) => {
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
  it('전 트랙 스텝 ID 목록이 SaveManager.TUTORIAL_STEP_IDS 와 일치한다', () => {
    expect(ALL_STEP_IDS).toEqual(SaveManager.TUTORIAL_STEP_IDS);
  });

  it('메인 트랙 12 + 전투 트랙 5 = 17스텝', () => {
    expect(STEP_IDS).toHaveLength(12);
    expect(BATTLE_STEP_IDS).toHaveLength(5);
    expect(ALL_STEP_IDS).toHaveLength(17);
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
