import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS } from '../config/gameConfig.js';
import { PartyManager } from '../systems/PartyManager.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import { getCharacter, getAllCharacters, normalizeHeroes } from '../data/index.js';
import transitionManager from '../utils/TransitionManager.js';

/**
 * PartyEditScene - 파티 편성 전용 씬
 * 5개 저장 슬롯, 4인 파티, 시너지 미리보기, 자동 편성
 */
export class PartyEditScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PartyEditScene' });
  }

  init(data) {
    this.returnTo = data?.returnTo || 'MainMenuScene';
    this.returnData = data?.returnData || {};
    this.activeSlot = 1;
    this.partySlots = []; // 현재 슬롯의 영웅 4칸
    this.heroSelectOpen = false;
    this.editingSlotIndex = -1; // 현재 편집 중인 파티 슬롯 인덱스 (0-3)
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    // 파티 데이터 로드
    this.loadPartyData();

    this.createBackground();
    this.createTopBar();
    this.createSlotTabs();
    this.createPartyGrid();
    this.createSynergyPreview();
    this.createActionButtons();

    this.refreshPartyDisplay();
    } catch (error) {
      console.error('[PartyEditScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  loadPartyData() {
    const saveData = SaveManager.load();
    this.parties = saveData?.parties || [];
    this.parties = PartyManager.ensurePartySlots(this.parties);

    // registry에서 정규화된 영웅 로드 (BootScene/LoginScene에서 normalizeHeroes 적용 완료)
    const registryHeroes = this.registry.get('ownedHeroes') || [];
    // SaveManager fallback: registry가 비어있으면 SaveManager에서 로드 후 정규화
    const savedChars = saveData?.characters || [];
    this.ownedHeroes = registryHeroes.length > 0 ? registryHeroes : normalizeHeroes(savedChars);

    // If still empty, give default starter heroes for testing
    if (this.ownedHeroes.length === 0) {
      const allChars = getAllCharacters();
      if (allChars && allChars.length > 0) {
        this.ownedHeroes = normalizeHeroes(allChars.slice(0, 4).map(c => ({
          id: c.id,
          level: 1,
          exp: 0,
          skillLevels: [1, 1, 1]
        })));
        // 세이브 데이터에도 저장
        saveData.characters = this.ownedHeroes;
        SaveManager.save(saveData);
        console.log('[PartyEditScene] 기본 스타터 영웅 4명 지급:', this.ownedHeroes.map(h => h.id));
      }
    }
    this.registry.set('ownedHeroes', this.ownedHeroes);
  }

  createBackground() {
    const g = this.add.graphics();
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const r = y / GAME_HEIGHT;
      const red = Math.floor(15 + r * 10);
      const green = Math.floor(23 + r * 8);
      const blue = Math.floor(42 + r * 15);
      g.fillStyle(Phaser.Display.Color.GetColor(red, green, blue), 1);
      g.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  createTopBar() {
    // 상단 바 배경
    this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.bgDark, 0.9);

    // 뒤로가기 버튼
    const backBtn = this.add.text(30, 50, '◁', {
      fontSize: '32px', color: '#FFFFFF'
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => this.goBack());

    // 제목
    this.add.text(GAME_WIDTH / 2, 50, '파티 편성', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 전투력 표시
    this.powerText = this.add.text(GAME_WIDTH - 30, 50, '전투력: 0', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5);
  }

  createSlotTabs() {
    const tabY = 130;
    const tabW = 120;
    const startX = (GAME_WIDTH - tabW * 5 - 10 * 4) / 2 + tabW / 2;

    this.tabButtons = [];

    for (let i = 0; i < 5; i++) {
      const x = startX + i * (tabW + 10);
      const slot = i + 1;
      const isActive = slot === this.activeSlot;

      const bg = this.add.rectangle(x, tabY, tabW, 40,
        isActive ? COLORS.primary : COLORS.bgPanel, isActive ? 1 : 0.6)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(x, tabY, `파티 ${slot}`, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#FFFFFF',
        fontStyle: isActive ? 'bold' : 'normal'
      }).setOrigin(0.5);

      bg.on('pointerdown', () => this.switchSlot(slot));

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
    const gridY = 220;
    const slotSize = 140;
    const spacing = 15;
    const totalW = slotSize * 4 + spacing * 3;
    const startX = (GAME_WIDTH - totalW) / 2 + slotSize / 2;

    this.heroSlots = [];

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (slotSize + spacing);
      const y = gridY + slotSize / 2;

      // 슬롯 배경
      const bg = this.add.rectangle(x, y, slotSize, slotSize + 30, COLORS.bgLight, 0.7)
        .setStrokeStyle(2, COLORS.bgPanel)
        .setInteractive({ useHandCursor: true });

      // 슬롯 번호
      this.add.text(x, y - slotSize / 2 + 12, `슬롯 ${i + 1}`, {
        fontSize: '11px', fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      // 캐릭터 아이콘 영역 (원형)
      const iconBg = this.add.circle(x, y - 10, 35, COLORS.bgPanel, 0.5);

      // 캐릭터 이름
      const nameText = this.add.text(x, y + 35, '+', {
        fontSize: '14px', fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // 부가 정보 (분위기, 클래스)
      const infoText = this.add.text(x, y + 55, '', {
        fontSize: '11px', fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      // 등급 표시
      const rarityText = this.add.text(x, y - 10, '', {
        fontSize: '24px'
      }).setOrigin(0.5);

      // 제거 버튼
      const removeBtn = this.add.text(x + slotSize / 2 - 8, y - slotSize / 2 - 5, '✕', {
        fontSize: '16px', color: '#FF5555'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);

      removeBtn.on('pointerdown', () => this.removeHeroFromSlot(i));

      bg.on('pointerdown', () => this.openHeroSelect(i));

      this.heroSlots.push({
        bg, iconBg, nameText, infoText, rarityText, removeBtn,
        hero: null, index: i
      });
    }
  }

  createSynergyPreview() {
    const y = 460;

    // 시너지 패널 배경
    this.synergyPanel = this.add.rectangle(GAME_WIDTH / 2, y + 40, GAME_WIDTH - 60, 100, COLORS.bgLight, 0.5)
      .setStrokeStyle(1, COLORS.bgPanel);

    this.add.text(GAME_WIDTH / 2, y, '시너지 효과', {
      fontSize: '14px', fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.synergyTexts = [];
    for (let i = 0; i < 3; i++) {
      const text = this.add.text(50, y + 20 + i * 25, '', {
        fontSize: '13px', fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
      });
      this.synergyTexts.push(text);
    }
  }

  createActionButtons() {
    const btnY = 580;
    const btnWidth = 180;
    const btnHeight = 48;

    // 자동 편성 버튼
    this.createButton(GAME_WIDTH / 2 - 100, btnY, btnWidth, btnHeight,
      '⚡ 자동 편성', COLORS.primary, () => this.autoFormParty());

    // 초기화 버튼
    this.createButton(GAME_WIDTH / 2 + 100, btnY, btnWidth, btnHeight,
      '초기화', COLORS.bgPanel, () => this.clearParty());

    // 저장 버튼
    this.createButton(GAME_WIDTH / 2, btnY + 65, btnWidth + 40, btnHeight + 5,
      '💾 파티 저장', COLORS.success, () => this.saveCurrentParty());

    // 확인 (전투 복귀) 버튼
    if (this.returnTo === 'StageSelectScene' || this.returnTo === 'BattleResultScene') {
      this.createButton(GAME_WIDTH / 2, btnY + 135, btnWidth + 40, btnHeight + 5,
        '✅ 편성 완료', COLORS.secondary, () => this.confirmAndReturn());
    }
  }

  createButton(x, y, w, h, label, color, callback) {
    const bg = this.add.rectangle(x, y, w, h, color, 1)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0xFFFFFF, 0.15);

    const text = this.add.text(x, y, label, {
      fontSize: '16px', fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0.5);

    bg.on('pointerover', () => { bg.setScale(1.03); text.setScale(1.03); });
    bg.on('pointerout', () => { bg.setScale(1); text.setScale(1); });
    bg.on('pointerdown', () => {
      this.tweens.add({
        targets: [bg, text],
        scaleX: 0.95, scaleY: 0.95,
        duration: 50, yoyo: true,
        onComplete: callback
      });
    });

    return { bg, text };
  }

  // === 파티 표시 갱신 ===
  refreshPartyDisplay() {
    const party = this.parties[this.activeSlot - 1];
    const heroIds = party?.heroIds || [];

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
          slot.bg.setStrokeStyle(2, COLORS.success);
          slot.iconBg.setFillStyle(MOODS[heroData.mood]?.color || COLORS.bgPanel, 0.7);
          slot.removeBtn.setVisible(true);
        } else {
          // heroData를 찾지 못한 경우 - 슬롯 비움 처리
          console.warn(`[PartyEditScene] heroId '${heroId}' 데이터를 찾을 수 없음, 슬롯 비움`);
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

    // ownedHeroes 배열에서 검색
    const owned = this.ownedHeroes.find(h =>
      (typeof h === 'string' ? h : h?.id) === heroId
    );
    if (owned && typeof owned === 'object') return owned;

    // data/index.js에서 검색
    try {
      const charData = getCharacter(heroId);
      return charData || null;
    } catch {
      console.warn(`[PartyEditScene] findHeroData: '${heroId}' 캐릭터 데이터 없음`);
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
      const stats = h.stats || {};
      totalPower += (stats.hp || 0) / 10 + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0);
    });
    this.powerText.setText(`전투력: ${Math.floor(totalPower).toLocaleString()}`);
  }

  updateSynergies() {
    const heroIds = this.heroSlots.filter(s => s.hero).map(s => s.hero.id);

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
          this.synergyTexts[i].setText(`${icon} ${syn.name}: ${syn.description || syn.effect || ''}`);
        });
      } else {
        this.synergyTexts[0].setText('활성 시너지 없음');
      }
    } catch (e) {
      this.synergyTexts[0].setText('시너지 계산 중 오류');
      console.warn('[PartyEdit] Synergy error:', e.message);
    }
  }

  // === 영웅 선택 모달 ===
  openHeroSelect(slotIndex) {
    if (this.heroSelectOpen) return;
    this.heroSelectOpen = true;
    this.editingSlotIndex = slotIndex;

    // 현재 파티에 있는 영웅 ID 목록
    const currentIds = this.heroSlots.filter(s => s.hero).map(s => s.hero.id);

    // 보유 영웅 목록 (이미 편성된 영웅 제외)
    const availableHeroes = this.ownedHeroes
      .map(h => typeof h === 'string' ? this.findHeroData(h) : h)
      .filter(h => h && !currentIds.includes(h.id));

    // 오버레이
    this.selectOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setDepth(80).setInteractive();

    // 패널
    const panelH = Math.min(700, 160 + availableHeroes.length * 65);
    this.selectPanel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 40, panelH, COLORS.bgLight, 0.98)
      .setDepth(81).setStrokeStyle(2, COLORS.primary);

    // 타이틀
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - panelH / 2 + 25, `슬롯 ${slotIndex + 1} - 영웅 선택`, {
      fontSize: '20px', fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(82);

    // 닫기 버튼
    const closeBtn = this.add.text(GAME_WIDTH - 50, GAME_HEIGHT / 2 - panelH / 2 + 25, '✕', {
      fontSize: '24px', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(82).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeHeroSelect());

    // 영웅 리스트 (스크롤 가능 영역)
    const listStartY = GAME_HEIGHT / 2 - panelH / 2 + 60;
    const listX = 50;
    const itemH = 60;

    if (availableHeroes.length === 0) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '편성 가능한 영웅이 없습니다', {
        fontSize: '16px', fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(82);
      return;
    }

    // 등급순 정렬 (SSR > SR > R > N)
    const rarityOrder = { SSR: 0, SR: 1, R: 2, N: 3 };
    availableHeroes.sort((a, b) => (rarityOrder[a.rarity] || 9) - (rarityOrder[b.rarity] || 9));

    this.heroListItems = [];
    availableHeroes.forEach((hero, i) => {
      const y = listStartY + i * itemH;
      if (y > GAME_HEIGHT / 2 + panelH / 2 - 40) return; // 패널 밖은 표시 안 함

      const itemBg = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 80, itemH - 5, COLORS.bgPanel, 0.5)
        .setDepth(82).setInteractive({ useHandCursor: true });

      // 등급 색상 원
      const rarityColor = COLORS.rarity?.[hero.rarity] || 0x9CA3AF;
      this.add.circle(listX + 20, y, 15, rarityColor, 0.8).setDepth(82);

      // 이름
      this.add.text(listX + 50, y - 10, hero.nameKo || hero.name, {
        fontSize: '15px', fontFamily: 'Arial',
        color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setDepth(82);

      // 정보 (분위기 · 역할 · 등급)
      const moodName = MOODS[hero.mood]?.name || hero.mood;
      this.add.text(listX + 50, y + 10, `${moodName} · ${hero.role || hero.class} · ${hero.rarity}`, {
        fontSize: '12px', fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5).setDepth(82);

      // 전투력
      const stats = hero.stats || {};
      const power = Math.floor((stats.hp || 0) / 10 + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0));
      this.add.text(GAME_WIDTH - 70, y, power.toString(), {
        fontSize: '14px', fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(1, 0.5).setDepth(82);

      itemBg.on('pointerdown', () => this.selectHero(hero));
      itemBg.on('pointerover', () => itemBg.setFillStyle(COLORS.primary, 0.3));
      itemBg.on('pointerout', () => itemBg.setFillStyle(COLORS.bgPanel, 0.5));

      this.heroListItems.push(itemBg);
    });
  }

  selectHero(hero) {
    const party = this.parties[this.activeSlot - 1];
    if (!party.heroIds) party.heroIds = [];

    // 슬롯에 영웅 배정
    party.heroIds[this.editingSlotIndex] = hero.id;

    this.closeHeroSelect();
    this.refreshPartyDisplay();
  }

  closeHeroSelect() {
    this.heroSelectOpen = false;
    this.editingSlotIndex = -1;

    // depth 80-82 요소 모두 제거
    this.children.list
      .filter(c => c.depth >= 80 && c.depth <= 82)
      .forEach(c => c.destroy());
  }

  removeHeroFromSlot(slotIndex) {
    const party = this.parties[this.activeSlot - 1];
    if (party.heroIds && party.heroIds[slotIndex]) {
      party.heroIds[slotIndex] = null;
      // 빈 슬롯 정리 (뒤로 당기기)
      party.heroIds = party.heroIds.filter(id => id !== null);
      this.refreshPartyDisplay();
    }
  }

  // === 자동 편성 ===
  autoFormParty() {
    const heroes = this.ownedHeroes.map(h => typeof h === 'string' ? this.findHeroData(h) : h).filter(Boolean);

    if (heroes.length === 0) {
      this.showToast('보유 영웅이 없습니다!');
      return;
    }

    const result = PartyManager.autoFormParty(heroes);
    if (result && result.length > 0) {
      const party = this.parties[this.activeSlot - 1];
      party.heroIds = result.slice(0, 4);
      this.refreshPartyDisplay();
      this.showToast('자동 편성 완료!');
    }
  }

  clearParty() {
    const party = this.parties[this.activeSlot - 1];
    party.heroIds = [];
    this.refreshPartyDisplay();
    this.showToast('파티 초기화');
  }

  saveCurrentParty() {
    const party = this.parties[this.activeSlot - 1];
    const heroIds = party.heroIds?.filter(id => id !== null) || [];

    if (heroIds.length === 0) {
      this.showToast('편성된 영웅이 없습니다!');
      return;
    }

    const result = PartyManager.saveParty(this.parties, this.activeSlot, heroIds, `파티 ${this.activeSlot}`);
    if (result.success) {
      this.parties = result.parties;
      SaveManager.saveParties(this.parties);
      this.showToast(`파티 ${this.activeSlot} 저장 완료!`);
    } else {
      this.showToast(result.error || '저장 실패');
    }
  }

  confirmAndReturn() {
    // 현재 파티를 registry에 설정 후 복귀
    const party = this.parties[this.activeSlot - 1];
    const heroIds = party.heroIds?.filter(id => id !== null) || [];
    const heroes = heroIds.map(id => this.findHeroData(id)).filter(Boolean);

    if (heroes.length > 0) {
      this.registry.set('currentTeam', heroes);
    }

    this.goBack();
  }

  goBack() {
    transitionManager.fadeTransition(this, this.returnTo, this.returnData);
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, message, {
      fontSize: '16px', fontFamily: 'Arial',
      color: '#FFFFFF',
      backgroundColor: `#${  COLORS.bgPanel.toString(16).padStart(6, '0')}`,
      padding: { x: 16, y: 10 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      y: toast.y - 40,
      alpha: 0,
      duration: 1200,
      delay: 600,
      onComplete: () => toast.destroy()
    });
  }
}
