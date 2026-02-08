import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULTS, CULT_COLORS, CULT_INFO } from '../config/gameConfig.js';
import { BottomNav } from '../components/BottomNav.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import transitionManager from '../utils/TransitionManager.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
export class HeroListScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroListScene' });
    this.scrollY = 0;
    this.sortBy = 'rarity';
    this.sortAscending = false;
    this.filterCult = null;
    this.filterRarity = null;
    this.filterButtons = [];
    this.transitioning = false;
    this._loadedHeroIds = []; // RES-ABS-4: 로드된 히어로 추적
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    // RES-ABS-4: 소유 히어로 썸네일 동적 로드
    const ownedHeroes = this.registry.get('ownedHeroes') || [];
    const heroIds = ownedHeroes.map(h => h.id);
    this._loadedHeroIds = heroIds;

    if (characterRenderer.useAssets && heroIds.length > 0) {
      characterRenderer.preloadAssets(this, ownedHeroes, { ids: heroIds, types: ['thumbnail'] });
      this.load.start();
      this.load.once('complete', () => {
        this.initUI();
      });
    } else {
      this.initUI();
    }
    } catch (error) {
      console.error('[HeroListScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  initUI() {
    this.createBackground();
    this.createHeader();
    this.createFilterBar();
    this.createHeroGrid();
    this.setupScrolling();
    this.bottomNav = new BottomNav(this, 'home');
    } catch (error) {
      console.error('[HeroListScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  createBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.background);
  }

  createHeader() {
    // Header background
    const headerBg = this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.backgroundLight, 0.95);
    headerBg.setDepth(20);

    // Back button
    const backBtn = this.add.container(40, 50).setDepth(21);
    const backBg = this.add.rectangle(0, 0, 60, 40, COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      if (this.transitioning) return;
      this.transitioning = true;
      transitionManager.slideTransition(this, 'MainMenuScene', {}, 'left');
    });

    // Title
    this.add.text(GAME_WIDTH / 2, 50, '영웅', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    // Hero count
    const heroes = this.registry.get('ownedHeroes') || [];
    this.countText = this.add.text(GAME_WIDTH - 30, 50, `${heroes.length}명`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(1, 0.5).setDepth(21);
  }

  createFilterBar() {
    const filterY = 130;
    const filterY2 = 175;

    // Filter background (extended for two rows)
    const filterBg = this.add.rectangle(GAME_WIDTH / 2, 152, GAME_WIDTH, 105, COLORS.backgroundLight, 0.8);
    filterBg.setDepth(19);

    // Sort buttons - expanded options
    const sortOptions = [
      { key: 'rarity', label: '등급순' },
      { key: 'level', label: '레벨순' },
      { key: 'power', label: '전투력순' },
      { key: 'mood', label: '분위기순' },
      { key: 'cult', label: '교단순' }
    ];

    this.sortButtons = [];

    sortOptions.forEach((opt, index) => {
      const x = 45 + index * 78;
      const btn = this.add.container(x, filterY).setDepth(20);

      const isActive = this.sortBy === opt.key;
      const bg = this.add.rectangle(0, 0, 70, 28, isActive ? COLORS.primary : COLORS.backgroundLight, 1)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(0, 0, opt.label, {
        fontSize: '11px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      btn.add([bg, text]);
      btn.setData('key', opt.key);
      btn.setData('bg', bg);
      this.sortButtons.push({ btn, bg, key: opt.key });

      bg.on('pointerdown', () => {
        if (this.sortBy === opt.key) {
          this.sortAscending = !this.sortAscending;
        } else {
          this.sortBy = opt.key;
          this.sortAscending = false;
        }
        this.updateSortButtons();
        this.refreshGrid();
      });
    });

    // Sort direction indicator
    this.sortDirText = this.add.text(GAME_WIDTH - 25, filterY, this.sortAscending ? '▲' : '▼', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(20);

    // Second row - Cult filter buttons (분위기/교단 필터)
    const cults = ['olympus', 'takamagahara', 'yomi', 'asgard', 'valhalla', 'tartarus', 'avalon', 'helheim', 'kunlun'];
    this.cultButtons = [];

    cults.forEach((cult, index) => {
      const x = 20 + index * 22;
      const btn = this.add.circle(x, filterY2, 10, CULT_COLORS[cult] || COLORS.textDark, 0.8)
        .setInteractive({ useHandCursor: true })
        .setDepth(20);

      this.cultButtons.push({ btn, cult });

      btn.on('pointerdown', () => {
        if (this.filterCult === cult) {
          this.filterCult = null;
          btn.setStrokeStyle(0);
        } else {
          this.cultButtons.forEach(cb => cb.btn.setStrokeStyle(0));
          this.filterCult = cult;
          btn.setStrokeStyle(2, COLORS.text);
        }
        this.refreshGrid();
      });
    });

    // Rarity filter buttons
    const rarities = ['N', 'R', 'SR', 'SSR'];
    this.rarityButtons = [];

    rarities.forEach((rarity, index) => {
      const x = 200 + index * 45;
      const btn = this.add.container(x, filterY2).setDepth(20);

      const isActive = this.filterRarity === rarity;
      const bg = this.add.rectangle(0, 0, 38, 24, isActive ? RARITY[rarity].color : COLORS.backgroundLight, 0.9)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(0, 0, rarity, {
        fontSize: '10px',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      btn.add([bg, text]);
      this.rarityButtons.push({ btn, bg, rarity });

      bg.on('pointerdown', () => {
        if (this.filterRarity === rarity) {
          this.filterRarity = null;
          bg.setFillStyle(COLORS.backgroundLight, 0.9);
        } else {
          this.rarityButtons.forEach(rb => rb.bg.setFillStyle(COLORS.backgroundLight, 0.9));
          this.filterRarity = rarity;
          bg.setFillStyle(RARITY[rarity].color, 0.9);
        }
        this.refreshGrid();
      });
    });

    // Clear filters button
    const clearBtn = this.add.text(GAME_WIDTH - 50, filterY2, '초기화', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: `#${  COLORS.danger.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true });

    clearBtn.on('pointerdown', () => {
      this.filterRarity = null;
      this.filterCult = null;
      this.sortBy = 'rarity';
      this.sortAscending = false;
      this.rarityButtons.forEach(rb => rb.bg.setFillStyle(COLORS.backgroundLight, 0.9));
      this.cultButtons.forEach(cb => cb.btn.setStrokeStyle(0));
      this.updateSortButtons();
      this.refreshGrid();
    });
  }

  updateSortButtons() {
    this.sortButtons.forEach(({ bg, key }) => {
      bg.setFillStyle(this.sortBy === key ? COLORS.primary : COLORS.backgroundLight, 1);
    });
    if (this.sortDirText) {
      this.sortDirText.setText(this.sortAscending ? '▲' : '▼');
    }
  }

  createHeroGrid() {
    // Scrollable container
    this.gridContainer = this.add.container(0, 0);

    // Mask for scrolling (adjusted for extended filter bar)
    const maskShape = this.make.graphics();
    maskShape.fillRect(0, 210, GAME_WIDTH, GAME_HEIGHT - 210);
    const mask = maskShape.createGeometryMask();
    this.gridContainer.setMask(mask);

    this.refreshGrid();
  }

  calculatePower(hero) {
    const stats = hero.stats || { hp: 0, atk: 0, def: 0, spd: 0 };
    return stats.hp + stats.atk * 5 + stats.def * 3 + stats.spd * 2;
  }

  refreshGrid() {
    // Clear existing cards
    this.gridContainer.removeAll(true);

    let heroes = [...(this.registry.get('ownedHeroes') || [])].filter(h => h.name);

    // Filter by rarity (숫자/문자열 모두 지원)
    if (this.filterRarity) {
      heroes = heroes.filter(h => getRarityKey(h.rarity) === this.filterRarity);
    }

    // Filter by cult
    if (this.filterCult) {
      heroes = heroes.filter(h => h.cult === this.filterCult);
    }

    // Sort
    const sortDirection = this.sortAscending ? 1 : -1;

    switch (this.sortBy) {
      case 'rarity':
        heroes.sort((a, b) => {
          const aR = getRarityNum(a.rarity);
          const bR = getRarityNum(b.rarity);
          return (bR - aR) * sortDirection;
        });
        break;
      case 'level':
        heroes.sort((a, b) => ((b.level || 1) - (a.level || 1)) * sortDirection);
        break;
      case 'mood':
        const moodOrder = { brave: 0, fierce: 1, wild: 2, calm: 3, stoic: 4, devoted: 5, cunning: 6, noble: 7, mystic: 8 };
        heroes.sort((a, b) => {
          const aMood = moodOrder[a.mood] ?? 99;
          const bMood = moodOrder[b.mood] ?? 99;
          return (aMood - bMood) * sortDirection;
        });
        break;
      case 'power':
        heroes.sort((a, b) => (this.calculatePower(b) - this.calculatePower(a)) * sortDirection);
        break;
      case 'cult':
        const cultOrder = { olympus: 0, takamagahara: 1, yomi: 2, asgard: 3, valhalla: 4, tartarus: 5, avalon: 6, helheim: 7, kunlun: 8 };
        heroes.sort((a, b) => {
          const aCult = cultOrder[a.cult] ?? 99;
          const bCult = cultOrder[b.cult] ?? 99;
          return (aCult - bCult) * sortDirection;
        });
        break;
    }

    // Display heroes in grid (4 columns)
    const cols = 4;
    const cardWidth = 105;
    const cardHeight = 145;
    const startX = (GAME_WIDTH - cols * cardWidth) / 2 + cardWidth / 2;
    const startY = 240;

    if (heroes.length === 0) {
      // Empty state
      const emptyText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '보유한 영웅이 없습니다\n소환에서 영웅을 획득하세요!', {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
        align: 'center'
      }).setOrigin(0.5);
      this.gridContainer.add(emptyText);
      return;
    }

    heroes.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * cardWidth;
      const y = startY + row * cardHeight;

      this.createHeroCard(x, y, hero);
    });

    // Update max scroll (adjusted for extended filter bar)
    const rows = Math.ceil(heroes.length / cols);
    this.maxScroll = Math.max(0, rows * cardHeight - (GAME_HEIGHT - 250));
    this.scrollY = Math.min(this.scrollY, this.maxScroll);

    // Update count
    if (this.countText) {
      this.countText.setText(`${heroes.length}명`);
    }
  }

  createHeroCard(x, y, hero) {
    const card = this.add.container(x, y);

    // Card background with rarity color
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cardBg = this.add.rectangle(0, 0, 95, 135, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);
    cardBg.setInteractive({ useHandCursor: true });

    // Rarity indicator
    const rarityBg = this.add.rectangle(0, -55, 35, 18, rarityColor, 1);
    const rarityText = this.add.text(0, -55, rKey, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Hero portrait
    const portrait = this.add.image(0, -10, 'hero_placeholder').setScale(0.85);

    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = this.add.text(0, 35, '★'.repeat(starCount), {
      fontSize: '11px',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name
    const heroName = hero.name || '???';
    const name = heroName.length > 7 ? `${heroName.substring(0, 7)  }..` : heroName;
    const nameText = this.add.text(0, 50, name, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Level
    const levelText = this.add.text(0, 62, `Lv.${hero.level}`, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    card.add([cardBg, rarityBg, rarityText, portrait, stars, nameText, levelText]);
    this.gridContainer.add(card);

    // Interactions
    cardBg.on('pointerover', () => {
      card.setScale(1.05);
      cardBg.setFillStyle(COLORS.backgroundLight, 0.8);
    });

    cardBg.on('pointerout', () => {
      card.setScale(1);
      cardBg.setFillStyle(COLORS.backgroundLight, 1);
    });

    cardBg.on('pointerdown', (pointer) => {
      if (this.transitioning) return;
      this.transitioning = true;
      // PRD VFX-1.2: HeroList → HeroDetail = zoomIn (card position)
      transitionManager.zoomTransition(this, 'HeroDetailScene', { heroId: hero.id }, pointer.x, pointer.y, 'in', 400);
    });
  }

  setupScrolling() {
    this.maxScroll = 0;

    // Touch/mouse wheel scrolling (adjusted y offset for extended filter)
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      this.scrollY += deltaY * 0.5;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
      this.gridContainer.y = 210 - this.scrollY;
    });

    // Touch drag scrolling
    let dragStartY = 0;
    let dragStartScroll = 0;

    this.input.on('pointerdown', (pointer) => {
      if (pointer.y > 210) {
        dragStartY = pointer.y;
        dragStartScroll = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && dragStartY > 0) {
        const deltaY = dragStartY - pointer.y;
        this.scrollY = dragStartScroll + deltaY;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
        this.gridContainer.y = 210 - this.scrollY;
      }
    });

    this.input.on('pointerup', () => {
      dragStartY = 0;
    });
  }

  shutdown() {
    // RES-ABS-4: 메모리 해제
    if (this._loadedHeroIds && this._loadedHeroIds.length > 0) {
      HeroAssetLoader.unloadTextures(this, this._loadedHeroIds);
    }

    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  update() {
    // Smooth scroll position (adjusted for extended filter)
    const targetY = 210 - this.scrollY;
    if (this.gridContainer.y !== targetY) {
      this.gridContainer.y = Phaser.Math.Linear(this.gridContainer.y, targetY, 0.2);
    }
  }
}
