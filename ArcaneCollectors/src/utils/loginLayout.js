/**
 * loginLayout.js — 로그인 · 부팅 화면 배치 계산 (REDESIGN_PLAN §3-8, T-19)
 *
 * 두 화면은 같은 배경(`bg_login`)과 같은 로고를 같은 자리에 놓는다. 그래야 부팅에서
 * 로그인으로 넘어갈 때 그림이 끊기지 않고 한 장면처럼 이어진다. 그 "같은 자리"를
 * 두 씬 파일에 각각 적어 두면 한쪽만 고쳐져 어긋나므로 여기에 한 번만 적는다.
 *
 * 이 모듈은 어떤 프로젝트 모듈도 import 하지 않는다. 좌표는 기획 좌표(720x1280)의
 * 순수 숫자이며 씬이 s() 로 렌더 좌표(1080x1920)로 옮긴다.
 */

/** 기획 좌표계 크기 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/** 로그인 화면 배치 */
export const LOGIN_LAYOUT = Object.freeze({
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  /** 하단 페이드 — 이 아래는 단색으로 덮어 버튼 영역의 대비를 확보한다 */
  fade: Object.freeze({ y: 768, h: 384 }),
  logo: Object.freeze({ x: 360, y: 480, w: 560, h: 180 }),
  subtitle: Object.freeze({ x: 360, y: 592 }),
  guestButton: Object.freeze({ x: 360, y: 1016, w: 328, h: 72 }),
  accountButton: Object.freeze({ x: 360, y: 1108, w: 328, h: 64 }),
  autoLogin: Object.freeze({ x: 360, y: 1180, w: 300, h: 48 }),
  footer: Object.freeze({ x: 360, y: 1240 })
});

/** 부팅 화면 배치 — 로고 자리는 로그인과 같아야 한다 */
export const BOOT_LAYOUT = Object.freeze({
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  fade: Object.freeze({ y: 768, h: 384 }),
  logo: Object.freeze({ x: 360, y: 480, w: 560, h: 180 }),
  subtitle: Object.freeze({ x: 360, y: 592 }),
  /** 세계관 문구 — 진행바 바로 위 */
  tip: Object.freeze({ x: 360, y: 1010, wrapWidth: 600 }),
  progress: Object.freeze({ x: 360, y: 1120, w: 400, h: 12 }),
  progressLabel: Object.freeze({ x: 360, y: 1152 }),
  footer: Object.freeze({ x: 360, y: 1240 })
});

/**
 * 로고·부제 뒤에 까는 어둠 띠. bg_login 은 화면 한가운데가 가장 밝은 그림이라
 * 그 위의 흰 부제가 읽히지 않는다. 배경과 로고 **사이**에 깔아 로고는 밝게 남긴다.
 * y 는 기획 좌표, alpha 는 각 구간의 시작/끝 값이다.
 */
export const LOGO_SCRIM = Object.freeze([
  Object.freeze({ y: 380, h: 110, from: 0, to: 0.5 }),
  Object.freeze({ y: 490, h: 130, from: 0.5, to: 0.5 }),
  Object.freeze({ y: 620, h: 90, from: 0.5, to: 0 })
]);

/** 부팅 팁 교체 주기 (ms). 스플래시 2.4초 동안 두 문장이 지나간다 */
export const TIP_ROTATE_MS = 1300;

/** 팁 크로스페이드 시간 (ms) */
export const TIP_FADE_MS = 260;

/**
 * 로고를 지정한 상자 안에 비율을 지키며 넣는다(contain fit).
 * 로고 원본은 512x256 이고 상자는 560x180 이라 그대로 늘리면 찌그러진다.
 *
 * @param {number} srcW 원본 너비
 * @param {number} srcH 원본 높이
 * @param {number} boxW 상자 너비
 * @param {number} boxH 상자 높이
 * @returns {{w:number,h:number,scale:number}} 상자 안에 들어가는 표시 크기
 */
export function resolveLogoDisplaySize(srcW, srcH, boxW, boxH) {
  const sw = Number(srcW);
  const sh = Number(srcH);
  const bw = Number(boxW);
  const bh = Number(boxH);
  if (!sw || !sh || !bw || !bh) return { w: bw || 0, h: bh || 0, scale: 1 };
  const scale = Math.min(bw / sw, bh / sh);
  return { w: sw * scale, h: sh * scale, scale };
}

/**
 * 로드 진행률과 부팅 단계 진행률을 하나의 막대 값으로 합친다.
 *
 * 부팅은 두 가지 일을 한다 — 에셋을 받는 것과 세션을 확인하는 것. 막대가 에셋만
 * 따라가면 로드가 끝난 뒤 남은 시간 동안 100% 로 멈춰 서서 아무 정보도 주지 않는다.
 * 그래서 앞 구간(loadWeight)은 로드가, 뒷 구간은 부팅 단계가 채운다.
 *
 * @param {number} loadProgress 0~1 (Phaser 로더)
 * @param {number} bootProgress 0~1 (스플래시 경과)
 * @param {number} [loadWeight] 로드가 차지하는 비율. 기본 0.55
 * @returns {number} 0~1
 */
export function combineBootProgress(loadProgress, bootProgress, loadWeight = 0.55) {
  const clamp01 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  };
  const w = clamp01(loadWeight);
  return clamp01(loadProgress) * w + clamp01(bootProgress) * (1 - w);
}

export default {
  BASE_WIDTH,
  BASE_HEIGHT,
  LOGIN_LAYOUT,
  BOOT_LAYOUT,
  LOGO_SCRIM,
  TIP_ROTATE_MS,
  TIP_FADE_MS,
  resolveLogoDisplaySize,
  combineBootProgress
};
