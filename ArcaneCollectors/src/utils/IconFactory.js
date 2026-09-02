/**
 * IconFactory.js - 프로시저럴 UI 아이콘 생성 유틸리티
 *
 * 두 개의 API 계층을 가진다.
 *
 * 1) 벡터 아이콘 (T-07, 권장)
 *      IconFactory.create(scene, 'gacha', 'lg', { tint: 0x06BBFA });   // → 텍스처 키
 *      IconFactory.createImage(scene, 'settings', 'md');               // → Phaser.GameObjects.Image
 *    기하는 `iconPaths.js`(Phaser 비의존 순수 모듈)에 정의되어 있고 이 클래스는 렌더링만 한다.
 *    메뉴 15 + 클래스 4 + 스탯 4 = 23종. MainMenuScene의 popupKey를 그대로 넣어도 별칭으로 해석된다.
 *
 * 2) 레거시 아이콘 (하위 호환, 기존 7종)
 *      IconFactory.createIcon(scene, 'sword', 32);
 *      IconFactory.createCurrencyIcon(scene, 'gold', 24);
 *      IconFactory.createStatIcon(scene, 'hp', 24);
 *    기존 호출부의 텍스처 키(`icon_{type}_{size}`)와 그림이 그대로 유지된다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프나 static 필드에서 즉시 평가하지 않는다.
 *       (씬 그래프 순환 import로 인한 부팅 TDZ 방지 — tests/e2e/boot-smoke.mjs 참고)
 */

import {
  ICON_SIZES,
  ICON_SIZE_TOKENS,
  DEFAULT_ICON_SIZE,
  PRELOAD_SIZES,
  ICON_KEYS,
  MENU_ICON_KEYS,
  EXTRA_MENU_ICON_KEYS,
  CLASS_ICON_KEYS,
  STAT_ICON_KEYS,
  REQUIRED_ICON_KEYS,
  DEFAULT_TINT,
  buildTextureKey,
  derivePalette,
  getIconShape,
  hasIcon,
  normalizeIconKey,
  resolveIconSize,
  scaleOps,
  strokeWidthFor
} from './iconPaths.js';

export class IconFactory {
  /**
   * 생성된 텍스처 키 캐시
   * @type {Set<string>}
   */
  static _cache = new Set();

  /**
   * 캐시 히트/미스 통계 (테스트·프로파일링용)
   * @type {{created: number, reused: number}}
   */
  static _stats = { created: 0, reused: 0 };

  // ==========================================================
  // 공개 상수 (하위 호환 + 신규)
  // ==========================================================

  /** 크기 프리셋 5단계 */
  static get SIZES() {
    return ICON_SIZES;
  }

  /** 크기 토큰 이름 배열 */
  static get SIZE_TOKENS() {
    return ICON_SIZE_TOKENS;
  }

  /** 정의된 벡터 아이콘 키 전체 */
  static get KEYS() {
    return ICON_KEYS;
  }

  /** T-07 요구 21종 */
  static get REQUIRED_KEYS() {
    return REQUIRED_ICON_KEYS;
  }

  /** 메뉴 아이콘 키 (플랜 13 + 실사용 2) */
  static get MENU_KEYS() {
    return [...MENU_ICON_KEYS, ...EXTRA_MENU_ICON_KEYS];
  }

  /** 클래스 아이콘 키 4종 */
  static get CLASS_KEYS() {
    return CLASS_ICON_KEYS;
  }

  /** 스탯 아이콘 키 4종 */
  static get STAT_KEYS() {
    return STAT_ICON_KEYS;
  }

  // ==========================================================
  // 1. 벡터 아이콘 (T-07)
  // ==========================================================

  /**
   * 벡터 아이콘 텍스처를 만들고 키를 돌려준다.
   * 같은 (key, size, tint, bg) 조합이면 텍스처를 다시 굽지 않는다.
   *
   * @param {Phaser.Scene} scene
   * @param {string} key - 아이콘 키 또는 별칭 (예: 'gacha', 'herolist', 'atk')
   * @param {string|number} [size] - 'xs'|'sm'|'md'|'lg'|'xl' 또는 픽셀 숫자
   * @param {object} [options]
   * @param {number} [options.tint] - 실루엣 기준색 (0xRRGGBB). 미지정 시 오프화이트
   * @param {boolean} [options.bg] - 원형 배경 사용 여부
   * @param {number} [options.bgColor] - 원형 배경 색 (기본: tint의 아주 어두운 파생색)
   * @param {number} [options.bgAlpha] - 원형 배경 알파 (기본 0.9)
   * @param {boolean} [options.stroke] - 외곽/내부 스트로크 사용 여부 (기본 true)
   * @returns {string|null} 텍스처 키. 정의 없는 키면 null
   */
  static create(scene, key, size = DEFAULT_ICON_SIZE, options = {}) {
    const canonical = normalizeIconKey(key);
    if (!canonical || !scene) return null;

    const tint = Number.isFinite(options.tint) ? options.tint : DEFAULT_TINT;
    const useBg = options.bg === true;
    const bgColor = Number.isFinite(options.bgColor) ? options.bgColor : null;

    const textureKey = buildTextureKey(canonical, size, {
      tint,
      bg: useBg,
      bgColor: bgColor === null ? 0 : bgColor
    });

    if (scene.textures && scene.textures.exists(textureKey)) {
      this._cache.add(textureKey);
      this._stats.reused++;
      return textureKey;
    }

    const px = resolveIconSize(size);
    const palette = derivePalette(tint);
    const ops = scaleOps(getIconShape(canonical), px);
    const lineWidth = strokeWidthFor(px);
    const drawStroke = options.stroke !== false;

    const g = scene.add.graphics();

    if (useBg) {
      const fill = bgColor === null ? palette.deep : bgColor;
      const alpha = Number.isFinite(options.bgAlpha) ? options.bgAlpha : 0.9;
      g.fillStyle(fill, alpha);
      g.fillCircle(px / 2, px / 2, px / 2);
    }

    ops.forEach((op) => this._drawOp(g, op, palette, lineWidth, drawStroke));

    g.generateTexture(textureKey, px, px);
    g.destroy();

    this._cache.add(textureKey);
    this._stats.created++;
    return textureKey;
  }

  /**
   * 벡터 아이콘 이미지를 씬에 바로 추가한다.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} key
   * @param {string|number} [size]
   * @param {object} [options] - create()와 동일
   * @returns {Phaser.GameObjects.Image|null}
   */
  static createImage(scene, x, y, key, size = DEFAULT_ICON_SIZE, options = {}) {
    const textureKey = this.create(scene, key, size, options);
    if (!textureKey) return null;
    return scene.add.image(x, y, textureKey).setOrigin(0.5);
  }

  /**
   * 해당 키의 벡터 아이콘이 있는가 (별칭 포함)
   * @param {string} key
   * @returns {boolean}
   */
  static has(key) {
    return hasIcon(key);
  }

  /**
   * 단일 드로우 커맨드를 Phaser Graphics에 그린다.
   * @private
   */
  static _drawOp(g, op, palette, lineWidth, drawStroke) {
    const fillColor = op.fill ? palette[op.fill] : null;
    const wantStroke = drawStroke && op.stroke !== false;

    switch (op.t) {
      case 'poly': {
        const points = op.p.map(([x, y]) => ({ x, y }));
        if (fillColor !== null) {
          g.fillStyle(fillColor, 1);
          g.fillPoints(points, true);
        }
        if (wantStroke) {
          g.lineStyle(lineWidth, palette.stroke, 1);
          g.strokePoints(points, true);
        }
        break;
      }

      case 'circle': {
        if (fillColor !== null) {
          g.fillStyle(fillColor, 1);
          g.fillCircle(op.x, op.y, op.r);
        }
        if (wantStroke) {
          g.lineStyle(lineWidth, palette.stroke, 1);
          g.strokeCircle(op.x, op.y, op.r);
        }
        break;
      }

      case 'ellipse': {
        if (fillColor !== null) {
          g.fillStyle(fillColor, 1);
          g.fillEllipse(op.x, op.y, op.w, op.h);
        }
        if (wantStroke) {
          g.lineStyle(lineWidth, palette.stroke, 1);
          g.strokeEllipse(op.x, op.y, op.w, op.h);
        }
        break;
      }

      case 'rect': {
        const rounded = op.r > 0.5;
        if (fillColor !== null) {
          g.fillStyle(fillColor, 1);
          if (rounded) g.fillRoundedRect(op.x, op.y, op.w, op.h, op.r);
          else g.fillRect(op.x, op.y, op.w, op.h);
        }
        if (wantStroke) {
          g.lineStyle(lineWidth, palette.stroke, 1);
          if (rounded) g.strokeRoundedRect(op.x, op.y, op.w, op.h, op.r);
          else g.strokeRect(op.x, op.y, op.w, op.h);
        }
        break;
      }

      case 'bar': {
        const [[x1, y1], [x2, y2]] = op.p;
        g.lineStyle(op.w, fillColor === null ? palette.base : fillColor, 1);
        g.lineBetween(x1, y1, x2, y2);
        break;
      }

      case 'arc': {
        g.lineStyle(op.w, fillColor === null ? palette.base : fillColor, 1);
        g.beginPath();
        g.arc(op.x, op.y, op.r, op.a0, op.a1, false);
        g.strokePath();
        break;
      }

      default:
        break;
    }
  }

  // ==========================================================
  // 2. 레거시 아이콘 (기존 7종 — 하위 호환)
  // ==========================================================

  /**
   * 아이콘 텍스처 생성 (캐시 확인 후 생성)
   * @param {Phaser.Scene} scene
   * @param {string} type - 'sword'|'shield'|'heart'|'star'|'coin'|'gem'|'energy'
   * @param {number} size - 아이콘 크기 (기본 32)
   * @returns {string} 텍스처 키
   */
  static createIcon(scene, type, size = 32) {
    const key = `icon_${type}_${size}`;

    // 이미 캐시된 텍스처면 리턴
    if (scene.textures.exists(key)) {
      this._stats.reused++;
      return key;
    }

    const graphics = scene.add.graphics();
    const half = size / 2;

    switch (type) {
      case 'sword':
        this._drawSword(graphics, half);
        break;
      case 'shield':
        this._drawShield(graphics, half);
        break;
      case 'heart':
        this._drawHeart(graphics, half);
        break;
      case 'star':
        this._drawStar(graphics, half);
        break;
      case 'coin':
        this._drawCoin(graphics, half);
        break;
      case 'gem':
        this._drawGem(graphics, half);
        break;
      case 'energy':
        this._drawEnergy(graphics, half);
        break;
      default:
        // 기본: 원
        graphics.fillStyle(0x94a3b8, 1);
        graphics.fillCircle(half, half, half - 2);
    }

    // 텍스처 생성
    graphics.generateTexture(key, size, size);
    graphics.destroy();

    this._cache.add(key);
    this._stats.created++;
    return key;
  }

  /**
   * ART-2.3: 검 아이콘 강화 (그라데이션 + 빛 효과)
   */
  static _drawSword(graphics, half) {
    const color = 0xef4444; // 빨강

    // 칼날 (메인)
    graphics.fillStyle(color, 1);
    graphics.fillTriangle(half, half * 0.25, half - 4, half * 1.35, half + 4, half * 1.35);

    // 칼날 하이라이트
    graphics.fillStyle(0xff6b6b, 0.8);
    graphics.fillTriangle(half, half * 0.25, half - 2, half * 0.9, half + 2, half * 0.9);

    // 손잡이 (어두운 회색)
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(half - 6, half * 1.35, 12, half * 0.55);

    // 손잡이 감싼 부분 (골드 힌트)
    graphics.fillStyle(0xd97706, 1);
    graphics.fillRect(half - 6, half * 1.4, 12, 2);
    graphics.fillRect(half - 6, half * 1.65, 12, 2);

    // 가드 (크로스 가드)
    graphics.fillStyle(0x64748b, 1);
    graphics.fillRect(half - 10, half * 1.3, 20, 4);

    // 빛나는 효과 (중앙선)
    graphics.lineStyle(2, 0xffffff, 0.7);
    graphics.lineBetween(half - 1.5, half * 0.35, half - 1.5, half * 1.2);

    // 빛 반짝임 (3개 점)
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(half - 1, half * 0.5, 1.5);
    graphics.fillCircle(half - 1, half * 0.75, 1.5);
    graphics.fillCircle(half - 1, half * 1.0, 1.5);
  }

  /**
   * 방패 아이콘 (방어력)
   */
  static _drawShield(graphics, half) {
    const color = 0x3b82f6; // 파랑

    // 방패 외곽 (육각형)
    graphics.fillStyle(color, 1);
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      points.push({
        x: half + Math.cos(angle) * (half - 4),
        y: half + Math.sin(angle) * (half - 4)
      });
    }
    graphics.fillPoints(points, true);

    // 내부 하이라이트
    graphics.fillStyle(0xffffff, 0.3);
    graphics.fillCircle(half, half - 4, half * 0.5);

    // 테두리
    graphics.lineStyle(2, 0x1e40af, 1);
    graphics.strokePoints(points, true);
  }

  /**
   * 하트 아이콘 (HP)
   */
  static _drawHeart(graphics, half) {
    const color = 0x10b981; // 초록

    graphics.fillStyle(color, 1);

    // 하트 모양 (2개 원 + 삼각형)
    const r = half * 0.4;
    graphics.fillCircle(half - r * 0.7, half - r * 0.5, r);
    graphics.fillCircle(half + r * 0.7, half - r * 0.5, r);
    graphics.fillTriangle(
      half - r * 1.3,
      half - r * 0.2,
      half + r * 1.3,
      half - r * 0.2,
      half,
      half + r * 1.5
    );

    // 빛 효과
    graphics.fillStyle(0xffffff, 0.4);
    graphics.fillCircle(half - r * 0.3, half - r * 0.7, r * 0.5);
  }

  /**
   * 별 아이콘 (경험치)
   */
  static _drawStar(graphics, half) {
    const color = 0xf59e0b; // 골드

    graphics.fillStyle(color, 1);

    // 5각 별
    const points = [];
    for (let i = 0; i < 5; i++) {
      const outerAngle = ((Math.PI * 2) / 5) * i - Math.PI / 2;
      const innerAngle = outerAngle + Math.PI / 5;

      points.push({
        x: half + Math.cos(outerAngle) * (half - 3),
        y: half + Math.sin(outerAngle) * (half - 3)
      });
      points.push({
        x: half + Math.cos(innerAngle) * (half - 3) * 0.4,
        y: half + Math.sin(innerAngle) * (half - 3) * 0.4
      });
    }
    graphics.fillPoints(points, true);

    // 테두리
    graphics.lineStyle(1, 0xd97706, 1);
    graphics.strokePoints(points, true);

    // 중앙 빛
    graphics.fillStyle(0xffffff, 0.5);
    graphics.fillCircle(half, half, half * 0.3);
  }

  /**
   * ART-2.3: 동전 아이콘 강화 (입체감 + 엠보싱)
   */
  static _drawCoin(graphics, half) {
    const color = 0xf59e0b; // 골드

    // 그림자 (하단)
    graphics.fillStyle(0x000000, 0.25);
    graphics.fillEllipse(half + 1, half + 2, half - 1, half * 0.8);

    // 동전 외곽 (어두운 테두리)
    graphics.fillStyle(0xb45309, 1);
    graphics.fillCircle(half, half, half - 1);

    // 동전 메인
    graphics.fillStyle(color, 1);
    graphics.fillCircle(half, half, half - 3);

    // 내부 링 (엠보싱)
    graphics.lineStyle(2, 0xd97706, 1);
    graphics.strokeCircle(half, half, half - 6);
    graphics.lineStyle(1, 0xfbbf24, 0.8);
    graphics.strokeCircle(half, half, half - 8);

    // 중앙 심볼 (G 문자)
    graphics.fillStyle(0xd97706, 1);
    graphics.beginPath();
    graphics.arc(half, half, half * 0.35, 0, Math.PI * 1.5);
    graphics.lineTo(half + half * 0.35, half);
    graphics.closePath();
    graphics.fillPath();
    graphics.fillRect(half - half * 0.15, half - half * 0.05, half * 0.5, half * 0.1);

    // 하이라이트 (좌상단)
    graphics.fillStyle(0xffffff, 0.5);
    graphics.fillCircle(half - half * 0.35, half - half * 0.35, half * 0.35);

    // 빛 반사 (우상단 작은 점)
    graphics.fillStyle(0xffffff, 0.8);
    graphics.fillCircle(half - half * 0.2, half - half * 0.25, half * 0.15);
  }

  /**
   * 보석 아이콘 (젬)
   */
  static _drawGem(graphics, half) {
    const color = 0xec4899; // 핑크

    graphics.fillStyle(color, 1);

    // 다이아몬드 형태
    graphics.fillTriangle(half, half * 0.3, half - half * 0.6, half, half, half * 1.7);
    graphics.fillTriangle(half, half * 0.3, half + half * 0.6, half, half, half * 1.7);

    // 상단 패싯
    graphics.fillStyle(0xffffff, 0.6);
    graphics.fillTriangle(
      half,
      half * 0.3,
      half - half * 0.3,
      half * 0.6,
      half + half * 0.3,
      half * 0.6
    );

    // 테두리
    graphics.lineStyle(1, 0xdb2777, 1);
    graphics.strokeTriangle(half, half * 0.3, half - half * 0.6, half, half, half * 1.7);
    graphics.strokeTriangle(half, half * 0.3, half + half * 0.6, half, half, half * 1.7);
  }

  /**
   * 에너지 번개 아이콘
   */
  static _drawEnergy(graphics, half) {
    const color = 0x10b981; // 초록

    graphics.fillStyle(color, 1);

    // 번개 모양
    const points = [
      { x: half + half * 0.2, y: half * 0.2 },
      { x: half - half * 0.2, y: half },
      { x: half + half * 0.1, y: half },
      { x: half - half * 0.2, y: half * 1.8 },
      { x: half + half * 0.5, y: half * 0.9 },
      { x: half + half * 0.2, y: half * 0.9 }
    ];
    graphics.fillPoints(points, true);

    // 글로우 효과
    graphics.fillStyle(0xffffff, 0.4);
    graphics.fillPoints(
      [
        { x: half + half * 0.15, y: half * 0.3 },
        { x: half - half * 0.1, y: half * 0.9 },
        { x: half + half * 0.05, y: half * 0.9 }
      ],
      true
    );
  }

  /**
   * 재화 아이콘 생성 단축 메서드
   * @param {Phaser.Scene} scene
   * @param {string} currency - 'gold'|'gem'|'energy'
   * @param {number} size
   * @returns {string} 텍스처 키
   */
  static createCurrencyIcon(scene, currency, size = 32) {
    const typeMap = {
      gold: 'coin',
      gem: 'gem',
      energy: 'energy'
    };
    return this.createIcon(scene, typeMap[currency] || 'coin', size);
  }

  /**
   * 스탯 아이콘 생성 단축 메서드 (레거시 그림 유지)
   *
   * 신규 벡터 스탯 아이콘이 필요하면 `IconFactory.create(scene, 'hp', 'md')`를 쓴다.
   * @param {Phaser.Scene} scene
   * @param {string} stat - 'hp'|'atk'|'def'|'spd'
   * @param {number} size
   * @returns {string} 텍스처 키
   */
  static createStatIcon(scene, stat, size = 32) {
    const typeMap = {
      hp: 'heart',
      atk: 'sword',
      def: 'shield',
      spd: 'star'
    };
    return this.createIcon(scene, typeMap[stat] || 'star', size);
  }

  // ==========================================================
  // 3. 프리로드 · 캐시
  // ==========================================================

  /**
   * 모든 기본 아이콘 프리로드 (PreloadScene에서 호출)
   * 레거시 7종 + 벡터 전체를 지정 크기로 굽는다.
   * @param {Phaser.Scene} scene
   * @param {number[]} sizes - 레거시 아이콘 크기 배열 (기본 [24, 32, 48])
   * @param {object} [options]
   * @param {Array<string|number>} [options.vectorSizes] - 벡터 아이콘 크기 (기본 ['sm','md','lg'])
   * @param {number} [options.tint] - 벡터 아이콘 tint
   */
  static preloadAllIcons(scene, sizes = [24, 32, 48], options = {}) {
    const types = ['sword', 'shield', 'heart', 'star', 'coin', 'gem', 'energy'];

    types.forEach((type) => {
      sizes.forEach((size) => {
        this.createIcon(scene, type, size);
      });
    });

    const vectorSizes = options.vectorSizes || PRELOAD_SIZES;
    const tint = options.tint;
    ICON_KEYS.forEach((key) => {
      vectorSizes.forEach((size) => {
        this.create(scene, key, size, Number.isFinite(tint) ? { tint } : {});
      });
    });
  }

  /**
   * 캐시 초기화 (텍스처는 지우지 않는다 — 씬 재시작 시 textures.exists가 SSOT)
   */
  static clearCache() {
    this._cache.clear();
    this._stats = { created: 0, reused: 0 };
  }
}

export default IconFactory;
