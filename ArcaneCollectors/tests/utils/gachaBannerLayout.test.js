/**
 * gachaBannerLayout.test.js — T-12
 * 소환 화면 세로 밴드 배치와 배너 에셋 해석. Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  BANNER_TEXTURE,
  BAND_SPEC,
  resolveBannerTextureKey,
  pickFeaturedBanner,
  bannerChipLabel,
  bannerBadgeLabel,
  coverFitBanner,
  computePickupFit,
  computeGachaLayout,
  computeButtonRow,
  computeStripSlots
} from '../../src/utils/gachaBannerLayout.js';

const STANDARD = { id: 'standard', name: '표준 소환', type: 'standard', isPermanent: true };
const PICKUP = { id: 'pickup_iris_olympus', name: '올림푸스의 아이리스 픽업', type: 'pickup' };
const UNKNOWN_PICKUP = { id: 'pickup_leon_olympus', name: '신벌의 레온 픽업', type: 'pickup' };

describe('배너 에셋 해석', () => {
  it('전용 일러스트가 있는 배너만 전용 키를 쓰고 나머지는 generic 이다', () => {
    expect(resolveBannerTextureKey(PICKUP)).toBe(BANNER_TEXTURE.PICKUP_IRIS);
    expect(resolveBannerTextureKey(UNKNOWN_PICKUP)).toBe(BANNER_TEXTURE.GENERIC);
    expect(resolveBannerTextureKey(STANDARD)).toBe(BANNER_TEXTURE.GENERIC);
    expect(resolveBannerTextureKey(null)).toBe(BANNER_TEXTURE.GENERIC);
  });

  it('픽업이 있으면 픽업을 대표 배너로 세운다', () => {
    expect(pickFeaturedBanner([STANDARD, PICKUP])).toBe(PICKUP);
    expect(pickFeaturedBanner([STANDARD])).toBe(STANDARD);
    expect(pickFeaturedBanner([])).toBeNull();
  });

  it('스트립 칩 라벨은 길면 잘리고 배지는 상시/픽업을 구분한다', () => {
    expect(bannerChipLabel(STANDARD)).toBe('표준 소환');
    expect(bannerChipLabel(PICKUP).length).toBeLessThanOrEqual(8);
    expect(bannerBadgeLabel(STANDARD)).toBe('상시');
    expect(bannerBadgeLabel(PICKUP)).toBe('픽업 UP');
  });
});

describe('이미지 맞춤', () => {
  it('cover-fit 은 두 변 모두 박스를 덮는다', () => {
    const fit = coverFitBanner(832, 1216, 680, 460);
    expect(fit.width).toBeGreaterThanOrEqual(680 - 1e-6);
    expect(fit.height).toBeGreaterThanOrEqual(460 - 1e-6);
    expect(coverFitBanner(0, 0, 100, 100).scale).toBe(1);
  });

  it('픽업 전신은 배너 높이에 맞추되 가로를 넘으면 가로 기준으로 줄인다', () => {
    const tall = computePickupFit(683, 1024, { bannerW: 680, bannerH: 460 });
    expect(tall.height).toBeCloseTo(460 * 0.96, 5);
    expect(tall.widthLimited).toBe(false);

    const wide = computePickupFit(1600, 900, { bannerW: 680, bannerH: 460 });
    expect(wide.widthLimited).toBe(true);
    expect(wide.width).toBeCloseTo(680 * 0.72, 5);
  });
});

describe('세로 밴드 배치', () => {
  it('밴드가 위에서 아래로 겹치지 않고 순서를 지킨다', () => {
    const { bands, order } = computeGachaLayout({ top: 88, height: 1160 });
    let prevBottom = 88;
    order.forEach((id) => {
      expect(bands[id].y).toBeGreaterThanOrEqual(prevBottom - 1e-6);
      prevBottom = bands[id].bottom;
    });
    expect(order[0]).toBe('tabs');
    expect(order[order.length - 1]).toBe('info');
  });

  it('사용 높이가 주어진 높이를 넘지 않는다 (팝업 1015 · 씬 1160 base)', () => {
    [800, 1015, 1160].forEach((height) => {
      const layout = computeGachaLayout({ top: 0, height });
      expect(layout.overflow).toBe(0);
      expect(layout.used).toBeLessThanOrEqual(height + 1e-6);
    });
  });

  it('여유 높이는 배너가 가장 많이 가져간다', () => {
    const short = computeGachaLayout({ top: 0, height: 620 });
    const tall = computeGachaLayout({ top: 0, height: 1160 });
    const bannerGain = tall.bands.banner.h - short.bands.banner.h;
    const ratesGain = tall.bands.rates.h - short.bands.rates.h;
    expect(bannerGain).toBeGreaterThan(ratesGain);
    expect(tall.bands.banner.h).toBeGreaterThan(short.bands.banner.h);
  });

  it('밴드 높이는 규격의 min/max 범위를 벗어나지 않는다', () => {
    const layout = computeGachaLayout({ top: 0, height: 2000 });
    BAND_SPEC.forEach((band) => {
      const got = layout.bands[band.id];
      expect(got.h).toBeGreaterThanOrEqual(band.min - 1e-6);
      expect(got.h).toBeLessThanOrEqual(band.max + 1e-6);
    });
  });

  it('showTabs=false 면 탭 밴드가 사라지고 나머지가 위로 올라온다', () => {
    const withTabs = computeGachaLayout({ top: 100, height: 1000 });
    const without = computeGachaLayout({ top: 100, height: 1000, showTabs: false });
    expect(without.bands.tabs).toBeUndefined();
    expect(without.order).not.toContain('tabs');
    expect(without.bands.banner.y).toBeLessThan(withTabs.bands.banner.y);
  });

  it('높이가 모자라면 min 을 지키고 overflow 로 알린다', () => {
    const layout = computeGachaLayout({ top: 0, height: 300 });
    expect(layout.overflow).toBeGreaterThan(0);
    expect(layout.bands.banner.h).toBe(300 > 0 ? BAND_SPEC.find((b) => b.id === 'banner').min : 0);
  });
});

describe('가로 배치', () => {
  it('단일:10연 = 2:3 폭 비율이 지켜지고 여백 안에 들어간다', () => {
    const [single, multi] = computeButtonRow({ width: 720, margin: 20, gap: 12, ratio: [2, 3], h: 96 });
    expect(multi.w / single.w).toBeCloseTo(1.5, 5);
    expect(single.x).toBe(20);
    expect(multi.x + multi.w).toBeCloseTo(700, 5);
  });

  it('배너 탭 스트립 칩은 균등 폭이고 가로 중앙에 모인다', () => {
    const slots = computeStripSlots(3, { width: 600, gap: 10, left: 60, maxChipW: 180 });
    expect(slots).toHaveLength(3);
    expect(slots[0].w).toBeCloseTo(slots[2].w, 5);
    const mid = (slots[0].centerX + slots[2].centerX) / 2;
    expect(mid).toBeCloseTo(60 + 300, 5);
    expect(computeStripSlots(0)).toEqual([]);
  });

  it('칩이 하나뿐이면 최대 폭을 넘지 않는다', () => {
    const [only] = computeStripSlots(1, { width: 600, maxChipW: 180 });
    expect(only.w).toBe(180);
  });
});
