/**
 * HeroListPopup.js
 * 영웅 목록 팝업 - HeroListScene 로직을 팝업으로 변환
 * 정렬, 필터링, 영웅 클릭 → HeroInfoPopup 표시
 */
import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, RARITY, CULT_COLORS, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { HeroInfoPopup } from '../HeroInfoPopup.js';
import { getCharacter, getCharacterOrHero } from '../../data/index.js';
import { HeroAssetLoader } from '../../systems/HeroAssetLoader.js';
import { getRarityKey, getRarityNum } from '../../utils/rarityUtils.js';
import { ProgressionSystem } from '../../systems/ProgressionSystem.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { ensureMinTouchTarget } from '../../utils/touchTarget.js';
import { computeRowPositions, computeRowCenterY, computeGridScroll } from '../../utils/touchLayout.js';

/** 헤더 타이틀 */
const TITLE = '영웅 목록';

/**
 * 필터 바 3행의 세로 중심 (콘텐츠 top 기준 기획 px).
 *
 * QA P2-1: 세 줄 모두 히트 영역을 48 로 넓히면 예전 간격(14/52/88 → 38·36px 피치)에서는
 * 위아래 줄이 10px 씩 겹쳐 오탭이 난다. 히트 48 + 여백 6 = 54 피치로 벌린다.
 */
const FILTER_ROW_Y = Object.freeze({ sort: 26, rarity: 80, cult: 134 });

/** 필터 바 높이 — 그리드가 시작되는 오프셋 (기획 px). 마지막 행 히트(134±24) 아래 8px */
const FILTER_BAR_HEIGHT = 166;

/** 등급 필터 4칸 간격 (기획 px). 히트 48 + 여백 4 */
const RARITY_SPACING = 52;

/** 교단 필터 9칸 간격 (기획 px). 히트 48 + 여백 4 — 예전 22px 는 히트가 26px 겹쳤다 */
const CULT_SPACING = 52;

/** 그리드 위/아래 안쪽 여백 (기획 px) */
const GRID_PAD_TOP = 8;
const GRID_PAD_BOTTOM = 16;

/** 그리드 카드 규격 (기획 px) */
const CARD_W = 120;
const CARD_H = 150;
const CARD_GAP = 10;
const GRID_COLS = 3;

export class HeroListPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.brand.primary,
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
  }

  buildContent() {
    this.loadHeroes();
    this.setTitle(TITLE);
    this.applySummary(this.heroes.length);
    this.applyActions();
    this.createFilterBar();
    this.createHeroGrid();
    this.setupScrolling();
  }

  /** 슬롯 2 — 보유 수 · 현재 필터 결과 */
  applySummary(shown) {
    this.setSummary([
      { label: '보유 영웅', value: `${this.heroes.length}명` },
      { label: '표시 중', value: `${shown}명` }
    ]);
  }

  /** 슬롯 4 — 필터 초기화 + 닫기 */
  applyActions() {
    this.setActions([
      {
        label: '필터 초기화',
        variant: 'secondary',
        onClick: () => this.resetFilters()
      },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);
  }

  /** 정렬·등급·교단 필터를 기본값으로 되돌린다 (액션 바 · 콘텐츠 공용) */
  resetFilters() {
    this.sortBy = 'rarity';
    this.sortAscending = false;
    this.filterRarity = null;
    this.filterCult = null;
    this.updateSortButtons();
    this.updateRarityButtons();
    this.cultButtons.forEach(cb => cb.circle.setStrokeStyle(0));
    this.refreshGrid();
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
    const { top, centerX } = this.contentBounds;

    // Sort buttons
    const sortY = top + s(FILTER_ROW_Y.sort);
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
        isActive ? COLORS.primary : DESIGN.colors.bg.surface, 1);
      // 시각은 60×28 그대로, 히트만 60×48 (QA P2-1)
      ensureMinTouchTarget(bg);

      const label = this.scene.add.text(x + btnW / 2, sortY, opt.label, {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif',
        color: DESIGN.colors.text.primary, fontStyle: isActive ? 'bold' : 'normal'
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
        fontSize: sf(14), color: DESIGN.colors.text.secondary
      }).setOrigin(0.5);
    this.contentContainer.add(this.sortDirText);

    // Filter row - Rarity
    const filterY = top + s(FILTER_ROW_Y.rarity);
    const rarities = ['N', 'R', 'SR', 'SSR'];
    this.rarityButtons = [];
    const rarityX = computeRowPositions({
      count: rarities.length, spacing: s(RARITY_SPACING), centerX
    });

    rarities.forEach((rarity, i) => {
      const x = rarityX[i];
      const isActive = this.filterRarity === rarity;
      const rarityColor = RARITY[rarity]?.color || 0x9CA3AF;

      const bg = this.scene.add.rectangle(x, filterY, s(38), s(24),
        isActive ? rarityColor : DESIGN.colors.bg.surface, 0.9);
      // 시각은 38×24 그대로, 히트만 48×48 — 간격 52 라 인접 히트와 4px 떨어진다
      ensureMinTouchTarget(bg);

      const label = this.scene.add.text(x, filterY, rarity, {
        fontSize: sf(11), fontFamily: 'Arial', fontStyle: 'bold', color: DESIGN.colors.text.primary
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
    // QA P2-1 최우선 항목: 20×20 원형을 간격 22 로 늘어놓아 인접 여백이 2px 였다.
    // 원형 크기는 그대로 두고 간격을 52 로 벌린 뒤 히트만 48 로 넓힌다 → 히트 여백 4px.
    const cultY = top + s(FILTER_ROW_Y.cult);
    const cults = ['olympus', 'takamagahara', 'yomi', 'asgard', 'valhalla',
                   'tartarus', 'avalon', 'helheim', 'kunlun'];
    this.cultButtons = [];
    const cultX = computeRowPositions({ count: cults.length, spacing: s(CULT_SPACING), centerX });

    cults.forEach((cult, i) => {
      const x = cultX[i];
      const cultColor = CULT_COLORS[cult] || 0x9CA3AF;
      const circle = this.scene.add.circle(x, cultY, s(10), cultColor, 0.8);
      ensureMinTouchTarget(circle);

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

  }

  updateSortButtons() {
    this.sortButtons.forEach(({ bg, label, key }) => {
      const isActive = this.sortBy === key;
      bg.setFillStyle(isActive ? COLORS.primary : DESIGN.colors.bg.surface, 1);
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
      bg.setFillStyle(isActive ? rarityColor : DESIGN.colors.bg.surface, 0.9);
    });
  }

  createHeroGrid() {
    const { left, top, width, height } = this.contentBounds;

    // Grid container with mask
    const gridTop = top + s(FILTER_BAR_HEIGHT);
    const gridHeight = height - s(FILTER_BAR_HEIGHT);

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

    // 표시 개수는 요약 슬롯(슬롯 2)이 맡는다
    this.applySummary(filtered.length);

    // Render grid (3 columns)
    const cardW = s(CARD_W);
    const cardH = s(CARD_H);
    const spacing = s(CARD_GAP);
    const gridW = GRID_COLS * cardW + (GRID_COLS - 1) * spacing;
    const startX = this.contentBounds.centerX - gridW / 2 + cardW / 2;

    filtered.forEach((hero, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = startX + col * (cardW + spacing);
      // QA P2-5: 카드는 원점이 중앙이라 첫 행 중심을 뷰포트 top 에 두면 위 절반이 잘렸다.
      // 행 중심을 padTop + cardH/2 에서 시작한다.
      const y = computeRowCenterY(row, { itemHeight: cardH, gap: spacing, padTop: s(GRID_PAD_TOP) });

      const card = this.createHeroCard(hero, x, y);
      this.gridContainer.add(card);
    });

    // QA P2-5: 콘텐츠 높이는 행 피치 합이 아니라 실제 점유 span 이다.
    // 예전 식(rows × 피치)은 마지막 행 뒤 gap 과 카드 절반을 더 세어 바닥에 빈 칸을 남겼다.
    const { maxScroll } = computeGridScroll({
      itemCount: filtered.length,
      cols: GRID_COLS,
      itemHeight: cardH,
      gap: spacing,
      viewportHeight: this.contentBounds.height - s(FILTER_BAR_HEIGHT),
      padTop: s(GRID_PAD_TOP),
      padBottom: s(GRID_PAD_BOTTOM)
    });
    this.maxScroll = maxScroll;
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
    this.updateGridPosition();
  }

  createHeroCard(hero, x, y) {
    const card = this.scene.add.container(x, y);

    const cardW = s(CARD_W);
    const cardH = s(CARD_H);

    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;

    // Background
    const bg = this.scene.add.rectangle(0, 0, cardW - s(10), cardH - s(10),
      COLORS.backgroundLight || DESIGN.colors.bg.secondary, 1);
    bg.setStrokeStyle(s(2), rarityColor);
    bg.setInteractive({ useHandCursor: true });

    // Rarity badge
    const rarityBg = this.scene.add.rectangle(0, s(-60), s(35), s(18), rarityColor, 1);
    const rarityText = this.scene.add.text(0, s(-60), rKey, {
      fontSize: sf(11), fontFamily: 'Arial', fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    // Portrait — IMG-3: 온디맨드 텍스처 보장(asc/base 폴백), 그래도 없으면 emoji 폴백
    const fullData = getCharacterOrHero(hero.id || hero.characterId) || hero;
    const portraitKey = HeroAssetLoader.ensureTexture(this.scene, fullData) || `hero_${hero.id || hero.characterId}`;
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
      fontSize: sf(11), color: hexToCSS(DESIGN.colors.brand.accent)
    }).setOrigin(0.5);

    // Name
    const name = (hero.name || '???').substring(0, 8);
    const nameText = this.scene.add.text(0, s(56), name, {
      fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    // Level
    const levelText = this.scene.add.text(0, s(68), `Lv.${hero.level || 1}`, {
      fontSize: sf(10), fontFamily: 'Arial', color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);

    card.add([bg, rarityBg, rarityText, portrait, stars, nameText, levelText]);

    // Click handler
    bg.on('pointerdown', () => {
      this.openHeroInfo(hero.id || hero.characterId);
    });

    // Hover effect
    bg.on('pointerover', () => {
      card.setScale(1.05);
      bg.setFillStyle(COLORS.backgroundLight || DESIGN.colors.bg.secondary, 0.8);
    });
    bg.on('pointerout', () => {
      card.setScale(1);
      bg.setFillStyle(COLORS.backgroundLight || DESIGN.colors.bg.secondary, 1);
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
    const scrollTop = top + s(FILTER_BAR_HEIGHT);
    const scrollHeight = height - s(FILTER_BAR_HEIGHT);

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
      this.gridContainer.y = this.contentBounds.top + s(FILTER_BAR_HEIGHT) - this.scrollY;
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
