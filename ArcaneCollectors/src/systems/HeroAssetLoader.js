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
import { getRarityKey } from '../utils/rarityUtils.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';

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
  // 캐릭터 ID → 파일명 매핑 (portrait-mapping.json에서 import)
  static _PORTRAIT_MAP = PORTRAIT_MAP;

  /**
   * 런타임 포트레이트 확장자. `tools/portraits/build-runtime-portraits.py`가
   * 원본 PNG에서 긴 변 512 WebP를 굽는다. 원본은 portraits@2x/에 PNG로 남는다.
   */
  static RUNTIME_EXT = '.webp';

  /** 런타임(512 WebP) 포트레이트 경로 */
  static RUNTIME_PATH = 'assets/characters/portraits/';

  /** 원본(최대 1024 PNG) 포트레이트 경로. 영웅 상세의 큰 표시에만 지연 로드한다 */
  static HIRES_PATH = 'assets/characters/portraits@2x/';

  /**
   * 영웅 ID에 대응하는 원본 파일명을 반환합니다.
   * @param {Object} heroData
   * @returns {string|null} portrait-mapping.json 등록 파일명. 미등록이면 null
   */
  static getFileName(heroData) {
    if (!heroData || !heroData.id) return null;
    return HeroAssetLoader._PORTRAIT_MAP[heroData.id] ?? null;
  }

  /**
   * 고해상도(@2x) 텍스처 키를 반환합니다.
   * @param {Object} heroData
   * @returns {string} 예: 'hero_base_iris@2x'
   */
  static getHiresTextureKey(heroData) {
    return `${HeroAssetLoader.getTextureKey(heroData)}@2x`;
  }

  /**
   * 고해상도 원본을 지연 로드합니다. 영웅 상세처럼 큰 표시가 필요한 지점에서만 호출합니다.
   *
   * 이미 로드됐거나 매핑이 없으면 큐에 올리지 않고 null을 돌려준다.
   * 호출자는 반환 키가 null이거나 로드가 실패하면 512 런타임 텍스처로 폴백해야 한다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} heroData
   * @returns {string|null} 큐에 올린 고해상도 키. 로드할 필요가 없으면 null
   */
  static queueHiresTexture(scene, heroData) {
    const fileName = HeroAssetLoader.getFileName(heroData);
    if (!fileName) return null;

    const key = HeroAssetLoader.getHiresTextureKey(heroData);
    if (scene.textures.exists(key)) return key;

    scene.load.image(key, `${HeroAssetLoader.HIRES_PATH}${fileName}.png`);
    return key;
  }

  /**
   * 텍스처 키 생성
   * @param {Object} heroData
   * @returns {string} 텍스처 키 (예: 'hero_char_1')
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
   * 텍스처 보장: 없으면 향상된 플레이스홀더를 즉시 생성하고 사용 가능한 키를 반환합니다.
   * 가챠 결과/영웅 목록 등 동적 표시 지점에서 사용 (IMG-3).
   * @param {Phaser.Scene} scene
   * @param {Object} heroData - 최소 id 필요 (cult/mood/class/rarity/name 있으면 고품질 플레이스홀더)
   * @returns {string|null} 사용 가능한 텍스처 키 (생성 실패 시 null)
   */
  static ensureTexture(scene, heroData) {
    if (!heroData || !heroData.id) return null;
    const key = HeroAssetLoader.getTextureKey(heroData);
    if (!scene.textures.exists(key)) {
      try {
        HeroAssetLoader._createEnhancedPlaceholder(scene, heroData, key);
      } catch (e) {
        console.warn(`[HeroAssetLoader] ensureTexture 실패 (${key}):`, e);
        return null;
      }
    }
    return key;
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
   *
   * portrait-mapping.json에 등록되지 않은 영웅은 대응 파일이 존재하지 않으므로
   * 요청을 보내지 않고 즉시 플레이스홀더를 생성한다. dev 서버가 없는 에셋 경로에
   * index.html을 200으로 돌려주기 때문에, 요청을 보내면 404가 아니라 디코드 실패로
   * 뒤늦게 걸러진다. 매핑을 선검사하는 편이 요청 수와 진단 난이도를 모두 줄인다.
   *
   * @param {Phaser.Scene} scene
   * @param {Array} characters - 로드 대상 영웅 배열 (data/index.js의 getAllPortraitHeroes 권장)
   * @param {string} basePath - 이미지 경로 (기본: HeroAssetLoader.RUNTIME_PATH)
   * @returns {{ queued: string[], skipped: string[] }} 큐에 올린 키와 건너뛴 키
   */
  static loadImages(scene, characters, basePath = HeroAssetLoader.RUNTIME_PATH) {
    const result = { queued: [], skipped: [] };
    if (!characters || !Array.isArray(characters)) return result;

    characters.forEach(hero => {
      if (!hero || !hero.id) return;
      const key = HeroAssetLoader.getTextureKey(hero);
      if (scene.textures.exists(key)) return;

      // portrait-mapping.json: 파일명(hero_001~)과 캐릭터 ID(char_1, base_iris, asc_…) 연결
      const fileName = HeroAssetLoader._PORTRAIT_MAP[hero.id];
      if (!fileName) {
        // 매핑 없음 = 이미지 파일 없음. 요청하지 않고 플레이스홀더로 확정한다.
        try {
          HeroAssetLoader._createEnhancedPlaceholder(scene, hero, key);
        } catch (e) {
          console.warn(`[HeroAssetLoader] 플레이스홀더 생성 실패 (${key}):`, e);
        }
        result.skipped.push(key);
        return;
      }

      scene.load.image(key, `${basePath}${fileName}${HeroAssetLoader.RUNTIME_EXT}`);
      result.queued.push(key);
    });

    // 로드 실패 시 플레이스홀더로 폴백 (중복 등록 방어)
    if (!scene._heroErrorHandlerBound) {
      scene._heroErrorHandlerBound = true;
      scene.load.on('loaderror', (file) => {
        if (file.key.startsWith('hero_')) {
          const hero = characters.find(c => HeroAssetLoader.getTextureKey(c) === file.key);
          if (hero) {
            HeroAssetLoader._createEnhancedPlaceholder(scene, hero, file.key);
          }
        }
      });
    }

    return result;
  }

  /**
   * 텍스처 메모리 해제 (RES-ABS-4: Lazy Loading)
   * @param {Phaser.Scene} scene
   * @param {Array<string>} heroIds - 해제할 히어로 ID 배열
   */
  static unloadTextures(scene, heroIds) {
    if (!heroIds || !Array.isArray(heroIds)) return;

    heroIds.forEach(id => {
      const key = HeroAssetLoader.getTextureKey({ id });
      if (scene.textures.exists(key)) {
        scene.textures.remove(key);
      }
    });
  }
}

export default HeroAssetLoader;
