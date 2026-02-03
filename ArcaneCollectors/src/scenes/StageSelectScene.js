import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StageSelectScene' });
    this.selectedStage = null;
    this.currentChapter = 1;
  }

  create() {
    this.cameras.main.fadeIn(300);

    this.createBackground();
    this.createHeader();
    this.createChapterTitle();
    this.createStageList();
    this.createPartySelectModal();
  }

  createBackground() {
    // Forest theme gradient
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
      const y = Phaser.Math.Between(100, GAME_HEIGHT - 100);
      const size = Phaser.Math.Between(30, 80);
      const alpha = Phaser.Math.FloatBetween(0.05, 0.15);

      graphics.fillStyle(0x1a472a, alpha);
      graphics.fillTriangle(
        x, y - size,
        x - size / 2, y + size / 2,
        x + size / 2, y + size / 2
      );
    }
  }

  createHeader() {
    // Header background
    const headerBg = this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.backgroundLight, 0.9);
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
    this.add.text(GAME_WIDTH / 2, 50, '모험', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(21);

    // Energy display (placeholder)
    this.add.text(GAME_WIDTH - 40, 50, '⚡ 50/50', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(1, 0.5).setDepth(21);
  }

  createChapterTitle() {
    const titleY = 140;

    // Chapter navigation
    const prevBtn = this.add.text(30, titleY, '◀', {
      fontSize: '24px',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const nextBtn = this.add.text(GAME_WIDTH - 30, titleY, '▶', {
      fontSize: '24px',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // Chapter title
    this.chapterTitle = this.add.text(GAME_WIDTH / 2, titleY, '', {
      fontSize: '20px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
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

    const startY = 200;
    const stageHeight = 90;

    stages.forEach((stage, index) => {
      const y = startY + index * stageHeight;
      const isCleared = clearedStages[stage.id] !== undefined;
      const isLocked = index > 0 && clearedStages[stages[index - 1].id] === undefined;

      this.createStageCard(stage, y, isCleared, isLocked);
    });
  }

  generateStages(chapter) {
    const stages = [];
    const stageNames = {
      1: ['숲의 입구', '어두운 오솔길', '고목 광장', '독버섯 군락', '늑대 서식지',
          '폐허된 오두막', '늪지대', '검은 안개', '고대 제단', '숲의 군주'],
      2: ['얼음 문', '서리 터널', '빙하 호수', '눈폭풍', '얼음 정령',
          '동굴 심층부', '수정 방', '얼어붙은 감옥', '빙룡의 둥지', '프로스트 드래곤'],
      3: ['화염 관문', '용암 다리', '재의 평원', '불기둥', '화염 정령',
          '마그마 심연', '불타는 요새', '지옥 문턱', '용의 보좌', '화염의 왕']
    };

    for (let i = 0; i < 10; i++) {
      stages.push({
        id: `${chapter}-${i + 1}`,
        number: `${chapter}-${i + 1}`,
        name: stageNames[chapter][i],
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
    let bgColor = isLocked ? 0x1a1a2e : COLORS.backgroundLight;
    let bgAlpha = isLocked ? 0.5 : 0.8;

    const cardBg = this.add.rectangle(0, 0, GAME_WIDTH - 40, 80, bgColor, bgAlpha);
    cardBg.setStrokeStyle(2, isCleared ? COLORS.success : (isLocked ? COLORS.textDark : COLORS.primary), 0.5);

    if (!isLocked) {
      cardBg.setInteractive({ useHandCursor: true });
    }

    // Stage number
    const numberBg = this.add.circle(-185, 0, 25, isCleared ? COLORS.success : COLORS.primary, 1);
    const numberText = this.add.text(-185, 0, stage.number, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage name
    const nameColor = isLocked ? COLORS.textDark : COLORS.text;
    const nameText = this.add.text(-140, -15, stage.name, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + nameColor.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // Recommended power
    const powerText = this.add.text(-140, 10, `추천 전투력: ${stage.recommendedPower.toLocaleString()}`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0, 0.5);

    // Stars earned
    const clearedStages = this.registry.get('clearedStages') || {};
    const stars = clearedStages[stage.id] || 0;
    const starsText = this.add.text(170, -10, '★'.repeat(stars) + '☆'.repeat(3 - stars), {
      fontSize: '16px',
      color: '#' + (stars > 0 ? COLORS.accent : COLORS.textDark).toString(16).padStart(6, '0')
    }).setOrigin(1, 0.5);

    // Lock icon
    if (isLocked) {
      const lockText = this.add.text(170, 10, '🔒 잠김', {
        fontSize: '12px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(1, 0.5);
      card.add(lockText);
    }

    card.add([cardBg, numberBg, numberText, nameText, powerText, starsText]);
    this.stageContainer.add(card);

    // Interactions
    if (!isLocked) {
      cardBg.on('pointerover', () => {
        cardBg.setFillStyle(COLORS.primary, 0.3);
        card.setScale(1.02);
      });

      cardBg.on('pointerout', () => {
        cardBg.setFillStyle(COLORS.backgroundLight, 0.8);
        card.setScale(1);
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

    // Modal background
    const modalBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 60, 450, COLORS.backgroundLight, 0.95);
    modalBg.setStrokeStyle(2, COLORS.primary);

    // Modal title
    this.modalTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, '파티 선택', {
      fontSize: '22px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage info
    this.stageInfoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 165, '', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Party slots (5 slots)
    this.partySlots = [];
    const slotStartX = GAME_WIDTH / 2 - 180;
    const slotY = GAME_HEIGHT / 2 - 60;

    for (let i = 0; i < 5; i++) {
      const x = slotStartX + i * 90;
      const slotContainer = this.add.container(x, slotY);

      const slotBg = this.add.rectangle(0, 0, 75, 90, COLORS.background, 0.8);
      slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
      slotBg.setInteractive({ useHandCursor: true });

      const slotText = this.add.text(0, 0, '+', {
        fontSize: '30px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      const slotLabel = this.add.text(0, 55, `슬롯 ${i + 1}`, {
        fontSize: '10px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      slotContainer.add([slotBg, slotText, slotLabel]);
      this.partySlots.push({ container: slotContainer, hero: null, slotText, slotBg });

      slotBg.on('pointerdown', () => {
        this.selectHeroForSlot(i);
      });
    }

    // Auto-fill button
    const autoBtn = this.add.container(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 + 80);
    const autoBg = this.add.rectangle(0, 0, 140, 40, COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const autoText = this.add.text(0, 0, '자동 편성', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);
    autoBtn.add([autoBg, autoText]);

    autoBg.on('pointerdown', () => {
      this.autoFillParty();
    });

    // Start battle button
    const startBtn = this.add.container(GAME_WIDTH / 2 + 80, GAME_HEIGHT / 2 + 80);
    const startBg = this.add.rectangle(0, 0, 140, 40, COLORS.success, 1)
      .setInteractive({ useHandCursor: true });
    const startText = this.add.text(0, 0, '전투 시작', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);
    startBtn.add([startBg, startText]);

    startBg.on('pointerdown', () => {
      this.startBattle();
    });

    // Close button
    const closeBtn = this.add.text(GAME_WIDTH / 2 + 180, GAME_HEIGHT / 2 - 200, '✕', {
      fontSize: '24px',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.hidePartySelect();
    });

    // Total power display
    this.totalPowerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '총 전투력: 0', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
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
  }

  autoFillParty() {
    const heroes = this.registry.get('ownedHeroes') || [];

    if (heroes.length === 0) {
      this.showMessage('보유한 영웅이 없습니다!');
      return;
    }

    // Sort heroes by power
    const sortedHeroes = [...heroes].sort((a, b) => {
      const powerA = a.stats.hp + a.stats.atk * 5 + a.stats.def * 3 + a.stats.spd * 2;
      const powerB = b.stats.hp + b.stats.atk * 5 + b.stats.def * 3 + b.stats.spd * 2;
      return powerB - powerA;
    });

    // Fill slots with top heroes
    for (let i = 0; i < 5 && i < sortedHeroes.length; i++) {
      this.partySlots[i].hero = sortedHeroes[i];
      this.partySlots[i].slotText.setText(sortedHeroes[i].name.substring(0, 4));
      this.partySlots[i].slotBg.setStrokeStyle(2, COLORS.success, 1);
    }

    this.updateTotalPower();
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
      this.totalPowerText.setColor('#' + color.toString(16).padStart(6, '0'));
    }
  }

  startBattle() {
    const partyHeroes = this.partySlots
      .filter(s => s.hero)
      .map(s => s.hero);

    if (partyHeroes.length === 0) {
      this.showMessage('파티에 영웅을 배치해주세요!');
      return;
    }

    // Save party to registry
    this.registry.set('currentTeam', partyHeroes);

    // Transition to battle
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        stage: this.selectedStage,
        party: partyHeroes
      });
    });
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, text, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + color.toString(16).padStart(6, '0'),
      backgroundColor: '#' + COLORS.background.toString(16).padStart(6, '0'),
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - 50,
      duration: 1500,
      delay: 500,
      onComplete: () => msg.destroy()
    });
  }
}
