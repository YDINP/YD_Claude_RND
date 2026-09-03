/**
 * ScrollContainer.test.js — 팝업 3종 스크롤 컨테이너 작업
 * 순수 계산(clamp/관성/드래그·휠/탭 임계값/scrollTo)만 다룬다. Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  ScrollContainer,
  DEFAULT_THRESHOLD,
  DEFAULT_FRICTION,
  MIN_VELOCITY
} from '../../src/components/ScrollContainer.js';

describe('ScrollContainer.clampScroll', () => {
  it('음수는 0으로 자른다', () => {
    expect(ScrollContainer.clampScroll(-50, 200)).toBe(0);
  });

  it('maxScroll 을 넘으면 maxScroll 로 자른다', () => {
    expect(ScrollContainer.clampScroll(500, 200)).toBe(200);
  });

  it('범위 안이면 그대로 통과시킨다', () => {
    expect(ScrollContainer.clampScroll(80, 200)).toBe(80);
  });

  it('NaN/undefined 는 0 취급한다', () => {
    expect(ScrollContainer.clampScroll(NaN, 200)).toBe(0);
    expect(ScrollContainer.clampScroll(undefined, 200)).toBe(0);
  });

  it('maxScroll 이 음수/NaN 이면 0으로 취급한다(스크롤 불가)', () => {
    expect(ScrollContainer.clampScroll(50, -10)).toBe(0);
    expect(ScrollContainer.clampScroll(50, NaN)).toBe(0);
  });
});

describe('ScrollContainer.computeMaxScroll', () => {
  it('콘텐츠가 뷰포트보다 크면 그 차이를 반환한다', () => {
    expect(ScrollContainer.computeMaxScroll(1000, 600)).toBe(400);
  });

  it('콘텐츠가 뷰포트보다 작거나 같으면 0(스크롤 불필요)', () => {
    expect(ScrollContainer.computeMaxScroll(400, 600)).toBe(0);
    expect(ScrollContainer.computeMaxScroll(600, 600)).toBe(0);
  });
});

describe('ScrollContainer.exceedsThreshold — 탭↔드래그 판정 (8px)', () => {
  it('기본 임계값은 8px 다', () => {
    expect(DEFAULT_THRESHOLD).toBe(8);
  });

  it('임계값 이하 이동은 탭으로 본다(false)', () => {
    expect(ScrollContainer.exceedsThreshold(0, 5)).toBe(false);
    expect(ScrollContainer.exceedsThreshold(0, 8)).toBe(false);
  });

  it('임계값을 넘는 이동은 드래그로 본다(true)', () => {
    expect(ScrollContainer.exceedsThreshold(0, 9)).toBe(true);
  });

  it('대각선 이동은 유클리드 거리로 판정한다', () => {
    // 6-8-10 직각삼각형 — 거리 10 > 임계값 8
    expect(ScrollContainer.exceedsThreshold(6, 8)).toBe(true);
    // 거리 5 <= 8
    expect(ScrollContainer.exceedsThreshold(3, 4)).toBe(false);
  });

  it('커스텀 임계값을 지정할 수 있다', () => {
    expect(ScrollContainer.exceedsThreshold(0, 3, 2)).toBe(true);
    expect(ScrollContainer.exceedsThreshold(0, 1, 2)).toBe(false);
  });
});

describe('ScrollContainer.applyWheelDelta', () => {
  it('deltaY 에 민감도를 곱해 더한 뒤 클램프한다', () => {
    expect(ScrollContainer.applyWheelDelta(0, 100, 200, 0.5)).toBe(50);
  });

  it('결과가 범위를 넘으면 클램프된다', () => {
    expect(ScrollContainer.applyWheelDelta(190, 1000, 200, 0.5)).toBe(200);
    expect(ScrollContainer.applyWheelDelta(10, -1000, 200, 0.5)).toBe(0);
  });
});

describe('ScrollContainer.applyDragDelta', () => {
  it('시작 scrollY 에 이동량을 더한 뒤 클램프한다', () => {
    expect(ScrollContainer.applyDragDelta(50, 30, 200)).toBe(80);
  });

  it('손가락이 위로 이동(deltaY 양수)하면 scrollY 가 커진다', () => {
    // deltaY = dragStartY - pointer.y (컨벤션) — 손가락이 위로 가면 pointer.y 감소 → deltaY 양수
    expect(ScrollContainer.applyDragDelta(0, 40, 200)).toBe(40);
  });

  it('범위를 넘으면 클램프된다', () => {
    expect(ScrollContainer.applyDragDelta(190, 500, 200)).toBe(200);
    expect(ScrollContainer.applyDragDelta(10, -500, 200)).toBe(0);
  });
});

describe('ScrollContainer.stepInertia — 관성 감쇠', () => {
  it('friction 을 곱해 감쇠시킨다', () => {
    expect(ScrollContainer.stepInertia(1, { friction: 0.9, minVelocity: 0 })).toBeCloseTo(0.9);
  });

  it('minVelocity 아래로 떨어지면 0(정지)을 반환한다', () => {
    expect(ScrollContainer.stepInertia(0.01, { friction: 0.9, minVelocity: 0.02 })).toBe(0);
  });

  it('기본 friction/minVelocity 를 쓴다', () => {
    const next = ScrollContainer.stepInertia(1);
    expect(next).toBeCloseTo(DEFAULT_FRICTION);
  });

  it('반복 적용하면 결국 0으로 수렴해 멈춘다', () => {
    let v = 5;
    let steps = 0;
    while (v !== 0 && steps < 1000) {
      v = ScrollContainer.stepInertia(v, { friction: 0.8, minVelocity: MIN_VELOCITY });
      steps += 1;
    }
    expect(v).toBe(0);
    expect(steps).toBeLessThan(1000);
  });
});

describe('ScrollContainer.computeVelocity', () => {
  it('표본 2개 미만이면 0', () => {
    expect(ScrollContainer.computeVelocity([])).toBe(0);
    expect(ScrollContainer.computeVelocity([{ t: 0, y: 0 }])).toBe(0);
  });

  it('첫/마지막 표본으로 px/ms 속도를 구한다', () => {
    const samples = [{ t: 0, y: 0 }, { t: 100, y: 50 }];
    expect(ScrollContainer.computeVelocity(samples)).toBeCloseTo(0.5);
  });

  it('시간차가 0 이하면 0', () => {
    expect(ScrollContainer.computeVelocity([{ t: 100, y: 0 }, { t: 100, y: 50 }])).toBe(0);
  });
});

describe('ScrollContainer.computeScrollToTarget — 튜토리얼 ensureVisible 용', () => {
  const base = { scrollY: 0, viewTop: 100, viewportHeight: 400, maxScroll: 1000 };

  it('이미 뷰포트 안이면 scrollY 를 그대로 둔다(불필요한 점프 방지)', () => {
    const next = ScrollContainer.computeScrollToTarget({
      ...base, targetWorldTop: 150, targetHeight: 80
    });
    expect(next).toBe(0);
  });

  it('타깃이 뷰포트 아래로 가려지면 하단 정렬로 당긴다', () => {
    // view: 100~500, target: 550~630 (아래로 벗어남)
    const next = ScrollContainer.computeScrollToTarget({
      ...base, targetWorldTop: 550, targetHeight: 80
    });
    expect(next).toBe(130);
  });

  it('타깃이 뷰포트 위로 가려지면 상단 정렬로 당긴다', () => {
    // scrollY=200 상태에서 타깃이 이미 위로 벗어나 있음(targetWorldTop=50 < viewTop=100)
    const next = ScrollContainer.computeScrollToTarget({
      ...base, scrollY: 200, targetWorldTop: 50, targetHeight: 60
    });
    expect(next).toBe(150);
  });

  it('타깃이 뷰포트보다 크면 상단 정렬을 우선한다', () => {
    // 위/아래 조건이 동시에 성립하는 상황(타깃이 뷰포트 양끝을 모두 벗어남)에서도
    // 상단 조건(targetWorldTop < viewTop)이 먼저 걸려 상단 정렬된다.
    const next = ScrollContainer.computeScrollToTarget({
      ...base, scrollY: 200, targetWorldTop: 90, targetHeight: 900
    });
    expect(next).toBe(190);
  });

  it('margin 만큼 여유를 두고 당긴다', () => {
    const next = ScrollContainer.computeScrollToTarget({
      ...base, targetWorldTop: 550, targetHeight: 80, margin: 20
    });
    expect(next).toBe(150);
  });

  it('결과는 항상 [0, maxScroll] 로 클램프된다', () => {
    const next = ScrollContainer.computeScrollToTarget({
      ...base, maxScroll: 50, targetWorldTop: 900, targetHeight: 80
    });
    expect(next).toBe(50);
  });
});
