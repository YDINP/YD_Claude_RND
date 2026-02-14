import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { sweepSystem } from '../systems/SweepSystem.js';
import transitionManager from '../utils/TransitionManager.js';

/**
 * BattleResultScene - 전투 결과 화면
 * BattleScene에서 전환되며, 별점/보상/레벨업/소탕 버튼을 표시
 */
export class BattleResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleResultScene' });
    this.transitioning = false;
  }

  init(data) {
    this.victory = data?.victory ?? false;
    this.stars = data?.stars ?? 0;
    this.rewards = data?.rewards ?? { gold: 0, exp: 0 };
    this.levelUpResults = data?.levelUpResults ?? [];
    this.stage = data?.stage ?? null;
    this.party = data?.party ?? [];
    this.turnCount = data?.turnCount ?? 0;
    this.aliveCount = data?.aliveCount ?? 0;
    this.totalAllies = data?.totalAllies ?? 0;
  }

  create() {
    this.transitioning = false; // 씬 재진입 시 반드시 리셋
    this.cameras.main.fadeIn(400);

    try {
      this.createBackground();

      if (this.victory) {
        this.createVictoryDisplay();
      } else {
        this.createDefeatDisplay();
      }

      this.createActionButtons();
    } catch (error) {
      console.error('[BattleResultScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  createBackground() {
    const graphics = this.add.graphics();

    if (this.victory) {
      // 승리: 따뜻한 골드 그래디언트
      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(20 + ratio * 15);
        const g = Math.floor(18 + ratio * 12);
        const b = Math.floor(10 + ratio * 30);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }

      // 빛 파티클
      for (let i = 0; i < 40; i++) {
        const x = Phaser.Math.Between(0, GAME_WIDTH);
        const y = Phaser.Math.Between(0, GAME_HEIGHT);
        const size = Phaser.Math.FloatBetween(1, 4);
        const alpha = Phaser.Math.FloatBetween(0.1, 0.4);
        graphics.fillStyle(0xFFD700, alpha);
        graphics.fillCircle(x, y, size);
      }
    } else {
      // 패배: 어두운 블루 그래디언트
      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(10 + ratio * 5);
        const g = Math.floor(10 + ratio * 8);
        const b = Math.floor(25 + ratio * 15);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }
    }
  }

  createVictoryDisplay() {
    const centerX = GAME_WIDTH / 2;

    // === 승리 타이틀 ===
    const title = this.add.text(centerX, 100, 'VICTORY', {
      fontSize: '48px',
      fontFamily: 'Georgia, serif',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 타이틀 글로우 애니메이션
    this.tweens.add({
      targets: title,
      alpha: { from: 0.8, to: 1 },
      scaleX: { from: 0.95, to: 1.05 },
      scaleY: { from: 0.95, to: 1.05 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // === 별점 표시 ===
    this.createStarDisplay(centerX, 180);

    // === 스테이지 정보 ===
    if (this.stage) {
      this.add.text(centerX, 240, this.stage.name || `Stage ${this.stage.id}`, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    }

    // === 보상 패널 ===
    this.createRewardsPanel(centerX, 380);

    // === 레벨업 표시 ===
    if (this.levelUpResults.length > 0) {
      this.createLevelUpDisplay(centerX, 580);
    }

    // === 전투 통계 ===
    this.createBattleStats(centerX, 700);
  }

  createStarDisplay(x, y) {
    const starSize = 50;
    const spacing = 60;
    const startX = x - spacing;

    for (let i = 0; i < 3; i++) {
      const starX = startX + i * spacing;
      const filled = i < this.stars;

      const star = this.add.text(starX, y, filled ? '★' : '☆', {
        fontSize: `${starSize}px`,
        color: filled ? '#FFD700' : '#555555'
      }).setOrigin(0.5).setAlpha(0).setScale(0);

      // 순차적 별 등장 애니메이션
      this.tweens.add({
        targets: star,
        alpha: 1,
        scale: 1,
        duration: 400,
        delay: 300 + i * 200,
        ease: 'Back.easeOut'
      });

      // 채워진 별 반짝임
      if (filled) {
        this.tweens.add({
          targets: star,
          scaleX: { from: 1, to: 1.15 },
          scaleY: { from: 1, to: 1.15 },
          duration: 800,
          delay: 1200 + i * 100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    }
  }

  createRewardsPanel(x, y) {
    // 패널 배경
    const panelWidth = 360;
    const panelHeight = 160;

    const panel = this.add.rectangle(x, y, panelWidth, panelHeight, COLORS.bgLight, 0.85);
    panel.setStrokeStyle(2, COLORS.primary, 0.6);

    // 보상 타이틀
    this.add.text(x, y - 60, '보상', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 골드
    const goldY = y - 20;
    this.add.text(x - 60, goldY, '🪙', { fontSize: '24px' }).setOrigin(0.5);
    const goldText = this.add.text(x + 10, goldY, `+${this.rewards.gold.toLocaleString()}`, {
      fontSize: '22px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // 경험치
    const expY = y + 20;
    this.add.text(x - 60, expY, '⭐', { fontSize: '24px' }).setOrigin(0.5);
    this.add.text(x + 10, expY, `+${this.rewards.exp.toLocaleString()} EXP`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${  COLORS.primary.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // 아이템 드롭 (있으면)
    if (this.rewards.items && this.rewards.items.length > 0) {
      const itemY = y + 55;
      this.add.text(x - 60, itemY, '📦', { fontSize: '20px' }).setOrigin(0.5);
      const itemNames = this.rewards.items.map(i => i.name || i.itemId).join(', ');
      this.add.text(x + 10, itemY, itemNames, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: `#${  COLORS.success.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);
    }

    // 패널 등장 애니메이션
    panel.setAlpha(0);
    this.tweens.add({
      targets: panel,
      alpha: 0.85,
      duration: 500,
      delay: 600
    });
  }

  createLevelUpDisplay(x, y) {
    // 레벨업 배너
    const banner = this.add.rectangle(x, y, 340, 30 + this.levelUpResults.length * 30, COLORS.success, 0.15);
    banner.setStrokeStyle(1, COLORS.success, 0.5);

    this.add.text(x, y - (this.levelUpResults.length * 15), '🎉 레벨 업!', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.levelUpResults.forEach((result, i) => {
      const lineY = y - (this.levelUpResults.length * 15) + 30 + i * 28;
      this.add.text(x, lineY, `${result.name}  Lv.${result.newLevel - result.gained} → Lv.${result.newLevel}`, {
        fontSize: '15px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    });
  }

  createBattleStats(x, y) {
    const stats = [
      { label: '턴 수', value: `${this.turnCount}턴` },
      { label: '생존', value: `${this.aliveCount}/${this.totalAllies}` },
    ];

    stats.forEach((stat, i) => {
      const statX = x - 80 + i * 160;
      this.add.text(statX, y, stat.label, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      this.add.text(statX, y + 24, stat.value, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
    });
  }

  createDefeatDisplay() {
    const centerX = GAME_WIDTH / 2;

    // 패배 타이틀
    this.add.text(centerX, 200, 'DEFEAT', {
      fontSize: '44px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.danger.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 빈 별
    const starStr = '☆☆☆';
    this.add.text(centerX, 280, starStr, {
      fontSize: '40px',
      color: '#555555'
    }).setOrigin(0.5);

    // 격려 메시지
    const messages = [
      '다음에는 꼭 이길 수 있을 거예요!',
      '파티를 강화하고 다시 도전하세요!',
      '분위기 상성을 확인해보세요!',
      '영웅을 레벨업하면 쉬워질 거예요!'
    ];
    this.add.text(centerX, 380, Phaser.Math.RND.pick(messages), {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      wordWrap: { width: 300 },
      align: 'center'
    }).setOrigin(0.5);

    // 전투 통계 (패배 시에도)
    if (this.stage) {
      this.add.text(centerX, 460, this.stage.name || `Stage ${this.stage.id}`, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    }
  }

  createActionButtons() {
    const centerX = GAME_WIDTH / 2;
    const btnY = this.victory ? 820 : 580;
    const btnWidth = 200;
    const btnHeight = 55;
    const btnSpacing = 70;

    const buttons = [];

    if (this.victory) {
      // 다음 스테이지 버튼
      buttons.push({
        label: '다음 스테이지',
        color: COLORS.primary,
        action: () => this.goToNextStage()
      });

      // 소탕 버튼 (3성일 때만)
      if (this.stars >= 3 && this.stage) {
        buttons.push({
          label: '⚡ 소탕',
          color: COLORS.success,
          action: () => this.showSweepModal()
        });
      }

      // 재도전 버튼
      buttons.push({
        label: '재도전',
        color: COLORS.bgPanel,
        action: () => this.retryBattle()
      });
    } else {
      // 패배: 재도전 (메인)
      buttons.push({
        label: '재도전',
        color: COLORS.primary,
        action: () => this.retryBattle()
      });

      // 파티 편성 버튼
      buttons.push({
        label: '파티 편성',
        color: COLORS.secondary,
        action: () => this.goToPartyEdit()
      });
    }

    // 메인으로 버튼 (항상)
    buttons.push({
      label: '메인으로',
      color: COLORS.bgPanel,
      action: () => this.goToMain()
    });

    buttons.forEach((btn, i) => {
      const y = btnY + i * btnSpacing;

      const bg = this.add.rectangle(centerX, y, btnWidth, btnHeight, btn.color, 1)
        .setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0xFFFFFF, 0.2);

      const text = this.add.text(centerX, y, btn.label, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#FFFFFF',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      bg.on('pointerover', () => {
        bg.setScale(1.05);
        text.setScale(1.05);
      });
      bg.on('pointerout', () => {
        bg.setScale(1);
        text.setScale(1);
      });
      bg.on('pointerdown', () => {
        this.tweens.add({
          targets: [bg, text],
          scaleX: 0.95,
          scaleY: 0.95,
          duration: 50,
          yoyo: true,
          onComplete: btn.action
        });
      });
    });
  }

  // === 소탕 모달 ===
  showSweepModal() {
    if (!this.stage) return;

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(50).setInteractive();

    const panelW = 340;
    const panelH = 320;
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, COLORS.bgLight, 0.98)
      .setDepth(51).setStrokeStyle(2, COLORS.primary);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, '⚡ 소탕', {
      fontSize: '24px', fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // 소탕 가능 여부 체크
    const canSweep = sweepSystem.canSweep(this.stage.id, 1);

    // 남은 횟수 표시
    const remaining = sweepSystem.getDailyRemaining();
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 75, `남은 소탕: ${remaining}회`, {
      fontSize: '16px', fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(52);

    // 횟수 선택
    let sweepCount = 1;
    const maxSweep = Math.min(remaining, 10);

    const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, `${sweepCount}회`, {
      fontSize: '28px', fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // -/+ 버튼
    const minusBtn = this.add.text(GAME_WIDTH / 2 - 80, GAME_HEIGHT / 2 - 30, '◀', {
      fontSize: '28px', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    const plusBtn = this.add.text(GAME_WIDTH / 2 + 80, GAME_HEIGHT / 2 - 30, '▶', {
      fontSize: '28px', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    minusBtn.on('pointerdown', () => {
      if (sweepCount > 1) { sweepCount--; countText.setText(`${sweepCount}회`); updatePreview(); }
    });
    plusBtn.on('pointerdown', () => {
      if (sweepCount < maxSweep) { sweepCount++; countText.setText(`${sweepCount}회`); updatePreview(); }
    });

    // 예상 보상 미리보기
    const previewText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '', {
      fontSize: '14px', fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      align: 'center'
    }).setOrigin(0.5).setDepth(52);

    const updatePreview = () => {
      const preview = sweepSystem.calculateRewards(this.stage.id, sweepCount);
      if (preview) {
        previewText.setText(`예상: 🪙 ${preview.gold} / ⭐ ${preview.exp} EXP`);
      }
    };
    updatePreview();

    // 소탕 실행 버튼
    const execBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, 180, 50,
      canSweep.canSweep !== false ? COLORS.success : COLORS.bgPanel)
      .setDepth(52).setInteractive({ useHandCursor: true });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, '소탕 실행', {
      fontSize: '18px', fontFamily: 'Arial',
      color: '#FFFFFF', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    execBtn.on('pointerdown', () => {
      const result = sweepSystem.executeSweep(this.stage.id, sweepCount);
      if (result && result.success) {
        // 보상 적용
        if (result.rewards.gold) {
          const newGold = SaveManager.addGold(result.rewards.gold);
          this.registry.set('gold', newGold);
        }
        this.closeSweepModal(overlay, panel);
        this.showToast(`소탕 완료! 🪙 +${result.rewards.gold || 0}`);
      } else {
        this.showToast(result?.error || '소탕 실패!');
      }
    });

    // 닫기 버튼
    const closeBtn = this.add.text(GAME_WIDTH / 2 + panelW / 2 - 20, GAME_HEIGHT / 2 - panelH / 2 + 20, '✕', {
      fontSize: '24px', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => this.closeSweepModal(overlay, panel));

    // 모달 요소 저장 (닫기용)
    this.sweepModalElements = [overlay, panel, countText, minusBtn, plusBtn, previewText, execBtn, closeBtn];
  }

  closeSweepModal(overlay) {
    if (this.sweepModalElements) {
      this.sweepModalElements.forEach(el => { if (el && el.destroy) el.destroy(); });
      this.sweepModalElements = null;
    }
    // depth 52 요소들도 정리
    this.children.list
      .filter(c => c.depth >= 50 && c.depth <= 52)
      .forEach(c => c.destroy());
  }

  // === 네비게이션 (D-1.5: 중복 전환 방지 + TransitionManager) ===
  _navigate(sceneName, data = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    transitionManager.fadeTransition(this, sceneName, data);
  }

  goToNextStage() {
    if (this.transitioning) return;
    this.transitioning = true;
    transitionManager.slideTransition(this, 'MainMenuScene', {}, 'left');
  }

  retryBattle() {
    if (this.transitioning) return;
    this.transitioning = true;
    transitionManager.battleEntryTransition(this, { stage: this.stage, party: this.party });
  }

  goToPartyEdit() {
    this._navigate('PartyEditScene', { returnTo: 'MainMenuScene', stage: this.stage });
  }

  goToMain() {
    this._navigate('MainMenuScene');
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.bgLight.toString(16).padStart(6, '0')}`,
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
  }
}
