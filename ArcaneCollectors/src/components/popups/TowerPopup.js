import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH } from '../../config/gameConfig.js';
import { TowerSystem } from '../../systems/TowerSystem.js';
import { SaveManager } from '../../systems/SaveManager.js';
import energySystem from '../../systems/EnergySystem.js';
import transitionManager from '../../utils/TransitionManager.js';

/**
 * TowerPopup - 무한의 탑 팝업
 * PopupBase를 상속하여 탑 UI를 팝업 형태로 제공
 */
export class TowerPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '무한의 탑',
      width: 680,
      height: 1100,
      ...options
    });

    this.progress = null;
    this.currentFloorInfo = null;
  }

  buildContent() {
    this.loadTowerData();
    this.createFloorDisplay();
    this.createFloorInfo();
    this.createProgressBar();
    this.createActionButtons();
  }

  loadTowerData() {
    this.progress = TowerSystem.getProgress();
    this.currentFloorInfo = TowerSystem.getFloorInfo(this.progress.currentFloor);
  }

  createFloorDisplay() {
    const cx = this.contentBounds.centerX;
    const top = this.contentBounds.top;

    // 현재 층 표시 (큰 원)
    const circleY = top + 100;
    const isBoss = this.currentFloorInfo?.isBoss;
    const circleColor = isBoss ? 0xEF4444 : COLORS.primary;

    const circle = this.scene.add.graphics();
    circle.fillStyle(circleColor, 0.2);
    circle.fillCircle(cx, circleY, 80);
    circle.lineStyle(3, circleColor, 0.8);
    circle.strokeCircle(cx, circleY, 80);
    this.contentContainer.add(circle);

    // 층 번호
    this.addText(cx, circleY - 15, `${this.progress.currentFloor}`, {
      fontSize: '48px',
      fontStyle: 'bold',
      color: isBoss ? '#EF4444' : '#F8FAFC'
    }).setOrigin(0.5);

    this.addText(cx, circleY + 25, isBoss ? 'BOSS FLOOR' : 'FLOOR', {
      fontSize: '14px',
      color: isBoss ? '#FCA5A5' : '#94A3B8'
    }).setOrigin(0.5);

    // 최고 기록
    this.addText(cx, circleY + 60, `최고 기록: ${this.progress.highestFloor}층`, {
      fontSize: '16px',
      color: '#F59E0B'
    }).setOrigin(0.5);

    // 총 클리어 횟수
    this.addText(cx, circleY + 85, `총 클리어: ${this.progress.totalClears}회`, {
      fontSize: '14px',
      color: '#64748B'
    }).setOrigin(0.5);
  }

  createFloorInfo() {
    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    const panelY = this.contentBounds.top + 270;
    const panelW = this.contentBounds.width;
    const panelH = 220;

    // 패널 배경
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(left, panelY, panelW, panelH, 16);
    panel.lineStyle(2, COLORS.primary, 0.3);
    panel.strokeRoundedRect(left, panelY, panelW, panelH, 16);
    this.contentContainer.add(panel);

    this.addText(left + 20, panelY + 15, '층 정보', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    if (!this.currentFloorInfo) {
      this.addText(cx, panelY + panelH / 2, '탑 정복 완료!', {
        fontSize: '20px',
        color: '#F59E0B',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      return;
    }

    // 난이도
    const diff = this.currentFloorInfo.difficulty;
    const diffLabel = diff < 1.5 ? '쉬움' : diff < 2.5 ? '보통' : diff < 4 ? '어려움' : '극한';
    const diffColor = diff < 1.5 ? '#10B981' : diff < 2.5 ? '#F59E0B' : diff < 4 ? '#EF4444' : '#DC2626';

    this.addText(left + 20, panelY + 50, '난이도:', {
      fontSize: '15px',
      color: '#94A3B8'
    });
    this.addText(left + 100, panelY + 50, `${diffLabel} (x${diff.toFixed(2)})`, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: diffColor
    });

    // 적 구성
    const enemies = this.currentFloorInfo.enemies || [];
    this.addText(left + 20, panelY + 80, '적:', {
      fontSize: '15px',
      color: '#94A3B8'
    });
    const enemyText = enemies.map(e => `${e.id.replace('enemy_', '')} x${e.count}`).join(', ');
    this.addText(left + 100, panelY + 80, enemyText || '알 수 없음', {
      fontSize: '15px',
      color: '#F8FAFC'
    });

    // 보상 미리보기
    const rewards = this.currentFloorInfo.rewards;
    this.addText(left + 20, panelY + 115, '보상:', {
      fontSize: '15px',
      color: '#94A3B8'
    });
    if (rewards) {
      const rewardParts = [];
      if (rewards.gold) rewardParts.push(`💰 ${rewards.gold}`);
      if (rewards.exp) rewardParts.push(`✨ ${rewards.exp} EXP`);
      this.addText(left + 100, panelY + 115, rewardParts.join('  '), {
        fontSize: '15px',
        color: '#F8FAFC'
      });
    }

    // 보스 보상
    if (this.currentFloorInfo.bossReward) {
      const br = this.currentFloorInfo.bossReward;
      const bossRewardParts = [];
      if (br.gems) bossRewardParts.push(`💎 ${br.gems}`);
      if (br.srTicket) bossRewardParts.push(`🎫 SR티켓 x${br.srTicket}`);
      if (br.ssrTicket) bossRewardParts.push(`🎫 SSR티켓 x${br.ssrTicket}`);

      this.addText(left + 20, panelY + 150, '보스 보너스:', {
        fontSize: '15px',
        color: '#EF4444'
      });
      this.addText(left + 140, panelY + 150, bossRewardParts.join('  '), {
        fontSize: '15px',
        color: '#FCA5A5'
      });
    }

    // 다음 보스 층
    if (this.progress.nextBossFloor) {
      this.addText(left + 20, panelY + 185, `다음 보스: ${this.progress.nextBossFloor}층`, {
        fontSize: '14px',
        color: '#64748B'
      });
    }
  }

  createProgressBar() {
    const left = this.contentBounds.left;
    const barY = this.contentBounds.top + 530;
    const barW = this.contentBounds.width;
    const barH = 12;
    const progress = Math.min(this.progress.currentFloor / TowerSystem.MAX_FLOOR, 1);

    this.addText(left, barY - 20, '탑 진행도', {
      fontSize: '14px',
      color: '#64748B'
    });

    this.addText(left + barW, barY - 20,
      `${this.progress.currentFloor - 1} / ${TowerSystem.MAX_FLOOR}`, {
        fontSize: '14px',
        color: '#94A3B8'
      }).setOrigin(1, 0);

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(0x1E293B, 1);
    barBg.fillRoundedRect(left, barY, barW, barH, 6);
    this.contentContainer.add(barBg);

    const barFill = this.scene.add.graphics();
    barFill.fillStyle(COLORS.primary, 1);
    barFill.fillRoundedRect(left, barY, barW * progress, barH, 6);
    this.contentContainer.add(barFill);

    // 보스 층 마커
    TowerSystem.BOSS_FLOORS.forEach(bossFloor => {
      if (bossFloor <= TowerSystem.MAX_FLOOR) {
        const markerX = left + (bossFloor / TowerSystem.MAX_FLOOR) * barW;
        const marker = this.scene.add.graphics();
        const cleared = this.progress.currentFloor > bossFloor;
        marker.fillStyle(cleared ? 0x10B981 : 0xEF4444, 0.8);
        marker.fillCircle(markerX, barY + barH / 2, 5);
        this.contentContainer.add(marker);
      }
    });
  }

  createActionButtons() {
    const cx = this.contentBounds.centerX;
    const btnY = this.contentBounds.top + 650;

    // 도전 버튼
    const canChallenge = this.currentFloorInfo !== null;
    const challengeColor = canChallenge ? COLORS.primary : 0x475569;
    const challengeLabel = canChallenge ? `⚔️ ${this.progress.currentFloor}층 도전` : '정복 완료';

    if (canChallenge) {
      this.addButton(cx, btnY, 280, 60, challengeLabel, challengeColor, () => {
        this.startTowerBattle();
      });
    } else {
      // 비활성화 버튼 (클릭 불가)
      const bg = this.scene.add.rectangle(cx, btnY, 280, 60, challengeColor, 1);
      const text = this.scene.add.text(cx, btnY, challengeLabel, {
        fontSize: '20px',
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: '#FFFFFF'
      }).setOrigin(0.5);
      this.contentContainer.add([bg, text]);
    }

    // 리셋 버튼 (1층보다 높을 때만)
    if (this.progress.currentFloor > 1) {
      this.addButton(cx, btnY + 75, 200, 45, '🔄 탑 리셋', 0x334155, () => {
        this.confirmReset();
      });
    }
  }

  startTowerBattle() {
    const energyCost = this.currentFloorInfo.isBoss ? 20 : 12;
    const currentEnergy = energySystem.getCurrentEnergy();

    if (currentEnergy < energyCost) {
      this.showToast(`에너지 부족! (필요: ${energyCost}, 보유: ${currentEnergy})`);
      return;
    }

    energySystem.consumeEnergy(energyCost);

    // 팝업을 먼저 닫고, 완전히 닫힌 후 전투 시작
    this.hide();

    this.scene.time.delayedCall(200, () => {
      transitionManager.battleEntryTransition(this.scene, {
        mode: 'tower',
        towerFloor: this.progress.currentFloor,
        enemies: this.currentFloorInfo.enemies,
        isBoss: this.currentFloorInfo.isBoss,
        returnScene: 'MainMenuScene'  // TowerScene -> MainMenuScene로 변경
      });
    });
  }

  confirmReset() {
    // 리셋 확인 다이얼로그
    const overlay = this.scene.add.rectangle(GAME_WIDTH / 2, this.contentBounds.top + this.contentBounds.height / 2,
      GAME_WIDTH, this.contentBounds.height, 0x000000, 0.7)
      .setDepth(2100).setInteractive();

    const dialog = this.scene.add.graphics().setDepth(2101);
    dialog.fillStyle(0x1E293B, 1);
    dialog.fillRoundedRect(this.contentBounds.centerX - 160, this.contentBounds.top + 300, 320, 160, 16);
    dialog.lineStyle(2, 0xEF4444, 0.5);
    dialog.strokeRoundedRect(this.contentBounds.centerX - 160, this.contentBounds.top + 300, 320, 160, 16);

    const msg = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + 340,
      '탑을 리셋하시겠습니까?\n진행도가 1층으로 돌아갑니다.', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '16px',
        color: '#F8FAFC',
        align: 'center'
      }).setOrigin(0.5).setDepth(2102);

    // 확인 버튼
    const confirmBg = this.scene.add.rectangle(this.contentBounds.centerX - 75, this.contentBounds.top + 400, 120, 40, 0xEF4444)
      .setDepth(2102).setInteractive({ useHandCursor: true });
    const confirmLabel = this.scene.add.text(this.contentBounds.centerX - 75, this.contentBounds.top + 400, '리셋', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(2103);

    confirmBg.on('pointerdown', () => {
      TowerSystem.resetTower();
      [overlay, dialog, msg, confirmBg, confirmLabel, cancelBg, cancelLabel].forEach(e => e.destroy());
      this.hide();
      // 팝업을 닫은 후 메인 메뉴 새로고침
      this.scene.time.delayedCall(200, () => {
        this.scene.scene.restart();
      });
    });

    // 취소 버튼
    const cancelBg = this.scene.add.rectangle(this.contentBounds.centerX + 75, this.contentBounds.top + 400, 120, 40, 0x475569)
      .setDepth(2102).setInteractive({ useHandCursor: true });
    const cancelLabel = this.scene.add.text(this.contentBounds.centerX + 75, this.contentBounds.top + 400, '취소', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '16px',
      color: '#94A3B8'
    }).setOrigin(0.5).setDepth(2103);

    cancelBg.on('pointerdown', () => {
      [overlay, dialog, msg, confirmBg, confirmLabel, cancelBg, cancelLabel].forEach(e => e.destroy());
    });
  }

  showToast(message) {
    const toast = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + 50, message, {
      fontSize: '18px',
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      backgroundColor: '#334155',
      padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setDepth(2100);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }
}
