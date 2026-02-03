import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULTS, CULT_COLORS, CULT_INFO } from '../config/gameConfig.js';

export class HeroListScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroListScene' });
    this.scrollY = 0;
    this.sortBy = 'rarity';
    this.sortAscending = false;
    this.filterCult = null;
    this.filterRarity = null;
    this.filterButtons = [];
  }

  create() {
    this.cameras.main.fadeIn(300);

    this.createBackground();
    this.createHeader();
    this.createFilterBar();
    this.createHeroGrid();
    this.setupScrolling();
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
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(200);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MainMenuScene');
      });
    });

    // Title
    this.add.text(GAME_WIDTH / 2, 50, '영웅', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    // Hero count
    const heroes = this.registry.get('ownedHeroes') || [];
    this.countText = this.add.text(GAME_WIDTH - 30, 50, `${heroes.length}명`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
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
      { key: 'element', label: '속성순' },
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
        color: '#' + COLORS.text.toString(16).padStart(6, '0')
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
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(20);

    // Second row - Cult filter buttons (속성 대신 교단 필터)
    const cults = ['olympus', 'takamagahara', 'yomi', 'asgard', 'valhalla'];
    this.cultButtons = [];

    cults.forEach((cult, index) => {
      const x = 30 + index * 32;
      const btn = this.add.circle(x, filterY2, 13, CULT_COLORS[cult] || COLORS.textDark, 0.8)
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
        color: '#' + COLORS.text.toString(16).padStart(6, '0')
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

    // Cult filter buttons (use CULT_COLORS for display)
    const cults = Object.values(CULTS); // ['valhalla', 'takamagahara', ...]
    this.cultButtons = [];

    cults.forEach((cult, index) => {
      const x = 400 + (index % 3) * 28;
      const y = filterY2 + Math.floor(index / 3) * 22 - 10;
      const cultColor = CULT_COLORS[cult] || COLORS.textDark;
      const btn = this.add.circle(x, y, 10, cultColor, 0.8)
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

    // Clear filters button
    const clearBtn = this.add.text(GAME_WIDTH - 50, filterY2, '초기화', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#' + COLORS.danger.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(20).setInteractive({ useHandCursor: true });

    clearBtn.on('pointerdown', () => {
        this.filterRarity = null;
      this.filterCult = null;
      this.sortBy = 'rarity';
      this.sortAscending = false;
      this.elementButtons.forEach(eb => eb.btn.setStrokeStyle(0));
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

    let heroes = [...(this.registry.get('ownedHeroes') || [])];

    // Filter by rarity
    if (this.filterRarity) {
      heroes = heroes.filter(h => h.rarity === this.filterRarity);
    }

    // Filter by cult
    if (this.filterCult) {
      heroes = heroes.filter(h => h.cult === this.filterCult);
    }

    // Sort
    const sortDirection = this.sortAscending ? 1 : -1;

    switch (this.sortBy) {
      case 'rarity':
        const rarityOrder = { SSR: 0, SR: 1, R: 2, N: 3 };
        heroes.sort((a, b) => (rarityOrder[a.rarity] - rarityOrder[b.rarity]) * sortDirection);
        break;
      case 'level':
        heroes.sort((a, b) => (b.level - a.level) * sortDirection);
        break;
      case 'element':
        const elemOrder = { fire: 0, water: 1, wind: 2, light: 3, dark: 4 };
        heroes.sort((a, b) => (elemOrder[a.element] - elemOrder[b.element]) * sortDirection);
        break;
      case 'power':
        heroes.sort((a, b) => (this.calculatePower(b) - this.calculatePower(a)) * sortDirection);
        break;
      case 'cult':
        const cultOrder = { valhalla: 0, takamagahara: 1, olympus: 2, asgard: 3, yomi: 4 };
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
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0'),
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
    const rarityColor = RARITY[hero.rarity].color;
    const cardBg = this.add.rectangle(0, 0, 95, 135, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);
    cardBg.setInteractive({ useHandCursor: true });

    // Rarity indicator
    const rarityBg = this.add.rectangle(0, -55, 35, 18, rarityColor, 1);
    const rarityText = this.add.text(0, -55, hero.rarity, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Element icon
    const elemColor = ELEMENTS[hero.element]?.color || 0xffffff;
    const elemIcon = this.add.circle(35, -55, 10, elemColor, 1);

    // Hero portrait
    const portrait = this.add.image(0, -10, 'hero_placeholder').setScale(0.85);

    // Stars
    const stars = this.add.text(0, 35, '★'.repeat(hero.stars), {
      fontSize: '11px',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Name
    const name = hero.name.length > 7 ? hero.name.substring(0, 7) + '..' : hero.name;
    const nameText = this.add.text(0, 50, name, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Level
    const levelText = this.add.text(0, 62, `Lv.${hero.level}`, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    card.add([cardBg, rarityBg, rarityText, elemIcon, portrait, stars, nameText, levelText]);
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

    cardBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(200);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('HeroDetailScene', { heroId: hero.id });
      });
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

  update() {
    // Smooth scroll position (adjusted for extended filter)
    const targetY = 210 - this.scrollY;
    if (this.gridContainer.y !== targetY) {
      this.gridContainer.y = Phaser.Math.Linear(this.gridContainer.y, targetY, 0.2);
    }
  }
}
