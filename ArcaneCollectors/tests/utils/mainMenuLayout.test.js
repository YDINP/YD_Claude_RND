/**
 * mainMenuLayout.test.js — 메인 메뉴 배치 규칙 고정 (REDESIGN_PLAN §3-1 / T-10)
 *
 * 여기서 지키는 것은 "픽셀 값"이 아니라 **불변식**이다.
 *   - 세로 대역이 서로 겹치지 않는다 (§1-1 유휴전투 뷰 침범의 재발 방지)
 *   - 모든 조작 대상이 터치 하한을 넘는다 (§2-5)
 *   - 그리드가 화면 밖으로 나가지 않는다
 *   - 항목 수가 0/3/4/7/13 으로 변해도 좌표가 성립한다 (MenuGridGate 가변 그리드)
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_W,
  BASE_H,
  MAIN_LAYOUT,
  MENU_GRID,
  BAND_ORDER,
  bandsOverlap,
  meetsTouchTarget,
  toCenterRect,
  progressFillWidth,
  computeTopBarSlots,
  interactiveTopBarSlots,
  computeEnergyFill,
  computePartySlots,
  computePartyHeader,
  computePowerRow,
  computeAdventureButtons,
  computeAdventureRows,
  computeIdleBand,
  computeFullbodyDecor,
  computeSummaryCells,
  computeClaimButton,
  computeMenuGrid,
  resolveAccentCult,
  resolveAccentColor,
  toCss
} from '../../src/utils/mainMenuLayout.js';
import { MenuGridGate } from '../../src/systems/MenuGridGate.js';
import { DESIGN } from '../../src/config/designSystem.js';

describe('mainMenuLayout — 세로 대역', () => {
  it('인접한 대역이 서로 겹치지 않는다 (유휴전투 뷰 침범 재발 방지)', () => {
    const bands = BAND_ORDER.map((key) => ({ key, ...MAIN_LAYOUT[key] }));
    for (let i = 0; i < bands.length - 1; i++) {
      const a = bands[i];
      const b = bands[i + 1];
      expect(bandsOverlap(a, b), `${a.key} ↔ ${b.key}`).toBe(false);
    }
  });

  it('모든 대역이 화면 안에 있다', () => {
    BAND_ORDER.forEach((key) => {
      const band = MAIN_LAYOUT[key];
      expect(band.y).toBeGreaterThanOrEqual(0);
      expect(band.y + band.h).toBeLessThanOrEqual(BASE_H);
      expect(band.x).toBeGreaterThanOrEqual(0);
      expect(band.x + band.w).toBeLessThanOrEqual(BASE_W);
    });
  });

  it('유휴전투 대역이 모험 패널 아래에서 시작한다 (§3-1 y=508)', () => {
    const adventure = MAIN_LAYOUT.adventure;
    expect(MAIN_LAYOUT.idle.y).toBe(508);
    expect(MAIN_LAYOUT.idle.y).toBeGreaterThanOrEqual(adventure.y + adventure.h);
  });

  it('bandsOverlap 은 겹치는 쌍을 참으로 판정한다', () => {
    expect(bandsOverlap({ y: 0, h: 100 }, { y: 50, h: 10 })).toBe(true);
    expect(bandsOverlap({ y: 0, h: 100 }, { y: 100, h: 10 })).toBe(false);
    expect(bandsOverlap(null, { y: 0, h: 1 })).toBe(false);
  });
});

describe('mainMenuLayout — 유휴전투 관측창', () => {
  it('뷰 사각형이 대역 안에 완전히 들어간다', () => {
    const { band, view, clip } = computeIdleBand();
    expect(view.cx - view.w / 2).toBeGreaterThanOrEqual(band.x);
    expect(view.cx + view.w / 2).toBeLessThanOrEqual(band.x + band.w);
    expect(view.cy - view.h / 2).toBeGreaterThanOrEqual(band.y);
    expect(view.cy + view.h / 2).toBeLessThanOrEqual(band.y + band.h);
    expect(clip).toEqual({ x: band.x, y: band.y, w: band.w, h: band.h });
  });

  it('전신 장식은 대역보다 크게 잡혀 마스크에 잘린다', () => {
    const { band } = computeIdleBand();
    const decor = computeFullbodyDecor(683, 1024);
    expect(decor).not.toBeNull();
    expect(decor.h).toBeGreaterThan(band.h);
    expect(decor.y).toBe(band.y + band.h);      // 발밑이 대역 바닥
    expect(decor.alpha).toBeLessThan(0.5);      // 장식이지 주인공이 아니다
  });

  it('전신 장식은 텍스처 비율을 유지한다', () => {
    const decor = computeFullbodyDecor(683, 1024);
    expect(decor.w / decor.h).toBeCloseTo(683 / 1024, 5);
  });

  it('전신 크기가 없으면 장식을 만들지 않는다 (에셋 부재 시 생략)', () => {
    expect(computeFullbodyDecor(0, 0)).toBeNull();
    expect(computeFullbodyDecor(undefined, 1024)).toBeNull();
  });
});

describe('mainMenuLayout — 메뉴 그리드', () => {
  it('그리드 0개면 아무 것도 그리지 않는다 (신규 유저 첫 화면)', () => {
    const grid = computeMenuGrid(0, MenuGridGate.getColumnCount(0));
    expect(grid.cells).toHaveLength(0);
    expect(grid.rows).toBe(0);
  });

  it.each([
    [3, 1],
    [4, 1],
    [7, 2],
    [13, 3]
  ])('%i개 항목이 %i행으로 배치된다', (count, expectedRows) => {
    const cols = MenuGridGate.getColumnCount(count);
    const grid = computeMenuGrid(count, cols);
    expect(grid.cells).toHaveLength(count);
    expect(grid.rows).toBe(expectedRows);
  });

  it('13개는 5열 5/5/3 이 되어 고아 행이 사라진다', () => {
    const grid = computeMenuGrid(13, MenuGridGate.getColumnCount(13));
    expect(grid.cols).toBe(5);
    const perRow = [0, 1, 2].map((r) => grid.cells.filter((c) => c.row === r).length);
    expect(perRow).toEqual([5, 5, 3]);
  });

  it('그리드는 어떤 항목 수에서도 화면 밖으로 나가지 않는다', () => {
    for (let count = 1; count <= 14; count++) {
      const grid = computeMenuGrid(count, MenuGridGate.getColumnCount(count));
      expect(grid.bottom, `count=${count}`).toBeLessThanOrEqual(BASE_H);
      grid.cells.forEach((cell) => {
        expect(cell.x - MENU_GRID.cellW / 2).toBeGreaterThanOrEqual(0);
        expect(cell.x + MENU_GRID.cellW / 2).toBeLessThanOrEqual(BASE_W);
        expect(cell.labelY).toBeLessThanOrEqual(BASE_H);
      });
    }
  });

  it('그리드는 보상받기 버튼 아래에서 시작한다', () => {
    const claim = MAIN_LAYOUT.claim;
    expect(MENU_GRID.top).toBeGreaterThanOrEqual(claim.y + claim.h);
  });

  it('모든 셀이 가로 중앙 정렬된다', () => {
    const grid = computeMenuGrid(13, 5);
    const row0 = grid.cells.filter((c) => c.row === 0);
    const mid = (row0[0].x + row0[row0.length - 1].x) / 2;
    expect(mid).toBeCloseTo(BASE_W / 2, 5);
  });
});

describe('mainMenuLayout — 터치 타깃 (§2-5)', () => {
  it('메뉴 셀 히트 박스가 하한을 넘는다', () => {
    const grid = computeMenuGrid(13, 5);
    grid.cells.forEach((cell) => {
      expect(meetsTouchTarget(cell.hit, DESIGN.touch.minTarget), `cell ${cell.index}`).toBe(true);
    });
  });

  it('상단바 설정·충전 버튼이 하한을 넘는다', () => {
    const slots = computeTopBarSlots();
    expect(meetsTouchTarget(slots.settings, DESIGN.touch.minTarget)).toBe(true);
    expect(meetsTouchTarget(slots.charge.hit, DESIGN.touch.minTarget)).toBe(true);
  });

  // A11Y_AUDIT §(d) — 상단바 소형 요소가 표시 전용임을 계약으로 고정한다.
  // level(30px) / gem·gold(22px) 는 시각 크기가 하한보다 작지만 탭 대상이 아니다.
  // 나중에 탭 동작이 붙으면 interactive 를 true 로 바꿔야 하고, 그 순간 아래 두 테스트가
  // hit 누락을 잡아낸다.
  it('상단바에서 탭 가능한 슬롯은 설정과 충전 둘뿐이다 (level/gem/gold 는 표시 전용)', () => {
    expect(interactiveTopBarSlots().sort()).toEqual(['charge', 'settings']);
    const slots = computeTopBarSlots();
    ['level', 'gem', 'gold', 'energy', 'timer'].forEach((name) => {
      expect(slots[name].interactive, name).toBe(false);
      expect(slots[name].hit, name).toBeUndefined();
    });
  });

  it('탭 가능한 상단바 슬롯은 예외 없이 hit 사각형과 터치 하한을 가진다', () => {
    const slots = computeTopBarSlots();
    interactiveTopBarSlots().forEach((name) => {
      expect(slots[name].hit, name).toBeDefined();
      expect(meetsTouchTarget(slots[name].hit, DESIGN.touch.minTarget), name).toBe(true);
    });
  });

  it('편성 버튼은 시각 알약이 낮아도 히트 박스가 하한을 지킨다', () => {
    const header = computePartyHeader();
    expect(header.editPill.h).toBeLessThan(DESIGN.touch.minTarget);
    expect(meetsTouchTarget(header.editHit, DESIGN.touch.minTarget)).toBe(true);
  });

  it('모험 CTA 와 보상받기 버튼이 하한을 넘는다', () => {
    [true, false].forEach((onboarding) => {
      computeAdventureButtons(onboarding).forEach((btn) => {
        expect(meetsTouchTarget(btn, DESIGN.touch.minTarget), btn.key).toBe(true);
      });
    });
    expect(meetsTouchTarget(computeClaimButton().rect, DESIGN.touch.minTarget)).toBe(true);
  });

  it('파티 아바타 히트 박스가 하한을 넘는다', () => {
    computePartySlots().forEach((slot) => {
      expect(meetsTouchTarget(slot.hit, DESIGN.touch.minTarget)).toBe(true);
    });
  });
});

describe('mainMenuLayout — 현재 모험 패널', () => {
  it('온보딩은 폭 100% 단일 CTA, 완주 후에는 2분할이다 (UX §2-7)', () => {
    const solo = computeAdventureButtons(true);
    const dual = computeAdventureButtons(false);
    expect(solo).toHaveLength(1);
    expect(solo[0].key).toBe('battle_start');
    expect(dual.map((b) => b.key)).toEqual(['sweep', 'boss']);
    expect(solo[0].w).toBeGreaterThan(dual[0].w);
  });

  it('2분할 버튼이 서로 겹치지 않고 패널 안에 들어간다', () => {
    const panel = MAIN_LAYOUT.adventure;
    const [sweep, boss] = computeAdventureButtons(false);
    expect(sweep.x + sweep.w).toBeLessThanOrEqual(boss.x);
    expect(boss.x + boss.w).toBeLessThanOrEqual(panel.x + panel.w);
  });

  it('내부 요소가 패널 높이를 넘지 않는다 (h=188 고정의 근거)', () => {
    const panel = MAIN_LAYOUT.adventure;
    const rows = computeAdventureRows();
    const [btn] = computeAdventureButtons(true);
    expect(btn.y + btn.h).toBeLessThanOrEqual(panel.y + panel.h);
    expect(rows.progress.y + rows.progress.h).toBeLessThanOrEqual(panel.y + panel.h);
  });

  it('진행바 채움 폭이 0~1 로 잘린다', () => {
    expect(progressFillWidth(0.5, 600)).toBe(300);
    expect(progressFillWidth(-1, 600)).toBe(0);
    expect(progressFillWidth(2, 600)).toBe(600);
    expect(progressFillWidth(NaN, 600)).toBe(0);
  });
});

describe('mainMenuLayout — 상단바 · 요약', () => {
  it('에너지 채움바가 실제 비율로 채워진다 (빈 사각형 해소)', () => {
    const slots = computeTopBarSlots();
    expect(computeEnergyFill(0, 100).fillW).toBe(0);
    expect(computeEnergyFill(50, 100).fillW).toBeCloseTo(slots.energy.w / 2, 5);
    expect(computeEnergyFill(102, 102).fillW).toBe(slots.energy.w);
    expect(computeEnergyFill(5, 0).ratio).toBe(1);   // max 0 방어
  });

  it('상단바 요소가 좌에서 우로 겹치지 않고 늘어선다', () => {
    const s = computeTopBarSlots();
    const xs = [s.level.x, s.gem.iconX, s.gold.iconX, s.energy.iconX, s.charge.x, s.settings.x];
    for (let i = 0; i < xs.length - 1; i++) {
      expect(xs[i], `slot ${i}`).toBeLessThan(xs[i + 1]);
    }
    expect(s.settings.x + s.settings.w / 2).toBeLessThanOrEqual(BASE_W);
  });

  it('수익 요약 3칸이 균등 분할된다', () => {
    const cells = computeSummaryCells();
    expect(cells.map((c) => c.key)).toEqual(['gold', 'exp', 'stage']);
    const gap1 = cells[1].x - cells[0].x;
    const gap2 = cells[2].x - cells[1].x;
    expect(gap1).toBeCloseTo(gap2, 5);
  });

  it('전투력 배지가 패널 오른쪽 안에 들어간다', () => {
    const row = computePowerRow();
    expect(row.badge.x + row.badge.w / 2).toBeLessThanOrEqual(row.panel.x + row.panel.w);
    expect(row.value.x).toBeGreaterThan(row.label.x);
  });
});

describe('mainMenuLayout — 교단 액센트 (Cult Tint)', () => {
  it('파티 1번 영웅의 교단을 액센트로 고른다', () => {
    expect(resolveAccentCult([{ id: 'a', cult: 'olympus' }, { id: 'b', cult: 'yomi' }])).toBe('olympus');
    expect(resolveAccentCult([{ id: 'a', cultId: 'asgard' }])).toBe('asgard');
  });

  it('파티가 비었거나 교단을 모르면 brand.primary 로 간다', () => {
    expect(resolveAccentCult([])).toBeNull();
    expect(resolveAccentCult(null)).toBeNull();
    expect(resolveAccentCult([{ id: 'a' }])).toBeNull();
    expect(resolveAccentColor(null)).toBe(DESIGN.colors.brand.primary);
  });

  it('교단 색을 designSystem 에서 가져온다', () => {
    expect(resolveAccentColor('olympus')).toBe(DESIGN.colors.cult.olympus);
    expect(toCss(DESIGN.colors.cult.olympus)).toBe('#FF6B35');
    expect(toCss(0x06BBFA)).toBe('#06BBFA');
  });
});

describe('mainMenuLayout — 헬퍼', () => {
  it('toCenterRect 가 좌상단 기준을 중심 기준으로 바꾼다', () => {
    expect(toCenterRect({ x: 10, y: 20, w: 100, h: 40 })).toEqual({ x: 60, y: 40, w: 100, h: 40 });
  });

  it('meetsTouchTarget 은 한 변만 작아도 거짓이다', () => {
    expect(meetsTouchTarget({ w: 48, h: 48 })).toBe(true);
    expect(meetsTouchTarget({ w: 48, h: 47 })).toBe(false);
    expect(meetsTouchTarget(null)).toBe(false);
  });
});
