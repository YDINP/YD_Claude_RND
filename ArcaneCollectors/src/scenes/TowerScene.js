/**
 * TowerScene - 무한의 탑 UI
 * TowerSystem과 연동하여 층 진행, 보상, 전투 진입 제공
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, MOODS } from '../config/gameConfig.js';
import { TowerSystem } from '../systems/TowerSystem.js';
import energySystem from '../systems/EnergySystem.js';
import { BottomNav } from '../components/BottomNav.js';
import transitionManager from '../utils/TransitionManager.js';

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
    this.bottomNav = new BottomNav(this, 'menu');
    } catch (error) {
      console.error('[TowerScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    if (this.bottomNav) { this.bottomNav.destroy(); this.bottomNav = null; }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  createBackground() {
    // ART-1: 배경 텍스처 사용 (폴백: 기존 그래디언트)
    if (this.textures.exists('bg_tower')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_tower').setOrigin(0.5);
    } else {
      // Fallback: 어두운 탑 배경
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x0a0e1a, 0x0a0e1a, 0x1a1040, 0x1a1040, 1);
      bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // 별 효과
      for (let i = 0; i < 40; i++) {
        const x = Phaser.Math.Between(0, GAME_WIDTH);
        const y = Phaser.Math.Between(0, GAME_HEIGHT * 0.4);
        const size = Phaser.Math.FloatBetween(1, 3);
        const star = this.add.circle(x, y, size, 0xffffff, Phaser.Math.FloatBetween(0.2, 0.7));
        this.tweens.add({
          targets: star, alpha: 0.1, duration: Phaser.Math.Between(1500, 3000),
          yoyo: true, repeat: -1
        });
      }
    }
  }

  createTopBar() {
    // LAYOUT 통일: Top bar background (100px)
    const bar = this.add.graphics();
    bar.fillStyle(0x0F172A, 0.95);
    bar.fillRect(0, 0, GAME_WIDTH, 100);
    bar.lineStyle(2, COLORS.primary, 0.5);
    bar.lineBetween(0, 100, GAME_WIDTH, 100);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBg = this.add.rectangle(30, 50, 50, 40, 0x0F172A, 0.8)
      .setInteractive({ useHandCursor: true });
    this.add.text(30, 50, '← 뒤로', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#94A3B8'
    }).setOrigin(0.5).on('pointerdown', () => {
      transitionManager.slideTransition(this, 'StageSelectScene', {}, 'right');
    });

    this.add.text(GAME_WIDTH / 2, 50, '무한의 탑', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '24px',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);

    // 에너지 표시 (우상단)
    const energy = energySystem.getCurrentEnergy();
    const maxEnergy = energySystem.getMaxEnergy();
    this.energyText = this.add.text(GAME_WIDTH - 30, 50, `⚡ ${energy}/${maxEnergy}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#F59E0B'
    }).setOrigin(1, 0.5);
  }

  loadTowerData() {
    this.progress = TowerSystem.getProgress();
    this.currentFloorInfo = TowerSystem.getFloorInfo(this.progress.currentFloor);
  }

  createFloorDisplay() {
    const centerX = GAME_WIDTH / 2;
    const y = 160;

    // 현재 층 표시 (큰 원)
    const circle = this.add.graphics();
    const isBoss = this.currentFloorInfo?.isBoss;
    const circleColor = isBoss ? 0xEF4444 : COLORS.primary;
    circle.fillStyle(circleColor, 0.2);
    circle.fillCircle(centerX, y + 60, 80);
    circle.lineStyle(3, circleColor, 0.8);
    circle.strokeCircle(centerX, y + 60, 80);

    // 층 번호
    this.add.text(centerX, y + 45, `${this.progress.currentFloor}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '48px',
      fontStyle: 'bold', color: isBoss ? '#EF4444' : '#F8FAFC'
    }).setOrigin(0.5);

    this.add.text(centerX, y + 85, isBoss ? 'BOSS FLOOR' : 'FLOOR', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px',
      color: isBoss ? '#FCA5A5' : '#94A3B8'
    }).setOrigin(0.5);

    // 최고 기록
    this.add.text(centerX, y + 120, `최고 기록: ${this.progress.highestFloor}층`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#F59E0B'
    }).setOrigin(0.5);

    // 총 클리어 횟수
    this.add.text(centerX, y + 145, `총 클리어: ${this.progress.totalClears}회`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#64748B'
    }).setOrigin(0.5);
  }

  createFloorInfo() {
    const panelY = 380;
    const panelW = GAME_WIDTH - 60;
    const panelH = 220;

    // 패널 배경
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(30, panelY, panelW, panelH, 16);
    panel.lineStyle(2, COLORS.primary, 0.3);
    panel.strokeRoundedRect(30, panelY, panelW, panelH, 16);

    this.add.text(50, panelY + 15, '층 정보', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '18px',
      fontStyle: 'bold', color: '#F8FAFC'
    });

    if (!this.currentFloorInfo) {
      this.add.text(GAME_WIDTH / 2, panelY + panelH / 2, '탑 정복 완료!', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '20px',
        color: '#F59E0B', fontStyle: 'bold'
      }).setOrigin(0.5);
      return;
    }

    // 난이도
    const diff = this.currentFloorInfo.difficulty;
    const diffLabel = diff < 1.5 ? '쉬움' : diff < 2.5 ? '보통' : diff < 4 ? '어려움' : '극한';
    const diffColor = diff < 1.5 ? '#10B981' : diff < 2.5 ? '#F59E0B' : diff < 4 ? '#EF4444' : '#DC2626';
    this.add.text(50, panelY + 50, `난이도:`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#94A3B8'
    });
    this.add.text(130, panelY + 50, `${diffLabel} (x${diff.toFixed(2)})`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px',
      fontStyle: 'bold', color: diffColor
    });

    // 적 구성
    const enemies = this.currentFloorInfo.enemies || [];
    this.add.text(50, panelY + 80, `적:`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#94A3B8'
    });
    const enemyText = enemies.map(e => `${e.id.replace('enemy_', '')} x${e.count}`).join(', ');
    this.add.text(130, panelY + 80, enemyText || '알 수 없음', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#F8FAFC'
    });

    // 보상 미리보기
    const rewards = this.currentFloorInfo.rewards;
    this.add.text(50, panelY + 115, '보상:', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#94A3B8'
    });
    if (rewards) {
      const rewardParts = [];
      if (rewards.gold) rewardParts.push(`💰 ${rewards.gold}`);
      if (rewards.exp) rewardParts.push(`✨ ${rewards.exp} EXP`);
      this.add.text(130, panelY + 115, rewardParts.join('  '), {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#F8FAFC'
      });
    }

    // 보스 보상
    if (this.currentFloorInfo.bossReward) {
      const br = this.currentFloorInfo.bossReward;
      const bossRewardParts = [];
      if (br.gems) bossRewardParts.push(`💎 ${br.gems}`);
      if (br.srTicket) bossRewardParts.push(`🎫 SR티켓 x${br.srTicket}`);
      if (br.ssrTicket) bossRewardParts.push(`🎫 SSR티켓 x${br.ssrTicket}`);
      this.add.text(50, panelY + 150, '보스 보너스:', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#EF4444'
      });
      this.add.text(170, panelY + 150, bossRewardParts.join('  '), {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px', color: '#FCA5A5'
      });
    }

    // 다음 보스 층
    if (this.progress.nextBossFloor) {
      this.add.text(50, panelY + 185, `다음 보스: ${this.progress.nextBossFloor}층`, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#64748B'
      });
    }
  }

  createActionButtons() {
    // UIX-3.4: 도전 버튼 하단 중앙 (y=980)
    const btnY = 980;
    const btnW = 280;
    const btnH = 60;

    // 도전 버튼
    const canChallenge = this.currentFloorInfo !== null;
    const challengeColor = canChallenge ? COLORS.primary : 0x475569;

    const challengeBtn = this.add.graphics();
    challengeBtn.fillStyle(challengeColor, 1);
    challengeBtn.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY, btnW, btnH, 14);

    const challengeText = this.add.text(GAME_WIDTH / 2, btnY + btnH / 2,
      canChallenge ? `⚔️ ${this.progress.currentFloor}층 도전` : '정복 완료', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '20px',
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
    const resetY = 1050; // 1050+45=1095 < 1160
    if (this.progress.currentFloor > 1) {
      const resetBtn = this.add.graphics();
      resetBtn.fillStyle(0x334155, 1);
      resetBtn.fillRoundedRect(GAME_WIDTH / 2 - 100, resetY, 200, 45, 10);

      this.add.text(GAME_WIDTH / 2, resetY + 22, '🔄 탑 리셋', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#94A3B8'
      }).setOrigin(0.5);

      const resetHit = this.add.rectangle(GAME_WIDTH / 2, resetY + 22, 200, 45)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      resetHit.on('pointerdown', () => {
        this.confirmReset();
      });
    }
  }

  createProgressBar() {
    const barY = 780;
    const barW = GAME_WIDTH - 80;
    const barH = 12;
    const progress = Math.min(this.progress.currentFloor / TowerSystem.MAX_FLOOR, 1);

    this.add.text(40, barY - 20, '탑 진행도', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#64748B'
    });

    this.add.text(GAME_WIDTH - 40, barY - 20,
      `${this.progress.currentFloor - 1} / ${TowerSystem.MAX_FLOOR}`, {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#94A3B8'
      }).setOrigin(1, 0);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x1E293B, 1);
    barBg.fillRoundedRect(40, barY, barW, barH, 6);

    const barFill = this.add.graphics();
    barFill.fillStyle(COLORS.primary, 1);
    barFill.fillRoundedRect(40, barY, barW * progress, barH, 6);

    // 보스 층 마커
    TowerSystem.BOSS_FLOORS.forEach(bossFloor => {
      if (bossFloor <= TowerSystem.MAX_FLOOR) {
        const markerX = 40 + (bossFloor / TowerSystem.MAX_FLOOR) * barW;
        const marker = this.add.graphics();
        const cleared = this.progress.currentFloor > bossFloor;
        marker.fillStyle(cleared ? 0x10B981 : 0xEF4444, 0.8);
        marker.fillCircle(markerX, barY + barH / 2, 5);
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
    dialog.fillRoundedRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT / 2 - 80, 320, 160, 16);
    dialog.lineStyle(2, 0xEF4444, 0.5);
    dialog.strokeRoundedRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT / 2 - 80, 320, 160, 16);

    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40,
      '탑을 리셋하시겠습니까?\n진행도가 1층으로 돌아갑니다.', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
        color: '#F8FAFC', align: 'center'
      }).setOrigin(0.5).setDepth(5002);

    // 확인 버튼
    const confirmBg = this.add.rectangle(GAME_WIDTH / 2 - 75, GAME_HEIGHT / 2 + 40, 120, 40, 0xEF4444)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    const confirmLabel = this.add.text(GAME_WIDTH / 2 - 75, GAME_HEIGHT / 2 + 40, '리셋', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(5003);

    confirmBg.on('pointerdown', () => {
      TowerSystem.resetTower();
      this.scene.restart();
    });

    // 취소 버튼
    const cancelBg = this.add.rectangle(GAME_WIDTH / 2 + 75, GAME_HEIGHT / 2 + 40, 120, 40, 0x475569)
      .setDepth(5002).setInteractive({ useHandCursor: true });
    const cancelLabel = this.add.text(GAME_WIDTH / 2 + 75, GAME_HEIGHT / 2 + 40, '취소', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px', color: '#94A3B8'
    }).setOrigin(0.5).setDepth(5003);

    cancelBg.on('pointerdown', () => {
      [overlay, dialog, msg, confirmBg, confirmLabel, cancelBg, cancelLabel].forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, message, {
      fontSize: '18px', fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#334155', padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setDepth(2000);

    this.tweens.add({
      targets: toast, y: toast.y - 50, alpha: 0,
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
