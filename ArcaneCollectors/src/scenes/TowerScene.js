/**
 * TowerScene - 무한의 탑 UI
 * TowerSystem과 연동하여 층 진행, 보상, 전투 진입 제공
 */
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS, s, sf } from '../config/gameConfig.js';
import { TowerSystem } from '../systems/TowerSystem.js';
import energySystem from '../systems/EnergySystem.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';

export class TowerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TowerScene' });
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);
    this.createBackground();
    this.createTopBar();
    this.loadTowerData();
    this.createFloorDisplay();
    this.createFloorInfo();
    this.createActionButtons();
    this.createProgressBar();
    } catch (error) {
      console.error('[TowerScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
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

  createBackground() {
    BackgroundFactory.createTowerBg(this);
  }

  createTopBar() {
    // DESIGN_SYSTEM: TopBar s(80), 구분선 alpha 0.3
    const bar = this.add.graphics();
    bar.fillStyle(0x0F172A, 0.95);
    bar.fillRect(0, 0, GAME_WIDTH, s(80));
    bar.lineStyle(s(2), COLORS.primary, 0.3);
    bar.lineBetween(0, s(80), GAME_WIDTH, s(80));

    // Back button (최소 터치 s(50)×s(44))
    const backBg = this.add.rectangle(s(30), s(40), s(50), s(44), 0x0F172A, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.text(s(30), s(40), '← 뒤로', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#94A3B8'
    }).setOrigin(0.5);
    backBg.on('pointerdown', () => {
      navigationManager.goBack(this);
    });

    this.add.text(GAME_WIDTH / 2, s(40), '무한의 탑', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(24),
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);

    // 에너지 표시 (우상단)
    const energy = energySystem.getCurrentEnergy();
    const maxEnergy = energySystem.getMaxEnergy();
    this.energyText = this.add.text(GAME_WIDTH - s(30), s(40), `⚡ ${energy}/${maxEnergy}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#F59E0B'
    }).setOrigin(1, 0.5);
  }

  loadTowerData() {
    this.progress = TowerSystem.getProgress();
    this.currentFloorInfo = TowerSystem.getFloorInfo(this.progress.currentFloor);
  }

  createFloorDisplay() {
    const centerX = GAME_WIDTH / 2;
    const y = s(140);

    const isBoss = this.currentFloorInfo?.isBoss;
    const circleColor = isBoss ? 0xEF4444 : COLORS.primary;

    // 외곽 글로우 (큰 원, 저알파)
    const glow = this.add.graphics();
    glow.fillStyle(circleColor, 0.08);
    glow.fillCircle(centerX, y + s(60), s(100));

    // 메인 원 배경
    const circle = this.add.graphics();
    circle.fillStyle(circleColor, 0.15);
    circle.fillCircle(centerX, y + s(60), s(80));
    // 내부 그라데이션 효과 (동심원)
    circle.fillStyle(circleColor, 0.1);
    circle.fillCircle(centerX, y + s(60), s(60));
    circle.lineStyle(s(3), circleColor, 0.8);
    circle.strokeCircle(centerX, y + s(60), s(80));
    // 내부 보조선
    circle.lineStyle(s(1), circleColor, 0.2);
    circle.strokeCircle(centerX, y + s(60), s(60));

    // 보스 글로우 애니메이션
    if (isBoss) {
      const glowCircle = this.add.circle(centerX, y + s(60), s(85), circleColor, 0.15);
      this.tweens.add({
        targets: glowCircle, alpha: 0.05, duration: 1500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }

    // 층 번호
    this.add.text(centerX, y + s(45), `${this.progress.currentFloor}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(48),
      fontStyle: 'bold', color: isBoss ? '#EF4444' : '#F8FAFC'
    }).setOrigin(0.5);

    this.add.text(centerX, y + s(85), isBoss ? 'BOSS FLOOR' : 'FLOOR', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14),
      color: isBoss ? '#FCA5A5' : '#94A3B8'
    }).setOrigin(0.5);

    // 최고 기록
    this.add.text(centerX, y + s(120), `최고 기록: ${this.progress.highestFloor}층`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#F59E0B'
    }).setOrigin(0.5);

    // 총 클리어 횟수
    this.add.text(centerX, y + s(145), `총 클리어: ${this.progress.totalClears}회`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#64748B'
    }).setOrigin(0.5);
  }

  createFloorInfo() {
    const panelY = s(380);
    const panelW = GAME_WIDTH - s(60);
    const panelH = s(220);

    // 패널 배경
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(s(30), panelY, panelW, panelH, s(16));
    panel.lineStyle(s(2), COLORS.primary, 0.3);
    panel.strokeRoundedRect(s(30), panelY, panelW, panelH, s(16));

    this.add.text(s(50), panelY + s(15), '층 정보', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(18),
      fontStyle: 'bold', color: '#F8FAFC'
    });

    if (!this.currentFloorInfo) {
      this.add.text(GAME_WIDTH / 2, panelY + panelH / 2, '탑 정복 완료!', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
        color: '#F59E0B', fontStyle: 'bold'
      }).setOrigin(0.5);
      return;
    }

    // 난이도
    const diff = this.currentFloorInfo.difficulty;
    const diffLabel = diff < 1.5 ? '쉬움' : diff < 2.5 ? '보통' : diff < 4 ? '어려움' : '극한';
    const diffColor = diff < 1.5 ? '#10B981' : diff < 2.5 ? '#F59E0B' : diff < 4 ? '#EF4444' : '#DC2626';
    this.add.text(s(50), panelY + s(50), `난이도:`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#94A3B8'
    });
    this.add.text(s(130), panelY + s(50), `${diffLabel} (x${diff.toFixed(2)})`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15),
      fontStyle: 'bold', color: diffColor
    });

    // 적 구성
    const enemies = this.currentFloorInfo.enemies || [];
    this.add.text(s(50), panelY + s(80), `적:`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#94A3B8'
    });
    const enemyText = enemies.map(e => `${e.id.replace('enemy_', '')} x${e.count}`).join(', ');
    this.add.text(s(130), panelY + s(80), enemyText || '알 수 없음', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#F8FAFC'
    });

    // 보상 미리보기
    const rewards = this.currentFloorInfo.rewards;
    this.add.text(s(50), panelY + s(115), '보상:', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#94A3B8'
    });
    if (rewards) {
      const rewardParts = [];
      if (rewards.gold) rewardParts.push(`💰 ${rewards.gold}`);
      if (rewards.exp) rewardParts.push(`✨ ${rewards.exp} EXP`);
      this.add.text(s(130), panelY + s(115), rewardParts.join('  '), {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#F8FAFC'
      });
    }

    // 보스 보상
    if (this.currentFloorInfo.bossReward) {
      const br = this.currentFloorInfo.bossReward;
      const bossRewardParts = [];
      if (br.gems) bossRewardParts.push(`💎 ${br.gems}`);
      if (br.srTicket) bossRewardParts.push(`🎫 SR티켓 x${br.srTicket}`);
      if (br.ssrTicket) bossRewardParts.push(`🎫 SSR티켓 x${br.ssrTicket}`);
      this.add.text(s(50), panelY + s(150), '보스 보너스:', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#EF4444'
      });
      this.add.text(s(170), panelY + s(150), bossRewardParts.join('  '), {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(15), color: '#FCA5A5'
      });
    }

    // 다음 보스 층
    if (this.progress.nextBossFloor) {
      this.add.text(s(50), panelY + s(185), `다음 보스: ${this.progress.nextBossFloor}층`, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#64748B'
      });
    }
  }

  createActionButtons() {
    // UIX-3.4: 도전 버튼 하단 중앙 (y=980)
    const btnY = s(980);
    const btnW = s(280);
    const btnH = s(60);

    // 도전 버튼
    const canChallenge = this.currentFloorInfo !== null;
    const challengeColor = canChallenge ? COLORS.primary : 0x475569;

    const challengeBtn = this.add.graphics();
    challengeBtn.fillStyle(challengeColor, 1);
    challengeBtn.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY, btnW, btnH, s(14));

    const challengeText = this.add.text(GAME_WIDTH / 2, btnY + btnH / 2,
      canChallenge ? `⚔️ ${this.progress.currentFloor}층 도전` : '정복 완료', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(20),
        fontStyle: 'bold', color: '#FFFFFF'
      }).setOrigin(0.5);

    if (canChallenge) {
      const hitArea = this.add.rectangle(GAME_WIDTH / 2, btnY + btnH / 2, btnW, btnH)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      hitArea.on('pointerdown', () => {
        this.startTowerBattle();
      });
    }

    // 리셋 버튼: BottomNav(y=1160) 겹침 방지
    const resetY = s(1050); // 1050+45=1095 < 1160
    if (this.progress.currentFloor > 1) {
      const resetBtn = this.add.graphics();
      resetBtn.fillStyle(0x334155, 1);
      resetBtn.fillRoundedRect(GAME_WIDTH / 2 - s(100), resetY, s(200), s(45), s(10));

      this.add.text(GAME_WIDTH / 2, resetY + s(22), '🔄 탑 리셋', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#94A3B8'
      }).setOrigin(0.5);

      const resetHit = this.add.rectangle(GAME_WIDTH / 2, resetY + s(22), s(200), s(45))
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      resetHit.on('pointerdown', () => {
        this.confirmReset();
      });
    }
  }

  createProgressBar() {
    const barY = s(780);
    const barW = GAME_WIDTH - s(80);
    const barH = s(12);
    const progress = Math.min(this.progress.currentFloor / TowerSystem.MAX_FLOOR, 1);

    this.add.text(s(40), barY - s(20), '탑 진행도', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#64748B'
    });

    this.add.text(GAME_WIDTH - s(40), barY - s(20),
      `${this.progress.currentFloor - 1} / ${TowerSystem.MAX_FLOOR}`, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(14), color: '#94A3B8'
      }).setOrigin(1, 0);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x374151, 1);
    barBg.fillRoundedRect(s(40), barY, barW, barH, s(6));

    const barFill = this.add.graphics();
    barFill.fillStyle(COLORS.primary, 1);
    barFill.fillRoundedRect(s(40), barY, barW * progress, barH, s(6));

    // 보스 층 마커
    TowerSystem.BOSS_FLOORS.forEach(bossFloor => {
      if (bossFloor <= TowerSystem.MAX_FLOOR) {
        const markerX = s(40) + (bossFloor / TowerSystem.MAX_FLOOR) * barW;
        const marker = this.add.graphics();
        const cleared = this.progress.currentFloor > bossFloor;
        marker.fillStyle(cleared ? 0x10B981 : 0xEF4444, 0.8);
        marker.fillCircle(markerX, barY + barH / 2, s(5));
      }
    });
  }

  startTowerBattle() {
    const energyCost = this.currentFloorInfo.isBoss ? 20 : 12;
    const currentEnergy = energySystem.getCurrentEnergy();

    if (currentEnergy < energyCost) {
      this.showToast(`에너지 부족! (필요: ${energyCost}, 보유: ${currentEnergy})`);
      return;
    }

    energySystem.consumeEnergy(energyCost);

    transitionManager.battleEntryTransition(this, {
      mode: 'tower',
      towerFloor: this.progress.currentFloor,
      enemies: this.currentFloorInfo.enemies,
      isBoss: this.currentFloorInfo.isBoss,
      returnScene: 'TowerScene'
    });
  }

  confirmReset() {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(5000).setInteractive();

    const dialog = this.add.graphics().setDepth(5001);
    dialog.fillStyle(0x1E293B, 1);
    dialog.fillRoundedRect(GAME_WIDTH / 2 - s(160), GAME_HEIGHT / 2 - s(80), s(320), s(160), s(16));
    dialog.lineStyle(s(2), 0xEF4444, 0.5);
    dialog.strokeRoundedRect(GAME_WIDTH / 2 - s(160), GAME_HEIGHT / 2 - s(80), s(320), s(160), s(16));

    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(40),
      '탑을 리셋하시겠습니까?\n진행도가 1층으로 돌아갑니다.', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(5002);

    // 확인 버튼
    const confirmBg = this.add.rectangle(GAME_WIDTH / 2 - s(75), GAME_HEIGHT / 2 + s(40), s(120), s(40), 0xEF4444)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    const confirmLabel = this.add.text(GAME_WIDTH / 2 - s(75), GAME_HEIGHT / 2 + s(40), '리셋', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16),
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);

    confirmBg.on('pointerdown', () => {
      TowerSystem.resetTower();
      this.scene.restart();
    });

    // 취소 버튼
    const cancelBg = this.add.rectangle(GAME_WIDTH / 2 + s(75), GAME_HEIGHT / 2 + s(40), s(120), s(40), 0x475569)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    const cancelLabel = this.add.text(GAME_WIDTH / 2 + s(75), GAME_HEIGHT / 2 + s(40), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: sf(16), color: '#94A3B8'
    }).setOrigin(0.5).setDepth(5003);

    cancelBg.on('pointerdown', () => {
      [overlay, dialog, msg, confirmBg, confirmLabel, cancelBg, cancelLabel].forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(200), message, {
      fontSize: sf(18), fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#334155', padding: { x: s(24), y: s(14) }
    }).setOrigin(0.5).setDepth(2000);

    this.tweens.add({
      targets: toast, y: toast.y - s(50), alpha: 0,
      duration: 1500, delay: 500, onComplete: () => toast.destroy()
    });
  }

  update() {
    if (this.energyText) {
      const energy = energySystem.getCurrentEnergy();
      const maxEnergy = energySystem.getMaxEnergy();
      this.energyText.setText(`⚡ ${energy}/${maxEnergy}`);
    }
  }
}
