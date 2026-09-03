/**
 * touchTarget.js — `setInteractive` 히트 영역을 터치 하한(48 기획 px)까지 넓힌다 (QA P2-1)
 *
 * 감사(`docs/qa/QA_SCREEN_AUDIT_2026-09-03.md` §P2-1)가 잰 것은 시각 bounds 가 아니라
 * `input.hitArea` 다. 그래서 **시각 크기는 그대로 두고 히트 영역만** 넓히는 것이 이 모듈의 전부다.
 * `PopupBase` 의 ✕(글리프 20×22, 히트 48×48)가 감사에서 통과한 것과 같은 방식이다.
 *
 * 계산은 `touchLayout.computeHitRect()` 가 하고 여기서는 Phaser 에 물리기만 한다.
 *
 * ## 주의 — 텍스트는 내용이 바뀌면 다시 불러야 한다
 * `Text.width` 는 내용에 따라 변한다. `setText()` 로 라벨을 갈아끼우는 오브젝트는
 * 갱신 직후 이 함수를 다시 호출해야 히트 영역이 새 글리프 중앙에 놓인다.
 *
 * ## TDZ
 * 모듈 스코프에서 `s()`/`DESIGN` 을 평가하지 않는다. 전부 함수 안에서 읽는다.
 */
import Phaser from 'phaser';
import { s } from '../config/gameConfig.js';
import { DESIGN } from '../config/designSystem.js';
import { computeHitRect, MIN_TOUCH_TARGET } from './touchLayout.js';

/**
 * 오브젝트의 히트 영역을 최소 터치 타깃 이상으로 넓힌다.
 *
 * @param {Phaser.GameObjects.GameObject} obj - Text/Rectangle/Arc/Image 등 크기를 가진 오브젝트
 * @param {Object} [options]
 * @param {number} [options.minTarget] - 하한(기획 px). 기본 `DESIGN.touch.minTarget`
 * @param {number} [options.width] - 시각 폭 수동 지정(렌더 px). Container 처럼 width 가 0 인 경우
 * @param {number} [options.height] - 시각 높이 수동 지정(렌더 px)
 * @param {boolean} [options.cursor=true] - 손가락 커서 지정 여부
 * @returns {Phaser.GameObjects.GameObject} 넘긴 오브젝트 그대로
 */
export function ensureMinTouchTarget(obj, options = {}) {
  if (!obj || typeof obj.setInteractive !== 'function') return obj;

  const minBase = Number.isFinite(options.minTarget)
    ? options.minTarget
    : (DESIGN?.touch?.minTarget ?? MIN_TOUCH_TARGET);
  const min = s(minBase);

  const w = Number.isFinite(options.width) ? options.width : (obj.width || 0);
  const h = Number.isFinite(options.height) ? options.height : (obj.height || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return obj;

  const rect = computeHitRect(w, h, min);
  obj.setInteractive(
    new Phaser.Geom.Rectangle(rect.x, rect.y, rect.width, rect.height),
    Phaser.Geom.Rectangle.Contains
  );
  if (obj.input && options.cursor !== false) obj.input.cursor = 'pointer';
  return obj;
}

export default ensureMinTouchTarget;
