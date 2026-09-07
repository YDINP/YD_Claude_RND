/**
 * bossInfoLayout.test.js — 보스 정보 팝업의 배치·판정 규칙 고정
 *
 * 지키는 불변식:
 *   - 보스 전투력은 영웅 전투력과 **같은 식**으로 나온다 (다르면 나란히 놓는 순간 거짓말)
 *   - 비교 막대는 "동등 = 절반"으로 읽히고 0~1 을 벗어나지 않는다
 *   - 판정은 색이 아니라 **문장**으로도 전달된다 (A11Y)
 *   - 콘텐츠 슬롯 안에서 아트·스탯·비교·진행도가 겹치지 않고 순서대로 쌓인다
 */
import { describe, it, expect } from 'vitest';
import {
  BOSS_INFO,
  estimateBossPower,
  comparePower,
  verdictForRatio,
  computeBossInfoRows,
  bossSummaryCells,
  moodLabel,
  moodHint
} from '../../src/utils/bossInfoLayout.js';
import { ProgressionSystem } from '../../src/systems/ProgressionSystem.js';

// PopupBase.getContentBounds() 가 주는 모양 (렌더 px 가정)
const BOUNDS = {
  left: 48, right: 1032, top: 300, bottom: 1700,
  width: 984, height: 1400, centerX: 540, centerY: 1000
};

describe('보스 전투력 추정', () => {
  it('영웅 전투력 식(HP/10 + ATK + DEF + SPD)과 같은 값을 낸다', () => {
    const stats = { hp: 1200, atk: 90, def: 60, spd: 70 };
    expect(estimateBossPower(stats)).toBe(Math.floor(1200 / 10 + 90 + 60 + 70));
    // 게임 쪽 상수와도 일치하는지 — 나중에 한쪽만 바뀌면 여기서 걸린다
    expect(ProgressionSystem.POWER_HP_DIVISOR).toBe(10);
  });

  it('빠진 스탯은 0 으로 보고, 음수로 내려가지 않는다', () => {
    expect(estimateBossPower({ hp: 500 })).toBe(50);
    expect(estimateBossPower({})).toBe(0);
    expect(estimateBossPower(null)).toBe(0);
    expect(estimateBossPower({ hp: NaN, atk: 10 })).toBe(10);
  });
});

describe('전투력 비교', () => {
  it('동등하면 막대가 절반이다', () => {
    const { ratio, fill } = comparePower(1000, 1000);
    expect(ratio).toBe(1);
    expect(fill).toBe(0.5);
  });

  it('2배 이상이면 막대가 가득 차고 그 위로는 넘치지 않는다', () => {
    expect(comparePower(2000, 1000).fill).toBe(1);
    expect(comparePower(99999, 1000).fill).toBe(1);
  });

  it('파티가 없거나 대상이 없으면 무너지지 않는다', () => {
    expect(comparePower(0, 1000)).toEqual({ ratio: 0, fill: 0 });
    expect(comparePower(1000, 0).fill).toBe(1);
    expect(comparePower(0, 0)).toEqual({ ratio: 0, fill: 0 });
    expect(comparePower(NaN, 1000).ratio).toBe(0);
  });

  it('판정은 비율 구간마다 다른 문장을 준다 (색 단독 전달 금지)', () => {
    expect(verdictForRatio(0.4).tone).toBe('danger');
    expect(verdictForRatio(0.9).tone).toBe('warn');
    expect(verdictForRatio(1.2).tone).toBe('ok');
    expect(verdictForRatio(3).tone).toBe('strong');
    ['danger', 'warn', 'ok', 'strong'].forEach((tone) => {
      const found = [0.4, 0.9, 1.2, 3].map(verdictForRatio).find((v) => v.tone === tone);
      expect(found.text.length).toBeGreaterThan(0);
    });
  });

  it('비교 불가 상태에도 문장이 있다', () => {
    expect(verdictForRatio(Infinity).text.length).toBeGreaterThan(0);
    expect(verdictForRatio(0).text.length).toBeGreaterThan(0);
    expect(verdictForRatio(NaN).text.length).toBeGreaterThan(0);
  });
});

describe('콘텐츠 슬롯 배치', () => {
  it('아트 → 스탯 → 전투력 → 진행도 순으로 겹치지 않고 쌓인다', () => {
    const rows = computeBossInfoRows(BOUNDS, 1.5);
    expect(rows.art.y).toBeGreaterThanOrEqual(BOUNDS.top);
    expect(rows.stats.top).toBeGreaterThan(rows.art.y + rows.art.h);
    expect(rows.power.top).toBeGreaterThan(rows.stats.top + rows.stats.rowH * 4);
    expect(rows.progress.top).toBeGreaterThan(rows.power.bar.y + rows.power.bar.h);
    // 판정 문장과 진행도 줄이 겹치지 않는다 (첫 캡처에서 실제로 겹쳤다)
    expect(rows.progress.top).toBeGreaterThan(rows.power.verdictY + rows.stats.rowH);
  });

  it('모든 줄이 좌우 여백 안에 들어간다', () => {
    const rows = computeBossInfoRows(BOUNDS, 1.5);
    [rows.stats, rows.power, rows.progress].forEach((row) => {
      expect(row.left).toBeGreaterThan(BOUNDS.left);
      expect(row.right).toBeLessThan(BOUNDS.right);
    });
    expect(rows.art.w).toBeLessThanOrEqual(BOUNDS.width);
    expect(rows.art.x).toBe(BOUNDS.centerX);
  });

  it('배율이 커지면 각 구간도 같은 비율로 커진다', () => {
    const a = computeBossInfoRows(BOUNDS, 1);
    const b = computeBossInfoRows(BOUNDS, 2);
    expect(b.art.h).toBe(a.art.h * 2);
    expect(b.stats.rowH).toBe(a.stats.rowH * 2);
    expect(BOSS_INFO.artHeight).toBeGreaterThan(0);
  });

  it('진행도 줄이 콘텐츠 슬롯 아래로 넘치지 않는다 (실제 팝업 규격)', () => {
    const rows = computeBossInfoRows(BOUNDS, 1.5);
    expect(rows.progress.top).toBeLessThan(BOUNDS.bottom);
  });
});

describe('요약 · 분위기', () => {
  it('요약 3칸에 수치를 문자열로 병기한다', () => {
    const cells = bossSummaryCells({ hp: 12345, atk: 90, def: 60 });
    expect(cells).toHaveLength(3);
    expect(cells[0].value).toBe('12,345');
    expect(cells.every((c) => typeof c.value === 'string')).toBe(true);
  });

  it('스탯이 없으면 대시로 둔다 (숫자를 지어내지 않는다)', () => {
    bossSummaryCells(null).forEach((c) => expect(c.value).toBe('-'));
    bossSummaryCells({}).forEach((c) => expect(c.value).toBe('-'));
  });

  it('분위기는 한국어 이름으로 바뀌고, 모르는 값은 null 이다', () => {
    expect(moodLabel('cunning')).toBe('냉철');
    expect(moodLabel('BRAVE')).toBe('열혈');
    expect(moodLabel('unknown')).toBeNull();
    expect(moodLabel(null)).toBeNull();
  });

  it('상성 힌트는 어떤 입력에도 한 문장을 준다', () => {
    expect(moodHint('calm')).toContain('고요');
    expect(moodHint(null).length).toBeGreaterThan(0);
    expect(moodHint('nope').length).toBeGreaterThan(0);
  });
});
