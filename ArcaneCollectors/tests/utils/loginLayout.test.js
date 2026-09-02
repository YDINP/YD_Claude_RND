/**
 * loginLayout.test.js — 로그인 · 부팅 배치와 부팅 팁 (T-19)
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_HEIGHT,
  LOGIN_LAYOUT,
  BOOT_LAYOUT,
  resolveLogoDisplaySize,
  combineBootProgress
} from '../../src/utils/loginLayout.js';
import {
  buildBootTips,
  pickSceneTip,
  isTipLine,
  cycleIndex,
  FALLBACK_TIP,
  TIP_LIMIT
} from '../../src/utils/bootTips.js';
import STORY_DATA from '../../src/data/story.json';

describe('로그인 · 부팅 배치', () => {
  it('로고 자리가 두 화면에서 같다 — 씬이 바뀌어도 그림이 튀지 않아야 한다', () => {
    expect(BOOT_LAYOUT.logo).toEqual(LOGIN_LAYOUT.logo);
    expect(BOOT_LAYOUT.subtitle).toEqual(LOGIN_LAYOUT.subtitle);
    expect(BOOT_LAYOUT.fade).toEqual(LOGIN_LAYOUT.fade);
  });

  it('로그인 하단 요소가 아래에서 위 순서로 겹치지 않는다', () => {
    const order = [
      LOGIN_LAYOUT.guestButton.y + LOGIN_LAYOUT.guestButton.h / 2,
      LOGIN_LAYOUT.accountButton.y - LOGIN_LAYOUT.accountButton.h / 2
    ];
    expect(order[1]).toBeGreaterThanOrEqual(order[0]);
    expect(LOGIN_LAYOUT.autoLogin.y).toBeGreaterThan(
      LOGIN_LAYOUT.accountButton.y + LOGIN_LAYOUT.accountButton.h / 2
    );
    expect(LOGIN_LAYOUT.footer.y).toBeGreaterThan(LOGIN_LAYOUT.autoLogin.y);
    expect(LOGIN_LAYOUT.footer.y).toBeLessThan(BASE_HEIGHT);
  });

  it('부팅 팁이 진행바 위에 놓이고 진행바가 화면 안에 있다', () => {
    expect(BOOT_LAYOUT.tip.y).toBeLessThan(BOOT_LAYOUT.progress.y);
    expect(BOOT_LAYOUT.progress.y + BOOT_LAYOUT.progress.h / 2).toBeLessThan(BASE_HEIGHT);
    expect(BOOT_LAYOUT.progress.w).toBe(400);
  });

  it('로고를 상자 안에 비율을 지켜 넣는다', () => {
    // 512x256 로고를 560x180 상자에 → 세로가 먼저 닿는다
    const fit = resolveLogoDisplaySize(512, 256, 560, 180);
    expect(fit.h).toBe(180);
    expect(fit.w).toBe(360);
    expect(fit.w / fit.h).toBeCloseTo(2);
  });

  it('원본 크기를 모르면 상자 크기를 그대로 돌려준다', () => {
    expect(resolveLogoDisplaySize(0, 0, 560, 180)).toEqual({ w: 560, h: 180, scale: 1 });
  });

  it('진행률이 로드 구간과 부팅 구간으로 나뉜다', () => {
    expect(combineBootProgress(0, 0)).toBe(0);
    expect(combineBootProgress(1, 0)).toBeCloseTo(0.55);
    expect(combineBootProgress(1, 1)).toBe(1);
    expect(combineBootProgress(2, -1)).toBeCloseTo(0.55);
    expect(combineBootProgress(NaN, NaN)).toBe(0);
  });
});

describe('부팅 팁', () => {
  it('내레이션이 아닌 줄과 길이를 벗어난 줄은 쓰지 않는다', () => {
    expect(isTipLine({ speakerType: 'narrator', text: '세계는 조용히 금이 갔다.' })).toBe(true);
    expect(isTipLine({ speakerType: 'hero', text: '세계는 조용히 금이 갔다.' })).toBe(false);
    expect(isTipLine({ speakerType: 'narrator', text: '짧다' })).toBe(false);
    expect(isTipLine({ speakerType: 'narrator', text: '가'.repeat(80) })).toBe(false);
    expect(isTipLine({ speakerType: 'narrator', text: '변수 {ascendedCount} 가 들어 있다' })).toBe(false);
    expect(isTipLine(null)).toBe(false);
  });

  it('chapter_enter 컷씬에서만 문장을 뽑는다', () => {
    const lines = [{ speakerType: 'narrator', text: '세계는 조용히 금이 갔다.' }];
    expect(pickSceneTip({ trigger: 'chapter_enter', lines })).toBe('세계는 조용히 금이 갔다.');
    expect(pickSceneTip({ trigger: 'stage_enter', lines })).toBeNull();
    expect(pickSceneTip(null)).toBeNull();
  });

  it('챕터당 한 줄만, 한도까지 모은다', () => {
    const scenes = [
      { id: 'a1', trigger: 'chapter_enter', chapterId: 'chapter_1', lines: [{ speakerType: 'narrator', text: '첫 번째 문장이 여기에 있다.' }] },
      { id: 'a2', trigger: 'chapter_enter', chapterId: 'chapter_1', lines: [{ speakerType: 'narrator', text: '같은 챕터의 다른 문장이다.' }] },
      { id: 'b1', trigger: 'chapter_enter', chapterId: 'chapter_2', lines: [{ speakerType: 'narrator', text: '두 번째 챕터의 문장이다.' }] }
    ];
    const tips = buildBootTips(scenes);
    expect(tips).toHaveLength(2);
    expect(tips[0]).toBe('첫 번째 문장이 여기에 있다.');
    expect(buildBootTips(scenes, { limit: 1 })).toHaveLength(1);
  });

  it('뽑을 문장이 없으면 폴백 한 줄을 돌려준다', () => {
    expect(buildBootTips([])).toEqual([FALLBACK_TIP]);
    expect(buildBootTips(null)).toEqual([FALLBACK_TIP]);
  });

  it('실제 story.json 에서 3~5개를 뽑는다', () => {
    const tips = buildBootTips(STORY_DATA.scenes);
    expect(tips.length).toBeGreaterThanOrEqual(3);
    expect(tips.length).toBeLessThanOrEqual(TIP_LIMIT);
    expect(new Set(tips).size).toBe(tips.length);
    tips.forEach((tip) => {
      expect(tip.length).toBeGreaterThan(9);
      expect(tip.length).toBeLessThanOrEqual(60);
    });
  });

  it('인덱스가 목록 길이 안에서 순환한다', () => {
    expect(cycleIndex(0, 3)).toBe(0);
    expect(cycleIndex(3, 3)).toBe(0);
    expect(cycleIndex(-1, 3)).toBe(2);
    expect(cycleIndex(5, 0)).toBe(0);
  });
});
