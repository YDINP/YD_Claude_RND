import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, MOODS, s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/gameConfig.js';
import { RARITY_COLORS } from '../../config/layoutConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { PartyManager } from '../../systems/PartyManager.js';
import { ProgressionSystem } from '../../systems/ProgressionSystem.js';
import { SynergySystem } from '../../systems/SynergySystem.js';
import { getCharacter, getAllCharacters } from '../../data/index.js';

/**
 * PartyEditPopup - 파티 편성 팝업
 * PopupBase를 상속하여 파티 편성 UI를 팝업 형태로 제공
 *
 * 기능:
 * - 5개 파티 슬롯 탭
 * - 4개 영웅 슬롯 (클릭 시 영웅 선택 서브패널)
 * - 전투력 표시
 * - 시너지 미리보기
 * - 자동 편성 / 초기화 / 저장
 */
export class PartyEditPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '파티 편성',
      width: s(680),
      height: s(1100),
      ...options
    });

    this.activeSlot = 1;
    this.parties = [];
    this.ownedHeroes = [];
    this.heroSlots = [];
    this.tabButtons = [];
    this.heroSelectOpen = false;
    this.editingSlotIndex = -1;
  }

  buildContent() {
    this.loadPartyData();
    this.createSlotTabs();
    this.createPartyGrid();
    this.createSynergyPreview();
    this.createActionButtons();
    this.refreshPartyDisplay();
  }

  loadPartyData() {
    const saveData = SaveManager.load();
    this.parties = saveData?.parties || [];
    this.parties = PartyManager.ensurePartySlots(this.parties);

    // registry에서 영웅 로드
    const registryHeroes = this.scene.registry.get('ownedHeroes') || [];
    const savedChars = saveData?.characters || [];
    this.ownedHeroes = registryHeroes.length > 0 ? registryHeroes : savedChars;

    // 빈 경우 기본 스타터 영웅 제공
    if (this.ownedHeroes.length === 0) {
      const allChars = getAllCharacters();
      if (allChars && allChars.length > 0) {
        this.ownedHeroes = allChars.slice(0, 4).map(c => ({
          id: c.id,
          characterId: c.id,
          level: 1,
          exp: 0,
          skillLevels: [1, 1, 1],
          ...c
        }));
      }
    }
  }

  createSlotTabs() {
    const tabY = this.contentBounds.top + s(10);
    const tabW = s(120);
    const spacing = s(10);
    const totalW = tabW * 5 + spacing * 4;
    const startX = this.contentBounds.centerX - totalW / 2 + tabW / 2;

    for (let i = 0; i < 5; i++) {
      const x = startX + i * (tabW + spacing);
      const slot = i + 1;
      const isActive = slot === this.activeSlot;

      const bg = this.scene.add.rectangle(x, tabY, tabW, s(40),
        isActive ? COLORS.primary : COLORS.bgPanel, isActive ? 1 : 0.6);
      bg.setInteractive({ useHandCursor: true });

      const label = this.scene.add.text(x, tabY, `파티 ${slot}`, {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#FFFFFF',
        fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this.switchSlot(slot));

      this.contentContainer.add([bg, label]);
      this.tabButtons.push({ bg, label, slot });
    }
  }

  switchSlot(slot) {
    this.activeSlot = slot;

    // 탭 UI 갱신
    this.tabButtons.forEach(tab => {
      const isActive = tab.slot === slot;
      tab.bg.setFillStyle(isActive ? COLORS.primary : COLORS.bgPanel, isActive ? 1 : 0.6);
      tab.label.setFontStyle(isActive ? 'bold' : 'normal');
    });

    this.refreshPartyDisplay();
  }

  createPartyGrid() {
    const gridY = this.contentBounds.top + s(70);
    const slotSize = s(140);
    const spacing = s(15);
    const totalW = slotSize * 4 + spacing * 3;
    const startX = this.contentBounds.centerX - totalW / 2 + slotSize / 2;

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (slotSize + spacing);
      const y = gridY + slotSize / 2;

      // 슬롯 배경
      const bg = this.scene.add.rectangle(x, y, slotSize, slotSize + s(30), COLORS.bgLight, 0.7);
      bg.setStrokeStyle(s(2), COLORS.bgPanel);
      bg.setInteractive({ useHandCursor: true });

      // 슬롯 번호
      const slotLabel = this.scene.add.text(x, y - slotSize / 2 + s(12), `슬롯 ${i + 1}`, {
        fontSize: sf(11),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#64748B'
      }).setOrigin(0.5);

      // 캐릭터 아이콘 배경 (원형)
      const iconBg = this.scene.add.circle(x, y - s(10), s(35), COLORS.bgPanel, 0.5);

      // 캐릭터 이름
      const nameText = this.scene.add.text(x, y + s(35), '+', {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#F8FAFC',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // 부가 정보 (분위기, 역할)
      const infoText = this.scene.add.text(x, y + s(55), '', {
        fontSize: sf(11),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#64748B'
      }).setOrigin(0.5);

      // 등급 표시
      const rarityText = this.scene.add.text(x, y - s(10), '', {
        fontSize: sf(24)
      }).setOrigin(0.5);

      // 제거 버튼
      const removeBtn = this.scene.add.text(x + slotSize / 2 - s(8), y - slotSize / 2 - s(5), '✕', {
        fontSize: sf(16),
        color: '#FF5555'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);

      removeBtn.on('pointerdown', () => this.removeHeroFromSlot(i));
      bg.on('pointerdown', () => this.openHeroSelect(i));

      this.contentContainer.add([bg, slotLabel, iconBg, nameText, infoText, rarityText, removeBtn]);
      this.heroSlots.push({
        bg, iconBg, nameText, infoText, rarityText, removeBtn,
        hero: null, index: i
      });
    }
  }

  createSynergyPreview() {
    const y = this.contentBounds.top + s(280);
    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;

    // 시너지 패널 배경
    const panel = this.scene.add.rectangle(cx, y + s(40), this.contentBounds.width, s(100), COLORS.bgLight, 0.5);
    panel.setStrokeStyle(s(1), COLORS.bgPanel);
    this.contentContainer.add(panel);

    this.addText(cx, y, '시너지 효과', {
      fontSize: sf(14),
      fontStyle: 'bold',
      color: '#64748B'
    }).setOrigin(0.5);

    this.synergyTexts = [];
    for (let i = 0; i < 3; i++) {
      const text = this.addText(left + s(30), y + s(20) + i * s(25), '', {
        fontSize: sf(13),
        color: '#F8FAFC'
      });
      this.synergyTexts.push(text);
    }
  }

  createActionButtons() {
    const cx = this.contentBounds.centerX;
    const btnY = this.contentBounds.top + s(430);

    // 전투력 표시
    this.powerText = this.addText(cx, btnY - s(30), '전투력: 0', {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#F59E0B'
    }).setOrigin(0.5);

    // 자동 편성 버튼
    this.addButton(cx - s(100), btnY, s(180), s(48), '⚡ 자동 편성', COLORS.primary, () => {
      this.autoFormParty();
    });

    // 초기화 버튼
    this.addButton(cx + s(100), btnY, s(180), s(48), '초기화', COLORS.bgPanel, () => {
      this.clearParty();
    });

    // 저장 버튼
    this.addButton(cx, btnY + s(65), s(220), s(53), '💾 파티 저장', COLORS.success || 0x10B981, () => {
      this.saveCurrentParty();
    });
  }

  refreshPartyDisplay() {
    const party = this.parties[this.activeSlot - 1];
    const heroIds = party?.heroIds || party || [];

    this.heroSlots.forEach((slot, i) => {
      const heroId = heroIds[i] || null;
      if (heroId) {
        const heroData = this.findHeroData(heroId);
        slot.hero = heroData;
        if (heroData) {
          slot.nameText.setText(heroData.nameKo || heroData.name || heroId);
          const moodInfo = MOODS[heroData.mood];
          slot.infoText.setText(`${moodInfo?.name || heroData.mood || '?'} · ${heroData.role || heroData.class || '?'}`);
          slot.rarityText.setText(this.getRarityStars(heroData.rarity));
          slot.bg.setStrokeStyle(2, COLORS.success || 0x10B981);
          slot.iconBg.setFillStyle(moodInfo?.color || COLORS.bgPanel, 0.7);
          slot.removeBtn.setVisible(true);
        } else {
          // 데이터를 찾지 못한 경우
          slot.hero = null;
          slot.nameText.setText('+');
          slot.infoText.setText('');
          slot.rarityText.setText('');
          slot.bg.setStrokeStyle(2, COLORS.bgPanel);
          slot.iconBg.setFillStyle(COLORS.bgPanel, 0.5);
          slot.removeBtn.setVisible(false);
        }
      } else {
        slot.hero = null;
        slot.nameText.setText('+');
        slot.infoText.setText('');
        slot.rarityText.setText('');
        slot.bg.setStrokeStyle(2, COLORS.bgPanel);
        slot.iconBg.setFillStyle(COLORS.bgPanel, 0.5);
        slot.removeBtn.setVisible(false);
      }
    });

    this.updatePower();
    this.updateSynergies();
  }

  findHeroData(heroId) {
    if (!heroId) return null;

    // ownedHeroes에서 검색
    const owned = this.ownedHeroes.find(h =>
      (typeof h === 'string' ? h : (h?.id || h?.characterId)) === heroId
    );
    if (owned && typeof owned === 'object') return owned;

    // data/index에서 검색
    try {
      const charData = getCharacter(heroId);
      return charData || null;
    } catch {
      return null;
    }
  }

  getRarityStars(rarity) {
    const map = { N: '★★', R: '★★★', SR: '★★★★', SSR: '★★★★★' };
    return map[rarity] || '★';
  }

  updatePower() {
    const heroes = this.heroSlots.filter(s => s.hero).map(s => s.hero);
    let totalPower = 0;
    heroes.forEach(h => {
      try {
        totalPower += ProgressionSystem.calculatePower({
          ...h,
          characterId: h.id || h.characterId,
          skillLevels: h.skillLevels || [1, 1, 1]
        });
      } catch (e) {
        const stats = h.stats || {};
        totalPower += Math.floor((stats.hp || 0) / 10 + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0));
      }
    });
    this.powerText.setText(`전투력: ${Math.floor(totalPower).toLocaleString()}`);
  }

  updateSynergies() {
    const heroIds = this.heroSlots.filter(s => s.hero).map(s => s.hero.id || s.hero.characterId);

    // 시너지 텍스트 초기화
    this.synergyTexts.forEach(t => t.setText(''));

    if (heroIds.length < 2) {
      this.synergyTexts[0].setText('영웅 2명 이상 편성 시 시너지 확인 가능');
      return;
    }

    try {
      const allChars = getAllCharacters ? getAllCharacters() : [];
      const heroData = heroIds.map(id => allChars.find(c => c.id === id)).filter(Boolean);
      const synergies = SynergySystem.calculatePartySynergies(heroIds, heroData);

      if (synergies && synergies.length > 0) {
        synergies.slice(0, 3).forEach((syn, i) => {
          const icon = syn.type === 'cult' ? '⛪' : syn.type === 'mood' ? '🎭' : syn.type === 'role' ? '⚔️' : '✨';
          let effectStr = '';
          if (syn.effect && typeof syn.effect === 'object') {
            const labels = { atk: '공격', def: '방어', hp: 'HP', spd: '속도', all: '전체', skill_dmg: '스킬뎀', lifesteal: '흡혈', crit_rate: '치확', crit_dmg: '치뎀' };
            effectStr = Object.entries(syn.effect).map(([k, v]) => `${labels[k] || k}+${v}%`).join(' ');
          }
          this.synergyTexts[i].setText(`${icon} ${syn.name}${effectStr ? ' ' + effectStr : ''}`);
        });
      } else {
        this.synergyTexts[0].setText('활성 시너지 없음');
      }
    } catch (e) {
      this.synergyTexts[0].setText('시너지 계산 중 오류');
      console.warn('[PartyEditPopup] Synergy error:', e.message);
    }
  }

  openHeroSelect(slotIndex) {
    if (this.heroSelectOpen) return;
    this.heroSelectOpen = true;
    this.editingSlotIndex = slotIndex;

    // 현재 파티에 있는 영웅 ID 목록
    const currentIds = this.heroSlots.filter(s => s.hero).map(s => s.hero.id || s.hero.characterId);

    // 보유 영웅 목록 (모든 영웅 표시)
    const allHeroes = this.ownedHeroes
      .map(h => typeof h === 'string' ? this.findHeroData(h) : h)
      .filter(h => h);

    // 서브패널 오버레이
    const overlay = this.scene.add.rectangle(
      this.contentBounds.centerX,
      this.contentBounds.top + this.contentBounds.height / 2,
      this.contentBounds.width + s(30),
      this.contentBounds.height,
      0x000000,
      0.75
    ).setDepth(2100).setInteractive();

    // 서브패널
    const panelH = s(700);
    const panelW = this.contentBounds.width - s(40);
    const panelY = this.contentBounds.top + s(350);
    const panel = this.scene.add.rectangle(
      this.contentBounds.centerX,
      panelY,
      panelW,
      panelH,
      COLORS.bgLight,
      0.98
    ).setDepth(2101);
    panel.setStrokeStyle(s(2), COLORS.primary);

    // 타이틀
    const title = this.scene.add.text(
      this.contentBounds.centerX,
      panelY - panelH / 2 + s(25),
      `슬롯 ${slotIndex + 1} - 영웅 선택`,
      {
        fontSize: sf(20),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: '#F8FAFC'
      }
    ).setOrigin(0.5).setDepth(2102);

    // 닫기 버튼
    const closeX = this.contentBounds.centerX + panelW / 2 - s(20);
    const closeBtn = this.scene.add.text(
      closeX,
      panelY - panelH / 2 + s(25),
      '✕',
      {
        fontSize: sf(24),
        color: '#FFFFFF'
      }
    ).setOrigin(0.5).setDepth(2102).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeHeroSelect());

    if (allHeroes.length === 0) {
      const msg = this.scene.add.text(
        this.contentBounds.centerX,
        panelY,
        '보유한 영웅이 없습니다',
        {
          fontSize: sf(16),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: '#64748B'
        }
      ).setOrigin(0.5).setDepth(2102);
      return;
    }

    // 등급순 정렬
    const rarityOrder = { SSR: 0, SR: 1, R: 2, N: 3 };
    allHeroes.sort((a, b) => (rarityOrder[a.rarity] || 9) - (rarityOrder[b.rarity] || 9));

    // 그리드 컨테이너 설정
    const gridContainer = this.scene.add.container(0, 0).setDepth(2102);

    // 그리드 설정
    const cols = 3;
    const cardW = s(110);
    const cardH = s(130);
    const gapX = s(15);
    const gapY = s(15);
    const totalGridW = cols * cardW + (cols - 1) * gapX;
    const startX = this.contentBounds.centerX - totalGridW / 2 + cardW / 2;
    const startY = panelY - panelH / 2 + s(70);

    // 스크롤 영역 설정
    const scrollAreaH = panelH - s(120);
    const maskY = startY;
    const maskH = scrollAreaH;

    // 마스크 생성
    const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 }).setDepth(2102);
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(
      this.contentBounds.centerX - totalGridW / 2 - s(10),
      maskY - s(10),
      totalGridW + s(20),
      maskH + s(20)
    );
    const mask = maskGraphics.createGeometryMask();
    gridContainer.setMask(mask);

    // 영웅 카드 생성
    let scrollY = 0;
    const maxScrollY = Math.max(0, Math.ceil(allHeroes.length / cols) * (cardH + gapY) - scrollAreaH + s(30));

    allHeroes.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      const isInParty = currentIds.includes(hero.id || hero.characterId);

      // 카드 배경
      const cardBg = this.scene.add.rectangle(
        x,
        y,
        cardW,
        cardH,
        COLORS.bgPanel,
        isInParty ? 0.3 : 0.7
      );

      // 등급별 테두리
      const rarityStyle = RARITY_COLORS[hero.rarity] || RARITY_COLORS.N;
      cardBg.setStrokeStyle(s(2), rarityStyle.border, isInParty ? 0.4 : 1);

      if (!isInParty) {
        cardBg.setInteractive({ useHandCursor: true });
        cardBg.on('pointerdown', () => this.selectHero(hero));
        cardBg.on('pointerover', () => {
          cardBg.setFillStyle(COLORS.primary, 0.5);
          cardBg.setStrokeStyle(s(3), rarityStyle.border, 1);
        });
        cardBg.on('pointerout', () => {
          cardBg.setFillStyle(COLORS.bgPanel, 0.7);
          cardBg.setStrokeStyle(s(2), rarityStyle.border, 1);
        });
      }

      // 등급 표시 (별)
      const rarityText = this.scene.add.text(
        x,
        y - cardH / 2 + s(18),
        this.getRarityStars(hero.rarity),
        {
          fontSize: sf(14),
          color: '#FFD700'
        }
      ).setOrigin(0.5);

      // 이름
      const nameText = this.scene.add.text(
        x,
        y - s(10),
        hero.nameKo || hero.name,
        {
          fontSize: sf(13),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: isInParty ? '#64748B' : '#F8FAFC',
          fontStyle: 'bold',
          wordWrap: { width: cardW - s(10) },
          align: 'center'
        }
      ).setOrigin(0.5);

      // 레벨
      const levelText = this.scene.add.text(
        x,
        y + s(15),
        `Lv.${hero.level || 1}`,
        {
          fontSize: sf(12),
          fontFamily: '"Noto Sans KR", sans-serif',
          color: isInParty ? '#64748B' : '#94A3B8'
        }
      ).setOrigin(0.5);

      // 편성됨 표시
      let statusText = null;
      if (isInParty) {
        statusText = this.scene.add.text(
          x,
          y + s(38),
          '편성됨',
          {
            fontSize: sf(11),
            fontFamily: '"Noto Sans KR", sans-serif',
            color: '#64748B',
            backgroundColor: '#1E293B',
            padding: { x: s(6), y: s(3) }
          }
        ).setOrigin(0.5);
      }

      gridContainer.add([cardBg, rarityText, nameText, levelText]);
      if (statusText) gridContainer.add(statusText);
    });

    // 스크롤 이벤트
    if (maxScrollY > 0) {
      panel.setInteractive();
      panel.on('wheel', (pointer, deltaX, deltaY) => {
        scrollY = Phaser.Math.Clamp(scrollY + deltaY * 0.5, 0, maxScrollY);
        gridContainer.y = -scrollY;
      });

      // 드래그 스크롤
      let isDragging = false;
      let dragStartY = 0;
      let dragStartScrollY = 0;

      panel.on('pointerdown', (pointer) => {
        isDragging = true;
        dragStartY = pointer.y;
        dragStartScrollY = scrollY;
      });

      this.scene.input.on('pointermove', (pointer) => {
        if (isDragging) {
          const deltaY = dragStartY - pointer.y;
          scrollY = Phaser.Math.Clamp(dragStartScrollY + deltaY, 0, maxScrollY);
          gridContainer.y = -scrollY;
        }
      });

      this.scene.input.on('pointerup', () => {
        isDragging = false;
      });
    }

    // 스크롤 인디케이터
    if (maxScrollY > 0) {
      const indicatorX = this.contentBounds.centerX + totalGridW / 2 + s(20);
      const indicatorH = maskH - s(20);
      const indicatorTrack = this.scene.add.rectangle(
        indicatorX,
        maskY + maskH / 2,
        s(4),
        indicatorH,
        0x64748B,
        0.3
      ).setDepth(2102);

      const indicatorBarH = Math.max(s(30), indicatorH * (scrollAreaH / (scrollAreaH + maxScrollY)));
      const indicatorBar = this.scene.add.rectangle(
        indicatorX,
        maskY + s(10) + indicatorBarH / 2,
        s(4),
        indicatorBarH,
        COLORS.primary,
        0.8
      ).setDepth(2102);

      // 스크롤 업데이트 시 인디케이터 위치 업데이트
      panel.on('wheel', () => {
        const progress = scrollY / maxScrollY;
        const maxBarY = maskY + indicatorH - indicatorBarH / 2 - s(10);
        const minBarY = maskY + indicatorBarH / 2 + s(10);
        indicatorBar.y = minBarY + (maxBarY - minBarY) * progress;
      });
    }
  }

  selectHero(hero) {
    const party = this.parties[this.activeSlot - 1];

    // 파티 데이터 정규화
    if (!Array.isArray(party)) {
      this.parties[this.activeSlot - 1] = { heroIds: [] };
    }
    const heroIds = Array.isArray(party) ? party : (party.heroIds || []);

    // 슬롯에 영웅 배정
    heroIds[this.editingSlotIndex] = hero.id || hero.characterId;

    if (!Array.isArray(party)) {
      this.parties[this.activeSlot - 1].heroIds = heroIds;
    } else {
      this.parties[this.activeSlot - 1] = heroIds;
    }

    this.closeHeroSelect();
    this.refreshPartyDisplay();
  }

  closeHeroSelect() {
    this.heroSelectOpen = false;
    this.editingSlotIndex = -1;

    // depth 2100-2102 요소 모두 제거
    this.scene.children.list
      .filter(c => c.depth >= 2100 && c.depth <= 2103)
      .forEach(c => c.destroy());
  }

  removeHeroFromSlot(slotIndex) {
    const party = this.parties[this.activeSlot - 1];
    const heroIds = Array.isArray(party) ? party : (party.heroIds || []);

    if (heroIds[slotIndex]) {
      heroIds[slotIndex] = null;
      // 빈 슬롯 정리
      const filtered = heroIds.filter(id => id !== null);

      if (Array.isArray(party)) {
        this.parties[this.activeSlot - 1] = filtered;
      } else {
        this.parties[this.activeSlot - 1].heroIds = filtered;
      }

      this.refreshPartyDisplay();
    }
  }

  autoFormParty() {
    const heroes = this.ownedHeroes.map(h => typeof h === 'string' ? this.findHeroData(h) : h).filter(Boolean);

    if (heroes.length === 0) {
      this.showToast('보유 영웅이 없습니다!');
      return;
    }

    // 전투력 기준으로 정렬 후 상위 4명 선택
    heroes.sort((a, b) => {
      let powerA = 0, powerB = 0;
      try {
        powerA = ProgressionSystem.calculatePower({
          ...a,
          characterId: a.id || a.characterId,
          skillLevels: a.skillLevels || [1, 1, 1]
        });
        powerB = ProgressionSystem.calculatePower({
          ...b,
          characterId: b.id || b.characterId,
          skillLevels: b.skillLevels || [1, 1, 1]
        });
      } catch (e) {
        powerA = (a.stats?.atk || 0);
        powerB = (b.stats?.atk || 0);
      }
      return powerB - powerA;
    });

    const topHeroes = heroes.slice(0, 4).map(h => h.id || h.characterId);

    const party = this.parties[this.activeSlot - 1];
    if (Array.isArray(party)) {
      this.parties[this.activeSlot - 1] = topHeroes;
    } else {
      this.parties[this.activeSlot - 1] = { heroIds: topHeroes };
    }

    this.refreshPartyDisplay();
    this.showToast('자동 편성 완료!');
  }

  clearParty() {
    const party = this.parties[this.activeSlot - 1];
    if (Array.isArray(party)) {
      this.parties[this.activeSlot - 1] = [];
    } else {
      this.parties[this.activeSlot - 1] = { heroIds: [] };
    }
    this.refreshPartyDisplay();
    this.showToast('파티 초기화');
  }

  saveCurrentParty() {
    const party = this.parties[this.activeSlot - 1];
    const heroIds = Array.isArray(party) ? party : (party.heroIds || []);
    const filtered = heroIds.filter(id => id !== null);

    if (filtered.length === 0) {
      this.showToast('편성된 영웅이 없습니다!');
      return;
    }

    // 파티 저장
    SaveManager.saveParties(this.parties);

    // registry 업데이트
    const heroes = filtered.map(id => this.findHeroData(id)).filter(Boolean);
    if (heroes.length > 0) {
      this.scene.registry.set('currentTeam', heroes);
    }

    this.showToast(`파티 ${this.activeSlot} 저장 완료!`);
  }

  showToast(message) {
    const toast = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.bottom - s(50), message, {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      backgroundColor: '#334155',
      padding: { x: s(16), y: s(10) }
    }).setOrigin(0.5).setDepth(2100);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - s(40),
      alpha: 0,
      duration: 1200,
      delay: 600,
      onComplete: () => toast.destroy()
    });
  }
}
