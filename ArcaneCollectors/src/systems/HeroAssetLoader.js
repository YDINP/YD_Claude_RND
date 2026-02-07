/**
 * HeroAssetLoader.js - 히어로 이미지 에셋 관리
 * H-2: Hero Image Asset System
 *
 * 기능:
 * - 실제 이미지 파일 로드 (public/assets/images/heroes/)
 * - 이미지 미존재 시 캔버스 기반 향상된 플레이스홀더 자동 생성
 * - 교단/분위기/등급별 비주얼 차별화
 * - 레이지 로딩 지원
 *
 * 사용법:
 *   import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
 *   // PreloadScene에서:
 *   HeroAssetLoader.generatePlaceholders(this, characters);
 *   // 또는 개별:
 *   HeroAssetLoader.getTextureKey(heroData); // → 'hero_001'
 */

import { MOODS, CULT_COLORS, RARITY } from '../config/gameConfig.js';
import { getRarityKey } from '../utils/helpers.js';

// 히어로 이미지 사이즈 (등급별)
const PORTRAIT_SIZES = {
  SSR: { width: 200, height: 300 },
  SR: { width: 160, height: 200 },
  R: { width: 120, height: 150 },
  N: { width: 80, height: 80 }
};

// 클래스별 실루엣 심볼
const CLASS_SYMBOLS = {
  warrior: '⚔',
  mage: '✦',
  healer: '✚',
  archer: '➶'
};

// 교단별 배경 패턴 색상
const CULT_BG_TINTS = {
  olympus: 0xFFD700,
  takamagahara: 0xFFB7C5,
  yomi: 0x9C27B0,
  asgard: 0x2196F3,
  valhalla: 0xF44336,
  tartarus: 0xB71C1C,
  avalon: 0x4CAF50,
  helheim: 0x37474F,
  kunlun: 0x00BCD4
};

export class HeroAssetLoader {
  /**
   * 텍스처 키 생성
   * @param {Object} heroData
   * @returns {string} 텍스처 키 (예: 'hero_hero_001')
   */
  static getTextureKey(heroData) {
    return `hero_${heroData.id}`;
  }

  /**
   * 포트레이트 사이즈 조회
   * @param {string} rarity
   * @returns {{width: number, height: number}}
   */
  static getPortraitSize(rarity) {
    return PORTRAIT_SIZES[rarity] || PORTRAIT_SIZES.N;
  }

  /**
   * 전체 캐릭터에 대해 향상된 플레이스홀더 생성
   * @param {Phaser.Scene} scene
   * @param {Array} characters - characters.json 데이터
   */
  static generatePlaceholders(scene, characters) {
    if (!characters || !Array.isArray(characters)) return;

    characters.forEach(hero => {
      const key = HeroAssetLoader.getTextureKey(hero);
      if (scene.textures.exists(key)) return; // 이미 로드됨

      HeroAssetLoader._createEnhancedPlaceholder(scene, hero, key);
    });
  }

  /**
   * 단일 히어로 향상된 플레이스홀더 생성
   * @param {Phaser.Scene} scene
   * @param {Object} hero
   * @param {string} key
   */
  static _createEnhancedPlaceholder(scene, hero, key) {
    const size = 80; // 통일 사이즈 (HeroCard 내부에서 리사이즈)
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 1. 교단 배경 그라데이션
    const cultColor = CULT_BG_TINTS[hero.cult] || 0x666666;
    const r = (cultColor >> 16) & 0xFF;
    const g = (cultColor >> 8) & 0xFF;
    const b = cultColor & 0xFF;

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    grad.addColorStop(1, `rgba(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)}, 0.6)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 2. 분위기 색 오버레이 (상단 코너)
    const moodConfig = MOODS[hero.mood];
    if (moodConfig) {
      const mc = moodConfig.color;
      const mr = (mc >> 16) & 0xFF;
      const mg = (mc >> 8) & 0xFF;
      const mb = mc & 0xFF;
      const moodGrad = ctx.createRadialGradient(size, 0, 0, size, 0, size * 0.6);
      moodGrad.addColorStop(0, `rgba(${mr}, ${mg}, ${mb}, 0.25)`);
      moodGrad.addColorStop(1, `rgba(${mr}, ${mg}, ${mb}, 0)`);
      ctx.fillStyle = moodGrad;
      ctx.fillRect(0, 0, size, size);
    }

    // 3. 등급별 테두리 효과
    const heroRKey = getRarityKey(hero.rarity);
    const rarityConfig = RARITY[heroRKey];
    if (rarityConfig) {
      const rc = rarityConfig.color;
      const rr = (rc >> 16) & 0xFF;
      const rg = (rc >> 8) & 0xFF;
      const rb = rc & 0xFF;
      ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, 0.6)`;
      ctx.lineWidth = heroRKey === 'SSR' ? 3 : (heroRKey === 'SR' ? 2 : 1);
      ctx.strokeRect(1, 1, size - 2, size - 2);
    }

    // 4. 클래스 심볼 (중앙 위)
    const classSymbol = CLASS_SYMBOLS[hero.class] || '?';
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(classSymbol, size / 2, size / 2 - 8);

    // 5. 이름 이니셜 (하단)
    const initial = hero.name ? hero.name.charAt(0) : '?';
    ctx.font = 'bold 16px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(initial, size / 2, size / 2 + 16);

    // 텍스처 등록
    scene.textures.addCanvas(key, canvas);
  }

  /**
   * 실제 이미지 파일 로드 시도
   * @param {Phaser.Scene} scene
   * @param {Array} characters
   * @param {string} basePath - 이미지 경로 (기본: 'assets/images/heroes/')
   */
  static loadImages(scene, characters, basePath = 'assets/images/heroes/') {
    if (!characters || !Array.isArray(characters)) return;

    characters.forEach(hero => {
      const key = HeroAssetLoader.getTextureKey(hero);
      if (scene.textures.exists(key)) return;

      const filePath = `${basePath}${hero.id}.png`;
      scene.load.image(key, filePath);
    });

    // 로드 실패 시 플레이스홀더로 폴백
    scene.load.on('loaderror', (file) => {
      if (file.key.startsWith('hero_')) {
        const hero = characters.find(c => HeroAssetLoader.getTextureKey(c) === file.key);
        if (hero) {
          HeroAssetLoader._createEnhancedPlaceholder(scene, hero, file.key);
        }
      }
    });
  }
}

export default HeroAssetLoader;
