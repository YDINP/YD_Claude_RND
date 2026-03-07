/**
 * HeroListPopup.js
 * Collection Codex view with ascension progress tracking
 */
import Phaser from "phaser";
import { PopupBase } from "../PopupBase.js";
import { COLORS, GAME_WIDTH, RARITY, CULT_COLORS, s, sf } from "../../config/gameConfig.js";
import { SaveManager } from "../../systems/SaveManager.js";
import { HeroInfoPopup } from "../HeroInfoPopup.js";
import { getCharacter } from "../../data/index.js";
import { getRarityKey, getRarityNum } from "../../utils/rarityUtils.js";
import { ProgressionSystem } from "../../systems/ProgressionSystem.js";

export function buildOwnedSet(ownedAscendedHeroes) {
  if (!Array.isArray(ownedAscendedHeroes)) return new Set();
  return new Set(ownedAscendedHeroes.map(h => h.ascendedHeroId));
}

export function calcCodexProgress(baseHero, ownedSet) {
  const routes = baseHero.ascensionRoutes || [];
  const total = routes.length;
  const owned = routes.filter(r => ownedSet.has(r.ascendedHeroId)).length;
  return { owned, total };
}

export function buildAscendedCardData(routes, baseHero, ownedSet) {
  return routes.map(route => ({
    ascendedHeroId: route.ascendedHeroId,
    cultId: route.cultId,
    resultRarity: route.resultRarity,
    routeKeywords: route.routeKeywords || [],
    loreHint: route.loreHint || "",
    resonanceBoost: route.resonanceBoost || false,
    isOwned: ownedSet.has(route.ascendedHeroId),
    baseHeroName: baseHero.name,
    baseHeroId: baseHero.id
  }));
}

export function buildCodexSections(baseHeroes, ownedSet) {
  if (!Array.isArray(baseHeroes)) return [];
  return baseHeroes.map(baseHero => {
    const routes = baseHero.ascensionRoutes || [];
    const cards = buildAscendedCardData(routes, baseHero, ownedSet);
    const progress = calcCodexProgress(baseHero, ownedSet);
    return { baseHero, cards, progress };
  });
}

export class HeroListPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '영웅 목록',
      width: s(680),
      height: s(1100),
      ...options
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

    this.viewMode = 'list';
    this.codexScrollY = 0;
    this.codexMaxScroll = 0;
    this.codexContainer = null;
    this.tabButtons = [];
  }

  buildContent() {
    this.loadHeroes();
    this.createViewTabs();
    this.createFilterBar();
    this.createHeroGrid();
    this.setupScrolling();
  }

  loadHeroes() {
    const registryHeroes = this.scene.registry.get('ownedHeroes') || [];
    if (registryHeroes.length > 0) {
      this.heroes = registryHeroes;
    } else {
      const saveData = SaveManager.load();
      this.heroes = saveData?.characters || [];
    }
  }

  createViewTabs() {
    const { top, centerX } = this.contentBounds;
    const tabY = top + s(15);
    const tabs = [
      { key: 'list', label: '보유 목록' },
      { key: 'codex', label: '컬렉션 도감' }
    ];
    const tabW = s(120);
    const tabGap = s(8);
    const totalW = tabs.length * tabW + (tabs.length - 1) * tabGap;
    const startX = centerX - totalW / 2;

    this.tabButtons = [];
    tabs.forEach((tab, i) => {
      const x = startX + i * (tabW + tabGap);
      const isActive = this.viewMode === tab.key;

      const bg = this.scene.add.rectangle(x + tabW / 2, tabY, tabW, s(28),
        isActive ? COLORS.primary : 0x334155, 1);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + tabW / 2, tabY, tab.label, {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif',
        color: '#FFFFFF', fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.viewMode === tab.key) return;
        this.viewMode = tab.key;
        this._updateTabStyles();
        this._switchView();
      });

      this.contentContainer.add([bg, label]);
      this.tabButtons.push({ bg, label, key: tab.key });
    });
  }

  _updateTabStyles() {
    this.tabButtons.forEach(({ bg, label, key }) => {
      const isActive = this.viewMode === key;
      bg.setFillStyle(isActive ? COLORS.primary : 0x334155, 1);
      label.setFontStyle(isActive ? 'bold' : 'normal');
    });
  }

  _switchView() {
    if (this.viewMode === 'list') {
      if (this.gridContainer) this.gridContainer.setVisible(true);
      if (this.codexContainer) this.codexContainer.setVisible(false);
      this.sortButtons && this.sortButtons.forEach(b => {
        b.bg.setVisible(true); b.label.setVisible(true);
      });
      if (this.sortDirText) this.sortDirText.setVisible(true);
      this.rarityButtons && this.rarityButtons.forEach(b => b.bg.setVisible(true));
      this.cultButtons && this.cultButtons.forEach(b => b.circle.setVisible(true));
      if (this.heroCountText) this.heroCountText.setVisible(true);
    } else {
      if (this.gridContainer) this.gridContainer.setVisible(false);
      this.sortButtons && this.sortButtons.forEach(b => {
        b.bg.setVisible(false); b.label.setVisible(false);
      });
      if (this.sortDirText) this.sortDirText.setVisible(false);
      this.rarityButtons && this.rarityButtons.forEach(b => b.bg.setVisible(false));
      this.cultButtons && this.cultButtons.forEach(b => b.circle.setVisible(false));
      if (this.heroCountText) this.heroCountText.setVisible(false);
      this.buildCodexView();
    }
  }

  buildCodexView() {
    if (this.codexContainer) {
      this.codexContainer.destroy();
      this.codexContainer = null;
    }

    const { left, top, width, height } = this.contentBounds;
    const codexTop = top + s(55);
    const codexHeight = height - s(55);

    this.codexContainer = this.scene.add.container(0, codexTop);
    this.contentContainer.add(this.codexContainer);

    const maskShape = this.scene.make.graphics();
    maskShape.fillRect(left, codexTop, width, codexHeight);
    const mask = maskShape.createGeometryMask();
    this.codexContainer.setMask(mask);

    const ownedAscended = SaveManager.getOwnedAscendedHeroes
      ? SaveManager.getOwnedAscendedHeroes()
      : [];
    const baseHeroes = SaveManager.getAllBaseHeroes
      ? SaveManager.getAllBaseHeroes()
      : [];

    const ownedSet = buildOwnedSet(ownedAscended);
    const sections = buildCodexSections(baseHeroes, ownedSet);

    let curY = 0;
    sections.forEach(section => {
      curY = this.renderCodexSection(section, curY);
    });

    this.codexScrollY = 0;
    this.codexMaxScroll = Math.max(0, curY - codexHeight);
    this.setupCodexScrolling(codexTop, codexHeight);
  }

  renderCodexSection(section, startY) {
    const { baseHero, cards, progress } = section;
    const { left, width, centerX } = this.contentBounds;
    let y = startY;

    const headerBg = this.scene.add.rectangle(
      centerX, y + s(20), width - s(20), s(36), 0x1E293B, 1
    );
    headerBg.setStrokeStyle(1, 0x334155);

    const headerLabel = this.scene.add.text(
      left + s(20), y + s(20),
      baseHero.name || '???', {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif',
        color: '#F8FAFC', fontStyle: 'bold'
      }
    ).setOrigin(0, 0.5);

    const progressColor = progress.owned === progress.total ? '#10B981' : '#94A3B8';
    const progressLabel = this.scene.add.text(
      left + width - s(20), y + s(20),
      progress.owned + '/' + progress.total, {
        fontSize: sf(13), fontFamily: 'Arial',
        color: progressColor
      }
    ).setOrigin(1, 0.5);

    this.codexContainer.add([headerBg, headerLabel, progressLabel]);
    y += s(45);

    const cardW = s(90);
    const cardH = s(110);
    const cardGap = s(10);
    const cardsPerRow = 4;
    const rowW = cardsPerRow * cardW + (cardsPerRow - 1) * cardGap;
    const rowStartX = this.contentBounds.centerX - rowW / 2 + cardW / 2;

    cards.forEach((cardData, i) => {
      const col = i % cardsPerRow;
      const row = Math.floor(i / cardsPerRow);
      const cx = rowStartX + col * (cardW + cardGap);
      const cy = y + row * (cardH + cardGap);

      if (cardData.isOwned) {
        this._renderOwnedCard(cardData, cx, cy, cardW, cardH);
      } else {
        this._renderLockedCard(cardData, cx, cy, cardW, cardH);
      }
    });

    const cardRows = Math.ceil(cards.length / cardsPerRow);
    y += cardRows * (cardH + cardGap) + s(10);
    return y;
  }

  _cultNameMap() {
    return {
      prism_stars: '프리즘 스타즈', neon_crow: '네온 크로우', ink_cyclone: '잉크 사이클론',
      stella_club: '스텔라 클럽', card_cartel: '카드 카르텔', buddy_garden: '버디 가든',
      glitch_paradise: '글리치 파라다이스', cafe_encore: '카페 앙코르',
      lunatic_circus: '루나틱 서커스', iron_beat: '아이언 비트'
    };
  }

  _renderOwnedCard(cardData, cx, cy, cardW, cardH) {
    const cultColor = CULT_COLORS[cardData.cultId] || 0x9CA3AF;
    const rarityColor = RARITY[cardData.resultRarity]
      ? RARITY[cardData.resultRarity].color
      : 0x9CA3AF;

    const bg = this.scene.add.rectangle(cx, cy, cardW - s(4), cardH - s(4), 0x1E293B, 1);
    bg.setStrokeStyle(s(2), rarityColor);

    const rarityBadge = this.scene.add.rectangle(cx, cy - s(43), s(30), s(16), rarityColor, 1);
    const rarityText = this.scene.add.text(cx, cy - s(43), cardData.resultRarity, {
      fontSize: sf(10), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const portraitBg = this.scene.add.rectangle(cx, cy - s(15), s(50), s(50), cultColor, 0.4);
    const portraitBorder = this.scene.add.rectangle(cx, cy - s(15), s(50), s(50), cultColor, 0);
    portraitBorder.setStrokeStyle(s(2), cultColor);

    const cultNameMap = this._cultNameMap();
    const cultLabel = cultNameMap[cardData.cultId] || cardData.cultId;

    const nameText = this.scene.add.text(cx, cy + s(25), cultLabel, {
      fontSize: sf(10), fontFamily: '"Noto Sans KR", sans-serif', color: '#F8FAFC'
    }).setOrigin(0.5);

    this.codexContainer.add([bg, rarityBadge, rarityText, portraitBg, portraitBorder, nameText]);

    if (cardData.resonanceBoost) {
      const boostIcon = this.scene.add.text(cx + s(32), cy - s(43), "★", {
        fontSize: sf(9), color: '#FFD700'
      }).setOrigin(0.5);
      this.codexContainer.add(boostIcon);
    }
  }

  _renderLockedCard(cardData, cx, cy, cardW, cardH) {
    const bg = this.scene.add.rectangle(cx, cy, cardW - s(4), cardH - s(4), 0x0F172A, 1);
    bg.setStrokeStyle(s(1), 0x334155);

    const silhouette = this.scene.add.rectangle(cx, cy - s(15), s(50), s(50), 0x1E293B, 1);

    const lockIcon = this.scene.add.text(cx, cy - s(15), "🔒", {
      fontSize: sf(20)
    }).setOrigin(0.5);

    const cultNameMap = this._cultNameMap();
    const cultLabel = cultNameMap[cardData.cultId] || cardData.cultId;

    const nameText = this.scene.add.text(cx, cy + s(25), cultLabel, {
      fontSize: sf(10), fontFamily: '"Noto Sans KR", sans-serif', color: '#475569'
    }).setOrigin(0.5);

    this.codexContainer.add([bg, silhouette, lockIcon, nameText]);
  }

  setupCodexScrolling(codexTop, codexHeight) {
    const { left, width } = this.contentBounds;

    this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.isOpen || this.viewMode !== 'codex') return;
      if (pointer.y < codexTop || pointer.y > codexTop + codexHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.codexScrollY += deltaY * 0.3;
      this.codexScrollY = Phaser.Math.Clamp(this.codexScrollY, 0, this.codexMaxScroll);
      this._updateCodexPosition(codexTop);
    });

    let codexDragStartY = 0;
    let codexDragStartScrollY = 0;
    let codexIsDragging = false;

    this.scene.input.on('pointerdown', (pointer) => {
      if (!this.isOpen || this.viewMode !== 'codex') return;
      if (pointer.y < codexTop || pointer.y > codexTop + codexHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;
      codexDragStartY = pointer.y;
      codexDragStartScrollY = this.codexScrollY;
      codexIsDragging = false;
    });

    this.scene.input.on('pointermove', (pointer) => {
      if (!this.isOpen || this.viewMode !== 'codex' || !pointer.isDown) return;
      const delta = codexDragStartY - pointer.y;
      if (!codexIsDragging && Math.abs(delta) > s(5)) codexIsDragging = true;
      if (codexIsDragging) {
        this.codexScrollY = Phaser.Math.Clamp(
          codexDragStartScrollY + delta, 0, this.codexMaxScroll
        );
        this._updateCodexPosition(codexTop);
      }
    });

    this.scene.input.on('pointerup', () => {
      codexIsDragging = false;
      codexDragStartY = 0;
    });
  }

  _updateCodexPosition(codexTop) {
    if (this.codexContainer) {
      this.codexContainer.y = codexTop - this.codexScrollY;
    }
  }

  createFilterBar() {
    const { left, top, width, centerX } = this.contentBounds;

    // Sort buttons
    const sortY = top + s(45);
    const sortOptions = [
      { key: 'rarity', label: '등급' },
      { key: 'level', label: '레벨' },
      { key: 'power', label: '전투력' },
      { key: 'mood', label: '분위기' },
      { key: 'cult', label: '교단' }
    ];

    this.sortButtons = [];
    const btnW = s(60);
    const btnGap = s(8);
    const totalW = sortOptions.length * btnW + (sortOptions.length - 1) * btnGap;
    const startX = centerX - totalW / 2;

    sortOptions.forEach((opt, i) => {
      const x = startX + i * (btnW + btnGap);
      const isActive = this.sortBy === opt.key;

      const bg = this.scene.add.rectangle(x + btnW / 2, sortY, btnW, s(28),
        isActive ? COLORS.primary : 0x334155, 1);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + btnW / 2, sortY, opt.label, {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif',
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
    this.sortDirText = this.scene.add.text(startX + totalW + s(15), sortY,
      this.sortAscending ? '▲' : '▼', {
        fontSize: sf(14), color: '#94A3B8'
      }).setOrigin(0.5);
    this.contentContainer.add(this.sortDirText);

    // Filter row - Rarity
    const filterY = top + s(90);
    const rarities = ['N', 'R', 'SR', 'SSR'];
    this.rarityButtons = [];
    const rarityStartX = centerX - (rarities.length * s(45)) / 2;

    rarities.forEach((rarity, i) => {
      const x = rarityStartX + i * s(45);
      const isActive = this.filterRarity === rarity;
      const rarityColor = RARITY[rarity]?.color || 0x9CA3AF;

      const bg = this.scene.add.rectangle(x + s(20), filterY, s(38), s(24),
        isActive ? rarityColor : 0x334155, 0.9);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x + s(20), filterY, rarity, {
        fontSize: sf(11), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
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
    const cultY = top + s(125);
    const cults = ['prism_stars', 'neon_crow', 'ink_cyclone', 'stella_club', 'card_cartel',
                   'buddy_garden', 'glitch_paradise', 'cafe_encore', 'lunatic_circus', 'iron_beat'];
    this.cultButtons = [];
    const cultStartX = left + s(30);

    cults.forEach((cult, i) => {
      const x = cultStartX + i * s(22);
      const cultColor = CULT_COLORS[cult] || 0x9CA3AF;
      const circle = this.scene.add.circle(x, cultY, s(10), cultColor, 0.8);
      circle.setInteractive({ useHandCursor: true });

      circle.on('pointerdown', () => {
        if (this.filterCult === cult) {
          this.filterCult = null;
          circle.setStrokeStyle(0);
        } else {
          this.cultButtons.forEach(cb => cb.circle.setStrokeStyle(0));
          this.filterCult = cult;
          circle.setStrokeStyle(s(2), 0xFFFFFF);
        }
        this.refreshGrid();
      });

      this.contentContainer.add(circle);
      this.cultButtons.push({ circle, cult });
    });

    // Clear filters button
    const clearBtn = this.scene.add.text(left + width - s(50), cultY, '초기화', {
      fontSize: sf(11), fontFamily: '"Noto Sans KR", sans-serif',
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
    this.heroCountText = this.addText(centerX, top + s(155), `${this.heroes.length}명`, {
      fontSize: sf(14), color: '#94A3B8'
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
    const gridTop = top + s(190);
    const gridHeight = height - s(190);

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
      case 'mood': {
        const moodOrder = { brave: 0, fierce: 1, wild: 2, calm: 3, stoic: 4,
                            devoted: 5, cunning: 6, noble: 7, mystic: 8 };
        filtered.sort((a, b) => {
          const aM = moodOrder[a.mood] ?? 99;
          const bM = moodOrder[b.mood] ?? 99;
          return (aM - bM) * direction;
        });
        break;
      }
      case 'cult': {
        const cultOrder = { prism_stars: 0, neon_crow: 1, ink_cyclone: 2, stella_club: 3,
                            card_cartel: 4, buddy_garden: 5, glitch_paradise: 6,
                            cafe_encore: 7, lunatic_circus: 8, iron_beat: 9 };
        filtered.sort((a, b) => {
          const aC = cultOrder[a.cult] ?? 99;
          const bC = cultOrder[b.cult] ?? 99;
          return (aC - bC) * direction;
        });
        break;
      }
    }

    // Update count
    if (this.heroCountText) {
      this.heroCountText.setText(`${filtered.length}명`);
    }

    // Render grid (3 columns)
    const cols = 3;
    const cardW = s(120);
    const cardH = s(150);
    const spacing = s(10);
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
    const gridHeight = this.contentBounds.height - s(190);
    this.maxScroll = Math.max(0, rows * (cardH + spacing) - gridHeight);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
  }

  createHeroCard(hero, x, y) {
    const card = this.scene.add.container(x, y);

    const cardW = s(120);
    const cardH = s(150);

    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;

    // Background
    const bg = this.scene.add.rectangle(0, 0, cardW - s(10), cardH - s(10),
      COLORS.backgroundLight || 0x1E293B, 1);
    bg.setStrokeStyle(s(2), rarityColor);
    bg.setInteractive({ useHandCursor: true });

    // Rarity badge
    const rarityBg = this.scene.add.rectangle(0, s(-60), s(35), s(18), rarityColor, 1);
    const rarityText = this.scene.add.text(0, s(-60), rKey, {
      fontSize: sf(11), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    // Portrait — DiceBear 이미지 우선, 없으면 emoji 폴백
    const portraitKey = `hero_${hero.id || hero.characterId}`;
    let portrait;
    if (this.scene.textures.exists(portraitKey)) {
      portrait = this.scene.add.image(0, s(-15), portraitKey);
      portrait.setDisplaySize(s(60), s(60));
    } else {
      portrait = this.scene.add.text(0, s(-15), hero.emoji || '👤', {
        fontSize: sf(36)
      }).setOrigin(0.5);
    }

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || 1;
    const stars = this.scene.add.text(0, s(40), '★'.repeat(starCount), {
      fontSize: sf(11), color: '#FFD700'
    }).setOrigin(0.5);

    // Name
    const name = (hero.name || '???').substring(0, 8);
    const nameText = this.scene.add.text(0, s(56), name, {
      fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: '#FFFFFF'
    }).setOrigin(0.5);

    // Level
    const levelText = this.scene.add.text(0, s(68), `Lv.${hero.level || 1}`, {
      fontSize: sf(10), fontFamily: 'Arial', color: '#94A3B8'
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
      const st = hero.stats || {};
      return Math.floor((st.hp || 0) / 10 + (st.atk || 0) + (st.def || 0) + (st.spd || 0));
    }
  }

  setupScrolling() {
    const { left, top, width, height } = this.contentBounds;
    const scrollTop = top + s(190);
    const scrollHeight = height - s(190);

    this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.isOpen || this.viewMode !== 'list') return;
      if (pointer.y < scrollTop || pointer.y > scrollTop + scrollHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.scrollY += deltaY * 0.3;
      this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
      this.updateGridPosition();
    });

    this.scene.input.on('pointerdown', (pointer) => {
      if (!this.isOpen || this.viewMode !== 'list') return;
      if (pointer.y < scrollTop || pointer.y > scrollTop + scrollHeight) return;
      if (pointer.x < left || pointer.x > left + width) return;

      this.isDragging = false;
      this.dragStartY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    });

    this.scene.input.on('pointermove', (pointer) => {
      if (!this.isOpen || this.viewMode !== 'list' || !pointer.isDown || this.dragStartY === 0) return;

      const deltaY = this.dragStartY - pointer.y;
      if (!this.isDragging && Math.abs(deltaY) > s(5)) {
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
      this.gridContainer.y = this.contentBounds.top + s(190) - this.scrollY;
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
