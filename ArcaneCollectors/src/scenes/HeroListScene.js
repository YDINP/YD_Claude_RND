import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULTS, CULT_COLORS, CULT_INFO } from '../config/gameConfig.js';
import { BottomNav } from '../components/BottomNav.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import transitionManager from '../utils/TransitionManager.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { VirtualCardPool } from '../components/VirtualCardPool.js';
import { SaveManager } from '../systems/SaveManager.js';
import { normalizeHeroes } from '../data/index.js';
import { HeroInfoPopup } from '../components/HeroInfoPopup.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';

export class HeroListScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroListScene' });
    this.scrollY = 0;
    this.sortBy = 'rarity';
    this.sortAscending = false;
    // UIX-2.2.1: 다중 필터 (AND 조건)
    this.filterCult = null;
    this.filterRarity = null;
    this.filterClass = null; // 클래스 필터 추가
    this.filterMood = null;  // 분위기 필터 추가
    this.filterButtons = [];
    this.transitioning = false;
    this._loadedHeroIds = []; // RES-ABS-4: 로드된 히어로 추적
    this.cardPool = null; // UIX-2.2.1: Virtual scroll object pool
    this.heroPopup = null;
  }

  create() {
    try {
    this.transitioning = false; // 씬 재진입 시 반드시 리셋
    this.cameras.main.fadeIn(300);

    // RES-ABS-4: 소유 히어로 썸네일 동적 로드
    // ISSUE-01 FIX: registry가 비어있으면 SaveManager에서 최신 데이터 로드 후 정규화
    let ownedHeroes = this.registry.get('ownedHeroes') || [];
    if (ownedHeroes.length === 0) {
      const saveData = SaveManager.load();
      const savedChars = saveData?.characters || [];
      if (savedChars.length > 0) {
        ownedHeroes = normalizeHeroes(savedChars);
        this.registry.set('ownedHeroes', ownedHeroes);
        console.log(`[HeroListScene] Registry 갱신: ${ownedHeroes.length}명 로드`);
      }
    }
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
    // UIX-2.2.1: Initialize card pool
    this.cardPool = new VirtualCardPool(this, this.createHeroCard.bind(this), 24);
    this.heroPopup = new HeroInfoPopup(this);
    this.createHeroGrid();
    this.setupScrolling();
    this.bottomNav = new BottomNav(this, 'hero');
  }

  createBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.background);
  }

  createHeader() {
    // LAYOUT 통일: Header background (100px)
    const headerBg = this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.backgroundLight, 0.95);
    headerBg.setDepth(20);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBtn = this.add.container(30, 50).setDepth(21);
    const backBg = this.add.rectangle(0, 0, 50, 40, COLORS.backgroundLight, 0.8)
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

    // UIX-3.4: Mask for scrolling (콘텐츠 영역 y=80~1160)
    const maskShape = this.make.graphics();
    maskShape.fillRect(0, 210, GAME_WIDTH, GAME_HEIGHT - 330);
    const mask = maskShape.createGeometryMask();
    this.gridContainer.setMask(mask);

    this.refreshGrid();
  }

  calculatePower(hero) {
    try {
      return ProgressionSystem.calculatePower({
        ...hero,
        characterId: hero.id || hero.characterId,
        skillLevels: hero.skillLevels || [1, 1]
      });
    } catch (e) {
      const s = hero.stats || {};
      return Math.floor((s.hp || 0) / 10 + (s.atk || 0) + (s.def || 0) + (s.spd || 0));
    }
  }

  refreshGrid() {
    // UIX-2.2.1: Release all cards back to pool
    if (this.cardPool) {
      this.cardPool.releaseAll();
    }

    // Clear existing cards
    this.gridContainer.removeAll(true);

    let heroes = [...(this.registry.get('ownedHeroes') || [])].filter(h => h.name);

    // UIX-2.2.1: 다중 필터 (AND 조건)
    // Filter by rarity (숫자/문자열 모두 지원)
    if (this.filterRarity) {
      heroes = heroes.filter(h => getRarityKey(h.rarity) === this.filterRarity);
    }

    // Filter by cult
    if (this.filterCult) {
      heroes = heroes.filter(h => h.cult === this.filterCult);
    }

    // Filter by class
    if (this.filterClass) {
      heroes = heroes.filter(h => h.class === this.filterClass);
    }

    // Filter by mood
    if (this.filterMood) {
      heroes = heroes.filter(h => h.mood === this.filterMood);
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

    // UIX-2.2.1: Display heroes in grid (4 columns, 110x150 cards, 10px spacing)
    const cols = 4;
    const cardWidth = 110;
    const cardHeight = 150;
    const spacing = 10;
    const gridWidth = cols * cardWidth + (cols - 1) * spacing;
    const startX = (GAME_WIDTH - gridWidth) / 2 + cardWidth / 2;
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

    // UIX-2.2.1: Virtual scrolling - only render visible cards
    const visibleStart = Math.max(0, Math.floor((this.scrollY - startY) / (cardHeight + spacing)) * cols);
    const visibleRows = Math.ceil((GAME_HEIGHT - 250) / (cardHeight + spacing)) + 2;
    const visibleEnd = Math.min(heroes.length, visibleStart + visibleRows * cols);

    heroes.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardWidth + spacing);
      const y = startY + row * (cardHeight + spacing);

      // Only create cards in visible range
      if (index >= visibleStart && index < visibleEnd) {
        const card = this.cardPool.acquire(x, y, hero);
        this.gridContainer.add(card);
      }
    });

    // UIX-2.2.1: Update max scroll with new spacing
    const rows = Math.ceil(heroes.length / cols);
    this.maxScroll = Math.max(0, rows * (cardHeight + spacing) - (GAME_HEIGHT - 250));
    this.scrollY = Math.min(this.scrollY, this.maxScroll);

    // Update count
    if (this.countText) {
      this.countText.setText(`${heroes.length}명`);
    }
  }

  createHeroCard(scene, x, y, hero) {
    const card = scene.add.container(x, y);

    // UIX-2.2.1: Updated card size 110x150
    const cardWidth = 110;
    const cardHeight = 150;

    // Card background with rarity color
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cardBg = scene.add.rectangle(0, 0, cardWidth - 10, cardHeight - 10, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);
    cardBg.setInteractive({ useHandCursor: true });

    // Rarity indicator
    const rarityBg = scene.add.rectangle(0, -60, 35, 18, rarityColor, 1);
    const rarityText = scene.add.text(0, -60, rKey, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Hero portrait
    const portrait = scene.add.image(0, -15, 'hero_placeholder').setScale(0.9);

    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = scene.add.text(0, 40, '★'.repeat(starCount), {
      fontSize: '11px',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name
    const heroName = hero.name || '???';
    const name = heroName.length > 8 ? `${heroName.substring(0, 8)  }..` : heroName;
    const nameText = scene.add.text(0, 56, name, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Level
    const levelText = scene.add.text(0, 68, `Lv.${hero.level}`, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    card.add([cardBg, rarityBg, rarityText, portrait, stars, nameText, levelText]);

    // Add setHeroData method for pool reuse
    card.setHeroData = function(newHero) {
      const newRKey = getRarityKey(newHero.rarity);
      const newRarityData = RARITY[newRKey] || RARITY.N;
      const newRarityColor = newRarityData.color;

      cardBg.setStrokeStyle(2, newRarityColor);
      rarityBg.setFillStyle(newRarityColor, 1);
      rarityText.setText(newRKey);

      const newStarCount = newHero.stars || getRarityNum(newHero.rarity) || newRarityData.stars || 1;
      stars.setText('★'.repeat(newStarCount));

      const newHeroName = newHero.name || '???';
      const newName = newHeroName.length > 8 ? `${newHeroName.substring(0, 8)  }..` : newHeroName;
      nameText.setText(newName);
      levelText.setText(`Lv.${newHero.level}`);

      // Update hero reference for interactions
      card.heroData = newHero;
    };

    card.heroData = hero;

    // Interactions - hover only (tap handled by scene-level pointerup)
    cardBg.on('pointerover', () => {
      card.setScale(1.05);
      cardBg.setFillStyle(COLORS.backgroundLight, 0.8);
    });

    cardBg.on('pointerout', () => {
      card.setScale(1);
      cardBg.setFillStyle(COLORS.backgroundLight, 1);
    });

    return card;
  }

  setupScrolling() {
    this.maxScroll = 0;
    this.isDragging = false;
    this.dragStartPointerY = 0;
    this.dragStartScrollY = 0;

    const DRAG_THRESHOLD = 10; // px - 드래그 vs 탭 판정 임계값
    const CONTENT_TOP = 210;   // 필터바 아래 콘텐츠 영역 시작

    // Mouse wheel scrolling
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      this.scrollY += deltaY * 0.5;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
      this.updateGridPosition();
    });

    // Touch/mouse drag scrolling - scene level (카드 위에서도 동작)
    this.input.on('pointerdown', (pointer) => {
      if (pointer.y < CONTENT_TOP) return; // 필터바 영역 제외
      this.isDragging = false;
      this.dragStartPointerY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    });

    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown || this.dragStartPointerY === 0) return;

      const deltaY = this.dragStartPointerY - pointer.y;

      if (!this.isDragging && Math.abs(deltaY) > DRAG_THRESHOLD) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        this.scrollY = this.dragStartScrollY + deltaY;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
        this.updateGridPosition();
      }
    });

    this.input.on('pointerup', (pointer) => {
      if (!this.isDragging && this.dragStartPointerY > 0) {
        // 드래그가 아닌 탭 → 카드 클릭 처리
        this.handleCardTap(pointer);
      }
      this.isDragging = false;
      this.dragStartPointerY = 0;
    });
  }

  updateGridPosition() {
    if (this.gridContainer) {
      this.gridContainer.y = -this.scrollY;
    }
  }

  handleCardTap(pointer) {
    if (this.transitioning) return;

    // gridContainer 자식 중 포인터 위치에 해당하는 카드 찾기
    const worldX = pointer.x;
    const worldY = pointer.y;

    const children = this.gridContainer.getAll();
    for (const card of children) {
      if (!card.heroData) continue;

      // 카드의 월드 좌표 계산 (container 오프셋 적용)
      const cardWorldX = card.x + this.gridContainer.x;
      const cardWorldY = card.y + this.gridContainer.y;
      const halfW = 50; // (cardWidth - 10) / 2 = 100/2
      const halfH = 70; // (cardHeight - 10) / 2 = 140/2

      if (worldX >= cardWorldX - halfW && worldX <= cardWorldX + halfW &&
          worldY >= cardWorldY - halfH && worldY <= cardWorldY + halfH) {
        const currentHero = card.heroData;
        // 팝업으로 영웅 정보 표시 (씬 전환 없음)
        this.heroPopup?.show(currentHero.id);
        return;
      }
    }
  }

  shutdown() {
    this.transitioning = false; // 씬 종료 시 리셋
    if (this.heroPopup) { this.heroPopup.destroy(); this.heroPopup = null; }
    if (this.bottomNav) { this.bottomNav.destroy(); this.bottomNav = null; }

    // UIX-2.2.1: Clean up card pool
    if (this.cardPool) {
      this.cardPool.destroy();
      this.cardPool = null;
    }

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
    // Smooth scroll position
    const targetY = -this.scrollY;
    if (this.gridContainer && Math.abs(this.gridContainer.y - targetY) > 0.5) {
      this.gridContainer.y = Phaser.Math.Linear(this.gridContainer.y, targetY, 0.2);
    }
  }
}
