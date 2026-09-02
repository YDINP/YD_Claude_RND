/**
 * bgLayout.js — 씬 배경 배치 계산 (REDESIGN_PLAN §2-7, T-09)
 *
 * BackgroundFactory 는 gameConfig 를 거쳐 씬 그래프 전체를 끌고 오므로
 * 계산만 하는 부분을 여기로 분리했다. 이 파일은 scaleConfig 와 designSystem 만
 * 참조하며 둘 다 의존이 없다. 덕분에 단위 테스트가 Phaser 없이 돌아간다.
 *
 * 생성 원본은 832x1216 이고 빌드가 x1.30 업스케일해 1082x1581 로 만든다.
 * 목표 화면은 1080x1920 이라 비율이 다르므로 cover-fit 으로 세로를 채우고
 * 가로를 잘라낸다. 그래서 생성 프롬프트가 주요 형태를 가로 중앙 60% 에 두라고 요구한다.
 */
import { GAME_WIDTH, GAME_HEIGHT } from '../config/scaleConfig.js';
import { DESIGN } from '../config/designSystem.js';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';

/** 씬 배경 텍스처 키 접두사 (tools/art/asset-spec.json) */
export const BG_PREFIX = 'bg_';

/** 블러 페어 접미사 */
export const BLUR_SUFFIX = '_blur';

/** 배경 위 딤 알파 — 텍스트 대비 확보용 */
export const DIM_ALPHA = {
  DEFAULT: 0.35,
  BATTLE: 0.20   // 전투는 배경을 더 보여준다
};

/** 딤을 낮추는 씬 키 */
export const LOW_DIM_KEYS = ['battle'];

/**
 * 씬 키에서 원본과 블러본 텍스처 키를 만든다.
 * 이미 bg_ 로 시작하면 그대로 쓴다.
 *
 * @param {string} key - 씬 키 (예: main) 또는 완성된 텍스처 키 (예: bg_main)
 * @returns {{textureKey:string, blurKey:string}|null} 유효하지 않으면 null
 */
export function resolveBgKeys(key) {
  if (typeof key !== 'string' || key.length === 0) return null;
  const textureKey = key.startsWith(BG_PREFIX) ? key : BG_PREFIX + key;
  return { textureKey, blurKey: textureKey + BLUR_SUFFIX };
}

/**
 * cover-fit 배치를 계산한다. 짧은 쪽을 기준으로 확대해 화면을 빈틈없이 채운다.
 *
 * @param {number} srcW - 원본 너비
 * @param {number} srcH - 원본 높이
 * @param {number} [dstW] - 대상 너비. 기본 GAME_WIDTH
 * @param {number} [dstH] - 대상 높이. 기본 GAME_HEIGHT
 * @returns {{scale:number, displayWidth:number, displayHeight:number,
 *            overflowX:number, overflowY:number}} overflow 는 잘려나가는 비율(0~1)
 */
export function coverFit(srcW, srcH, dstW = GAME_WIDTH, dstH = GAME_HEIGHT) {
  if (!srcW || !srcH) return { scale: 1, displayWidth: dstW, displayHeight: dstH, overflowX: 0, overflowY: 0 };
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const displayWidth = srcW * scale;
  const displayHeight = srcH * scale;
  return {
    scale,
    displayWidth,
    displayHeight,
    overflowX: displayWidth > dstW ? (displayWidth - dstW) / displayWidth : 0,
    overflowY: displayHeight > dstH ? (displayHeight - dstH) / displayHeight : 0
  };
}

/**
 * 씬 키에 맞는 딤 알파를 반환한다.
 * @param {string} key - 씬 키 또는 텍스처 키
 * @returns {number} 0~1
 */
export function resolveDimAlpha(key) {
  const name = typeof key === 'string' && key.startsWith(BG_PREFIX) ? key.slice(BG_PREFIX.length) : key;
  return LOW_DIM_KEYS.includes(name) ? DIM_ALPHA.BATTLE : DIM_ALPHA.DEFAULT;
}

/**
 * 딤 색상 (배경 위 대비 확보용).
 * @returns {number} Phaser hex
 */
export function getDimColor() {
  return DESIGN.colors.bg.primary;
}

/**
 * 씬 키 → 프로시저럴 폴백 메서드 이름.
 * 텍스처가 없을 때 BackgroundFactory 가 어떤 기존 배경을 그릴지 결정한다.
 */
export const PROCEDURAL_FALLBACK = {
  main: 'createMainBg',
  login: 'createMainBg',
  battle: 'createBattleBg',
  // bg_chapter_N / bg_raid 는 전투 씬이 쓰는 배경이다. 지연 로드가 끝나기 전에는
  // 전투 폴백을 그려야 그라디언트 한 장으로 떨어지지 않는다 (T-17)
  chapter: 'createBattleBg',
  raid: 'createBattleBg',
  gacha: 'createGachaBg',
  stageselect: 'createStageSelectBg',
  tower: 'createTowerBg'
};

/**
 * 씬 키에 대응하는 프로시저럴 폴백 메서드 이름을 반환한다.
 * chapter_1 처럼 접두사가 붙은 키는 앞부분으로 매칭한다.
 *
 * @param {string} key - 씬 키 또는 텍스처 키
 * @returns {string} BackgroundFactory 의 static 메서드 이름. 매칭 실패 시 createGradientBg
 */
export function resolveFallbackMethod(key) {
  if (typeof key !== 'string' || key.length === 0) return 'createGradientBg';
  const name = key.startsWith(BG_PREFIX) ? key.slice(BG_PREFIX.length) : key;
  if (PROCEDURAL_FALLBACK[name]) return PROCEDURAL_FALLBACK[name];
  const prefix = name.split('_')[0];
  return PROCEDURAL_FALLBACK[prefix] || 'createGradientBg';
}

/**
 * asset-manifest.json 의 lazyTextures 에서 배경 항목을 조회한다.
 *
 * bg_main/bg_login 은 eager(PreloadScene.loadPhase0_Assets())라 여기 없다 — 이미 로드돼
 * 있으므로 BackgroundFactory.createSceneBg() 가 이 함수를 호출하기 전에 텍스처 존재
 * 검사에서 걸러진다. 나머지 배경(bg_gacha, bg_tower 등)은 씬 진입 시점에 동적으로
 * 로드해야 하므로 이 함수가 경로를 알려준다.
 *
 * @param {string} textureKey - 완성된 텍스처 키 (예: 'bg_gacha')
 * @returns {{path:string, blurPath:string|null}|null} 매니페스트에 없으면 null
 */
export function resolveLazyBgEntry(textureKey) {
  const lazy = (ASSET_MANIFEST && ASSET_MANIFEST.lazyTextures) || {};
  const entry = lazy[textureKey];
  if (!entry || !entry.path) return null;
  const blurEntry = lazy[`${textureKey}${BLUR_SUFFIX}`];
  return { path: entry.path, blurPath: blurEntry ? blurEntry.path : null };
}
