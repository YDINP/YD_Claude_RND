/**
 * stageSelectLayout.test.js — 스테이지 선택 배치 계산 (T-16)
 *
 * 씬을 띄우지 않고 검증한다. 이 모듈은 Phaser 도, 프로젝트 모듈도 참조하지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_WIDTH,
  BASE_HEIGHT,
  MIN_TOUCH,
  STAGE_SELECT_LAYOUT,
  CARD_SLOTS,
  CHAPTER_CULT,
  STAGE_CHIP,
  chapterNumberFromId,
  chapterIdFor,
  clampChapter,
  resolveChapterCult,
  getChapterHeaderLayout,
  buildChapterProgress,
  getProgressFillWidth,
  getStageCardRect,
  getListMetrics,
  clampScroll,
  resolveStageState,
  getStarOffsets,
  estimateHeroPower,
  estimatePartyPower,
  buildChapterStoryProgress,
  hasViewedStageStory
} from '../../src/utils/stageSelectLayout.js';

const stages = [
  { id: '1-1', number: '1-1', name: '어두운 숲 입구', recommendedPower: 100 },
  { id: '1-2', number: '1-2', name: '울창한 숲길', recommendedPower: 150 },
  { id: '1-3', number: '1-3', name: '버섯 군락지', recommendedPower: 200, isElite: true },
  { id: '1-4', number: '1-4', name: '고대의 폐허', recommendedPower: 500 },
  { id: '1-5', number: '1-5', name: '숲의 지배자', recommendedPower: 700, isBoss: true }
];

describe('구획', () => {
  it('세로 구획이 화면 안에서 겹치지 않는다', () => {
    const L = STAGE_SELECT_LAYOUT;
    const bands = [
      [L.header.y, L.header.y + L.header.h],
      [L.chapterPanel.y, L.chapterPanel.y + L.chapterPanel.h],
      [L.list.y, L.list.y + L.list.h],
      [L.lorePanel.y, L.lorePanel.y + L.lorePanel.h],
      [L.footer.y, L.footer.y + L.footer.h]
    ];

    for (let i = 1; i < bands.length; i++) {
      expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][1]);
    }
    expect(bands[bands.length - 1][1]).toBeLessThanOrEqual(BASE_HEIGHT);
  });

  it('패널이 좌우 여백 안에 들어간다', () => {
    const L = STAGE_SELECT_LAYOUT;
    [L.chapterPanel, L.list, L.lorePanel, L.footer].forEach((panel) => {
      expect(panel.x).toBe(L.margin);
      expect(panel.x + panel.w).toBe(BASE_WIDTH - L.margin);
    });
  });

  it('챕터 헤더 화살표의 히트 박스가 터치 하한을 만족한다', () => {
    const H = getChapterHeaderLayout();
    [H.prev, H.next].forEach((slot) => {
      expect(slot.w).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(slot.h).toBeGreaterThanOrEqual(MIN_TOUCH);
    });
    // 화살표가 패널 안에 있다
    expect(H.prev.x - H.prev.w / 2).toBeGreaterThanOrEqual(H.panel.x);
    expect(H.next.x + H.next.w / 2).toBeLessThanOrEqual(H.panel.x + H.panel.w);
  });

  it('카드 슬롯이 카드 폭 안에 있고 진입 버튼이 터치 하한을 만족한다', () => {
    const half = STAGE_SELECT_LAYOUT.list.w / 2;
    expect(CARD_SLOTS.hex.x - CARD_SLOTS.hex.r).toBeGreaterThanOrEqual(-half);
    expect(CARD_SLOTS.action.x + CARD_SLOTS.action.w / 2).toBeLessThanOrEqual(half);
    expect(CARD_SLOTS.action.h).toBeGreaterThanOrEqual(MIN_TOUCH);
    expect(CARD_SLOTS.sweep.h).toBeGreaterThanOrEqual(MIN_TOUCH);
  });

  it('칩과 소탕 버튼이 세로로 겹치지 않는다', () => {
    const chipBottom = CARD_SLOTS.chip.y + CARD_SLOTS.chip.h / 2;
    const sweepTop = CARD_SLOTS.sweep.y - CARD_SLOTS.sweep.h / 2;
    expect(sweepTop).toBeGreaterThanOrEqual(chipBottom);
  });
});

describe('챕터', () => {
  it('챕터 ID 와 번호를 서로 변환한다', () => {
    expect(chapterNumberFromId('chapter_3')).toBe(3);
    expect(chapterNumberFromId('chapter_x')).toBe(0);
    expect(chapterNumberFromId(null)).toBe(0);
    expect(chapterIdFor(2)).toBe('chapter_2');
    expect(chapterIdFor('chapter_5')).toBe('chapter_5');
    expect(chapterIdFor(undefined)).toBe('chapter_1');
  });

  it('챕터 번호를 사용 가능한 범위로 가둔다', () => {
    expect(clampChapter(0, 5)).toBe(1);
    expect(clampChapter(9, 5)).toBe(5);
    expect(clampChapter(3, 5)).toBe(3);
    expect(clampChapter(NaN, 5)).toBe(1);
  });

  it('챕터마다 지배 교단이 정해져 있고 모르는 챕터는 null 이다', () => {
    expect(Object.keys(CHAPTER_CULT)).toHaveLength(5);
    expect(resolveChapterCult(3)).toBe('yomi');
    expect(resolveChapterCult('chapter_4')).toBe('olympus');
    expect(resolveChapterCult(99)).toBeNull();
  });

  it('클리어 진행도를 별 수까지 세어 문장으로 만든다', () => {
    const progress = buildChapterProgress(stages, { '1-1': 3, '1-2': 1 });
    expect(progress.cleared).toBe(2);
    expect(progress.total).toBe(5);
    expect(progress.stars).toBe(4);
    expect(progress.maxStars).toBe(15);
    expect(progress.ratio).toBeCloseTo(0.4);
    expect(progress.text).toBe('2 / 5 클리어');
  });

  it('진행도 0 과 빈 목록에서도 문장이 성립한다', () => {
    expect(buildChapterProgress(stages, {}).text).toBe('0 / 5 클리어');
    expect(buildChapterProgress([], {}).ratio).toBe(0);
    expect(buildChapterProgress(null, null).total).toBe(0);
  });

  it('진행바 채움 너비가 0..width 를 벗어나지 않는다', () => {
    expect(getProgressFillWidth(0, 380)).toBe(0);
    expect(getProgressFillWidth(0.5, 380)).toBe(190);
    expect(getProgressFillWidth(3, 380)).toBe(380);
    expect(getProgressFillWidth(-1, 380)).toBe(0);
    expect(getProgressFillWidth(0.5, 0)).toBe(0);
  });
});

describe('리스트', () => {
  it('카드가 gap 만큼 떨어져 아래로 쌓인다', () => {
    const first = getStageCardRect(0);
    const second = getStageCardRect(1);
    expect(first.y).toBe(STAGE_SELECT_LAYOUT.list.y);
    expect(second.y - first.y).toBe(STAGE_SELECT_LAYOUT.card.h + STAGE_SELECT_LAYOUT.card.gap);
    expect(first.cy).toBe(first.y + first.h / 2);
    expect(first.cx).toBe(BASE_WIDTH / 2);
  });

  it('5장은 스크롤이 필요 없고 12장은 필요하다', () => {
    const five = getListMetrics(5);
    expect(five.scrollable).toBe(false);
    expect(five.maxScroll).toBe(0);
    expect(five.contentH).toBe(5 * 92 + 4 * 12);

    const twelve = getListMetrics(12);
    expect(twelve.scrollable).toBe(true);
    expect(twelve.maxScroll).toBeGreaterThan(0);
  });

  it('스크롤 오프셋을 0..maxScroll 로 가둔다', () => {
    expect(clampScroll(-50, 200)).toBe(0);
    expect(clampScroll(500, 200)).toBe(200);
    expect(clampScroll(120, 200)).toBe(120);
    expect(clampScroll(120, 0)).toBe(0);
  });
});

describe('스테이지 상태', () => {
  it('첫 칸은 항상 열려 있고 다음 칸은 직전 클리어가 필요하다', () => {
    const cleared = {};
    expect(resolveStageState({ stages, index: 0, clearedStages: cleared }).isLocked).toBe(false);
    expect(resolveStageState({ stages, index: 1, clearedStages: cleared }).isLocked).toBe(true);
    expect(
      resolveStageState({ stages, index: 1, clearedStages: { '1-1': 2 } }).isLocked
    ).toBe(false);
  });

  it('클리어 여부와 별 수를 구분한다 — 0성 클리어도 클리어다', () => {
    const state = resolveStageState({ stages, index: 0, clearedStages: { '1-1': 0 } });
    expect(state.isCleared).toBe(true);
    expect(state.stars).toBe(0);
    expect(state.isCurrent).toBe(false);
  });

  it('잠김 카드의 알파는 0.45 이고 지금 도전할 칸만 isCurrent 다', () => {
    const current = resolveStageState({ stages, index: 0, clearedStages: {} });
    expect(current.isCurrent).toBe(true);
    expect(current.alpha).toBe(1);

    const locked = resolveStageState({ stages, index: 2, clearedStages: {} });
    expect(locked.isLocked).toBe(true);
    expect(locked.isCurrent).toBe(false);
    expect(locked.alpha).toBe(0.45);
  });

  it('보스 판정은 인자를 우선하고 칩은 하나만 붙는다', () => {
    const boss = resolveStageState({ stages, index: 4, clearedStages: {}, isBoss: true });
    expect(boss.isBoss).toBe(true);
    expect(boss.isElite).toBe(false);
    expect(boss.chip).toBe(STAGE_CHIP.boss);

    const elite = resolveStageState({ stages, index: 2, clearedStages: {}, isBoss: false });
    expect(elite.chip).toBe(STAGE_CHIP.elite);

    const plain = resolveStageState({ stages, index: 0, clearedStages: {}, isBoss: false });
    expect(plain.chip).toBeNull();
  });

  it('별 오프셋이 중심 대칭이고 개수만큼 나온다', () => {
    const offsets = getStarOffsets(3);
    expect(offsets).toHaveLength(3);
    expect(offsets[1]).toBeCloseTo(CARD_SLOTS.stars.x);
    expect(offsets[2] - offsets[1]).toBe(CARD_SLOTS.stars.size + CARD_SLOTS.stars.gap);
  });
});

describe('전투력 추정', () => {
  const hero = (hp, atk, def, spd) => ({ stats: { hp, atk, def, spd } });

  it('스탯이 없으면 0 이다', () => {
    expect(estimateHeroPower(null)).toBe(0);
    expect(estimateHeroPower({})).toBe(0);
    expect(estimateHeroPower({ stats: {} })).toBe(0);
  });

  it('파티 편성 모달과 같은 가중치를 쓴다', () => {
    expect(estimateHeroPower(hero(100, 10, 5, 3))).toBe(100 + 50 + 15 + 6);
  });

  it('상위 4명만 합산한다', () => {
    const heroes = [hero(100, 0, 0, 0), hero(200, 0, 0, 0), hero(300, 0, 0, 0),
      hero(400, 0, 0, 0), hero(500, 0, 0, 0)];
    expect(estimatePartyPower(heroes)).toBe(500 + 400 + 300 + 200);
    expect(estimatePartyPower(heroes, 2)).toBe(900);
    expect(estimatePartyPower([])).toBe(0);
    expect(estimatePartyPower(null)).toBe(0);
  });
});

describe('이야기 진행', () => {
  const scenes = [
    { id: 'cs_ch1_enter', chapterId: 'chapter_1', stageId: null },
    { id: 'cs_1_1_enter', chapterId: 'chapter_1', stageId: '1-1' },
    { id: 'cs_1_1_clear', chapterId: 'chapter_1', stageId: '1-1' },
    { id: 'cs_ch2_enter', chapterId: 'chapter_2', stageId: null }
  ];

  it('챕터별 시청 편수를 센다', () => {
    const progress = buildChapterStoryProgress(scenes, 'chapter_1', ['cs_ch1_enter']);
    expect(progress.total).toBe(3);
    expect(progress.viewed).toBe(1);
    expect(progress.text).toBe('이야기 1 / 3편 시청');
  });

  it('컷씬이 없는 챕터는 없음으로 말한다', () => {
    expect(buildChapterStoryProgress(scenes, 'chapter_9', []).text).toBe('이야기 없음');
    expect(buildChapterStoryProgress(null, 'chapter_1', null).total).toBe(0);
  });

  it('시청한 컷씬이 있는 스테이지만 표시 대상이다', () => {
    const viewed = new Set(['cs_1_1_clear']);
    expect(hasViewedStageStory(scenes, '1-1', viewed)).toBe(true);
    expect(hasViewedStageStory(scenes, '1-2', viewed)).toBe(false);
    expect(hasViewedStageStory(scenes, '1-1', [])).toBe(false);
    expect(hasViewedStageStory(scenes, null, viewed)).toBe(false);
  });
});
