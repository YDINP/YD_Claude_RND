/**
 * UIRenderer.js - UI 렌더링 추상화 레이어
 * 에셋(이미지) / 코드(캔버스) 렌더링 자동 전환
 *
 * 사용법:
 *   import uiRenderer from '../renderers/UIRenderer.js';
 *   const btn = uiRenderer.renderButton(scene, x, y, { width, height, text, style });
 *   const panel = uiRenderer.renderPanel(scene, x, y, { width, height, title });
 *   const icon = uiRenderer.renderIcon(scene, x, y, { type, key, size });
 *   const frame = uiRenderer.renderRarityFrame(scene, x, y, { rarity, width, height });
 */

import { COLORS, MOODS, CULT_COLORS, RARITY, CLASSES } from '../config/gameConfig.js';
import { RARITY_COLORS } from '../config/layoutConfig.js';
import { getRarityKey } from '../utils/helpers.js';

// 에셋 경로 매핑
const UI_ASSET_PATHS = {
  button: 'assets/ui/buttons/',
  panel: 'assets/ui/panels/',
  frame: 'assets/ui/frames/',
  icon: {
    currency: 'assets/ui/icons/currency/',
    stats: 'assets/ui/icons/stats/',
    moods: 'assets/ui/icons/moods/',
    cults: 'assets/ui/icons/cults/',
    classes: 'assets/ui/icons/classes/',
    tabs: 'assets/ui/icons/tabs/',
    buttons: 'assets/ui/icons/buttons/'
  }
};

// 분위기 아이콘 심볼 (코드 폴백용)
const MOOD_SYMBOLS = {
  brave: '\u2694',    // 검
  fierce: '\uD83D\uDD25',   // (불 대신 텍스트)
  wild: '\u26A1',    // 번개
  calm: '\uD83D\uDCA7',     // (물방울 대신 텍스트)
  stoic: '\uD83D\uDEE1',    // (방패 대신 텍스트)
  devoted: '\u2665',  // 하트
  cunning: '\u2606',  // 별
  noble: '\u265B',    // 체스 퀸
  mystic: '\u2734'    // 별2
};

// 교단 아이콘 심볼 (코드 폴백용)
const CULT_SYMBOLS = {
  valhalla: '\u2693',     // 닻
  takamagahara: '\u2600', // 태양
  olympus: '\u26A1',      // 번개
  asgard: '\u2744',       // 눈
  yomi: '\u263D',         // 달
  tartarus: '\u2620',     // 해골
  avalon: '\u2618',       // 클로버
  helheim: '\u2622',      // 방사능(죽음)
  kunlun: '\u2603'        // 눈사람(산)
};

// 클래스 아이콘 심볼 (코드 폴백용)
const CLASS_SYMBOLS = {
  warrior: '\u2694',  // 검
  mage: '\u2726',     // 별
  healer: '\u271A',   // 십자
  archer: '\u27B6'    // 화살
};

// 재화 아이콘 심볼 (코드 폴백용)
const CURRENCY_SYMBOLS = {
  gold: 'G',
  gem: '\u25C6',
  ticket: 'T',
  energy: '\u26A1'
};

// 스탯 아이콘 심볼
const STAT_SYMBOLS = {
  hp: '\u2665',
  atk: '\u2694',
  def: '\u26E8',
  spd: '\u21E8'
};

class UIRenderer {
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
  // 버튼 렌더링
  // ============================================

  /**
   * 버튼 렌더링
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} options
   * @param {number} options.width - 버튼 너비 (기본 200)
   * @param {number} options.height - 버튼 높이 (기본 50)
   * @param {string} options.text - 버튼 텍스트
   * @param {string} options.style - 'primary' | 'secondary' | 'danger' | 'success'
   * @param {number} [options.fontSize] - 폰트 크기
   * @returns {Phaser.GameObjects.Container}
   */
  renderButton(scene, x, y, options = {}) {
    const width = options.width || 200;
    const height = options.height || 50;
    const text = options.text || '';
    const style = options.style || 'primary';
    const fontSize = options.fontSize || 16;

    const textureKey = `ui_btn_${style}`;

    if (this.useAssets && this._textureExists(scene, textureKey)) {
      return this._assetButton(scene, x, y, textureKey, width, height, text, fontSize);
    }

    return this._codeButton(scene, x, y, width, height, text, style, fontSize);
  }

  _assetButton(scene, x, y, textureKey, width, height, text, fontSize) {
    const container = scene.add.container(x, y);
    const bg = scene.add.image(0, 0, textureKey);
    bg.setDisplaySize(width, height);
    container.add(bg);

    if (text) {
      const label = scene.add.text(0, 0, text, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: '#FFFFFF'
      }).setOrigin(0.5);
      container.add(label);
    }

    container.setSize(width, height);
    return container;
  }

  _codeButton(scene, x, y, width, height, text, style, fontSize) {
    const container = scene.add.container(x, y);
    const halfW = width / 2;
    const halfH = height / 2;
    const cornerRadius = 8;

    // 스타일 색상 매핑
    const styleColors = {
      primary: COLORS.primary,
      secondary: COLORS.secondary,
      danger: COLORS.danger,
      success: COLORS.success
    };
    const color = styleColors[style] || COLORS.primary;

    const bg = scene.add.graphics();

    // 그림자
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(-halfW + 2, -halfH + 3, width, height, cornerRadius);

    // 메인 바디
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-halfW, -halfH, width, height, cornerRadius);

    // 상단 하이라이트
    bg.fillStyle(0xffffff, 0.15);
    bg.fillRoundedRect(-halfW, -halfH, width, height * 0.45,
      { tl: cornerRadius, tr: cornerRadius, bl: 0, br: 0 });

    // 테두리
    bg.lineStyle(1, 0xffffff, 0.2);
    bg.strokeRoundedRect(-halfW, -halfH, width, height, cornerRadius);

    container.add(bg);

    if (text) {
      const label = scene.add.text(0, 0, text, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: 'bold',
        color: '#FFFFFF',
        stroke: '#000000',
        strokeThickness: 1
      }).setOrigin(0.5);
      container.add(label);
    }

    container.setSize(width, height);
    return container;
  }

  // ============================================
  // 패널 렌더링
  // ============================================

  /**
   * 패널 렌더링
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} options
   * @param {number} options.width
   * @param {number} options.height
   * @param {string} [options.title]
   * @param {number} [options.borderColor]
   * @returns {Phaser.GameObjects.Container}
   */
  renderPanel(scene, x, y, options = {}) {
    const width = options.width || 300;
    const height = options.height || 200;
    const title = options.title || null;
    const borderColor = options.borderColor || null;

    const textureKey = 'ui_panel_default';

    if (this.useAssets && this._textureExists(scene, textureKey)) {
      return this._assetPanel(scene, x, y, textureKey, width, height, title);
    }

    return this._codePanel(scene, x, y, width, height, title, borderColor);
  }

  _assetPanel(scene, x, y, textureKey, width, height, title) {
    const container = scene.add.container(x, y);
    const bg = scene.add.image(0, 0, textureKey);
    bg.setDisplaySize(width, height);
    container.add(bg);

    if (title) {
      const titleText = scene.add.text(0, -height / 2 + 20, title, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#F8FAFC'
      }).setOrigin(0.5);
      container.add(titleText);
    }

    container.setSize(width, height);
    return container;
  }

  _codePanel(scene, x, y, width, height, title, borderColor) {
    const container = scene.add.container(x, y);
    const halfW = width / 2;
    const halfH = height / 2;
    const cornerRadius = 12;

    const bg = scene.add.graphics();

    // 그림자
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(-halfW + 3, -halfH + 4, width, height, cornerRadius);

    // 메인 배경
    bg.fillStyle(COLORS.backgroundLight, 0.9);
    bg.fillRoundedRect(-halfW, -halfH, width, height, cornerRadius);

    // 내부 글로우
    bg.fillStyle(0xffffff, 0.04);
    bg.fillRoundedRect(-halfW + 2, -halfH + 2, width - 4, height * 0.3, cornerRadius);

    // 테두리
    if (borderColor) {
      bg.lineStyle(2, borderColor, 1);
      bg.strokeRoundedRect(-halfW, -halfH, width, height, cornerRadius);
    }

    container.add(bg);

    // 타이틀 바
    if (title) {
      const titleBarH = 40;
      const titleBar = scene.add.graphics();
      titleBar.fillStyle(COLORS.primary, 0.25);
      titleBar.fillRoundedRect(-halfW, -halfH, width, titleBarH,
        { tl: cornerRadius, tr: cornerRadius, bl: 0, br: 0 });
      titleBar.lineStyle(1, COLORS.primary, 0.4);
      titleBar.lineBetween(-halfW, -halfH + titleBarH, halfW, -halfH + titleBarH);
      container.add(titleBar);

      const titleText = scene.add.text(0, -halfH + titleBarH / 2, title, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F8FAFC'
      }).setOrigin(0.5);
      container.add(titleText);
    }

    container.setSize(width, height);
    return container;
  }

  // ============================================
  // 아이콘 렌더링
  // ============================================

  /**
   * 아이콘 렌더링
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} options
   * @param {string} options.type - 'mood' | 'cult' | 'class' | 'currency' | 'stat'
   * @param {string} options.key - 아이콘 키 (예: 'brave', 'olympus', 'warrior', 'gold', 'hp')
   * @param {number} [options.size] - 아이콘 크기 (기본 32)
   * @returns {Phaser.GameObjects.Container}
   */
  renderIcon(scene, x, y, options = {}) {
    const type = options.type || 'mood';
    const key = options.key || '';
    const size = options.size || 32;

    const textureKey = `icon_${type}_${key}`;

    if (this.useAssets && this._textureExists(scene, textureKey)) {
      return this._assetIcon(scene, x, y, textureKey, size);
    }

    return this._codeIcon(scene, x, y, type, key, size);
  }

  _assetIcon(scene, x, y, textureKey, size) {
    const container = scene.add.container(x, y);
    const icon = scene.add.image(0, 0, textureKey);
    icon.setDisplaySize(size, size);
    container.add(icon);
    container.setSize(size, size);
    return container;
  }

  _codeIcon(scene, x, y, type, key, size) {
    const container = scene.add.container(x, y);
    const half = size / 2;

    let color = 0x94A3B8;
    let symbol = '?';

    switch (type) {
      case 'mood': {
        const moodConfig = MOODS[key];
        color = moodConfig ? moodConfig.color : 0x94A3B8;
        symbol = MOOD_SYMBOLS[key] || '?';
        break;
      }
      case 'cult': {
        color = CULT_COLORS[key] || 0x94A3B8;
        symbol = CULT_SYMBOLS[key] || '?';
        break;
      }
      case 'class': {
        color = COLORS.primary;
        symbol = CLASS_SYMBOLS[key] || '?';
        break;
      }
      case 'currency': {
        const currencyColors = {
          gold: 0xF59E0B,
          gem: 0xEC4899,
          ticket: 0x6366F1,
          energy: 0x10B981
        };
        color = currencyColors[key] || 0x94A3B8;
        symbol = CURRENCY_SYMBOLS[key] || '?';
        break;
      }
      case 'stat': {
        const statColors = {
          hp: 0x10B981,
          atk: 0xEF4444,
          def: 0x3B82F6,
          spd: 0xF59E0B
        };
        color = statColors[key] || 0x94A3B8;
        symbol = STAT_SYMBOLS[key] || '?';
        break;
      }
      case 'tab': {
        const tabIcons = { home: '🏠', adventure: '⚔', inventory: '📦', gacha: '🎲', more: '☰' };
        symbol = tabIcons[key] || '?';
        color = 0x94A3B8;
        break;
      }
      case 'button': {
        const btnIcons = { add: '+', remove: '-', lock: '🔒', unlock: '🔓', filter: '🔍', sort: '↕', auto: '🤖', speed: '⚡', pause: '⏸' };
        symbol = btnIcons[key] || '?';
        color = 0xE2E8F0;
        break;
      }
    }

    // 원형 배경
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.4);
    bg.fillCircle(0, 0, half);
    bg.fillStyle(color, 0.8);
    bg.fillCircle(0, 0, half - 2);
    container.add(bg);

    // 심볼
    const text = scene.add.text(0, 0, symbol, {
      fontSize: `${Math.floor(size * 0.5)}px`,
      color: '#FFFFFF'
    }).setOrigin(0.5);
    container.add(text);

    container.setSize(size, size);
    return container;
  }

  // ============================================
  // 등급별 카드 프레임
  // ============================================

  /**
   * 등급별 카드 프레임 렌더링
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} options
   * @param {string|number} options.rarity - 'SSR'|'SR'|'R'|'N' 또는 1~5
   * @param {number} options.width
   * @param {number} options.height
   * @returns {Phaser.GameObjects.Container}
   */
  renderRarityFrame(scene, x, y, options = {}) {
    const rKey = getRarityKey(options.rarity || 'N');
    const width = options.width || 100;
    const height = options.height || 120;

    const textureKey = `ui_frame_${rKey.toLowerCase()}`;

    if (this.useAssets && this._textureExists(scene, textureKey)) {
      return this._assetFrame(scene, x, y, textureKey, width, height);
    }

    return this._codeFrame(scene, x, y, rKey, width, height);
  }

  _assetFrame(scene, x, y, textureKey, width, height) {
    const container = scene.add.container(x, y);
    const frame = scene.add.image(0, 0, textureKey);
    frame.setDisplaySize(width, height);
    container.add(frame);
    container.setSize(width, height);
    return container;
  }

  _codeFrame(scene, x, y, rKey, width, height) {
    const container = scene.add.container(x, y);
    const halfW = width / 2;
    const halfH = height / 2;
    const cornerRadius = 8;

    const rarityColor = RARITY_COLORS[rKey] || RARITY_COLORS.N;
    const rarityConfig = RARITY[rKey] || RARITY.N;

    const frame = scene.add.graphics();

    // SSR/SR 글로우
    if (rarityColor.glow) {
      frame.fillStyle(rarityColor.glow, 0.2);
      frame.fillRoundedRect(-halfW - 3, -halfH - 3, width + 6, height + 6, cornerRadius + 2);
    }

    // 배경
    frame.fillStyle(rarityColor.bg, 0.9);
    frame.fillRoundedRect(-halfW, -halfH, width, height, cornerRadius);

    // 상단 하이라이트
    frame.fillStyle(0xffffff, 0.06);
    frame.fillRoundedRect(-halfW, -halfH, width, height * 0.3,
      { tl: cornerRadius, tr: cornerRadius, bl: 0, br: 0 });

    // 테두리
    const borderWidth = rKey === 'SSR' ? 3 : (rKey === 'SR' ? 2 : 1);
    frame.lineStyle(borderWidth, rarityColor.border, 1);
    frame.strokeRoundedRect(-halfW, -halfH, width, height, cornerRadius);

    container.add(frame);
    container.setSize(width, height);
    return container;
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 텍스처 존재 확인 (캐시)
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
   * 텍스처 캐시 초기화
   */
  clearCache() {
    this._textureCache.clear();
  }

  /**
   * UI 에셋 프리로드 (PreloadScene에서 호출)
   * @param {Phaser.Scene} scene
   * @param {Object} options - 로드 옵션
   * @param {Array<string>} [options.icons] - 로드할 아이콘 카테고리 배열 (예: ['currency', 'stats'])
   */
  preloadAssets(scene, options = {}) {
    if (!this.useAssets) return;

    // 버튼 에셋
    const buttonStyles = ['primary', 'secondary', 'danger', 'success'];
    buttonStyles.forEach(style => {
      const key = `ui_btn_${style}`;
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${UI_ASSET_PATHS.button}${style}.png`);
      }
    });

    // 패널 에셋
    const key = 'ui_panel_default';
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `${UI_ASSET_PATHS.panel}default.png`);
    }

    // 프레임 에셋
    const rarities = ['n', 'r', 'sr', 'ssr'];
    rarities.forEach(r => {
      const fKey = `ui_frame_${r}`;
      if (!scene.textures.exists(fKey)) {
        scene.load.image(fKey, `${UI_ASSET_PATHS.frame}${r}.png`);
      }
    });

    // 아이콘 로딩 필터링
    const iconCategories = options.icons || ['moods', 'cults', 'classes', 'currency', 'stats', 'tabs', 'buttons'];

    // 아이콘 에셋 - 분위기
    if (iconCategories.includes('moods')) {
      Object.keys(MOODS).forEach(mood => {
        const mKey = `icon_mood_${mood}`;
        if (!scene.textures.exists(mKey)) {
          scene.load.image(mKey, `${UI_ASSET_PATHS.icon.moods}${mood}.png`);
        }
      });
    }

    // 아이콘 에셋 - 교단
    if (iconCategories.includes('cults')) {
      Object.keys(CULT_COLORS).forEach(cult => {
        if (cult === 'DEFAULT') return;
        const cKey = `icon_cult_${cult}`;
        if (!scene.textures.exists(cKey)) {
          scene.load.image(cKey, `${UI_ASSET_PATHS.icon.cults}${cult}.png`);
        }
      });
    }

    // 아이콘 에셋 - 클래스
    if (iconCategories.includes('classes')) {
      Object.keys(CLASSES).forEach(cls => {
        const clKey = `icon_class_${cls}`;
        if (!scene.textures.exists(clKey)) {
          scene.load.image(clKey, `${UI_ASSET_PATHS.icon.classes}${cls}.png`);
        }
      });
    }

    // 아이콘 에셋 - 재화 (currency)
    if (iconCategories.includes('currency')) {
      ['gold', 'gem', 'ticket', 'energy'].forEach(curr => {
        const currKey = `icon_currency_${curr}`;
        if (!scene.textures.exists(currKey)) {
          scene.load.image(currKey, `${UI_ASSET_PATHS.icon.currency}${curr}.png`);
        }
      });
    }

    // 아이콘 에셋 - 스탯 (stats)
    if (iconCategories.includes('stats')) {
      ['hp', 'atk', 'def', 'spd'].forEach(stat => {
        const statKey = `icon_stat_${stat}`;
        if (!scene.textures.exists(statKey)) {
          scene.load.image(statKey, `${UI_ASSET_PATHS.icon.stats}${stat}.png`);
        }
      });
    }

    // 아이콘 에셋 - 탭 (tabs)
    if (iconCategories.includes('tabs')) {
      ['home', 'adventure', 'inventory', 'gacha', 'more'].forEach(tab => {
        const tabKey = `icon_tab_${tab}`;
        if (!scene.textures.exists(tabKey)) {
          scene.load.image(tabKey, `${UI_ASSET_PATHS.icon.tabs}${tab}.png`);
        }
      });
    }

    // 아이콘 에셋 - 버튼 (buttons)
    if (iconCategories.includes('buttons')) {
      ['add', 'remove', 'lock', 'unlock', 'filter', 'sort', 'auto', 'speed', 'pause'].forEach(btn => {
        const btnKey = `icon_button_${btn}`;
        if (!scene.textures.exists(btnKey)) {
          scene.load.image(btnKey, `${UI_ASSET_PATHS.icon.buttons}${btn}.png`);
        }
      });
    }

    // 로드 실패 무시 (코드 폴백)
    scene.load.on('loaderror', (file) => {
      if (file.key.startsWith('ui_') || file.key.startsWith('icon_')) {
        console.warn(`[UIRenderer] Asset not found: ${file.key}, using code fallback`);
      }
    });
  }
}

export default new UIRenderer();
