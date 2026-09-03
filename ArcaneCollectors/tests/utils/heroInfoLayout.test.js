/**
 * heroInfoLayout.test.js — T-15b
 * 영웅 정보 팝업 콘텐츠 배치. 핵심은 "겹침 0" 회귀 가드다.
 * 이전 구현은 400×600 패널에 스킬 3칸과 액션 버튼을 같은 좌표에 그려 서로 덮어썼다.
 */
import { describe, it, expect } from 'vitest';
import {
  HERO_INFO_LAYOUT,
  STAT_ROWS,
  STAT_MAX,
  MAX_SKILLS,
  rect,
  rectsOverlap,
  findOverlap,
  anyOverlap,
  contains,
  computeSections,
  computePortraitCover,
  computePortraitFade,
  barRatio,
  computeStatRows,
  computeSkillRows,
  computeRibbonSlots,
  collectLayoutBoxes,
  formatNumber,
  truncate,
  buildStars
} from '../../src/utils/heroInfoLayout.js';

/** POPUP_SLOT 규격의 콘텐츠 슬롯 (기획 px): 헤더 88 아래, 액션바 88 위 */
const CONTENT = rect(56, 152, 608, 1000, 'content');

describe('사각형 유틸', () => {
  it('맞닿기만 하면 겹침이 아니다', () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(9, 0, 10, 10))).toBe(true);
  });

  it('겹치는 쌍을 이름과 함께 찾아준다', () => {
    const found = findOverlap([rect(0, 0, 10, 10, 'a'), rect(5, 5, 10, 10, 'b')]);
    expect(found.a.name).toBe('a');
    expect(found.b.name).toBe('b');
    expect(anyOverlap([rect(0, 0, 10, 10), rect(20, 20, 5, 5)])).toBe(false);
  });

  it('포함 관계를 판정한다', () => {
    expect(contains(rect(0, 0, 100, 100), rect(10, 10, 10, 10))).toBe(true);
    expect(contains(rect(0, 0, 100, 100), rect(95, 95, 10, 10))).toBe(false);
  });
});

describe('computeSections — 콘텐츠 4분할', () => {
  it('네 섹션이 위에서 아래로 겹치지 않고 쌓인다', () => {
    const { portrait, ribbon, stats, skills } = computeSections(CONTENT);
    expect(portrait.bottom).toBeLessThanOrEqual(ribbon.y);
    expect(ribbon.bottom).toBeLessThanOrEqual(stats.y);
    expect(stats.bottom).toBeLessThanOrEqual(skills.y);
    expect(anyOverlap([portrait, ribbon, stats, skills])).toBe(false);
  });

  it('네 섹션이 콘텐츠 슬롯 밖으로 나가지 않는다 (액션바 침범 없음)', () => {
    const sections = computeSections(CONTENT);
    Object.values(sections).forEach((section) => {
      expect(contains(CONTENT, section)).toBe(true);
    });
    expect(sections.skills.bottom).toBeLessThanOrEqual(CONTENT.bottom);
  });

  it('전신 시트가 콘텐츠 높이의 40%다', () => {
    const { portrait } = computeSections(CONTENT);
    expect(portrait.h).toBeCloseTo(CONTENT.h * HERO_INFO_LAYOUT.portraitRatio, 6);
  });

  it('스킬 섹션이 남은 높이를 전부 받는다', () => {
    const { skills } = computeSections(CONTENT);
    expect(skills.bottom).toBeCloseTo(CONTENT.bottom, 6);
    expect(skills.h).toBeGreaterThan(0);
  });

  it('PopupBase 의 left/top/width/height 표기도 그대로 받는다', () => {
    const fromPopupBase = { left: 56, top: 152, width: 608, height: 1000 };
    expect(computeSections(fromPopupBase).portrait.x).toBe(56);
  });

  it('유효하지 않은 입력은 크기 0 섹션으로 안전 복귀한다', () => {
    const sections = computeSections(null);
    expect(sections.portrait.w).toBe(0);
    expect(computeSections({ x: 0, y: 0, w: 0, h: 0 }).skills.h).toBe(0);
  });
});

describe('computePortraitCover — 세로로 긴 전신을 가로 띠에 채우기', () => {
  const box = computeSections(CONTENT).portrait;

  it('가로를 꽉 채우고 아래를 잘라낸다', () => {
    const fit = computePortraitCover(683, 1024, box);
    expect(fit.width).toBeCloseTo(box.w, 6);
    expect(fit.height).toBeGreaterThan(box.h);
    expect(fit.cropped).toBe(true);
  });

  it('머리가 보이도록 상단 기준으로 붙인다', () => {
    const fit = computePortraitCover(683, 1024, box);
    expect(fit.originY).toBe(0);
    expect(fit.y).toBe(box.y);
    expect(fit.x).toBe(box.centerX);
  });

  it('가로세로 비율을 유지한다', () => {
    const fit = computePortraitCover(683, 1024, box);
    expect(fit.width / fit.height).toBeCloseTo(683 / 1024, 6);
  });

  it('가로로 긴 원본은 세로 기준으로 키워 빈틈을 없앤다', () => {
    const fit = computePortraitCover(1600, 400, box);
    expect(fit.height).toBeGreaterThanOrEqual(box.h - 0.001);
    expect(fit.width).toBeGreaterThanOrEqual(box.w - 0.001);
  });

  it('정사각 포트레이트 폴백도 같은 경로로 처리된다', () => {
    const fit = computePortraitCover(512, 512, box);
    expect(fit.width).toBeCloseTo(box.w, 6);
    expect(fit.height).toBeCloseTo(box.w, 6);
  });

  it('크기가 유효하지 않으면 배율 1 로 안전 복귀한다', () => {
    expect(computePortraitCover(0, 0, box).scale).toBe(1);
    expect(computePortraitCover(683, 1024, null).width).toBe(0);
  });

  it('페이드 띠가 전신 섹션 하단에 붙고 섹션을 넘지 않는다', () => {
    const fade = computePortraitFade(box, 96);
    expect(fade.bottom).toBeCloseTo(box.bottom, 6);
    expect(contains(box, fade)).toBe(true);
  });
});

describe('능력치 4행', () => {
  const sections = computeSections(CONTENT);
  const stats = { hp: 990, atk: 99, def: 71, spd: 99 };

  it('HP·ATK·DEF·SPD 순서로 아래로 쌓인다', () => {
    const rows = computeStatRows(stats, sections.stats);
    expect(rows.map((r) => r.key)).toEqual(STAT_ROWS.map((r) => r.key));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].row.y).toBeGreaterThan(rows[i - 1].row.y);
    }
  });

  it('한 행 안에서 아이콘·라벨·값·바가 서로 겹치지 않는다', () => {
    const row = computeStatRows(stats, sections.stats)[0];
    expect(anyOverlap([row.icon, row.labelBox, row.valueBox, row.bar])).toBe(false);
  });

  it('4행 전체가 능력치 섹션 안에 들어간다', () => {
    computeStatRows(stats, sections.stats).forEach((row) => {
      expect(contains(sections.stats, row.row)).toBe(true);
    });
  });

  it('바 길이는 상한 대비 비율이고 상한을 넘어도 꽉 찬 데서 멈춘다', () => {
    const rows = computeStatRows(
      { hp: STAT_MAX.hp / 2, atk: STAT_MAX.atk * 4, def: 0, spd: -10 },
      sections.stats
    );
    expect(rows[0].fillWidth).toBeCloseTo(rows[0].bar.w / 2, 6);
    expect(rows[1].fillWidth).toBeCloseTo(rows[1].bar.w, 6);
    expect(rows[2].fillWidth).toBe(0);
    expect(rows[3].fillWidth).toBe(0);
  });

  it('스탯이 없어도 4행을 0 으로 만들어낸다', () => {
    const rows = computeStatRows(null, sections.stats);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });

  it('barRatio 는 0~1 로 잘린다', () => {
    expect(barRatio(50, 100)).toBe(0.5);
    expect(barRatio(500, 100)).toBe(1);
    expect(barRatio(-5, 100)).toBe(0);
    expect(barRatio(5, 0)).toBe(0);
    expect(barRatio(NaN, 100)).toBe(0);
  });
});

describe('스킬 행', () => {
  const sections = computeSections(CONTENT);

  it('스킬 3칸이 스킬 섹션 안에 다 들어간다', () => {
    const { visible, rows } = computeSkillRows(3, sections.skills);
    expect(visible).toBe(3);
    rows.forEach((row) => expect(contains(sections.skills, row.row)).toBe(true));
  });

  it('행 안에서 아이콘·이름·설명·레벨이 겹치지 않는다', () => {
    const { rows } = computeSkillRows(3, sections.skills);
    rows.forEach((row) => {
      expect(anyOverlap([row.icon, row.nameBox, row.descBox, row.levelBox])).toBe(false);
    });
  });

  it('스킬이 3개보다 많아도 3개까지만 그린다', () => {
    expect(computeSkillRows(7, sections.skills).visible).toBe(MAX_SKILLS);
  });

  it('섹션이 좁으면 행 높이를 줄이고, 더 좁으면 개수를 줄인다', () => {
    const narrow = rect(56, 900, 608, 140, 'skills');
    const shrunk = computeSkillRows(3, narrow);
    expect(shrunk.visible).toBeGreaterThan(0);
    shrunk.rows.forEach((row) => expect(contains(narrow, row.row)).toBe(true));

    const tiny = rect(56, 900, 608, 40, 'skills');
    expect(computeSkillRows(3, tiny).visible).toBe(0);
  });

  it('스킬이 없으면 빈 결과다', () => {
    expect(computeSkillRows(0, sections.skills)).toEqual({ visible: 0, rows: [] });
  });
});

describe('리본', () => {
  const sections = computeSections(CONTENT);

  it('등급·교단·성급·레벨·전투력 칸이 서로 겹치지 않는다', () => {
    const slots = computeRibbonSlots(sections.ribbon);
    expect(anyOverlap(Object.values(slots))).toBe(false);
  });

  it('모든 칸이 리본 안에 들어간다', () => {
    const slots = computeRibbonSlots(sections.ribbon);
    Object.values(slots).forEach((slot) => {
      expect(contains(sections.ribbon, slot)).toBe(true);
    });
  });

  it('전투력은 오른쪽 끝에 붙는다', () => {
    const slots = computeRibbonSlots(sections.ribbon);
    expect(slots.power.x).toBeGreaterThan(slots.cult.x);
  });
});

describe('겹침 0 — 팝업 전체 회귀 가드', () => {
  it('기본 데이터에서 그리는 모든 사각형이 하나도 겹치지 않는다', () => {
    const boxes = collectLayoutBoxes(CONTENT, {
      stats: { hp: 990, atk: 99, def: 71, spd: 99 },
      skillCount: 3
    });
    const overlap = findOverlap(boxes);
    expect(overlap ? `${overlap.a.name} × ${overlap.b.name}` : null).toBeNull();
    expect(boxes.length).toBeGreaterThan(20);
  });

  it('스킬이 없어도 겹치지 않는다', () => {
    expect(anyOverlap(collectLayoutBoxes(CONTENT, { skillCount: 0 }))).toBe(false);
  });

  it('모든 사각형이 콘텐츠 슬롯 안에 있다 — 액션 바를 덮지 않는다', () => {
    collectLayoutBoxes(CONTENT, { skillCount: 3 }).forEach((box) => {
      expect(contains(CONTENT, box)).toBe(true);
    });
  });

  it('콘텐츠가 짧아져도(작은 화면) 겹치지 않는다', () => {
    const short = rect(56, 152, 608, 700, 'content');
    expect(anyOverlap(collectLayoutBoxes(short, { skillCount: 3 }))).toBe(false);
  });
});

describe('표시 문자열', () => {
  it('전투력에 천 단위 구분 기호를 넣는다', () => {
    expect(formatNumber(1735)).toBe('1,735');
    expect(formatNumber('abc')).toBe('0');
  });

  it('긴 설명을 자르고 말줄임표를 붙인다', () => {
    expect(truncate('가나다라마', 3)).toBe('가나다…');
    expect(truncate('가나', 5)).toBe('가나');
    expect(truncate(null, 5)).toBe('');
  });

  it('성급은 채운 별과 빈 별을 합쳐 항상 같은 길이다', () => {
    expect(buildStars(3, 6)).toBe('★★★☆☆☆');
    expect(buildStars(0, 6)).toBe('☆☆☆☆☆☆');
    expect(buildStars(99, 6)).toBe('★★★★★★');
    expect(buildStars(null, 6)).toHaveLength(6);
  });
});
