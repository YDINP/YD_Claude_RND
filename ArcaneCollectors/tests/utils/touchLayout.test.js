/**
 * touchLayout.test.js — 터치 타깃·스크롤 목록 배치 순수 함수 (QA P2-1 / P2-5)
 *
 * 감사 보고서(`docs/qa/QA_SCREEN_AUDIT_2026-09-03.md`)가 실제로 잰 값을 회귀 케이스로 박아둔다.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_TOUCH_TARGET,
  computeHitRect,
  computeRowPositions,
  hasHitOverlap,
  rowHitExtent,
  minRowPitch,
  computeRowCenterY,
  computeGridScroll
} from '../../src/utils/touchLayout.js';
import { DESIGN } from '../../src/config/designSystem.js';

describe('touchLayout — 히트 사각형', () => {
  it('하한이 designSystem 의 touch.minTarget 과 같다', () => {
    expect(MIN_TOUCH_TARGET).toBe(DESIGN.touch.minTarget);
  });

  it('작은 글리프(✕ 20×22)를 48×48 로 넓히고 중앙 정렬한다', () => {
    const rect = computeHitRect(20, 22);
    expect(rect.width).toBe(48);
    expect(rect.height).toBe(48);
    // 로컬 좌표계(0..width)에서 중앙이 유지된다
    expect(rect.x + rect.width / 2).toBeCloseTo(10);
    expect(rect.y + rect.height / 2).toBeCloseTo(11);
  });

  it('이미 하한을 넘는 변은 줄이지 않는다 (정렬 칩 60×28)', () => {
    const rect = computeHitRect(60, 28);
    expect(rect.width).toBe(60);
    expect(rect.height).toBe(48);
    expect(rect.x).toBe(0);
  });

  it('감사가 잰 미달 대상이 전부 48 이상이 된다', () => {
    const audited = [
      [60, 28],   // 영웅 목록 정렬 칩
      [38, 24],   // 등급 필터
      [20, 20],   // 교단 필터 원형
      [199, 36],  // 팝업 탭 스트립 (가방·PvP·길드·친구)
      [300, 36],  // 팝업 탭 스트립 (무한탑·레이드)
      [20, 22],   // 파티 선택 / 소탕 모달 ✕
      [106, 17],  // 벽 경고 CTA
      [91, 17],   // 벽 경고 CTA (각인)
      [43, 19],   // 복귀 카드 '나중에'
      [99, 19],   // 복귀 카드 CTA
      [34, 13],   // 영웅 목록 씬 '초기화'
      [32, 29],   // 파티 편성 씬 '◁'
      [13, 15],   // 파티 편성 팝업 ✕
      [80, 35]    // 이벤트 던전 버튼
    ];
    audited.forEach(([w, h]) => {
      const rect = computeHitRect(w, h);
      expect(Math.min(rect.width, rect.height), `${w}x${h}`).toBeGreaterThanOrEqual(48);
    });
  });

  it('컨테이너(폭 0)는 위치 중심으로 대칭인 히트를 받는다', () => {
    const rect = computeHitRect(0, 0);
    expect(rect.x).toBe(-24);
    expect(rect.y).toBe(-24);
    expect(rect.width).toBe(48);
  });
});

describe('touchLayout — 한 줄 배치', () => {
  it('중앙 정렬 좌표는 개수·간격에 대칭이다', () => {
    const xs = computeRowPositions({ count: 4, spacing: 52, centerX: 360 });
    expect(xs).toEqual([282, 334, 386, 438]);
    expect((xs[0] + xs[3]) / 2).toBe(360);
  });

  it('개수 0 이면 빈 배열', () => {
    expect(computeRowPositions({ count: 0, spacing: 52, centerX: 360 })).toEqual([]);
  });

  it('교단 필터: 예전 간격 22 는 히트 48 이 겹치고, 52 는 겹치지 않는다', () => {
    const before = computeRowPositions({ count: 9, spacing: 22, centerX: 360 });
    const after = computeRowPositions({ count: 9, spacing: 52, centerX: 360 });
    expect(hasHitOverlap(before, 48)).toBe(true);
    expect(hasHitOverlap(after, 48)).toBe(false);
  });

  it('여백까지 요구하면 간격 48 은 통과하지 못한다', () => {
    const xs = computeRowPositions({ count: 3, spacing: 48, centerX: 100 });
    expect(hasHitOverlap(xs, 48)).toBe(false);
    expect(hasHitOverlap(xs, 48, 4)).toBe(true);
  });

  it('교단 9칸(간격 52·히트 48)이 팝업 콘텐츠 폭 608 안에 들어간다', () => {
    const xs = computeRowPositions({ count: 9, spacing: 52, centerX: 360 });
    const extent = rowHitExtent({ positions: xs, hitSize: 48 });
    expect(extent.width).toBe(464);
    // 콘텐츠 슬롯: left 56 ~ right 664 (POPUP_SLOT margin 32 + padX 24)
    expect(extent.left).toBeGreaterThanOrEqual(56);
    expect(extent.right).toBeLessThanOrEqual(664);
  });

  it('줄 간격 하한은 히트 높이 + 여백이다 (필터 바 3행 피치 54)', () => {
    expect(minRowPitch(48, 6)).toBe(54);
    expect(minRowPitch(48)).toBe(48);
  });
});

describe('touchLayout — 스크롤 목록', () => {
  it('첫 행 중심이 padTop + 항목 절반이라 위쪽이 잘리지 않는다', () => {
    expect(computeRowCenterY(0, { itemHeight: 150, gap: 10, padTop: 8 })).toBe(83);
    expect(computeRowCenterY(1, { itemHeight: 150, gap: 10, padTop: 8 })).toBe(243);
  });

  it('예전 식(중심 = row × 피치)은 첫 행의 절반이 뷰포트 위로 나간다', () => {
    const legacyFirstCenter = 0;
    const fixedFirstCenter = computeRowCenterY(0, { itemHeight: 150, gap: 10, padTop: 8 });
    expect(legacyFirstCenter - 150 / 2).toBeLessThan(0);       // 잘림
    expect(fixedFirstCenter - 150 / 2).toBeGreaterThanOrEqual(0); // 온전
  });

  it('콘텐츠 높이는 마지막 행 뒤 gap 을 세지 않는다', () => {
    const { rowCount, contentHeight } = computeGridScroll({
      itemCount: 9, cols: 3, itemHeight: 150, gap: 10, viewportHeight: 722
    });
    expect(rowCount).toBe(3);
    expect(contentHeight).toBe(3 * 150 + 2 * 10); // 470 — 480 이 아니다
  });

  it('예전 maxScroll 식보다 정확히 (gap + 항목 절반)만큼 작다 — 바닥 빈칸의 정체', () => {
    const cols = 3;
    const itemHeight = 150;
    const gap = 10;
    const viewportHeight = 722;
    const itemCount = 34;
    const rows = Math.ceil(itemCount / cols);
    const legacyMax = rows * (itemHeight + gap) - viewportHeight;
    const { maxScroll } = computeGridScroll({
      itemCount, cols, itemHeight, gap, viewportHeight, padTop: 0, padBottom: 0
    });
    expect(legacyMax - maxScroll).toBe(gap);
  });

  it('콘텐츠가 뷰포트보다 짧으면 스크롤이 0 이다', () => {
    const { maxScroll } = computeGridScroll({
      itemCount: 3, cols: 3, itemHeight: 150, gap: 10, viewportHeight: 722, padTop: 8, padBottom: 16
    });
    expect(maxScroll).toBe(0);
  });

  it('항목이 없으면 콘텐츠 높이도 0 이다 (필터 결과 없음)', () => {
    expect(computeGridScroll({
      itemCount: 0, cols: 3, itemHeight: 150, gap: 10, viewportHeight: 722, padTop: 8, padBottom: 16
    })).toEqual({ rowCount: 0, contentHeight: 0, maxScroll: 0 });
  });

  it('퀘스트 팝업 1열: 콘텐츠 높이가 카드 span + 바닥 여백이다', () => {
    const { contentHeight, maxScroll } = computeGridScroll({
      itemCount: 5, itemHeight: 100, gap: 10, viewportHeight: 380, padBottom: 10
    });
    expect(contentHeight).toBe(5 * 100 + 4 * 10 + 10);
    expect(maxScroll).toBe(contentHeight - 380);
  });

  it('비정상 입력(NaN/음수)에도 0 이하로 내려가지 않는다', () => {
    const r = computeGridScroll({
      itemCount: NaN, cols: -3, itemHeight: -100, gap: NaN, viewportHeight: undefined
    });
    expect(r.contentHeight).toBe(0);
    expect(r.maxScroll).toBe(0);
    expect(computeHitRect(NaN, NaN).width).toBe(48);
  });
});
