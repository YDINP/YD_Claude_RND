/**
 * TutorialTargetRegistry - 튜토리얼 하이라이트 대상(TID) 매핑 레지스트리
 *
 * 설계 근거: docs/story/UX_ONBOARDING_FLOW.md §4-1 (TID 명명 규칙 · 3단 해석 · 바운드 계산 규약)
 *
 * TID = {scopeKey}.{group}.{item}
 *   scopeKey : Scene 클래스명에서 "Scene" 제거 후 소문자 (MainMenuScene → mainmenu)
 *              또는 popupKey 그대로 (AscensionPopup → ascension)
 *
 * 3단 해석 (어느 하나가 실패해도 튜토리얼이 멈추지 않는다):
 *   1) 레지스트리 조회
 *   2) scene.children.getByName('tid:' + TID)
 *   3) fallbackAnchor (base 720x1280 좌표 → s() 통과)
 * 전부 실패하면 null 을 반환하며, 호출부는 마스킹을 자동 해제하고 코치마크로 강등해야 한다.
 *
 * 주의: gameConfig/scaleConfig 의 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 *       s() 는 반드시 함수 내부에서만 호출한다.
 */
import { s } from '../config/scaleConfig.js';

/** Phaser GameObject 이름 접두사 — 2단계 해석용 */
export const TID_NAME_PREFIX = 'tid:';

/** 3단 해석 결과 티어 */
export const RESOLUTION_TIER = {
  REGISTRY: 1,
  SCENE_NAME: 2,
  FALLBACK_ANCHOR: 3,
};

/** 파괴된 Phaser 오브젝트인지 판정 (destroy() 시 scene 참조가 사라진다) */
function isAlive(obj) {
  if (!obj) return false;
  if (obj.scene === undefined || obj.scene === null) return false;
  if (obj.active === false) return false;
  return true;
}

/** GameObject → { x, y, w, h } 월드 바운드 (padding 은 base 단위가 아닌 월드 px) */
function boundsOf(obj, padding = 0) {
  if (!obj) return null;

  let rect = null;
  if (typeof obj.getBounds === 'function') {
    const b = obj.getBounds();
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      rect = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
  }

  if (!rect && Number.isFinite(obj.x) && Number.isFinite(obj.width)) {
    const ox = obj.originX ?? 0.5;
    const oy = obj.originY ?? 0.5;
    rect = {
      x: obj.x - obj.width * ox,
      y: obj.y - obj.height * oy,
      w: obj.width,
      h: obj.height,
    };
  }

  if (!rect) return null;
  if (!padding) return rect;

  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
}

export class TutorialTargetRegistry {
  /** @type {Map<string, {object: any, sceneKey: string|null, padding: number}>} */
  static _entries = new Map();

  /**
   * TID 등록. 오브젝트 생성 직후 1줄 호출한다.
   * @param {string} tid 예: 'mainmenu.menu.ascension'
   * @param {object} gameObject Phaser GameObject (hitArea Rectangle 우선)
   * @param {string|null} sceneKey 소속 씬 키 (clearScene 용)
   * @param {{padding?: number, ensureVisible?: Function}} options
   *   padding = 홀 여백 보정(월드 px, UXI-11).
   *   ensureVisible = 선택 훅. `resolve()` 가 이 타깃을 찾을 때마다 bounds 계산 전에 먼저 호출한다.
   *   `ScrollContainer` 안의 타깃처럼 마스크 밖(스크롤 아웃)일 수 있는 오브젝트를
   *   `ScrollContainer.scrollTo(target)` 로 미리 보이게 하는 용도(TutorialFlow.js 는 수정하지 않는다).
   * @returns {boolean} 등록 성공 여부
   */
  static register(tid, gameObject, sceneKey = null, options = {}) {
    if (!tid || !gameObject) return false;

    this._entries.set(tid, {
      object: gameObject,
      sceneKey: sceneKey || gameObject.scene?.scene?.key || null,
      padding: options.padding || 0,
      ensureVisible: typeof options.ensureVisible === 'function' ? options.ensureVisible : null,
    });

    // 2단계 해석 폴백 — Phaser 내장 조회로도 찾을 수 있게 이름을 붙인다
    if (typeof gameObject.setName === 'function' && !gameObject.name) {
      gameObject.setName(TID_NAME_PREFIX + tid);
    }
    return true;
  }

  /** 등록 해제 */
  static unregister(tid) {
    return this._entries.delete(tid);
  }

  /** TID 의 scopeKey (첫 세그먼트) */
  static scopeOf(tid) {
    if (typeof tid !== 'string') return null;
    const idx = tid.indexOf('.');
    return idx === -1 ? tid : tid.slice(0, idx);
  }

  /** Scene 클래스/키 → scopeKey (MainMenuScene → mainmenu) */
  static sceneScopeKey(sceneKey) {
    if (!sceneKey) return null;
    return String(sceneKey).replace(/Scene$/, '').toLowerCase();
  }

  /**
   * 스코프 단위 정리. 씬 shutdown() / 팝업 close() 에서 호출한다.
   * @param {string} scopeKey 예: 'mainmenu', 'ascension'
   * @returns {number} 제거된 항목 수
   */
  static clearScope(scopeKey) {
    if (!scopeKey) return 0;
    let removed = 0;
    for (const tid of Array.from(this._entries.keys())) {
      if (this.scopeOf(tid) === scopeKey) {
        this._entries.delete(tid);
        removed++;
      }
    }
    return removed;
  }

  /** 씬 키로 등록된 항목 전부 제거 */
  static clearScene(sceneKey) {
    let removed = 0;
    for (const [tid, entry] of Array.from(this._entries.entries())) {
      if (entry.sceneKey === sceneKey) {
        this._entries.delete(tid);
        removed++;
      }
    }
    return removed;
  }

  /** 전체 초기화 (테스트/재부팅용) */
  static clearAll() {
    this._entries.clear();
  }

  /** 등록 여부 */
  static has(tid) {
    const entry = this._entries.get(tid);
    return !!entry && isAlive(entry.object);
  }

  /** 등록된 GameObject 반환 (죽은 참조는 정리 후 null) */
  static get(tid) {
    const entry = this._entries.get(tid);
    if (!entry) return null;
    if (!isAlive(entry.object)) {
      this._entries.delete(tid);
      return null;
    }
    return entry.object;
  }

  /** 등록 개수 */
  static get size() {
    return this._entries.size;
  }

  /**
   * base 720x1280 좌표의 fallbackAnchor 를 월드 바운드로 변환한다.
   * s() 를 통과시키지 않으면 1080x1920 화면의 2/3 위치에 찍힌다(SPIKE §7-1).
   * @param {{x:number,y:number,w:number,h:number}|null} anchor
   */
  static anchorToBounds(anchor) {
    if (!anchor) return null;
    const { x, y, w, h } = anchor;
    if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
    return { x: s(x), y: s(y), w: s(w), h: s(h) };
  }

  /**
   * 3단 해석. 실패 시 null.
   * @param {string} tid
   * @param {{scene?: object, fallbackAnchor?: object|null}} options
   * @returns {{tier:number, bounds:{x,y,w,h}, object:object|null}|null}
   */
  static resolve(tid, options = {}) {
    const { scene = null, fallbackAnchor = null } = options;

    // 1단계 — 레지스트리
    const entry = this._entries.get(tid);
    if (entry && isAlive(entry.object)) {
      if (entry.ensureVisible) {
        try {
          entry.ensureVisible(entry.object);
        } catch {
          // 스크롤 이동 실패는 해석 자체를 막지 않는다 — bounds 계산은 계속 진행
        }
      }
      const bounds = boundsOf(entry.object, entry.padding);
      if (bounds) {
        return { tier: RESOLUTION_TIER.REGISTRY, bounds, object: entry.object };
      }
    } else if (entry) {
      this._entries.delete(tid);
    }

    // 2단계 — scene.children.getByName('tid:' + TID)
    if (scene?.children?.getByName) {
      const found = scene.children.getByName(TID_NAME_PREFIX + tid);
      if (isAlive(found)) {
        const bounds = boundsOf(found, 0);
        if (bounds) {
          return { tier: RESOLUTION_TIER.SCENE_NAME, bounds, object: found };
        }
      }
    }

    // 3단계 — fallbackAnchor (base 좌표)
    const anchorBounds = this.anchorToBounds(fallbackAnchor);
    if (anchorBounds) {
      return { tier: RESOLUTION_TIER.FALLBACK_ANCHOR, bounds: anchorBounds, object: null };
    }

    return null;
  }
}

export default TutorialTargetRegistry;
