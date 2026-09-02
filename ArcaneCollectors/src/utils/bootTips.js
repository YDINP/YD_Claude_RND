/**
 * bootTips.js — 부팅 화면 세계관 문구 추출 (REDESIGN_PLAN §3-8, T-19)
 *
 * 부팅 스플래시의 한 줄은 "로딩 중"이라고 말하는 대신 이 세계가 어떤 곳인지 말한다.
 * 문구를 새로 쓰지 않고 story.json 에서 뽑는 이유는 하나다 — 대본 SSOT 가 story.json 이고,
 * 씬 파일에 카피를 복사해 두면 대본이 고쳐질 때 부팅 화면만 옛 문장을 계속 말하게 된다.
 *
 * 선별 규칙 (결정적이다. 같은 story.json 이면 항상 같은 목록이 나온다):
 *   1. trigger 가 chapter_enter 인 컷씬만 본다 — 챕터의 첫 문장이 곧 그 챕터의 세계 설명이다
 *   2. 그중 화자가 narrator 인 첫 줄 하나만 챕터당 뽑는다 (대사는 맥락 없이 읽히지 않는다)
 *   3. 길이 10~60자, 치환 변수({...})가 없는 줄만 쓴다 — 한 줄로 렌더되어야 하므로
 *   4. 챕터 순서대로 최대 limit 개
 *
 * 이 모듈은 어떤 프로젝트 모듈도 import 하지 않는다. Phaser 없이 단위 테스트가 돌아간다.
 */

/** 세계관 문구를 뽑는 트리거 */
export const TIP_TRIGGER = 'chapter_enter';

/** 한 줄로 렌더 가능한 길이 범위 */
export const TIP_MIN_LENGTH = 10;
export const TIP_MAX_LENGTH = 60;

/** 기본 노출 개수 (§3-8: 3~5개 순환) */
export const TIP_LIMIT = 5;

/** story.json 에서 한 줄도 못 건졌을 때의 최후 폴백 */
export const FALLBACK_TIP = '균열 너머의 이름을 모으는 자, 수집가.';

/**
 * 대사 한 줄이 팁으로 쓸 수 있는 문장인지.
 * @param {{speakerType?:string, text?:string}} line
 * @returns {boolean}
 */
export function isTipLine(line) {
  if (!line || line.speakerType !== 'narrator') return false;
  const text = typeof line.text === 'string' ? line.text.trim() : '';
  if (text.length < TIP_MIN_LENGTH || text.length > TIP_MAX_LENGTH) return false;
  return !text.includes('{');
}

/**
 * 컷씬 하나에서 팁 후보 한 줄을 뽑는다.
 * @param {{trigger?:string, lines?:Array}} scene
 * @returns {string|null} 조건에 맞는 첫 줄. 없으면 null
 */
export function pickSceneTip(scene) {
  if (!scene || scene.trigger !== TIP_TRIGGER) return null;
  const lines = Array.isArray(scene.lines) ? scene.lines : [];
  const found = lines.find(isTipLine);
  return found ? found.text.trim() : null;
}

/**
 * 부팅 팁 목록을 만든다. 챕터당 한 줄, 챕터 순서대로.
 *
 * @param {Array} scenes story.json 의 scenes 배열
 * @param {{limit?:number}} [options]
 * @returns {string[]} 최소 1개는 보장한다 (전부 실패하면 FALLBACK_TIP)
 */
export function buildBootTips(scenes, options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : TIP_LIMIT;

  const list = Array.isArray(scenes) ? scenes : [];
  const seenChapters = new Set();
  const tips = [];

  for (const scene of list) {
    if (tips.length >= limit) break;
    const tip = pickSceneTip(scene);
    if (!tip) continue;
    // 챕터당 한 줄. chapterId 가 없는 컷씬은 자기 id 로 구분한다
    const groupKey = scene.chapterId || scene.id || tip;
    if (seenChapters.has(groupKey)) continue;
    seenChapters.add(groupKey);
    tips.push(tip);
  }

  return tips.length > 0 ? tips : [FALLBACK_TIP];
}

/**
 * 순환 인덱스. 팁을 돌려 보여줄 때 쓴다.
 * @param {number} index 현재 인덱스 (음수나 초과를 허용한다)
 * @param {number} length 목록 길이
 * @returns {number} 0..length-1
 */
export function cycleIndex(index, length) {
  const n = Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
  if (n === 0) return 0;
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return ((i % n) + n) % n;
}

export default {
  TIP_TRIGGER,
  TIP_MIN_LENGTH,
  TIP_MAX_LENGTH,
  TIP_LIMIT,
  FALLBACK_TIP,
  isTipLine,
  pickSceneTip,
  buildBootTips,
  cycleIndex
};
