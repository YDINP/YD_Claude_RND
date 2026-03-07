import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import GameLogger from '../utils/GameLogger.js';
import { energySystem } from '../systems/EnergySystem.js';
import { PartyManager } from '../systems/PartyManager.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { sweepSystem } from '../systems/SweepSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import { getAllCharacters, getChapterStages } from '../data/index.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import { SweepRewardPopup } from '../components/popups/SweepRewardPopup.js';

export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StageSelectScene' });
    this.selectedStage = null;
    this.currentChapter = 1;
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    this.createBackground();
    this.createHeader();
    this.createChapterTitle();
    this.createStageList();
    this.createPartySelectModal();
    this.createSweepModal();
    } catch (error) {
      console.error('[StageSelectScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  createBackground() {
    // ART-1: 배경 텍스처 사용 (폴백: 기존 그래디언트)
    if (this.textures.exists('bg_stage')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_stage').setOrigin(0.5);
    } else {
      // Fallback: Forest theme gradient
      const graphics = this.add.graphics();

      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(10 + ratio * 5);
        const g = Math.floor(20 + ratio * 10);
        const b = Math.floor(15 + ratio * 5);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }

      // Decorative trees/fog
      for (let i = 0; i < 15; i++) {
        const x = Phaser.Math.Between(0, GAME_WIDTH);
        const y = Phaser.Math.Between(s(100), GAME_HEIGHT - s(100));
        const size = Phaser.Math.Between(s(30), s(80));
        const alpha = Phaser.Math.FloatBetween(0.05, 0.15);

        graphics.fillStyle(0x1a472a, alpha);
        graphics.fillTriangle(
          x, y - size,
          x - size / 2, y + size / 2,
          x + size / 2, y + size / 2
        );
      }
    }
  }

  createHeader() {
    // LAYOUT 통일: Header background (100px)
    const headerBg = this.add.rectangle(GAME_WIDTH / 2, s(50), GAME_WIDTH, s(100), COLORS.backgroundLight, 0.9);
    headerBg.setDepth(20);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBtn = this.add.container(s(30), s(50)).setDepth(21);
    const backBg = this.add.rectangle(0, 0, s(50), s(40), COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      navigationManager.goBack(this);
    });

    // Title
    this.add.text(GAME_WIDTH / 2, s(50), '모험', {
      fontSize: sf(28),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    // Energy display (동적)
    const energyStatus = energySystem.getStatus();
    this.energyText = this.add.text(GAME_WIDTH - s(30), s(50), `⚡ ${energyStatus.current}/${energyStatus.max}`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(1, 0.5).setDepth(21);
  }

  createChapterTitle() {
    // LAYOUT 통일: 챕터 타이틀 영역 y=120 (content 시작)
    const titleY = s(120);

    // Chapter navigation
    const prevBtn = this.add.text(s(30), titleY, '◀', {
      fontSize: sf(24),
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const nextBtn = this.add.text(GAME_WIDTH - s(30), titleY, '▶', {
      fontSize: sf(24),
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Chapter title
    this.chapterTitle = this.add.text(GAME_WIDTH / 2, titleY, '', {
      fontSize: sf(20),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.updateChapterTitle();

    prevBtn.on('pointerdown', () => {
      if (this.currentChapter > 1) {
        this.currentChapter--;
        this.updateChapterTitle();
        this.refreshStages();
      }
    });

    nextBtn.on('pointerdown', () => {
      if (this.currentChapter < 3) { // 3 chapters for demo
        this.currentChapter++;
        this.updateChapterTitle();
        this.refreshStages();
      }
    });
  }

  updateChapterTitle() {
    const chapters = {
      1: 'Chapter 1: 어둠의 숲',
      2: 'Chapter 2: 얼음 동굴',
      3: 'Chapter 3: 화염 계곡'
    };
    this.chapterTitle.setText(chapters[this.currentChapter] || 'Chapter 1');
  }

  createStageList() {
    this.stageContainer = this.add.container(0, 0);
    this.refreshStages();
  }

  refreshStages() {
    this.stageContainer.removeAll(true);

    const clearedStages = this.registry.get('clearedStages') || {};
    const stages = this.generateStages(this.currentChapter);

    // LAYOUT 통일: 스테이지 버튼 그리드 시작 y=160
    const startY = s(160);
    const stageHeight = s(90);

    stages.forEach((stage, index) => {
      const y = startY + index * stageHeight;
      const isCleared = clearedStages[stage.id] !== undefined;
      const isLocked = index > 0 && clearedStages[stages[index - 1].id] === undefined;

      this.createStageCard(stage, y, isCleared, isLocked);
    });
  }

  generateStages(chapter) {
    // data/index.js에서 동적 로드 시도
    const dataStages = getChapterStages(chapter);

    if (dataStages && dataStages.length > 0) {
      console.log(`[StageSelect] Loaded ${dataStages.length} stages from data for chapter ${chapter}`);
      return dataStages.map((stage, i) => ({
        id: stage.id || `${chapter}-${i + 1}`,
        number: stage.number || `${chapter}-${i + 1}`,
        name: stage.name || `스테이지 ${i + 1}`,
        recommendedPower: stage.recommendedPower || 1000 + (chapter - 1) * 2000 + i * 300,
        enemyCount: stage.enemyCount || 3 + Math.floor(i / 3),
        rewards: stage.rewards || {
          gold: 100 + i * 50 + (chapter - 1) * 200,
          exp: 50 + i * 20 + (chapter - 1) * 100
        }
      }));
    }

    // 폴백: 하드코딩 스테이지
    console.log(`[StageSelect] No data for chapter ${chapter}, using fallback`);
    const stages = [];
    const stageNames = {
      1: ['숲의 입구', '어두운 오솔길', '고목 광장', '독버섯 군락', '늑대 서식지',
          '폐허된 오두막', '늪지대', '검은 안개', '고대 제단', '숲의 군주'],
      2: ['얼음 문', '서리 터널', '빙하 호수', '눈폭풍', '얼음 정령',
          '동굴 심층부', '수정 방', '얼어붙은 감옥', '빙룡의 둥지', '프로스트 드래곤'],
      3: ['화염 관문', '용암 다리', '재의 평원', '불기둥', '화염 정령',
          '마그마 심연', '불타는 요새', '지옥 문턱', '용의 보좌', '화염의 왕']
    };

    const names = stageNames[chapter] || stageNames[1];
    for (let i = 0; i < 10; i++) {
      stages.push({
        id: `${chapter}-${i + 1}`,
        number: `${chapter}-${i + 1}`,
        name: names[i] || `스테이지 ${i + 1}`,
        recommendedPower: 1000 + (chapter - 1) * 2000 + i * 300,
        enemyCount: 3 + Math.floor(i / 3),
        rewards: {
          gold: 100 + i * 50 + (chapter - 1) * 200,
          exp: 50 + i * 20 + (chapter - 1) * 100
        }
      });
    }

    return stages;
  }

  createStageCard(stage, y, isCleared, isLocked) {
    const card = this.add.container(GAME_WIDTH / 2, y);

    // Card background
    const bgColor = isLocked ? 0x1a1a2e : COLORS.backgroundLight;
    const bgAlpha = isLocked ? 0.5 : 0.8;

    const cardBg = this.add.rectangle(0, 0, GAME_WIDTH - s(40), s(80), bgColor, bgAlpha);
    cardBg.setStrokeStyle(s(2), isCleared ? COLORS.success : (isLocked ? COLORS.textDark : COLORS.primary), 0.5);

    // 클리어 상태 좌측 컬러 스트라이프
    if (isCleared) {
      const stars = (this.registry.get('clearedStages') || {})[stage.id] || 0;
      const stripeColor = stars >= 3 ? COLORS.accent : COLORS.success;
      const stripe = this.add.rectangle(-(GAME_WIDTH - s(40)) / 2 + s(3), 0, s(6), s(76), stripeColor, 1);
      card.add(stripe);
    }

    // 잠김 상태 오버레이
    if (isLocked) {
      const lockOverlay = this.add.rectangle(0, 0, GAME_WIDTH - s(44), s(76), 0x000000, 0.3);
      card.add(lockOverlay);
    }

    if (!isLocked) {
      cardBg.setInteractive({ useHandCursor: true });
    }

    // Stage number
    const numberBg = this.add.circle(s(-185), 0, s(25), isCleared ? COLORS.success : (isLocked ? COLORS.textDark : COLORS.primary), 1);
    const numberText = this.add.text(s(-185), 0, stage.number, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage name
    const nameColor = isLocked ? COLORS.textDark : COLORS.text;
    const nameText = this.add.text(s(-140), s(-15), stage.name, {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  nameColor.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // Recommended power
    const powerText = this.add.text(s(-140), s(10), `추천 전투력: ${stage.recommendedPower.toLocaleString()}`, {
      fontSize: sf(12),
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0, 0.5);

    // Stars earned
    const clearedStages = this.registry.get('clearedStages') || {};
    const stars = clearedStages[stage.id] || 0;
    const starsText = this.add.text(s(170), s(-10), '★'.repeat(stars) + '☆'.repeat(3 - stars), {
      fontSize: sf(16),
      color: `#${  (stars > 0 ? COLORS.accent : COLORS.textDark).toString(16).padStart(6, '0')}`
    }).setOrigin(1, 0.5);

    // Lock icon
    if (isLocked) {
      const lockIcon = this.add.text(s(160), 0, '🔒', {
        fontSize: sf(24)
      }).setOrigin(0.5);
      const lockLabel = this.add.text(s(160), s(22), '잠김', {
        fontSize: sf(10),
        fontFamily: 'Noto Sans KR',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      card.add([lockIcon, lockLabel]);
    }

    // 소탕 버튼 (3성 클리어 시)
    if (stars >= 3) {
      const sweepBtn = this.add.rectangle(s(140), s(12), s(60), s(22), COLORS.success, 0.8)
        .setStrokeStyle(s(1), 0xFFFFFF, 0.2)
        .setInteractive({ useHandCursor: true });
      const sweepLabel = this.add.text(s(140), s(12), '⚡소탕', {
        fontSize: sf(11), fontFamily: 'Arial',
        color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);

      sweepBtn.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        this.showSweepModal(stage);
      });

      card.add([sweepBtn, sweepLabel]);
    }

    card.add([cardBg, numberBg, numberText, nameText, powerText, starsText]);
    this.stageContainer.add(card);

    // Interactions
    if (!isLocked) {
      cardBg.on('pointerover', () => {
        cardBg.setFillStyle(COLORS.primary, 0.3);
        this.tweens.add({
          targets: card,
          scaleX: 1.02,
          scaleY: 1.02,
          duration: 150,
          ease: 'Power2'
        });
      });

      cardBg.on('pointerout', () => {
        cardBg.setFillStyle(COLORS.backgroundLight, 0.8);
        this.tweens.add({
          targets: card,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
          ease: 'Power2'
        });
      });

      cardBg.on('pointerdown', () => {
        this.selectedStage = stage;
        this.showPartySelect();
      });
    }
  }

  createPartySelectModal() {
    // Modal container (hidden by default)
    this.partyModal = this.add.container(0, 0).setDepth(50).setVisible(false);

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive();

    // Modal background (라운드 코너 s(16))
    const modalBg = this.add.graphics();
    modalBg.fillStyle(COLORS.backgroundLight, 0.95);
    modalBg.fillRoundedRect(GAME_WIDTH / 2 - (GAME_WIDTH - s(60)) / 2, GAME_HEIGHT / 2 - s(225), GAME_WIDTH - s(60), s(450), s(16));
    modalBg.lineStyle(s(2), COLORS.primary, 1);
    modalBg.strokeRoundedRect(GAME_WIDTH / 2 - (GAME_WIDTH - s(60)) / 2, GAME_HEIGHT / 2 - s(225), GAME_WIDTH - s(60), s(450), s(16));

    // Modal title
    this.modalTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(200), '파티 선택', {
      fontSize: sf(22),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage info
    this.stageInfoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(165), '', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Party slots (4 slots — PARTY_SIZE 기준)
    this.partySlots = [];
    const slotStartX = GAME_WIDTH / 2 - s(150);
    const slotY = GAME_HEIGHT / 2 - s(60);

    for (let i = 0; i < 4; i++) {
      const x = slotStartX + i * s(100);
      const slotContainer = this.add.container(x, slotY);

      const slotBg = this.add.rectangle(0, 0, s(75), s(90), COLORS.background, 0.8);
      slotBg.setStrokeStyle(s(2), COLORS.primary, 0.5);
      slotBg.setInteractive({ useHandCursor: true });

      const slotText = this.add.text(0, 0, '+', {
        fontSize: sf(30),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      const slotLabel = this.add.text(0, s(55), `슬롯 ${i + 1}`, {
        fontSize: sf(10),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      slotContainer.add([slotBg, slotText, slotLabel]);
      this.partySlots.push({ container: slotContainer, hero: null, slotText, slotBg });

      slotBg.on('pointerdown', () => {
        this.selectHeroForSlot(i);
      });
    }

    // Auto-fill button
    const autoBtn = this.add.container(GAME_WIDTH / 2 - s(80), GAME_HEIGHT / 2 + s(80));
    const autoBg = this.add.rectangle(0, 0, s(140), s(40), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const autoText = this.add.text(0, 0, '자동 편성', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    autoBtn.add([autoBg, autoText]);

    autoBg.on('pointerdown', () => {
      this.autoFillParty();
    });

    // Start battle button
    const startBtn = this.add.container(GAME_WIDTH / 2 + s(80), GAME_HEIGHT / 2 + s(80));
    const startBg = this.add.rectangle(0, 0, s(140), s(40), COLORS.success, 1)
      .setInteractive({ useHandCursor: true });
    const startText = this.add.text(0, 0, '전투 시작', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    startBtn.add([startBg, startText]);

    startBg.on('pointerdown', () => {
      this.startBattle();
    });

    // Close button
    const closeBtn = this.add.text(GAME_WIDTH / 2 + s(180), GAME_HEIGHT / 2 - s(200), '✕', {
      fontSize: sf(24),
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.hidePartySelect();
    });

    // Total power display
    this.totalPowerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(30), '총 전투력: 0', {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.partyModal.add([
      overlay, modalBg, this.modalTitle, this.stageInfoText,
      ...this.partySlots.map(s => s.container),
      autoBtn, startBtn, closeBtn, this.totalPowerText
    ]);
  }

  showPartySelect() {
    if (!this.selectedStage) return;

    this.stageInfoText.setText(`${this.selectedStage.name} | 추천 전투력: ${this.selectedStage.recommendedPower.toLocaleString()}`);

    // Clear party slots
    this.partySlots.forEach(slot => {
      slot.hero = null;
      slot.slotText.setText('+');
      slot.slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
    });

    this.updateTotalPower();
    this.partyModal.setVisible(true);
  }

  hidePartySelect() {
    this.partyModal.setVisible(false);
    this.selectedStage = null;
  }

  selectHeroForSlot(slotIndex) {
    const heroes = this.registry.get('ownedHeroes') || [];

    if (heroes.length === 0) {
      this.showMessage('보유한 영웅이 없습니다!');
      return;
    }

    // Get heroes not already in party
    const partyHeroIds = this.partySlots
      .filter(s => s.hero)
      .map(s => s.hero.id);

    const availableHeroes = heroes.filter(h => !partyHeroIds.includes(h.id));

    if (availableHeroes.length === 0) {
      // Toggle off if clicking filled slot
      if (this.partySlots[slotIndex].hero) {
        this.partySlots[slotIndex].hero = null;
        this.partySlots[slotIndex].slotText.setText('+');
        this.partySlots[slotIndex].slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
        this.updateTotalPower();
      } else {
        this.showMessage('사용 가능한 영웅이 없습니다!');
      }
      return;
    }

    // Simple: assign first available hero
    const hero = availableHeroes[0];
    this.partySlots[slotIndex].hero = hero;
    this.partySlots[slotIndex].slotText.setText(hero.name.substring(0, 4));
    this.partySlots[slotIndex].slotBg.setStrokeStyle(2, COLORS.success, 1);

    this.updateTotalPower();
    this.updateSynergyPreview();
  }

  autoFillParty() {
    const heroes = this.registry.get('ownedHeroes') || [];

    if (heroes.length === 0) {
      this.showMessage('보유한 영웅이 없습니다!');
      return;
    }

    // PartyManager로 자동 편성
    const recommendedIds = PartyManager.autoFormParty(heroes);

    // 슬롯 초기화 후 배치
    this.partySlots.forEach(slot => {
      slot.hero = null;
      slot.slotText.setText('+');
      slot.slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
    });

    const sortedHeroes = recommendedIds
      .map(id => heroes.find(h => h.id === id))
      .filter(Boolean);

    for (let i = 0; i < 4 && i < sortedHeroes.length; i++) {
      this.partySlots[i].hero = sortedHeroes[i];
      this.partySlots[i].slotText.setText(sortedHeroes[i].name.substring(0, 4));
      this.partySlots[i].slotBg.setStrokeStyle(2, COLORS.success, 1);
    }

    this.updateTotalPower();
    this.updateSynergyPreview();
    this.showMessage('자동 편성 완료!', COLORS.success);
  }

  updateTotalPower() {
    let total = 0;
    this.partySlots.forEach(slot => {
      if (slot.hero) {
        const stats = slot.hero.stats;
        total += stats.hp + stats.atk * 5 + stats.def * 3 + stats.spd * 2;
      }
    });
    this.totalPowerText.setText(`총 전투력: ${total.toLocaleString()}`);

    // Color code based on recommended
    if (this.selectedStage) {
      const ratio = total / this.selectedStage.recommendedPower;
      let color = COLORS.danger;
      if (ratio >= 1) color = COLORS.success;
      else if (ratio >= 0.8) color = COLORS.accent;
      this.totalPowerText.setColor(`#${  color.toString(16).padStart(6, '0')}`);
    }
  }

  /**
   * 시너지 미리보기 표시
   */
  updateSynergyPreview() {
    // 기존 시너지 미리보기 제거
    if (this.synergyPreviewTexts) {
      this.synergyPreviewTexts.forEach(t => t.destroy());
    }
    this.synergyPreviewTexts = [];

    const partyHeroIds = this.partySlots
      .filter(s => s.hero)
      .map(s => s.hero.id)
      .filter(Boolean);

    if (partyHeroIds.length < 2) return;

    const heroData = getAllCharacters();
    const synergies = SynergySystem.calculatePartySynergies(partyHeroIds, heroData);

    if (synergies.length === 0) return;

    const baseY = GAME_HEIGHT / 2 + s(110);
    const typeIcons = { cult: '⛪', mood: '🎭', role: '⚔️', special: '✨' };

    synergies.slice(0, 3).forEach((syn, i) => {
      const icon = typeIcons[syn.type] || '●';
      const text = this.add.text(GAME_WIDTH / 2, baseY + i * s(18), `${icon} ${syn.name || syn.type}`, {
        fontSize: sf(11),
        fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(60);
      this.partyModal.add(text);
      this.synergyPreviewTexts.push(text);
    });
  }

  startBattle() {
    const partyHeroes = this.partySlots
      .filter(s => s.hero)
      .map(s => s.hero);

    if (partyHeroes.length === 0) {
      this.showMessage('파티에 영웅을 배치해주세요!');
      return;
    }

    // 에너지 차감 (스테이지 비용 계산)
    const stageType = this.selectedStage?.type || 'NORMAL';
    const stageCost = energySystem.getStageCost(stageType);
    const consumeResult = energySystem.consumeEnergy(stageCost);

    if (!consumeResult.success) {
      this.showMessage(`⚡ 에너지가 부족합니다! (필요: ${stageCost})`, COLORS.danger);
      return;
    }

    // 에너지 UI 업데이트
    this.refreshEnergyDisplay();

    // Save party to registry
    this.registry.set('currentTeam', partyHeroes);

    GameLogger.log('SCENE', `스테이지 선택: ${this.selectedStage?.name || this.selectedStage?.id}`, { chapter: this.currentChapter, partySize: partyHeroes.length, energy: consumeResult.currentEnergy });

    // Transition to battle with dramatic entry
    transitionManager.battleEntryTransition(this, {
      stage: this.selectedStage,
      party: partyHeroes
    });
  }

  /**
   * 에너지 UI 갱신
   */
  refreshEnergyDisplay() {
    const status = energySystem.getStatus();
    if (this.energyText) {
      this.energyText.setText(`⚡ ${status.current}/${status.max}`);
    }
  }

  /**
   * 에너지 회복 타이머 업데이트
   */
  updateEnergyTimer() {
    if (!this.energyTimerText) return;

    const status = energySystem.getStatus();
    if (status.current >= status.max) {
      this.energyTimerText.setText('');
      return;
    }

    if (status.recoveryInfo && status.recoveryInfo.formatted) {
      this.energyTimerText.setText(`회복: ${status.recoveryInfo.formatted}`);
    }

    // 30초마다 갱신
    this.time.delayedCall(30000, () => {
      this.refreshEnergyDisplay();
      this.updateEnergyTimer();
    });
  }

  createSweepModal() {
    this.sweepModal = this.add.container(0, 0).setDepth(60).setVisible(false);

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hideSweepModal());

    // Modal background (라운드 코너 s(16))
    const sweepModalBg = this.add.graphics();
    sweepModalBg.fillStyle(COLORS.backgroundLight, 0.95);
    sweepModalBg.fillRoundedRect(GAME_WIDTH / 2 - s(170), GAME_HEIGHT / 2 - s(160), s(340), s(320), s(16));
    sweepModalBg.lineStyle(s(2), COLORS.primary, 1);
    sweepModalBg.strokeRoundedRect(GAME_WIDTH / 2 - s(170), GAME_HEIGHT / 2 - s(160), s(340), s(320), s(16));

    // Title
    this.sweepTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(130), '⚡ 소탕', {
      fontSize: sf(20), fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage info
    this.sweepStageInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(100), '', {
      fontSize: sf(13), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Cost info
    this.sweepCostInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(75), '', {
      fontSize: sf(12), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Count buttons (1, 3, 5, 10)
    const counts = [1, 3, 5, 10];
    this.sweepCountBtns = [];
    const btnY = GAME_HEIGHT / 2 - s(25);

    counts.forEach((count, i) => {
      const btnX = GAME_WIDTH / 2 - s(120) + i * s(80);
      const bg = this.add.rectangle(btnX, btnY, s(65), s(50), COLORS.background, 0.9)
        .setStrokeStyle(s(2), COLORS.primary, 0.5)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(btnX, btnY - s(8), `×${count}`, {
        fontSize: sf(18), fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      const costLabel = this.add.text(btnX, btnY + s(14), '', {
        fontSize: sf(10), fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setStrokeStyle(s(2), COLORS.accent));
      bg.on('pointerout', () => bg.setStrokeStyle(s(2), COLORS.primary, 0.5));
      bg.on('pointerdown', () => this.executeSweep(this._sweepStage, count));

      this.sweepCountBtns.push({ bg, label, costLabel, count });
      this.sweepModal.add([bg, label, costLabel]);
    });

    // Daily remaining info
    this.sweepDailyInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(40), '', {
      fontSize: sf(11), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Tickets info
    this.sweepTicketInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(60), '', {
      fontSize: sf(11), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Close button
    const closeBtn = this.add.text(GAME_WIDTH / 2 + s(155), GAME_HEIGHT / 2 - s(145), '✕', {
      fontSize: sf(20), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.hideSweepModal());

    this.sweepModal.add([overlay, sweepModalBg, this.sweepTitle, this.sweepStageInfo,
      this.sweepCostInfo, this.sweepDailyInfo, this.sweepTicketInfo, closeBtn]);
  }

  showSweepModal(stage) {
    this._sweepStage = stage;
    const cost = stage.energyCost || 6;
    const status = energySystem.getStatus();
    const daily = sweepSystem.getDailyRemaining();
    const tickets = sweepSystem.sweepTickets || 0;

    this.sweepStageInfo.setText(`${stage.name || stage.id} (에너지 ${cost}/회)`);
    this.sweepDailyInfo.setText(`일일 소탕: ${daily.used || 0}/${daily.limit || 50}`);
    this.sweepTicketInfo.setText(`소탕권: ${tickets}장`);

    // Update each count button availability
    this.sweepCountBtns.forEach(({ bg, label, costLabel, count }) => {
      const totalCost = cost * count;
      const canAfford = status.current >= totalCost;
      const canDaily = (daily.remaining || 50) >= count;
      const canTicket = tickets >= count;
      const available = canAfford && canDaily && canTicket;

      costLabel.setText(`⚡${totalCost}`);
      bg.setAlpha(available ? 1 : 0.4);
      label.setAlpha(available ? 1 : 0.4);
      bg.setInteractive(available ? { useHandCursor: true } : false);
      if (!available) bg.disableInteractive();
      else bg.setInteractive({ useHandCursor: true });
    });

    this.sweepCostInfo.setText(`보유 에너지: ⚡${status.current}/${status.max}`);
    this.sweepModal.setVisible(true);
  }

  hideSweepModal() {
    this.sweepModal.setVisible(false);
    this._sweepStage = null;
  }

  executeSweep(stage, count = 1) {
    if (!stage) return;

    const canSweep = sweepSystem.canSweep(stage.id, count);
    if (canSweep.canSweep === false) {
      this.showMessage(canSweep.reasons?.[0] || '소탕 불가!', COLORS.danger);
      return;
    }

    const cost = (stage.energyCost || 6) * count;
    const status = energySystem.getStatus();
    if (status.current < cost) {
      this.showMessage('에너지가 부족합니다!', COLORS.danger);
      return;
    }

    // 소탕 실행
    GameLogger.log('SCENE', `소탕 실행: ${stage.name || stage.id} x${count}`, { energyCost: cost });
    const result = sweepSystem.executeSweep(stage.id, count);
    if (result && result.success) {
      energySystem.consumeEnergy(cost);

      // 보상 지급
      let totalGold = 0;
      let totalExp = 0;
      if (result.rewards) {
        totalGold = result.rewards.gold || 0;
        totalExp = result.rewards.exp || 0;
        if (totalGold > 0) {
          const newGold = SaveManager.addGold(totalGold);
          this.registry.set('gold', newGold);
        }
      }

      this.hideSweepModal();
      this.refreshEnergyDisplay();

      // 소탕 보상 팝업 표시
      const rewardPopup = new SweepRewardPopup(this, {
        stageId: stage.id,
        stageName: stage.name || stage.id,
        count,
        gold: totalGold,
        exp: totalExp,
        items: result.rewards?.items || [],
        energyCost: cost,
      });
      rewardPopup.show();
    } else {
      this.showMessage(result?.error || '소탕 실패!', COLORS.danger);
    }
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    if (this.energyTimer) {
      this.energyTimer.remove();
      this.energyTimer = null;
    }
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(100), text, {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${  color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.background.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - s(50),
      duration: 1500,
      delay: 500,
      onComplete: () => msg.destroy()
    });
  }
}
