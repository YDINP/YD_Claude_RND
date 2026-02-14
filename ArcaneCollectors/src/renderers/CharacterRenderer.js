/**
 * CharacterRenderer.js - 캐릭터 렌더링 추상화 레이어
 * 에셋(이미지) / 코드(캔버스) 렌더링 자동 전환
 *
 * 사용법:
 *   import characterRenderer from '../renderers/CharacterRenderer.js';
 *   const container = characterRenderer.renderThumbnail(scene, x, y, hero);
 *   const card = characterRenderer.renderCard(scene, x, y, hero);
 *   const sprite = characterRenderer.renderBattleSprite(scene, x, y, hero);
 *   const portrait = characterRenderer.renderPortrait(scene, x, y, hero);
 */

import { COLORS, MOODS, CULT_COLORS, RARITY } from '../config/gameConfig.js';
import { getRarityKey } from '../utils/helpers.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';

// 에셋 경로 매핑
const ASSET_PATHS = {
  thumbnail: 'assets/characters/thumbnails/',
  card: 'assets/characters/cards/',
  battle: 'assets/characters/battle/',
  portrait: 'assets/characters/portraits/'
};

// 렌더링 사이즈
const RENDER_SIZES = {
  thumbnail: { width: 80, height: 80 },
  card: { width: 200, height: 280 },
  battle: { width: 120, height: 120 },
  portrait: { width: 64, height: 64 }
};

class CharacterRenderer {
  constructor() {
    /** @type {boolean} 에셋/코드 전환 플래그 */
    this.useAssets = false;

    /** @type {Map<string, boolean>} 텍스처 존재 캐시 */
    this._textureCache = new Map();
  }

  /**
   * 에셋 사용 모드 설정
   * @param {boolean} enabled
   */
  setUseAssets(enabled) {
    this.useAssets = enabled;
    this._textureCache.clear();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 썸네일 렌더링 (80x80) - 그리드 목록용
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} hero - 영웅 데이터
   * @returns {Phaser.GameObjects.Container}
   */
  renderThumbnail(scene, x, y, hero) {
    const size = RENDER_SIZES.thumbnail;
    const textureKey = this._getTextureKey(hero, 'thumbnail');

    return this._renderWithFallback(scene, x, y, textureKey, size, () => {
      return this._codeThumbnail(scene, x, y, hero, size);
    });
  }

  /**
   * 카드 렌더링 (200x280) - 상세/가차 연출용
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} hero
   * @returns {Phaser.GameObjects.Container}
   */
  renderCard(scene, x, y, hero) {
    const size = RENDER_SIZES.card;
    const textureKey = this._getTextureKey(hero, 'card');

    return this._renderWithFallback(scene, x, y, textureKey, size, () => {
      return this._codeCard(scene, x, y, hero, size);
    });
  }

  /**
   * 전투 스프라이트 렌더링 (120x120)
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} hero
   * @returns {Phaser.GameObjects.Container}
   */
  renderBattleSprite(scene, x, y, hero) {
    const size = RENDER_SIZES.battle;
    const textureKey = this._getTextureKey(hero, 'battle');

    return this._renderWithFallback(scene, x, y, textureKey, size, () => {
      return this._codeBattleSprite(scene, x, y, hero, size);
    });
  }

  /**
   * 포트레이트 렌더링 (64x64) - 턴 순서/미니 아이콘용
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} hero
   * @returns {Phaser.GameObjects.Container}
   */
  renderPortrait(scene, x, y, hero) {
    const size = RENDER_SIZES.portrait;
    const textureKey = this._getTextureKey(hero, 'portrait');

    return this._renderWithFallback(scene, x, y, textureKey, size, () => {
      return this._codePortrait(scene, x, y, hero, size);
    });
  }

  // ============================================
  // Internal: Fallback Logic
  // ============================================

  /**
   * 에셋 존재 시 이미지, 없으면 코드 렌더링으로 폴백
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} textureKey
   * @param {{width: number, height: number}} size
   * @param {Function} codeFallback - 코드 렌더링 함수
   * @returns {Phaser.GameObjects.Container}
   */
  _renderWithFallback(scene, x, y, textureKey, size, codeFallback) {
    if (this.useAssets && this._textureExists(scene, textureKey)) {
      // 에셋 이미지 렌더링
      const container = scene.add.container(x, y);
      const image = scene.add.image(0, 0, textureKey);
      image.setDisplaySize(size.width, size.height);
      container.add(image);
      container.setSize(size.width, size.height);
      return container;
    }

    // 코드 폴백 렌더링
    return codeFallback();
  }

  /**
   * 텍스처 존재 확인 (캐시)
   * @param {Phaser.Scene} scene
   * @param {string} key
   * @returns {boolean}
   */
  _textureExists(scene, key) {
    if (this._textureCache.has(key)) {
      return this._textureCache.get(key);
    }
    const exists = scene.textures.exists(key);
    this._textureCache.set(key, exists);
    return exists;
  }

  /**
   * 텍스처 키 생성
   * @param {Object} hero
   * @param {string} type - 'thumbnail' | 'card' | 'battle' | 'portrait'
   * @returns {string}
   */
  _getTextureKey(hero, type) {
    return `${type}_${hero.id}`;
  }

  // ============================================
  // Internal: Code Rendering (폴백용)
  // ============================================

  /**
   * 코드 기반 썸네일 (80x80)
   */
  _codeThumbnail(scene, x, y, hero, size) {
    const container = scene.add.container(x, y);
    const { width, height } = size;
    const halfW = width / 2;
    const halfH = height / 2;

    const rKey = getRarityKey(hero.rarity);
    const rarityConfig = RARITY[rKey] || RARITY.N;
    const cultColor = CULT_COLORS[hero.cult] || 0x666666;
    const moodConfig = MOODS[hero.mood];

    // ART-1.3: 등급별 배경 레이어
    const bg = scene.add.graphics();

    // 교단 색상 베이스
    bg.fillStyle(cultColor, 0.15);
    bg.fillRoundedRect(-halfW, -halfH, width, height, 6);

    // 분위기(Mood) 색상 오버레이
    if (moodConfig) {
      bg.fillStyle(moodConfig.color, 0.08);
      bg.fillRoundedRect(-halfW, -halfH, width, height, 6);
    }

    // 메인 배경
    bg.fillStyle(COLORS.backgroundLight, 0.85);
    bg.fillRoundedRect(-halfW, -halfH, width, height, 6);
    container.add(bg);

    // HeroAssetLoader 플레이스홀더 사용 (이미 생성된 텍스처)
    const heroTextureKey = HeroAssetLoader.getTextureKey(hero);
    if (scene.textures.exists(heroTextureKey)) {
      const portrait = scene.add.image(0, 0, heroTextureKey);
      portrait.setDisplaySize(width - 8, height - 8);
      container.add(portrait);
    } else {
      // ART-1.3: 직업별 실루엣 폴백
      this._drawClassSilhouette(scene, container, hero.class, width * 0.5);
    }

    // 분위기 아이콘 (우상단)
    if (moodConfig) {
      const moodDot = scene.add.graphics();
      const dotX = halfW - 10;
      const dotY = -halfH + 10;
      moodDot.fillStyle(0x000000, 0.5);
      moodDot.fillCircle(dotX, dotY, 8);
      moodDot.fillStyle(moodConfig.color, 1);
      moodDot.fillCircle(dotX, dotY, 6);
      container.add(moodDot);
    }

    // ART-1.3: 등급 프레임 강화
    this._drawRarityFrame(scene, container, rKey, width, height, halfW, halfH);

    container.setSize(width, height);
    return container;
  }

  /**
   * 코드 기반 카드 (200x280)
   */
  _codeCard(scene, x, y, hero, size) {
    const container = scene.add.container(x, y);
    const { width, height } = size;
    const halfW = width / 2;
    const halfH = height / 2;

    const rKey = getRarityKey(hero.rarity);
    const rarityConfig = RARITY[rKey] || RARITY.N;
    const cultColor = CULT_COLORS[hero.cult] || 0x666666;
    const moodConfig = MOODS[hero.mood];

    // 카드 배경
    const bg = scene.add.graphics();

    // 교단색 그라데이션 효과 (하단)
    bg.fillStyle(cultColor, 0.15);
    bg.fillRoundedRect(-halfW, -halfH, width, height, 12);

    // 메인 배경
    bg.fillStyle(COLORS.backgroundLight, 0.92);
    bg.fillRoundedRect(-halfW, -halfH, width, height, 12);

    // 상단 하이라이트
    bg.fillStyle(0xffffff, 0.06);
    bg.fillRoundedRect(-halfW, -halfH, width, height * 0.35,
      { tl: 12, tr: 12, bl: 0, br: 0 });

    // 하단 교단색 힌트
    bg.fillStyle(cultColor, 0.2);
    bg.fillRoundedRect(-halfW, halfH - height * 0.2, width, height * 0.2,
      { tl: 0, tr: 0, bl: 12, br: 12 });

    container.add(bg);

    // 캐릭터 이미지 영역
    const portraitH = height * 0.55;
    const portraitY = -halfH + 20 + portraitH / 2;

    const heroTextureKey = HeroAssetLoader.getTextureKey(hero);
    if (scene.textures.exists(heroTextureKey)) {
      const portrait = scene.add.image(0, portraitY, heroTextureKey);
      portrait.setDisplaySize(width - 30, portraitH);
      container.add(portrait);
    } else {
      const initial = hero.name ? hero.name.charAt(0) : '?';
      const text = scene.add.text(0, portraitY, initial, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '56px',
        fontStyle: 'bold',
        color: '#64748B'
      }).setOrigin(0.5);
      container.add(text);
    }

    // 이름
    const nameY = halfH - 55;
    const name = scene.add.text(0, nameY, hero.name || '???', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#E2E8F0'
    }).setOrigin(0.5);
    container.add(name);

    // 등급 배지
    const rarityBadgeY = nameY + 22;
    const rarityBg = scene.add.graphics();
    rarityBg.fillStyle(rarityConfig.color, 0.8);
    rarityBg.fillRoundedRect(-22, rarityBadgeY - 10, 44, 20, 4);
    container.add(rarityBg);

    const rarityText = scene.add.text(0, rarityBadgeY, rKey, {
      fontFamily: 'Arial',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);
    container.add(rarityText);

    // 분위기 아이콘 (우상단)
    if (moodConfig) {
      const moodDot = scene.add.graphics();
      const dotX = halfW - 16;
      const dotY = -halfH + 16;
      moodDot.fillStyle(0x000000, 0.5);
      moodDot.fillCircle(dotX, dotY, 12);
      moodDot.fillStyle(moodConfig.color, 1);
      moodDot.fillCircle(dotX, dotY, 10);
      container.add(moodDot);
    }

    // 테두리
    const borderWidth = rKey === 'SSR' ? 4 : (rKey === 'SR' ? 3 : 2);
    const border = scene.add.graphics();
    border.lineStyle(borderWidth, rarityConfig.color, 1);
    border.strokeRoundedRect(-halfW, -halfH, width, height, 12);
    container.add(border);

    // SSR/SR 글로우
    if (rKey === 'SSR' || rKey === 'SR') {
      const glow = scene.add.graphics();
      glow.fillStyle(rarityConfig.color, 0.15);
      glow.fillRoundedRect(-halfW - 4, -halfH - 4, width + 8, height + 8, 14);
      container.add(glow);
      container.sendToBack(glow);
    }

    container.setSize(width, height);
    return container;
  }

  /**
   * 코드 기반 전투 스프라이트 (120x120)
   */
  _codeBattleSprite(scene, x, y, hero, size) {
    const container = scene.add.container(x, y);
    const { width, height } = size;
    const halfW = width / 2;
    const halfH = height / 2;

    const rKey = getRarityKey(hero.rarity);
    const rarityConfig = RARITY[rKey] || RARITY.N;
    const cultColor = CULT_COLORS[hero.cult] || 0x666666;
    const moodConfig = MOODS[hero.mood];

    // 배경 원형
    const bg = scene.add.graphics();
    bg.fillStyle(cultColor, 0.15);
    bg.fillCircle(0, 0, halfW);
    bg.fillStyle(COLORS.backgroundLight, 0.8);
    bg.fillCircle(0, 0, halfW - 2);
    container.add(bg);

    // 캐릭터 이미지
    const heroTextureKey = HeroAssetLoader.getTextureKey(hero);
    if (scene.textures.exists(heroTextureKey)) {
      const portrait = scene.add.image(0, 0, heroTextureKey);
      portrait.setDisplaySize(width - 20, height - 20);
      container.add(portrait);
    } else {
      // 클래스 심볼 + 이니셜
      const classSymbols = { warrior: '\u2694', mage: '\u2726', healer: '\u271A', archer: '\u27B6' };
      const symbol = classSymbols[hero.class] || '?';
      const symbolText = scene.add.text(0, -10, symbol, {
        fontSize: '28px',
        color: '#94A3B8'
      }).setOrigin(0.5);
      container.add(symbolText);

      const initial = hero.name ? hero.name.charAt(0) : '?';
      const nameText = scene.add.text(0, 18, initial, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#E2E8F0'
      }).setOrigin(0.5);
      container.add(nameText);
    }

    // 분위기 링
    if (moodConfig) {
      const ring = scene.add.graphics();
      ring.lineStyle(3, moodConfig.color, 0.6);
      ring.strokeCircle(0, 0, halfW - 1);
      container.add(ring);
    }

    // 등급 테두리
    const border = scene.add.graphics();
    border.lineStyle(2, rarityConfig.color, 0.8);
    border.strokeCircle(0, 0, halfW);
    container.add(border);

    container.setSize(width, height);
    return container;
  }

  /**
   * 코드 기반 포트레이트 (64x64)
   */
  _codePortrait(scene, x, y, hero, size) {
    const container = scene.add.container(x, y);
    const { width, height } = size;
    const halfW = width / 2;

    const rKey = getRarityKey(hero.rarity);
    const rarityConfig = RARITY[rKey] || RARITY.N;
    const cultColor = CULT_COLORS[hero.cult] || 0x666666;

    // 배경 원
    const bg = scene.add.graphics();
    bg.fillStyle(cultColor, 0.3);
    bg.fillCircle(0, 0, halfW);
    bg.fillStyle(COLORS.background, 0.8);
    bg.fillCircle(0, 0, halfW - 2);
    container.add(bg);

    // 캐릭터 이미지
    const heroTextureKey = HeroAssetLoader.getTextureKey(hero);
    if (scene.textures.exists(heroTextureKey)) {
      const portrait = scene.add.image(0, 0, heroTextureKey);
      portrait.setDisplaySize(width - 8, height - 8);
      container.add(portrait);
    } else {
      const initial = hero.name ? hero.name.charAt(0) : '?';
      const text = scene.add.text(0, 0, initial, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#94A3B8'
      }).setOrigin(0.5);
      container.add(text);
    }

    // 등급 테두리
    const border = scene.add.graphics();
    border.lineStyle(2, rarityConfig.color, 0.8);
    border.strokeCircle(0, 0, halfW);
    container.add(border);

    container.setSize(width, height);
    return container;
  }

  /**
   * 텍스처 캐시 초기화
   */
  clearCache() {
    this._textureCache.clear();
  }

  // ============================================
  // ART-1.3: 강화 렌더링 헬퍼 (직업별 실루엣 + 등급 프레임)
  // ============================================

  /**
   * 직업별 실루엣 그리기
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} container
   * @param {string} heroClass - 'warrior'|'mage'|'healer'|'archer'
   * @param {number} size - 아이콘 크기
   */
  _drawClassSilhouette(scene, container, heroClass, size) {
    const graphics = scene.add.graphics();
    const classColors = {
      warrior: 0xEF4444, // 빨강
      mage: 0x8B5CF6,    // 보라
      healer: 0x10B981,  // 초록
      archer: 0x3B82F6   // 파랑
    };
    const color = classColors[heroClass] || 0x94A3B8;

    graphics.fillStyle(color, 0.6);

    switch (heroClass) {
      case 'warrior':
        // 검 실루엣
        graphics.fillTriangle(0, -size * 0.4, -size * 0.15, size * 0.3, size * 0.15, size * 0.3);
        graphics.fillRect(-size * 0.2, size * 0.3, size * 0.4, size * 0.2); // 손잡이
        break;
      case 'mage':
        // 지팡이 실루엣
        graphics.fillRect(-size * 0.05, -size * 0.5, size * 0.1, size * 0.8);
        graphics.fillCircle(0, -size * 0.5, size * 0.2); // 보석
        break;
      case 'healer':
        // 십자가 실루엣
        graphics.fillRect(-size * 0.3, -size * 0.08, size * 0.6, size * 0.16);
        graphics.fillRect(-size * 0.08, -size * 0.4, size * 0.16, size * 0.8);
        break;
      case 'archer':
        // 활 실루엣
        graphics.lineStyle(size * 0.1, color, 1);
        graphics.arc(0, 0, size * 0.3, -Math.PI * 0.7, Math.PI * 0.7);
        graphics.lineBetween(-size * 0.2, -size * 0.25, -size * 0.2, size * 0.25);
        break;
      default:
        // 기본: 물음표
        graphics.fillCircle(0, -size * 0.2, size * 0.3);
        graphics.fillRect(-size * 0.1, 0, size * 0.2, size * 0.3);
    }

    container.add(graphics);
  }

  /**
   * 등급별 프레임 그리기 (강화 버전)
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} container
   * @param {string} rKey - 'N'|'R'|'SR'|'SSR'|'UR'
   * @param {number} width
   * @param {number} height
   * @param {number} halfW
   * @param {number} halfH
   */
  _drawRarityFrame(scene, container, rKey, width, height, halfW, halfH) {
    const rarityConfig = RARITY[rKey] || RARITY.N;

    // SSR/UR 글로우 효과
    if (rKey === 'SSR' || rKey === 'UR') {
      const glow = scene.add.graphics();
      glow.fillStyle(rarityConfig.color, 0.2);
      glow.fillRoundedRect(-halfW - 3, -halfH - 3, width + 6, height + 6, 8);
      container.add(glow);
      container.sendToBack(glow);

      // 빛나는 파티클 (4개)
      for (let i = 0; i < 4; i++) {
        const particle = scene.add.circle(
          Phaser.Math.Between(-halfW, halfW),
          Phaser.Math.Between(-halfH, halfH),
          2,
          rarityConfig.color,
          0.6
        );
        container.add(particle);
        scene.tweens.add({
          targets: particle,
          alpha: 0,
          y: particle.y - 20,
          duration: 1500,
          repeat: -1,
          delay: i * 375
        });
      }
    }

    // 테두리
    const borderWidth = rKey === 'SSR' ? 3 : (rKey === 'SR' ? 2 : (rKey === 'UR' ? 4 : 1));
    const border = scene.add.graphics();
    border.lineStyle(borderWidth, rarityConfig.color, 1);
    border.strokeRoundedRect(-halfW, -halfH, width, height, 6);

    // UR 추가 효과: 이중 테두리
    if (rKey === 'UR') {
      border.lineStyle(1, 0xffffff, 0.5);
      border.strokeRoundedRect(-halfW - 2, -halfH - 2, width + 4, height + 4, 7);
    }

    container.add(border);
  }

  /**
   * 에셋 프리로드 (PreloadScene에서 호출)
   * @param {Phaser.Scene} scene
   * @param {Array} characters
   * @param {Object} options - 로드 옵션
   * @param {Array<string>} [options.types] - 로드할 타입 배열 (예: ['thumbnail', 'portrait'])
   * @param {Array<string>} [options.ids] - 로드할 히어로 ID 배열 (필터링용)
   */
  preloadAssets(scene, characters, options = {}) {
    if (!this.useAssets || !characters) return;

    const types = options.types || ['thumbnail', 'card', 'battle', 'portrait'];
    const filterIds = options.ids || null;

    const filteredCharacters = filterIds
      ? characters.filter(c => filterIds.includes(c.id))
      : characters;

    filteredCharacters.forEach(hero => {
      types.forEach(type => {
        const key = this._getTextureKey(hero, type);
        if (!scene.textures.exists(key)) {
          const path = `${ASSET_PATHS[type]}${hero.id}.png`;
          scene.load.image(key, path);
        }
      });
    });

    // 로드 실패 시 무시 (코드 폴백 사용)
    scene.load.on('loaderror', (file) => {
      console.warn(`[CharacterRenderer] Asset not found: ${file.key}, using code fallback`);
    });
  }
}

export default new CharacterRenderer();
