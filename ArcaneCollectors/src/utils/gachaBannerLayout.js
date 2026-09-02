/**
 * gachaBannerLayout.js — 소환 화면 배치·배너 에셋 해석 (순수 함수, Phaser 비의존)
 *
 * REDESIGN_PLAN §3-2 의 세로 밴드 배치를 계산한다. 같은 함수가 두 곳에 쓰인다.
 *   - GachaScene    : 전체 화면 (base 720×1280, 상단바 아래 전부)
 *   - GachaPopup    : 팝업 콘텐츠 영역 (더 짧다)
 * 두 화면의 높이가 다르므로 밴드는 최소/최대와 가중치를 갖고, 남는 높이를
 * 가중치대로 나눠 갖는다. 배너가 가장 큰 가중치를 가져 여유 공간을 흡수한다.
 *
 * 배너 일러스트는 asset-manifest 의 lazyTextures 라 없을 수 있다.
 * resolveBannerTextureKey() 는 "무엇을 요청해야 하는가" 만 답하고,
 * 실제 존재 여부는 호출부(Phaser scene.textures)가 판정한다.
 *
 * 주의: 다른 설정 모듈을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/** base 좌표계 기준 화면 폭 */
export const BASE_WIDTH = 720;

/** 배너 텍스처 키 (asset-manifest.json lazyTextures) */
export const BANNER_TEXTURE = Object.freeze({
  PICKUP_IRIS: 'banner_pickup_iris',
  GENERIC: 'banner_pickup_generic'
});

/** 소환진 텍스처 키 (없으면 벡터 폴백) */
export const SUMMON_CIRCLE_TEXTURE = 'fx_summon_circle';

/**
 * 배너 id → 전용 키 비트맵. 전용 일러스트가 없는 배너는 generic 으로 간다.
 * 새 픽업 배너에 전용 아트를 생성하면 여기에 한 줄 추가한다.
 */
export const BANNER_KEY_BY_ID = Object.freeze({
  pickup_iris_olympus: BANNER_TEXTURE.PICKUP_IRIS
});

/**
 * 세로 밴드 규격. min 으로 채운 뒤 남는 높이를 flex 비율로 max 까지 나눠 갖는다.
 * gapAfter 는 다음 밴드와의 간격이다 (마지막 밴드는 0).
 */
export const BAND_SPEC = Object.freeze([
  Object.freeze({ id: 'tabs', min: 48, max: 60, flex: 0, gapAfter: 8, optional: true }),
  Object.freeze({ id: 'banner', min: 300, max: 560, flex: 6, gapAfter: 12 }),
  Object.freeze({ id: 'rates', min: 88, max: 144, flex: 2, gapAfter: 8 }),
  Object.freeze({ id: 'pity', min: 60, max: 100, flex: 1, gapAfter: 12 }),
  Object.freeze({ id: 'gems', min: 88, max: 112, flex: 1, gapAfter: 12 }),
  Object.freeze({ id: 'tickets', min: 60, max: 88, flex: 1, gapAfter: 10 }),
  Object.freeze({ id: 'info', min: 44, max: 48, flex: 0, gapAfter: 0 })
]);

// ------------------------------------------------------------------
// 배너 에셋 해석
// ------------------------------------------------------------------

/**
 * 배너에 쓸 텍스처 키를 고른다.
 * @param {{id?:string, type?:string}|null} banner - GachaSystem.getActiveBanners() 항목
 * @returns {string} 텍스처 키. 전용 아트가 없으면 generic
 */
export function resolveBannerTextureKey(banner) {
  if (!banner || typeof banner.id !== 'string') return BANNER_TEXTURE.GENERIC;
  return BANNER_KEY_BY_ID[banner.id] || BANNER_TEXTURE.GENERIC;
}

/**
 * 활성 배너 목록에서 화면에 띄울 기본 배너를 고른다.
 * 픽업이 있으면 픽업이 우선이고, 없으면 첫 배너다.
 * @param {Array<Object>} banners
 * @returns {Object|null}
 */
export function pickFeaturedBanner(banners) {
  if (!Array.isArray(banners) || banners.length === 0) return null;
  const pickup = banners.find((b) => b && (b.type === 'pickup' || b.type === 'dual_pickup'));
  return pickup || banners[0];
}

/**
 * 배너 스트립에 쓸 짧은 라벨. 긴 배너명은 잘라 쓴다.
 * @param {Object} banner
 * @param {number} [maxChars] - 기본 8
 * @returns {string}
 */
export function bannerChipLabel(banner, maxChars = 8) {
  if (!banner) return '';
  const raw = typeof banner.name === 'string' && banner.name.length > 0 ? banner.name : (banner.id || '');
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars - 1)}…`;
}

/**
 * 배너 상태 배지 문구.
 * @param {Object} banner
 * @returns {string} '상시' | '픽업 UP' | '기간 한정'
 */
export function bannerBadgeLabel(banner) {
  if (!banner) return '';
  if (banner.isPermanent) return '상시';
  if (banner.type === 'pickup' || banner.type === 'dual_pickup') return '픽업 UP';
  return '기간 한정';
}

// ------------------------------------------------------------------
// 이미지 맞춤
// ------------------------------------------------------------------

/**
 * 박스를 가득 채우는 cover-fit 배율과 표시 크기.
 * @param {number} texW
 * @param {number} texH
 * @param {number} boxW
 * @param {number} boxH
 * @returns {{scale:number, width:number, height:number}} 유효하지 않으면 scale 1
 */
export function coverFitBanner(texW, texH, boxW, boxH) {
  if (![texW, texH, boxW, boxH].every((v) => Number.isFinite(v) && v > 0)) {
    return { scale: 1, width: boxW || 0, height: boxH || 0 };
  }
  const scale = Math.max(boxW / texW, boxH / texH);
  return { scale, width: texW * scale, height: texH * scale };
}

/**
 * 배너 위에 세우는 픽업 전신 시트 크기. 배너 높이의 비율로 맞추고
 * 가로가 배너를 넘으면 가로 기준으로 다시 줄인다.
 *
 * @param {number} texW
 * @param {number} texH
 * @param {Object} [options]
 * @param {number} [options.bannerW]
 * @param {number} [options.bannerH]
 * @param {number} [options.heightRatio] - 배너 높이 대비 전신 높이. 기본 0.96
 * @param {number} [options.maxWidthRatio] - 배너 폭 대비 최대 전신 폭. 기본 0.72
 * @returns {{width:number, height:number, scale:number, widthLimited:boolean}}
 */
export function computePickupFit(texW, texH, options = {}) {
  const {
    bannerW = BASE_WIDTH - 40,
    bannerH = 460,
    heightRatio = 0.96,
    maxWidthRatio = 0.72
  } = options;

  if (!Number.isFinite(texW) || !Number.isFinite(texH) || texW <= 0 || texH <= 0) {
    return { width: 0, height: 0, scale: 1, widthLimited: false };
  }

  const targetH = bannerH * heightRatio;
  let scale = targetH / texH;
  const maxW = bannerW * maxWidthRatio;
  let widthLimited = false;

  if (texW * scale > maxW) {
    scale = maxW / texW;
    widthLimited = true;
  }

  return { width: texW * scale, height: texH * scale, scale, widthLimited };
}

// ------------------------------------------------------------------
// 세로 밴드 배치
// ------------------------------------------------------------------

/**
 * 세로 밴드를 배치한다. min 으로 채운 뒤 남는 높이를 flex 비율로 max 까지 나눠 준다.
 * 남는 높이가 음수면(=화면이 너무 짧으면) min 을 유지하고 overflow 로 알린다.
 *
 * @param {Object} options
 * @param {number} options.top - 첫 밴드의 상단 y (base px)
 * @param {number} options.height - 사용 가능한 총 높이 (base px)
 * @param {boolean} [options.showTabs] - 탭 밴드 포함 여부. 기본 true
 * @param {Array<Object>} [options.spec] - 밴드 규격 덮어쓰기 (테스트용)
 * @returns {{bands:Object, order:string[], used:number, bottom:number, overflow:number}}
 *          bands[id] = { id, y, h, bottom, centerY }
 */
export function computeGachaLayout(options = {}) {
  const { top = 0, height = 0, showTabs = true, spec = BAND_SPEC } = options;

  const active = spec.filter((band) => !(band.optional && band.id === 'tabs' && !showTabs));
  const gapTotal = active.reduce((sum, band, index) => (
    index === active.length - 1 ? sum : sum + band.gapAfter
  ), 0);

  const minTotal = active.reduce((sum, band) => sum + band.min, 0);
  let slack = height - gapTotal - minTotal;
  const overflow = slack < 0 ? -slack : 0;

  const sizes = new Map(active.map((band) => [band.id, band.min]));

  // 여유를 flex 비율로 나눠 max 까지 채운다. max 에 먼저 닿은 밴드는 빠지고 남은 몫을 다시 돌린다.
  let pool = active.filter((band) => band.flex > 0 && band.max > band.min);
  while (slack > 0.5 && pool.length > 0) {
    const flexSum = pool.reduce((sum, band) => sum + band.flex, 0);
    const before = slack;
    const nextPool = [];

    pool.forEach((band) => {
      const share = (before * band.flex) / flexSum;
      const current = sizes.get(band.id);
      const room = band.max - current;
      const give = Math.min(share, room);
      sizes.set(band.id, current + give);
      slack -= give;
      if (room - give > 0.5) nextPool.push(band);
    });

    if (nextPool.length === pool.length && before - slack < 0.5) break;
    pool = nextPool;
  }

  const bands = {};
  let cursor = top;
  active.forEach((band, index) => {
    const h = sizes.get(band.id);
    bands[band.id] = {
      id: band.id,
      y: cursor,
      h,
      bottom: cursor + h,
      centerY: cursor + h / 2
    };
    cursor += h;
    if (index < active.length - 1) cursor += band.gapAfter;
  });

  return {
    bands,
    order: active.map((band) => band.id),
    used: cursor - top,
    bottom: cursor,
    overflow
  };
}

/**
 * 가로 2분할 버튼 슬롯. 좌우 폭 비율을 지정할 수 있다(§3-2 는 단일:10연 = 2:3).
 *
 * @param {Object} [options]
 * @param {number} [options.width] - 전체 폭. 기본 BASE_WIDTH
 * @param {number} [options.margin] - 좌우 여백. 기본 20
 * @param {number} [options.gap] - 사이 간격. 기본 12
 * @param {number[]} [options.ratio] - 폭 비율. 기본 [2, 3]
 * @param {number} [options.y] - 상단 y
 * @param {number} [options.h] - 높이
 * @returns {Array<{index:number,x:number,y:number,w:number,h:number,centerX:number,centerY:number}>}
 */
export function computeButtonRow(options = {}) {
  const {
    width = BASE_WIDTH,
    margin = 20,
    gap = 12,
    ratio = [2, 3],
    y = 0,
    h = 0
  } = options;

  const weights = Array.isArray(ratio) && ratio.length > 0 ? ratio : [1];
  const usable = width - margin * 2 - gap * (weights.length - 1);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;

  let x = margin;
  return weights.map((weight, index) => {
    const w = (usable * weight) / sum;
    const slot = {
      index,
      x,
      y,
      w,
      h,
      centerX: x + w / 2,
      centerY: y + h / 2
    };
    x += w + gap;
    return slot;
  });
}

/**
 * 배너 탭 스트립 칩 배치. 배너가 많아지면 폭을 줄여 균등 분할한다.
 *
 * @param {number} count - 칩 수
 * @param {Object} [options]
 * @param {number} [options.width] - 스트립 전체 폭
 * @param {number} [options.gap] - 칩 간격. 기본 8
 * @param {number} [options.left] - 좌측 시작 x. 기본 0
 * @param {number} [options.maxChipW] - 칩 최대 폭. 기본 180
 * @returns {Array<{index:number,x:number,w:number,centerX:number}>}
 */
export function computeStripSlots(count, options = {}) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0) return [];

  const { width = BASE_WIDTH - 40, gap = 8, left = 20, maxChipW = 180 } = options;
  const raw = (width - gap * (n - 1)) / n;
  const chipW = Math.min(raw, maxChipW);
  const totalW = chipW * n + gap * (n - 1);
  const startX = left + (width - totalW) / 2;

  return Array.from({ length: n }, (_, index) => {
    const x = startX + index * (chipW + gap);
    return { index, x, w: chipW, centerX: x + chipW / 2 };
  });
}

export default {
  BASE_WIDTH,
  BANNER_TEXTURE,
  SUMMON_CIRCLE_TEXTURE,
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
};
