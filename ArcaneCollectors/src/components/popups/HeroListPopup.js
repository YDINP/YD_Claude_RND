/**
 * HeroListPopup.js
 * 영웅 목록 팝업 - HeroListScene 로직을 팝업으로 변환
 * 정렬, 필터링, 영웅 클릭 → HeroInfoPopup 표시
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, RARITY, CULT_COLORS } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { HeroInfoPopup } from '../HeroInfoPopup.js';
import { getCharacter } from '../../data/index.js';
import { getRarityKey, getRarityNum } from '../../utils/rarityUtils.js';
import { ProgressionSystem } from '../../systems/ProgressionSystem.js';

export class HeroListPopup extends PopupBase {
  constructor(scene) {
    super(scene, {
      title: '영웅 목록',
      width: 680,
      height: 1100
    });

    this.heroes = [];
    this.sortBy = 'rarity';
    this.sortAscending = false;
    this.filterRarity = null;
    this.filterCult = null;

    this.gridContainer = null;
    this.scrollY = 0;
    this.maxScroll = 0;
    this.isDragging = false;
    this.dragStartY = 0;
    this.dragStartScrollY = 0;

    this.heroPopup = null;
  }

  buildContent() {
    this.loadHeroes();
    this.createFilterBar();
    this.createHeroGrid();
    this.setupScrolling();
  }

  loadHeroes() {
    // registry에서 정규화된 영웅 로드 (name, emoji, rarity 등 포함)
    const registryHeroes = this.scene.registry.get('ownedHeroes') || [];
    if (registryHeroes.length > 0) {
      this.heroes = registryHeroes;
    } else {
      const saveData = SaveManager.load();
      this.heroes = saveData?.characters || [];
    }
  }

  createFilterBar() {
    const { left, top, width, centerX } = this.contentBounds;

    // Sort buttons
    const sortY = top + 10;
    const sortOptions = [
      { key: 'rarity', label: '등급' },
      { key: 'level', label: '레벨' },
      { key: 'power', label: '전투력' },
      { key: 'mood', label: '분위기' },
      { key: 'cult', label: '교단' }
    ];

    this.sortButtons = [];
    const btnW = 60;
    const btnGap = 8;
    const totalW = sortOptions.length * btnW + (sortOptions.length - 1) * btnGap;
    const startX = centerX - totalW / 2;

    sortOptions.forEach((opt, i) => {
      const x = startX + i * (btnW + btnGap);
      const isActive = this.sortBy === opt.key;

      const bg = this.scene.add.rectangle(x + btnW / 2, sortY, btnW, 28,
        isActive ? COLORS.primary : 0x334155, 1);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + btnW / 2, sortY, opt.label, {
        fontSize: '12px', fontFamily: '"Noto Sans KR", sans-serif',
        color: '#FFFFFF', fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

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

      this.contentContainer.add([bg, label]);
      this.sortButtons.push({ bg, label, key: opt.key });
    });

    // Sort direction indicator
    this.sortDirText = this.scene.add.text(startX + totalW + 15, sortY,
      this.sortAscending ? '▲' : '▼', {
        fontSize: '14px', color: '#94A3B8'
      }).setOrigin(0.5);
    this.contentContainer.add(this.sortDirText);

    // Filter row - Rarity
    const filterY = top + 50;
    const rarities = ['N', 'R', 'SR', 'SSR'];
    this.rarityButtons = [];
    const rarityStartX = centerX - (rarities.length * 45) / 2;

    rarities.forEach((rarity, i) => {
      const x = rarityStartX + i * 45;
      const isActive = this.filterRarity === rarity;
      const rarityColor = RARITY[rarity]?.color || 0x9CA3AF;

      const bg = this.scene.add.rectangle(x + 20, filterY, 38, 24,
        isActive ? rarityColor : 0x334155, 0.9);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + 20, filterY, rarity, {
        fontSize: '11px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.filterRarity === rarity) {
          this.filterRarity = null;
        } else {
          this.filterRarity = rarity;
        }
        this.updateRarityButtons();
        this.refreshGrid();
      });

      this.contentContainer.add([bg, label]);
      this.rarityButtons.push({ bg, rarity });
    });

    // Filter row - Cult dots
    const cultY = top + 85;
    const cults = ['olympus', 'takamagahara', 'yomi', 'asgard', 'valhalla',
                   'tartarus', 'avalon', 'helheim', 'kunlun'];
    this.cultButtons = [];
    const cultStartX = left + 30;

    cults.forEach((cult, i) => {
      const x = cultStartX + i * 22;
      const cultColor = CULT_COLORS[cult] || 0x9CA3AF;
      const circle = this.scene.add.circle(x, cultY, 10, cultColor, 0.8);
      circle.setInteractive({ useHandCursor: true });

      circle.on('pointerdown', () => {
        if (this.filterCult === cult) {
          this.filterCult = null;
          circle.setStrokeStyle(0);
        } else {
          this.cultButtons.forEach(cb => cb.circle.setStrokeStyle(0));
          this.filterCult = cult;
          circle.setStrokeStyle(2, 0xFFFFFF);
        }
        this.refreshGrid();
      });

      this.contentContainer.add(circle);
      this.cultButtons.push({ circle, cult });
    });

    // Clear filters button
    const clearBtn = this.scene.add.text(left + width - 50, cultY, '초기화', {
      fontSize: '11px', fontFamily: '"Noto Sans KR", sans-serif',
      color: '#EF4444'
    }).setOrigin(0.5);
    clearBtn.setInteractive({ useHandCursor: true });
    clearBtn.on('pointerdown', () => {
      this.sortBy = 'rarity';
      this.sortAscending = false;
      this.filterRarity = null;
      this.filterCult = null;
      this.updateSortButtons();
      this.updateRarityButtons();
      this.cultButtons.forEach(cb => cb.circle.setStrokeStyle(0));
      this.refreshGrid();
    });
    this.contentContainer.add(clearBtn);

    // Hero count
    this.heroCountText = this.addText(centerX, top + 115, `${this.heroes.length}명`, {
      fontSize: '14px', color: '#94A3B8'
    });
    this.heroCountText.setOrigin(0.5);
  }

  updateSortButtons() {
    this.sortButtons.forEach(({ bg, label, key }) => {
      const isActive = this.sortBy === key;
      bg.setFillStyle(isActive ? COLORS.primary : 0x334155, 1);
      label.setFontStyle(isActive ? 'bold' : 'normal');
    });
    if (this.sortDirText) {
      this.sortDirText.setText(this.sortAscending ? '▲' : '▼');
    }
  }

  updateRarityButtons() {
    this.rarityButtons.forEach(({ bg, rarity }) => {
      const isActive = this.filterRarity === rarity;
      const rarityColor = RARITY[rarity]?.color || 0x9CA3AF;
      bg.setFillStyle(isActive ? rarityColor : 0x334155, 0.9);
    });
  }

  createHeroGrid() {
    const { left, top, width, height } = this.contentBounds;

    // Grid container with mask
    const gridTop = top + 145;
    const gridHeight = height - 145;

    this.gridContainer = this.scene.add.container(0, gridTop);
    this.contentContainer.add(this.gridContainer);

    // Mask for scrolling
    const maskShape = this.scene.make.graphics();
    maskShape.fillRect(left, gridTop, width, gridHeight);
    const mask = maskShape.createGeometryMask();
    this.gridContainer.setMask(mask);

    this.refreshGrid();
  }

  refreshGrid() {
    if (!this.gridContainer) return;
    this.gridContainer.removeAll(true);

    let filtered = [...this.heroes];

    // Apply filters
    if (this.filterRarity) {
      filtered = filtered.filter(h => getRarityKey(h.rarity) === this.filterRarity);
    }
    if (this.filterCult) {
      filtered = filtered.filter(h => h.cult === this.filterCult);
    }

    // Apply sorting
    const direction = this.sortAscending ? 1 : -1;
    switch (this.sortBy) {
      case 'rarity':
        filtered.sort((a, b) =>
          (getRarityNum(b.rarity) - getRarityNum(a.rarity)) * direction);
        break;
      case 'level':
        filtered.sort((a, b) => ((b.level || 1) - (a.level || 1)) * direction);
        break;
      case 'power':
        filtered.sort((a, b) =>
          (this.calculatePower(b) - this.calculatePower(a)) * direction);
        break;
      case 'mood':
        const moodOrder = { brave: 0, fierce: 1, wild: 2, calm: 3, stoic: 4,
                            devoted: 5, cunning: 6, noble: 7, mystic: 8 };
        filtered.sort((a, b) => {
          const aM = moodOrder[a.mood] ?? 99;
          const bM = moodOrder[b.mood] ?? 99;
          return (aM - bM) * direction;
        });
        break;
      case 'cult':
        const cultOrder = { olympus: 0, takamagahara: 1, yomi: 2, asgard: 3,
                            valhalla: 4, tartarus: 5, avalon: 6, helheim: 7, kunlun: 8 };
        filtered.sort((a, b) => {
          const aC = cultOrder[a.cult] ?? 99;
          const bC = cultOrder[b.cult] ?? 99;
          return (aC - bC) * direction;
        });
        break;
    }

    // Update count
    if (this.heroCountText) {
      this.heroCountText.setText(`${filtered.length}명`);
    }

    // Render grid (2 columns)
    const cols = 2;
    const cardW = 110;
    const cardH = 150;
    const spacing = 10;
    const gridW = cols * cardW + (cols - 1) * spacing;
    const startX = this.contentBounds.centerX - gridW / 2 + cardW / 2;

    filtered.forEach((hero, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + spacing);
      const y = row * (cardH + spacing);

      const card = this.createHeroCard(hero, x, y);
      this.gridContainer.add(card);
    });

    // Update max scroll
    const rows = Math.ceil(filtered.length / cols);
    this.maxScroll = Math.max(0, rows * (cardH + spacing) - this.contentBounds.height + 145);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
  }

  createHeroCard(hero, x, y) {
    const card = this.scene.add.container(x, y);

    const cardW = 110;
    const cardH = 150;

    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;

    // Background
    const bg = this.scene.add.rectangle(0, 0, cardW - 10, cardH - 10,
      COLORS.backgroundLight || 0x1E293B, 1);
    bg.setStrokeStyle(2, rarityColor);
    bg.setInteractive({ useHandCursor: true });

    // Rarity badge
    const rarityBg = this.scene.add.rectangle(0, -60, 35, 18, rarityColor, 1);
    const rarityText = this.scene.add.text(0, -60, rKey, {
      fontSize: '11px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    // Portrait placeholder
    const portrait = this.scene.add.text(0, -15, hero.emoji || '👤', {
      fontSize: '36px'
    }).setOrigin(0.5);

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || 1;
    const stars = this.scene.add.text(0, 40, '★'.repeat(starCount), {
      fontSize: '11px', color: '#FFD700'
    }).setOrigin(0.5);

    // Name
    const name = (hero.name || '???').substring(0, 8);
    const nameText = this.scene.add.text(0, 56, name, {
      fontSize: '12px', fontFamily: '"Noto Sans KR", sans-serif', color: '#FFFFFF'
    }).setOrigin(0.5);

    // Level
    const levelText = this.scene.add.text(0, 68, `Lv.${hero.level || 1}`, {
      fontSize: '10px', fontFamily: 'Arial', color: '#94A3B8'
    }).setOrigin(0.5);

    card.add([bg, rarityBg, rarityText, portrait, stars, nameText, levelText]);

    // Click handler
    bg.on('pointerdown', () => {
      this.openHeroInfo(hero.id || hero.characterId);
    });

    // Hover effect
    bg.on('pointerover', () => {
      card.setScale(1.05);
      bg.setFillStyle(COLORS.backgroundLight || 0x1E293B, 0.8);
    });
    bg.on('pointerout', () => {
      card.setScale(1);
      bg.setFillStyle(COLORS.backgroundLight || 0x1E293B, 1);
    });

    return card;
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

  setupScrolling() {
    const { left, top, width, height } = this.contentBounds;
    const scrollTop = top + 145;
    const scrollHeight = height - 145;

    this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.isOpen) return;
      if (pointer.y < scrollTop || pointer.y > scrollTop + scrollHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.scrollY += deltaY * 0.3;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
      this.updateGridPosition();
    });

    this.scene.input.on('pointerdown', (pointer) => {
      if (!this.isOpen) return;
      if (pointer.y < scrollTop || pointer.y > scrollTop + scrollHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.isDragging = false;
      this.dragStartY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    });

    this.scene.input.on('pointermove', (pointer) => {
      if (!this.isOpen || !pointer.isDown || this.dragStartY === 0) return;

      const deltaY = this.dragStartY - pointer.y;
      if (!this.isDragging && Math.abs(deltaY) > 5) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        this.scrollY = this.dragStartScrollY + deltaY;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
        this.updateGridPosition();
      }
    });

    this.scene.input.on('pointerup', () => {
      this.isDragging = false;
      this.dragStartY = 0;
    });
  }

  updateGridPosition() {
    if (this.gridContainer) {
      this.gridContainer.y = this.contentBounds.top + 145 - this.scrollY;
    }
  }

  openHeroInfo(heroId) {
    if (!this.heroPopup) {
      this.heroPopup = new HeroInfoPopup(this.scene);
    }
    this.heroPopup.show(heroId);
  }

  destroy() {
    if (this.heroPopup) {
      this.heroPopup.destroy();
      this.heroPopup = null;
    }
    super.destroy();
  }
}
