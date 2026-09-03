/**
 * ScrollContainer.js — 팝업 콘텐츠 슬롯 공용 스크롤 뷰 (팝업 3종 스크롤 컨테이너 작업)
 *
 * `PopupBase` 콘텐츠 슬롯(기획 888px)에 카드 목록을 그대로 채우면 데이터가 늘어날 때
 * 액션 바 아래로 넘친다. 이 컴포넌트는 Geometry Mask 로 콘텐츠를 자르고
 * 드래그/휠 스크롤 + 관성 + 가장자리 페이드 + 스크롤바 인디케이터를 제공한다.
 *
 * ## 좌표 규약
 * 콘텐츠 자식은 기존 팝업 코드와 동일하게 **절대 화면 좌표**(`contentBounds` 기준)를 그대로 쓴다.
 * `content` 컨테이너 자체는 `y = -scrollY` 만 적용하므로, 호출부는 기존에 쓰던
 * `top + i * (itemH + gap)` 같은 절대 y 계산을 그대로 재사용할 수 있다 — 스크롤 도입으로
 * 좌표 공식을 바꿀 필요가 없다.
 *
 * ## 튜토리얼 연동
 * 이 컴포넌트는 `TutorialTargetRegistry` 를 직접 참조하지 않는다(범용 컴포넌트로 유지).
 * 마스크 밖으로 스크롤된 타깃을 보이게 하려면 호출부가 `scrollTo(target)` 을 호출하는
 * `ensureVisible` 콜백을 `TutorialTargetRegistry.register(tid, obj, sceneKey, { ensureVisible })`
 * 로 함께 등록한다. `resolve()` 가 타깃을 찾을 때마다 자동으로 그 콜백을 먼저 실행한다
 * (`src/systems/TutorialTargetRegistry.js` 참고). `getBounds()` 는 컨테이너 트랜스폼을
 * 그대로 반영하므로 마스크로 가려져 있어도(스크롤 밖) 항상 올바른 화면 좌표를 돌려준다.
 *
 * 순수 계산(클램프/관성/드래그·휠 적용/탭 임계값/스크롤-투-타깃)은 static 메서드로 분리해
 * Phaser 없이 테스트한다(`tests/components/ScrollContainer.test.js`).
 */

/** 드래그를 "탭"과 구분하는 최소 이동 거리(px). 이보다 작게 움직이면 스크롤을 시작하지 않는다 */
export const DEFAULT_THRESHOLD = 8;

/** 휠 델타 → 스크롤 오프셋 변환 계수 */
export const DEFAULT_WHEEL_SENSITIVITY = 0.35;

/** 관성 감쇠율(프레임당 곱). 1에 가까울수록 오래 미끄러진다 */
export const DEFAULT_FRICTION = 0.92;

/** 관성 속도가 이 값(스크롤 px/ms) 아래로 떨어지면 멈춘다 */
export const MIN_VELOCITY = 0.02;

/** 관성 애니메이션 프레임 간격(ms) */
export const INERTIA_STEP_MS = 16;

/** 유한한 숫자만 통과시킨다. 아니면 대체값 */
function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export class ScrollContainer {
  // ================================================================
  // 순수 함수 — Phaser 없이 단위 테스트 가능
  // ================================================================

  /** scrollY 를 [0, maxScroll] 로 자른다 */
  static clampScroll(scrollY, maxScroll) {
    const max = Math.max(0, num(maxScroll));
    return Math.min(Math.max(num(scrollY), 0), max);
  }

  /** 콘텐츠 높이·뷰포트 높이로 최대 스크롤값을 계산한다 */
  static computeMaxScroll(contentHeight, viewportHeight) {
    const c = Math.max(0, num(contentHeight));
    const v = Math.max(0, num(viewportHeight));
    return Math.max(0, c - v);
  }

  /** 이동 거리(dx,dy)가 탭↔드래그 판정 임계값을 넘었는지 */
  static exceedsThreshold(dx, dy, threshold = DEFAULT_THRESHOLD) {
    const t = Math.max(0, num(threshold, DEFAULT_THRESHOLD));
    const d = Math.hypot(num(dx), num(dy));
    return d > t;
  }

  /** 휠 델타를 스크롤에 반영한 새 scrollY */
  static applyWheelDelta(scrollY, deltaY, maxScroll, sensitivity = DEFAULT_WHEEL_SENSITIVITY) {
    const next = num(scrollY) + num(deltaY) * num(sensitivity, DEFAULT_WHEEL_SENSITIVITY);
    return ScrollContainer.clampScroll(next, maxScroll);
  }

  /**
   * 드래그 시작 시점의 scrollY 에 이동량을 더한 새 scrollY.
   * `deltaY` 규약: `dragStartY - pointer.y` (손가락이 위로 이동 = 양수 = 아래쪽 콘텐츠 노출)
   */
  static applyDragDelta(dragStartScrollY, deltaY, maxScroll) {
    return ScrollContainer.clampScroll(num(dragStartScrollY) + num(deltaY), maxScroll);
  }

  /**
   * 관성 속도를 한 프레임만큼 감쇠시킨다.
   * @param {number} velocity - 현재 속도 (scrollY px / ms)
   * @param {{friction?:number, minVelocity?:number}} [options]
   * @returns {number} 다음 속도. `minVelocity` 아래면 0 (정지)
   */
  static stepInertia(velocity, options = {}) {
    const friction = num(options.friction, DEFAULT_FRICTION);
    const minVelocity = num(options.minVelocity, MIN_VELOCITY);
    const next = num(velocity) * friction;
    return Math.abs(next) < minVelocity ? 0 : next;
  }

  /**
   * 포인터 y 표본(`{t, y}[]`, 시간순)에서 속도(px/ms)를 구한다.
   * 표본이 2개 미만이거나 시간차가 0이면 0.
   */
  static computeVelocity(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = num(last?.t) - num(first?.t);
    if (dt <= 0) return 0;
    return (num(last?.y) - num(first?.y)) / dt;
  }

  /**
   * 타깃이 뷰포트 안에 보이도록 필요한 새 scrollY 를 계산한다.
   * 이미 완전히 보이면 입력한 scrollY 를 그대로 돌려준다(불필요한 점프 방지).
   * 타깃이 뷰포트보다 크면 상단 정렬을 우선한다.
   *
   * @param {Object} p
   * @param {number} p.scrollY - 현재 scrollY
   * @param {number} p.viewTop - 뷰포트 절대 top
   * @param {number} p.viewportHeight - 뷰포트 높이
   * @param {number} p.targetWorldTop - 타깃의 현재(스크롤 반영) 절대 top (`getBounds().y`)
   * @param {number} p.targetHeight - 타깃 높이
   * @param {number} p.maxScroll
   * @param {number} [p.margin=0] - 가장자리 여유
   * @returns {number} 새 scrollY
   */
  static computeScrollToTarget(p = {}) {
    const scrollY = num(p.scrollY);
    const viewTop = num(p.viewTop);
    const viewportHeight = Math.max(0, num(p.viewportHeight));
    const targetWorldTop = num(p.targetWorldTop);
    const targetHeight = Math.max(0, num(p.targetHeight));
    const margin = Math.max(0, num(p.margin));

    const viewBottom = viewTop + viewportHeight;
    const targetWorldBottom = targetWorldTop + targetHeight;
    // 스크롤이 0일 때 기준 절대 top — 스크롤 값과 무관한 콘텐츠 좌표
    const unscrolledTop = targetWorldTop + scrollY;

    let next = scrollY;
    if (targetWorldTop - margin < viewTop) {
      // 타깃 상단이 뷰포트 위로 가려짐 → 위로 당긴다(상단 정렬)
      next = unscrolledTop - margin - viewTop;
    } else if (targetWorldBottom + margin > viewBottom) {
      // 타깃 하단이 뷰포트 아래로 가려짐 → 아래로 당긴다(하단 정렬)
      next = unscrolledTop + targetHeight + margin - viewportHeight - viewTop;
    }
    return ScrollContainer.clampScroll(next, p.maxScroll);
  }

  // ================================================================
  // 인스턴스 — Phaser 렌더
  // ================================================================

  /**
   * @param {Phaser.Scene} scene
   * @param {Object} opts
   * @param {number} opts.x - 뷰포트 좌측(절대 화면 좌표, 보통 `contentBounds.left`)
   * @param {number} opts.y - 뷰포트 상단(절대 화면 좌표)
   * @param {number} opts.width - 뷰포트 너비
   * @param {number} opts.height - 뷰포트 높이
   * @param {number} [opts.threshold] - 탭↔드래그 임계값(px). 기본 8
   * @param {number} [opts.wheelSensitivity]
   * @param {number} [opts.friction] - 관성 감쇠율
   * @param {boolean} [opts.fade=true] - 상단/하단 페이드 표시 여부
   * @param {number} [opts.fadeHeight] - 페이드 높이(px)
   * @param {number} [opts.fadeColor] - 페이드 색(패널 채움색과 맞춘다). 기본 0x0F172A
   * @param {boolean} [opts.scrollbar=true] - 스크롤바 인디케이터 표시 여부
   * @param {number} [opts.scrollbarWidth]
   * @param {number} [opts.scrollbarColor]
   * @param {Phaser.GameObjects.Container} [opts.parent] - 즉시 `parent.add(this.root)` 한다.
   *   팝업의 `contentContainer` 처럼 depth 를 가진 부모에 넣지 않으면 이 컴포넌트는
   *   씬 루트(depth 0)에 그려져 팝업 패널 뒤에 숨는다 — 반드시 넘기거나 호출부가 직접 add 한다.
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.viewLeft = num(opts.x);
    this.viewTop = num(opts.y);
    this.width = Math.max(0, num(opts.width));
    this.viewportHeight = Math.max(0, num(opts.height));

    this.threshold = num(opts.threshold, DEFAULT_THRESHOLD);
    this.wheelSensitivity = num(opts.wheelSensitivity, DEFAULT_WHEEL_SENSITIVITY);
    this.friction = num(opts.friction, DEFAULT_FRICTION);

    this.fadeEnabled = opts.fade !== false;
    this.fadeHeight = Math.max(0, num(opts.fadeHeight, 28));
    this.fadeColor = typeof opts.fadeColor === 'number' ? opts.fadeColor : 0x0F172A;

    this.scrollbarEnabled = opts.scrollbar !== false;
    this.scrollbarWidth = Math.max(1, num(opts.scrollbarWidth, 6));
    this.scrollbarColor = typeof opts.scrollbarColor === 'number' ? opts.scrollbarColor : 0x64748B;

    this.scrollY = 0;
    this.maxScroll = 0;
    this.contentHeight = 0;
    this.isDragging = false;

    this._pressing = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragStartScrollY = 0;
    this._samples = [];
    this._velocity = 0;
    this._inertiaEvent = null;
    this._destroyed = false;

    this.root = scene.add.container(0, 0);

    // 콘텐츠 레이어 — 자식은 절대 화면 좌표를 그대로 쓴다. scrollY 만큼만 끌어올린다.
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);

    // 마스크 — 표시 목록에는 넣지 않는다(add:false). 절대 좌표라 위치 계산이 CollectionPopup 과 동일하다.
    this._maskShape = scene.make.graphics({ x: 0, y: 0, add: false });
    this._maskShape.fillStyle(0xffffff);
    this._maskShape.fillRect(this.viewLeft, this.viewTop, this.width, this.viewportHeight);
    this.content.setMask(this._maskShape.createGeometryMask());

    // 히트 영역 — 뷰포트 경계를 표시만 하는 투명 존. **인터랙티브로 만들지 않는다.**
    //
    // 드래그·휠 판정은 `_bindInput()` 이 씬 입력(`scene.input.on(...)`)에서 직접 받으므로
    // 이 존에 입력을 걸 이유가 없다. 그런데 존은 `content` 보다 뒤에 추가되어 표시 목록상
    // 위에 있고, Phaser 의 `topOnly`(기본 true)는 최상위 오브젝트 하나에만 pointerdown 을
    // 준다. 그래서 인터랙티브하게 만드는 순간 뷰포트 전체가 입력을 삼켜
    // `attachTap()` 으로 붙인 목록 카드가 **단 한 번도 눌리지 않는다**
    // (온보딩 T-07 기관 루트 선택이 여기서 막혔다).
    this._hitZone = scene.add.zone(
      this.viewLeft + this.width / 2, this.viewTop + this.viewportHeight / 2,
      Math.max(1, this.width), Math.max(1, this.viewportHeight)
    );
    this.root.add(this._hitZone);

    if (this.fadeEnabled) {
      this._topFade = scene.add.graphics();
      this._bottomFade = scene.add.graphics();
      this.root.add([this._topFade, this._bottomFade]);
    }

    if (this.scrollbarEnabled) {
      this._scrollbar = scene.add.graphics();
      this.root.add(this._scrollbar);
    }

    if (opts.parent && typeof opts.parent.add === 'function') {
      opts.parent.add(this.root);
    }

    this._bindInput();
    this._render();
  }

  // ------------------------------------------------------------------
  // 콘텐츠 헬퍼 (PopupBase.addText 와 동일한 시그니처 — 대상 컨테이너만 다르다)
  // ------------------------------------------------------------------

  /** 스크롤 콘텐츠에 텍스트 추가 */
  addText(x, y, text, style = {}) {
    const t = this.scene.add.text(x, y, text, {
      fontSize: '16px',
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      ...style
    });
    this.content.add(t);
    return t;
  }

  /** 스크롤 콘텐츠에 임의 GameObject 추가 */
  add(obj) {
    this.content.add(obj);
    return obj;
  }

  // ------------------------------------------------------------------
  // 콘텐츠 높이 / 스크롤 상태
  // ------------------------------------------------------------------

  /**
   * 스크롤 가능한 전체 콘텐츠 높이를 설정한다(뷰포트 top 기준 span).
   * 목록을 다시 그릴 때마다 호출한다.
   * @param {number} height
   */
  setContentHeight(height) {
    this.contentHeight = Math.max(0, num(height));
    this.maxScroll = ScrollContainer.computeMaxScroll(this.contentHeight, this.viewportHeight);
    this.scrollY = ScrollContainer.clampScroll(this.scrollY, this.maxScroll);
    this._render();
  }

  /**
   * 탭↔드래그를 구분해 안전하게 클릭을 바인딩한다.
   * 스크롤 드래그가 진행 중(임계값 8px 초과)이면 탭을 무시한다.
   * @param {Phaser.GameObjects.GameObject} gameObject
   * @param {Function} onTap - (pointer, gameObject) => void
   */
  attachTap(gameObject, onTap) {
    if (!gameObject || typeof onTap !== 'function') return gameObject;
    if (typeof gameObject.setInteractive === 'function' && !gameObject.input) {
      gameObject.setInteractive({ useHandCursor: true });
    }
    gameObject.on('pointerdown', (pointer) => {
      if (this.isDragging) return;
      onTap(pointer, gameObject);
    });
    return gameObject;
  }

  /**
   * 타깃(GameObject)이 보이도록 스크롤한다. `TutorialTargetRegistry` 의
   * `ensureVisible` 훅에서 호출하는 용도.
   * @param {Phaser.GameObjects.GameObject} target
   * @param {{margin?:number}} [options]
   */
  scrollTo(target, options = {}) {
    if (!target || typeof target.getBounds !== 'function' || this._destroyed) return;
    const bounds = target.getBounds();
    if (!bounds || !Number.isFinite(bounds.y)) return;

    const next = ScrollContainer.computeScrollToTarget({
      scrollY: this.scrollY,
      viewTop: this.viewTop,
      viewportHeight: this.viewportHeight,
      targetWorldTop: bounds.y,
      targetHeight: bounds.height,
      maxScroll: this.maxScroll,
      margin: options.margin
    });

    if (next !== this.scrollY) {
      this._stopInertia();
      this.scrollY = next;
      this._render();
    }
  }

  // ------------------------------------------------------------------
  // 렌더
  // ------------------------------------------------------------------

  _render() {
    if (this._destroyed) return;
    this.content.y = -this.scrollY;
    this._drawFades();
    this._drawScrollbar();
  }

  _drawFades() {
    if (!this.fadeEnabled || !this._topFade || !this._bottomFade) return;
    const h = Math.min(this.fadeHeight, this.viewportHeight / 2);
    const x = this.viewLeft;
    const w = this.width;

    this._topFade.clear();
    this._bottomFade.clear();

    if (this.scrollY > 0.5) {
      this._topFade.fillGradientStyle(this.fadeColor, this.fadeColor, this.fadeColor, this.fadeColor, 0.95, 0.95, 0, 0);
      this._topFade.fillRect(x, this.viewTop, w, h);
    }
    if (this.scrollY < this.maxScroll - 0.5) {
      this._bottomFade.fillGradientStyle(this.fadeColor, this.fadeColor, this.fadeColor, this.fadeColor, 0, 0, 0.95, 0.95);
      this._bottomFade.fillRect(x, this.viewTop + this.viewportHeight - h, w, h);
    }
  }

  _drawScrollbar() {
    if (!this.scrollbarEnabled || !this._scrollbar) return;
    this._scrollbar.clear();
    if (this.maxScroll <= 0) return;

    const trackH = this.viewportHeight;
    const ratio = Math.min(1, this.viewportHeight / Math.max(this.contentHeight, 1));
    const barH = Math.max(this.scrollbarWidth * 4, trackH * ratio);
    const progress = this.maxScroll > 0 ? this.scrollY / this.maxScroll : 0;
    const barY = this.viewTop + progress * Math.max(0, trackH - barH);
    const barX = this.viewLeft + this.width - this.scrollbarWidth - Math.max(2, this.scrollbarWidth / 2);

    this._scrollbar.fillStyle(this.scrollbarColor, 0.55);
    this._scrollbar.fillRoundedRect(barX, barY, this.scrollbarWidth, barH, this.scrollbarWidth / 2);
  }

  // ------------------------------------------------------------------
  // 입력 — 휠/드래그/관성
  // ------------------------------------------------------------------

  _isPointerInBounds(pointer) {
    return pointer.x >= this.viewLeft && pointer.x <= this.viewLeft + this.width &&
      pointer.y >= this.viewTop && pointer.y <= this.viewTop + this.viewportHeight;
  }

  _bindInput() {
    const wheelHandler = (pointer, gameObjects, deltaX, deltaY) => {
      if (this._destroyed || !this._isPointerInBounds(pointer)) return;
      this._stopInertia();
      this.scrollY = ScrollContainer.applyWheelDelta(this.scrollY, deltaY, this.maxScroll, this.wheelSensitivity);
      this._render();
    };

    const downHandler = (pointer) => {
      if (this._destroyed || !this._isPointerInBounds(pointer)) return;
      this._stopInertia();
      this._pressing = true;
      this.isDragging = false;
      this._dragStartX = pointer.x;
      this._dragStartY = pointer.y;
      this._dragStartScrollY = this.scrollY;
      this._samples = [{ t: this._now(), y: pointer.y }];
    };

    const moveHandler = (pointer) => {
      if (this._destroyed || !this._pressing || !pointer.isDown) return;
      const dx = pointer.x - this._dragStartX;
      const dy = this._dragStartY - pointer.y;

      if (!this.isDragging && ScrollContainer.exceedsThreshold(dx, dy, this.threshold)) {
        this.isDragging = true;
      }
      if (this.isDragging) {
        this.scrollY = ScrollContainer.applyDragDelta(this._dragStartScrollY, dy, this.maxScroll);
        this._render();
        this._samples.push({ t: this._now(), y: pointer.y });
        if (this._samples.length > 5) this._samples.shift();
      }
    };

    const upHandler = () => {
      if (this._destroyed) return;
      if (this.isDragging) {
        const pointerVelocity = ScrollContainer.computeVelocity(this._samples);
        this._velocity = -pointerVelocity; // scrollY 는 포인터 y 와 반대 방향으로 움직인다
        this._startInertia();
      }
      this._pressing = false;
      this.isDragging = false;
      this._samples = [];
    };

    this.scene.input.on('wheel', wheelHandler);
    this.scene.input.on('pointerdown', downHandler);
    this.scene.input.on('pointermove', moveHandler);
    this.scene.input.on('pointerup', upHandler);
    this.scene.input.on('pointerupoutside', upHandler);

    this._handlers = { wheelHandler, downHandler, moveHandler, upHandler };
  }

  _now() {
    return (this.scene?.time?.now) ?? Date.now();
  }

  _startInertia() {
    this._stopInertia();
    if (this._destroyed || Math.abs(this._velocity) < MIN_VELOCITY || !this.scene?.time) return;

    this._inertiaEvent = this.scene.time.addEvent({
      delay: INERTIA_STEP_MS,
      loop: true,
      callback: () => {
        const next = ScrollContainer.clampScroll(this.scrollY + this._velocity * INERTIA_STEP_MS, this.maxScroll);
        const hitEdge = next === 0 || next === this.maxScroll;
        this.scrollY = next;
        this._render();
        this._velocity = ScrollContainer.stepInertia(this._velocity, { friction: this.friction });
        if (this._velocity === 0 || hitEdge) this._stopInertia();
      }
    });
  }

  _stopInertia() {
    if (this._inertiaEvent) {
      this._inertiaEvent.remove(false);
      this._inertiaEvent = null;
    }
    this._velocity = 0;
  }

  // ------------------------------------------------------------------
  // 파괴
  // ------------------------------------------------------------------

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopInertia();

    if (this._handlers && this.scene?.input) {
      const h = this._handlers;
      this.scene.input.off('wheel', h.wheelHandler);
      this.scene.input.off('pointerdown', h.downHandler);
      this.scene.input.off('pointermove', h.moveHandler);
      this.scene.input.off('pointerup', h.upHandler);
      this.scene.input.off('pointerupoutside', h.upHandler);
    }
    this._handlers = null;

    if (this._maskShape) {
      this._maskShape.destroy();
      this._maskShape = null;
    }
    if (this.root && this.root.scene) {
      this.root.destroy(true);
    }
    this.root = null;
    this.content = null;
    this._hitZone = null;
    this._topFade = null;
    this._bottomFade = null;
    this._scrollbar = null;
  }
}

export default ScrollContainer;
