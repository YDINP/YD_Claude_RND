import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS, s, sf } from '../config/gameConfig.js';
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
    this.mode = data?.mode ?? 'normal';
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
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
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
    const title = this.add.text(centerX, s(100), 'VICTORY', {
      fontSize: sf(48),
      fontFamily: 'Georgia, serif',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(4)
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
    this.createStarDisplay(centerX, s(180));

    // === 스테이지 정보 ===
    if (this.stage) {
      this.add.text(centerX, s(240), this.stage.name || `Stage ${this.stage.id}`, {
        fontSize: sf(18),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    }

    // === 보상 패널 ===
    this.createRewardsPanel(centerX, s(380));

    // === 레벨업 표시 ===
    if (this.levelUpResults.length > 0) {
      this.createLevelUpDisplay(centerX, s(580));
    }

    // === 전투 통계 ===
    this.createBattleStats(centerX, s(700));
  }

  createStarDisplay(x, y) {
    const starSize = s(50);
    const spacing = s(60);
    const startX = x - spacing;

    for (let i = 0; i < 3; i++) {
      const starX = startX + i * spacing;
      const filled = i < this.stars;

      const star = this.add.text(starX, y, filled ? '★' : '☆', {
        fontSize: `${starSize}px`,  // starSize already scaled
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
    const panelWidth = s(360);
    const panelHeight = s(160);

    const panel = this.add.rectangle(x, y, panelWidth, panelHeight, COLORS.bgLight, 0.85);
    panel.setStrokeStyle(s(2), COLORS.primary, 0.6);

    // 보상 타이틀
    this.add.text(x, y - s(60), '보상', {
      fontSize: sf(20),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 골드
    const goldY = y - s(20);
    this.add.text(x - s(60), goldY, '🪙', { fontSize: sf(24) }).setOrigin(0.5);
    const goldText = this.add.text(x + s(10), goldY, `+${this.rewards.gold.toLocaleString()}`, {
      fontSize: sf(22),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // 경험치
    const expY = y + s(20);
    this.add.text(x - s(60), expY, '⭐', { fontSize: sf(24) }).setOrigin(0.5);
    this.add.text(x + s(10), expY, `+${this.rewards.exp.toLocaleString()} EXP`, {
      fontSize: sf(20),
      fontFamily: 'Arial',
      color: `#${  COLORS.primary.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // 아이템 드롭 (있으면)
    if (this.rewards.items && this.rewards.items.length > 0) {
      const itemY = y + s(55);
      this.add.text(x - s(60), itemY, '📦', { fontSize: sf(20) }).setOrigin(0.5);
      const itemNames = this.rewards.items.map(i => i.name || i.itemId).join(', ');
      this.add.text(x + s(10), itemY, itemNames, {
        fontSize: sf(14),
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
    const banner = this.add.rectangle(x, y, s(340), s(30) + this.levelUpResults.length * s(30), COLORS.success, 0.15);
    banner.setStrokeStyle(s(1), COLORS.success, 0.5);

    this.add.text(x, y - (this.levelUpResults.length * s(15)), '🎉 레벨 업!', {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${  COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.levelUpResults.forEach((result, i) => {
      const lineY = y - (this.levelUpResults.length * s(15)) + s(30) + i * s(28);
      this.add.text(x, lineY, `${result.name}  Lv.${result.newLevel - result.gained} → Lv.${result.newLevel}`, {
        fontSize: sf(15),
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
      const statX = x - s(80) + i * s(160);
      this.add.text(statX, y, stat.label, {
        fontSize: sf(13),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      this.add.text(statX, y + s(24), stat.value, {
        fontSize: sf(18),
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
    });
  }

  createDefeatDisplay() {
    const centerX = GAME_WIDTH / 2;

    // 패배 타이틀
    this.add.text(centerX, s(200), 'DEFEAT', {
      fontSize: sf(44),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.danger.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(3)
    }).setOrigin(0.5);

    // 빈 별
    const starStr = '☆☆☆';
    this.add.text(centerX, s(280), starStr, {
      fontSize: sf(40),
      color: '#555555'
    }).setOrigin(0.5);

    // 격려 메시지
    const messages = [
      '다음에는 꼭 이길 수 있을 거예요!',
      '파티를 강화하고 다시 도전하세요!',
      '분위기 상성을 확인해보세요!',
      '영웅을 레벨업하면 쉬워질 거예요!'
    ];
    this.add.text(centerX, s(380), Phaser.Math.RND.pick(messages), {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`,
      wordWrap: { width: s(300) },
      align: 'center'
    }).setOrigin(0.5);

    // 전투 통계 (패배 시에도)
    if (this.stage) {
      this.add.text(centerX, s(460), this.stage.name || `Stage ${this.stage.id}`, {
        fontSize: sf(16),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    }
  }

  createActionButtons() {
    const centerX = GAME_WIDTH / 2;
    const btnY = this.victory ? s(820) : s(580);
    const btnWidth = s(200);
    const btnHeight = s(55);
    const btnSpacing = s(70);

    const buttons = [];

    if (this.victory) {
      // 다음 스테이지 버튼
      buttons.push({
        label: this.mode === 'boss' ? '스테이지 진행' : '다음 스테이지',
        color: COLORS.primary,
        action: () => this.goToNextStage()
      });

      // 소탕 버튼 (3성일 때만, 보스전 모드 제외)
      if (this.stars >= 3 && this.stage && this.mode !== 'boss') {
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
      bg.setStrokeStyle(s(2), 0xFFFFFF, 0.2);

      const text = this.add.text(centerX, y, btn.label, {
        fontSize: sf(18),
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

    const panelW = s(340);
    const panelH = s(320);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, panelW, panelH, COLORS.bgLight, 0.98)
      .setDepth(51).setStrokeStyle(s(2), COLORS.primary);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(120), '⚡ 소탕', {
      fontSize: sf(24), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // 소탕 가능 여부 체크
    const canSweep = sweepSystem.canSweep(this.stage.id, 1);

    // 남은 횟수 표시
    const remaining = sweepSystem.getDailyRemaining();
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(75), `남은 소탕: ${remaining}회`, {
      fontSize: sf(16), fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(52);

    // 횟수 선택
    let sweepCount = 1;
    const maxSweep = Math.min(remaining, 10);

    const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(30), `${sweepCount}회`, {
      fontSize: sf(28), fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // -/+ 버튼
    const minusBtn = this.add.text(GAME_WIDTH / 2 - s(80), GAME_HEIGHT / 2 - s(30), '◀', {
      fontSize: sf(28), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    const plusBtn = this.add.text(GAME_WIDTH / 2 + s(80), GAME_HEIGHT / 2 - s(30), '▶', {
      fontSize: sf(28), color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    minusBtn.on('pointerdown', () => {
      if (sweepCount > 1) { sweepCount--; countText.setText(`${sweepCount}회`); updatePreview(); }
    });
    plusBtn.on('pointerdown', () => {
      if (sweepCount < maxSweep) { sweepCount++; countText.setText(`${sweepCount}회`); updatePreview(); }
    });

    // 예상 보상 미리보기
    const previewText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(30), '', {
      fontSize: sf(14), fontFamily: 'Arial',
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
    const execBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(90), s(180), s(50),
      canSweep.canSweep !== false ? COLORS.success : COLORS.bgPanel)
      .setDepth(52).setInteractive({ useHandCursor: true });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(90), '소탕 실행', {
      fontSize: sf(18), fontFamily: 'Arial',
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
    const closeBtn = this.add.text(GAME_WIDTH / 2 + panelW / 2 - s(20), GAME_HEIGHT / 2 - panelH / 2 + s(20), '✕', {
      fontSize: sf(24), color: '#FFFFFF'
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
    const data = this.mode === 'boss' ? { bossVictory: true } : {};
    transitionManager.slideTransition(this, 'MainMenuScene', data, 'left');
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
    if (this.mode === 'boss') {
      const data = this.victory ? { bossVictory: true } : { bossDefeat: true };
      this._navigate('MainMenuScene', data);
    } else {
      this._navigate('MainMenuScene');
    }
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.bgLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: toast,
      y: toast.y - s(50),
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
