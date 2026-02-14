/**
 * IconFactory.js - 프로시저럴 UI 아이콘 생성 유틸리티
 * Canvas로 렌더링된 아이콘 텍스처 생성 및 캐시
 *
 * 사용법:
 *   import { IconFactory } from '../utils/IconFactory.js';
 *   IconFactory.createIcon(scene, 'sword', 32);
 *   IconFactory.createCurrencyIcon(scene, 'gold', 24);
 */

import { COLORS } from '../config/gameConfig.js';

export class IconFactory {
  /**
   * 텍스처 캐시 (scene별로 한 번만 생성)
   * @type {Set<string>}
   */
  static _cache = new Set();

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
      return key;
    }

    const graphics = scene.add.graphics();
    const half = size / 2;

    switch (type) {
      case 'sword':
        this._drawSword(graphics, half, size);
        break;
      case 'shield':
        this._drawShield(graphics, half, size);
        break;
      case 'heart':
        this._drawHeart(graphics, half, size);
        break;
      case 'star':
        this._drawStar(graphics, half, size);
        break;
      case 'coin':
        this._drawCoin(graphics, half, size);
        break;
      case 'gem':
        this._drawGem(graphics, half, size);
        break;
      case 'energy':
        this._drawEnergy(graphics, half, size);
        break;
      default:
        // 기본: 원
        graphics.fillStyle(0x94A3B8, 1);
        graphics.fillCircle(half, half, half - 2);
    }

    // 텍스처 생성
    graphics.generateTexture(key, size, size);
    graphics.destroy();

    this._cache.add(key);
    return key;
  }

  /**
   * ART-2.3: 검 아이콘 강화 (그라데이션 + 빛 효과)
   */
  static _drawSword(graphics, half, size) {
    const color = 0xEF4444; // 빨강

    // 칼날 (메인)
    graphics.fillStyle(color, 1);
    graphics.fillTriangle(
      half, half * 0.25,
      half - 4, half * 1.35,
      half + 4, half * 1.35
    );

    // 칼날 하이라이트
    graphics.fillStyle(0xFF6B6B, 0.8);
    graphics.fillTriangle(
      half, half * 0.25,
      half - 2, half * 0.9,
      half + 2, half * 0.9
    );

    // 손잡이 (어두운 회색)
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(half - 6, half * 1.35, 12, half * 0.55);

    // 손잡이 감싼 부분 (골드 힌트)
    graphics.fillStyle(0xD97706, 1);
    graphics.fillRect(half - 6, half * 1.4, 12, 2);
    graphics.fillRect(half - 6, half * 1.65, 12, 2);

    // 가드 (크로스 가드)
    graphics.fillStyle(0x64748B, 1);
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
  static _drawShield(graphics, half, size) {
    const color = 0x3B82F6; // 파랑

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
    graphics.lineStyle(2, 0x1E40AF, 1);
    graphics.strokePoints(points, true);
  }

  /**
   * 하트 아이콘 (HP)
   */
  static _drawHeart(graphics, half, size) {
    const color = 0x10B981; // 초록

    graphics.fillStyle(color, 1);

    // 하트 모양 (2개 원 + 삼각형)
    const r = half * 0.4;
    graphics.fillCircle(half - r * 0.7, half - r * 0.5, r);
    graphics.fillCircle(half + r * 0.7, half - r * 0.5, r);
    graphics.fillTriangle(
      half - r * 1.3, half - r * 0.2,
      half + r * 1.3, half - r * 0.2,
      half, half + r * 1.5
    );

    // 빛 효과
    graphics.fillStyle(0xffffff, 0.4);
    graphics.fillCircle(half - r * 0.3, half - r * 0.7, r * 0.5);
  }

  /**
   * 별 아이콘 (경험치)
   */
  static _drawStar(graphics, half, size) {
    const color = 0xF59E0B; // 골드

    graphics.fillStyle(color, 1);

    // 5각 별
    const points = [];
    for (let i = 0; i < 5; i++) {
      const outerAngle = (Math.PI * 2 / 5) * i - Math.PI / 2;
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
    graphics.lineStyle(1, 0xD97706, 1);
    graphics.strokePoints(points, true);

    // 중앙 빛
    graphics.fillStyle(0xffffff, 0.5);
    graphics.fillCircle(half, half, half * 0.3);
  }

  /**
   * ART-2.3: 동전 아이콘 강화 (입체감 + 엠보싱)
   */
  static _drawCoin(graphics, half, size) {
    const color = 0xF59E0B; // 골드

    // 그림자 (하단)
    graphics.fillStyle(0x000000, 0.25);
    graphics.fillEllipse(half + 1, half + 2, half - 1, half * 0.8);

    // 동전 외곽 (어두운 테두리)
    graphics.fillStyle(0xB45309, 1);
    graphics.fillCircle(half, half, half - 1);

    // 동전 메인
    graphics.fillStyle(color, 1);
    graphics.fillCircle(half, half, half - 3);

    // 내부 링 (엠보싱)
    graphics.lineStyle(2, 0xD97706, 1);
    graphics.strokeCircle(half, half, half - 6);
    graphics.lineStyle(1, 0xFBBF24, 0.8);
    graphics.strokeCircle(half, half, half - 8);

    // 중앙 심볼 (G 문자)
    graphics.fillStyle(0xD97706, 1);
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
  static _drawGem(graphics, half, size) {
    const color = 0xEC4899; // 핑크

    graphics.fillStyle(color, 1);

    // 다이아몬드 형태
    graphics.fillTriangle(
      half, half * 0.3,
      half - half * 0.6, half,
      half, half * 1.7
    );
    graphics.fillTriangle(
      half, half * 0.3,
      half + half * 0.6, half,
      half, half * 1.7
    );

    // 상단 패싯
    graphics.fillStyle(0xffffff, 0.6);
    graphics.fillTriangle(
      half, half * 0.3,
      half - half * 0.3, half * 0.6,
      half + half * 0.3, half * 0.6
    );

    // 테두리
    graphics.lineStyle(1, 0xDB2777, 1);
    graphics.strokeTriangle(
      half, half * 0.3,
      half - half * 0.6, half,
      half, half * 1.7
    );
    graphics.strokeTriangle(
      half, half * 0.3,
      half + half * 0.6, half,
      half, half * 1.7
    );
  }

  /**
   * 에너지 번개 아이콘
   */
  static _drawEnergy(graphics, half, size) {
    const color = 0x10B981; // 초록

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
    graphics.fillPoints([
      { x: half + half * 0.15, y: half * 0.3 },
      { x: half - half * 0.1, y: half * 0.9 },
      { x: half + half * 0.05, y: half * 0.9 }
    ], true);
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
   * 스탯 아이콘 생성 단축 메서드
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

  /**
   * 모든 기본 아이콘 프리로드 (PreloadScene에서 호출)
   * @param {Phaser.Scene} scene
   * @param {number[]} sizes - 생성할 크기 배열 (기본 [24, 32, 48])
   */
  static preloadAllIcons(scene, sizes = [24, 32, 48]) {
    const types = ['sword', 'shield', 'heart', 'star', 'coin', 'gem', 'energy'];

    types.forEach(type => {
      sizes.forEach(size => {
        this.createIcon(scene, type, size);
      });
    });
  }

  /**
   * 캐시 초기화
   */
  static clearCache() {
    this._cache.clear();
  }
}
