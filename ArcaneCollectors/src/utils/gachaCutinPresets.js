/**
 * gachaCutinPresets.js — 캐릭터별 소환 컷인 프리셋 해석 (순수 함수, Phaser 비의존)
 *
 * `src/data/gacha-cutins.json` 을 읽어 "이 영웅의 컷인은 어떤 배경·문장·색·파티클·
 * 등장 방식·대사로 굴러가는가" 를 한 덩어리로 돌려준다. GachaResultOverlay 는
 * 그 결과를 그리기만 한다.
 *
 * ## 해석 순서
 *   1. cutins[] 에 heroId 항목이 있으면 그것을 바탕으로 삼는다
 *   2. 빠진 값은 cultDefaults[cultId] → moodDefaults[mood] 순으로 채운다
 *   3. 그래도 없으면 이 파일의 하드 폴백(brand 색 · 벡터 문장 · slide)
 *
 * 목록에 없는 영웅(장비 소환, 신규 추가분)도 2·3단계만으로 컷인이 성립한다.
 * 데이터가 통째로 비어도 화면은 무너지지 않아야 한다 — 그게 이 모듈의 계약이다.
 *
 * 텍스처 존재 여부는 여기서 판단하지 않는다. `resolveAssetKey()` 가
 * "요청할 키" 와 "폴백해야 하는가" 만 답하고, 실제 확인은 호출부(Phaser)가 한다.
 *
 * 주의: designSystem/gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import CUTIN_DATA from '../data/gacha-cutins.json';
import STORY_DATA from '../data/story.json';

/** 전신 시트 등장 방식 */
export const CUTIN_ENTER = Object.freeze({
  SLIDE: 'slide',
  BURST: 'burst',
  RISE: 'rise'
});

/** 전신 시트가 서는 쪽 */
export const CUTIN_POSE = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right'
});

/** 데이터가 통째로 없을 때의 최종 폴백 */
export const HARD_FALLBACK = Object.freeze({
  bg: null,                 // null 이면 교단색 방사 그라디언트
  accent: '#06BBFA',        // DESIGN.colors.brand.primary
  emblem: null,             // null 이면 벡터 룬 문장
  particles: 'mystic',
  fullbodyPose: CUTIN_POSE.RIGHT,
  enter: CUTIN_ENTER.SLIDE,
  quote: null
});

/**
 * 컷인 격식.
 *   full   SSR — 교단 배경 + 문장 + 전신 + 리본 + 대사
 *   brief  SR  — 배경 + 전신 + 리본. 문장과 대사 없음(§간소판)
 */
export const CUTIN_FORMAT = Object.freeze({
  FULL: 'full',
  BRIEF: 'brief'
});

/** 격식별 진행 시간(ms). 합이 곧 cutin 단계 1회분이다 */
export const CUTIN_TIMING = Object.freeze({
  [CUTIN_FORMAT.FULL]: Object.freeze({
    bgFade: 260,
    emblem: 420,
    figure: 520,
    ribbon: 300,
    quote: 2000,
    total: 2200
  }),
  [CUTIN_FORMAT.BRIEF]: Object.freeze({
    bgFade: 220,
    emblem: 0,
    figure: 440,
    ribbon: 260,
    quote: 0,
    total: 1400
  })
});

/** 한 번의 소환에서 연달아 재생할 컷인 상한. 잭팟에서 연출이 끝없이 늘어나는 것을 막는다 */
export const MAX_CUTIN_TARGETS = 3;

// ------------------------------------------------------------------
// 조회
// ------------------------------------------------------------------

/** 데이터 문서 (테스트에서 직접 검사한다) */
export function getCutinData() {
  return CUTIN_DATA;
}

/** 명시적으로 정의된 컷인 항목 전체 */
export function listCutins() {
  return Array.isArray(CUTIN_DATA.cutins) ? CUTIN_DATA.cutins : [];
}

/**
 * heroId 로 명시 항목을 찾는다.
 * @param {string} heroId
 * @returns {Object|null}
 */
export function findCutinEntry(heroId) {
  if (!heroId) return null;
  return listCutins().find((entry) => entry && entry.heroId === heroId) || null;
}

/** 교단 기본값 */
export function cultDefaults(cultId) {
  const table = CUTIN_DATA.cultDefaults || {};
  return (cultId && table[cultId]) || null;
}

/** 분위기 기본값 */
export function moodDefaults(mood) {
  const table = CUTIN_DATA.moodDefaults || {};
  return (mood && table[mood]) || null;
}

// ------------------------------------------------------------------
// 해석
// ------------------------------------------------------------------

/**
 * 등급으로 컷인 격식을 정한다.
 * @param {string} rarity
 * @returns {string|null} CUTIN_FORMAT 값. 컷인이 없는 등급이면 null
 */
export function formatForRarity(rarity) {
  if (rarity === 'SSR') return CUTIN_FORMAT.FULL;
  if (rarity === 'SR') return CUTIN_FORMAT.BRIEF;
  return null;
}

/**
 * 영웅 하나의 컷인 프리셋을 조립한다.
 *
 * @param {Object} hero - 소환 결과 항목 { id, name, rarity, cult, mood, ... }
 * @returns {{heroId:string, name:string, rarity:string, cultId:string|null, format:string,
 *            bg:string|null, accent:string, emblem:string|null, particles:string,
 *            fullbodyPose:string, enter:string, quote:Object|null, timing:Object,
 *            explicit:boolean}}
 */
export function resolveCutin(hero) {
  const source = hero || {};
  const heroId = source.id || source.heroId || null;
  const entry = findCutinEntry(heroId) || {};

  const cultId = entry.cultId || source.cult || source.cultId || null;
  const mood = entry.particles || source.mood || source.baseMood || null;

  const byCult = cultDefaults(cultId) || {};
  const byMood = moodDefaults(mood) || {};

  const rarity = source.rarity || entry.rarity || 'SSR';

  return {
    heroId,
    name: source.name || heroId || '???',
    rarity,
    cultId,
    format: formatForRarity(rarity) || CUTIN_FORMAT.FULL,
    bg: pick(entry.bg, byCult.bg, HARD_FALLBACK.bg),
    accent: pick(entry.accent, byCult.accent, HARD_FALLBACK.accent),
    emblem: pick(entry.emblem, byCult.emblem, HARD_FALLBACK.emblem),
    particles: pick(entry.particles, byMood.particles, mood, HARD_FALLBACK.particles),
    fullbodyPose: normalizePose(pick(entry.fullbodyPose, HARD_FALLBACK.fullbodyPose)),
    enter: normalizeEnter(pick(entry.enter, byMood.enter, HARD_FALLBACK.enter)),
    quote: entry.quote || HARD_FALLBACK.quote,
    timing: CUTIN_TIMING[formatForRarity(rarity) || CUTIN_FORMAT.FULL],
    explicit: !!entry.heroId
  };
}

/** @private 첫 번째로 정의된 값 */
function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

/** 알 수 없는 등장 방식은 slide 로 정규화한다 */
export function normalizeEnter(value) {
  return Object.values(CUTIN_ENTER).includes(value) ? value : CUTIN_ENTER.SLIDE;
}

/** 알 수 없는 서는 쪽은 right 로 정규화한다 */
export function normalizePose(value) {
  return Object.values(CUTIN_POSE).includes(value) ? value : CUTIN_POSE.RIGHT;
}

/**
 * CSS 색 문자열을 Phaser hex 숫자로 바꾼다.
 * @param {string} css - '#RRGGBB'
 * @param {number} [fallback]
 * @returns {number}
 */
export function cssToHex(css, fallback = 0x06BBFA) {
  if (typeof css !== 'string') return fallback;
  const match = css.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? parseInt(match[1], 16) : fallback;
}

// ------------------------------------------------------------------
// 에셋 · 대사
// ------------------------------------------------------------------

/**
 * 텍스처 키가 매니페스트에 있는지 본다. 없으면 폴백해야 한다는 뜻이다.
 *
 * @param {string|null} key - 텍스처 키
 * @param {Object} manifest - asset-manifest.json
 * @returns {{key:string|null, bucket:string|null, available:boolean}}
 *          bucket 은 'textures'(즉시 로드) | 'lazyTextures'(지연 로드) | null
 */
export function resolveAssetKey(key, manifest) {
  if (!key || !manifest) return { key: key || null, bucket: null, available: false };
  if (manifest.textures && Object.prototype.hasOwnProperty.call(manifest.textures, key)) {
    return { key, bucket: 'textures', available: true };
  }
  if (manifest.lazyTextures && Object.prototype.hasOwnProperty.call(manifest.lazyTextures, key)) {
    return { key, bucket: 'lazyTextures', available: true };
  }
  return { key, bucket: null, available: false };
}

/**
 * 프리셋의 quote 참조를 실제 대사 문자열로 바꾼다.
 *
 * @param {Object|null} quote - { sceneId, line }
 * @param {Array} [scenes] - story.json 의 scenes. 생략 시 번들 데이터
 * @returns {string|null} 앞뒤 따옴표를 벗긴 대사. 참조가 깨졌으면 null
 */
export function resolveQuoteText(quote, scenes) {
  if (!quote || !quote.sceneId) return null;
  const list = Array.isArray(scenes) ? scenes : (STORY_DATA.scenes || []);
  const scene = list.find((item) => item && item.id === quote.sceneId);
  if (!scene || !Array.isArray(scene.lines)) return null;

  const index = Number.isInteger(quote.line) ? quote.line : 0;
  const line = scene.lines[index];
  if (!line || typeof line.text !== 'string') return null;

  return stripQuotes(line.text);
}

/**
 * 대사 양끝의 따옴표를 벗긴다. 컷인은 자체 인용 부호를 그리므로 겹치면 지저분하다.
 * @param {string} text
 * @returns {string}
 */
export function stripQuotes(text) {
  if (typeof text !== 'string') return '';
  return text.trim().replace(/^["“”'']+/, '').replace(/["“”'']+$/, '').trim();
}

/**
 * 타이프라이터 진행률에 맞는 부분 문자열.
 * @param {string} text
 * @param {number} progress - 0..1
 * @returns {string}
 */
export function typewriterSlice(text, progress) {
  if (typeof text !== 'string' || text.length === 0) return '';
  const ratio = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return text.slice(0, Math.round(text.length * ratio));
}

export default {
  CUTIN_ENTER,
  CUTIN_POSE,
  CUTIN_FORMAT,
  CUTIN_TIMING,
  MAX_CUTIN_TARGETS,
  HARD_FALLBACK,
  getCutinData,
  listCutins,
  findCutinEntry,
  cultDefaults,
  moodDefaults,
  formatForRarity,
  resolveCutin,
  normalizeEnter,
  normalizePose,
  cssToHex,
  resolveAssetKey,
  resolveQuoteText,
  stripQuotes,
  typewriterSlice
};
