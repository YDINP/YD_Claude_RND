/**
 * QuestScene - 퀘스트 UI
 * QuestSystem과 연동하여 일일 퀘스트 진행도, 보상 수령 제공
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { BottomNav } from '../components/BottomNav.js';
import transitionManager from '../utils/TransitionManager.js';

export class QuestScene extends Phaser.Scene {
  constructor() {
    super({ key: 'QuestScene' });
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);
    this.questItems = [];
    this.createBackground();
    this.createTopBar();
    this.loadQuests();
    this.createQuestSummary();
    this.createQuestList();
    this.createClaimAllButton();
    this.bottomNav = new BottomNav(this, 'more');
    } catch (error) {
      console.error('[QuestScene] create() 실패:', error);
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
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0F172A);
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
      transitionManager.slideTransition(this, 'MainMenuScene', {}, 'left');
    });

    this.add.text(GAME_WIDTH / 2, 50, '일일 퀘스트', {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '24px',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
  }

  loadQuests() {
    this.quests = QuestSystem.getDailyQuests();
    this.claimable = QuestSystem.getClaimableQuests();
  }

  createQuestSummary() {
    // LAYOUT 통일: 요약 패널 (y=120, content 시작)
    const y = 120;
    const total = this.quests.length;
    const completed = this.quests.filter(q => q.completed).length;
    const claimed = this.quests.filter(q => q.claimed).length;

    // 요약 패널
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(20, y, GAME_WIDTH - 40, 80, 12);

    // 진행 바
    const barX = 40;
    const barW = GAME_WIDTH - 80;
    const barH = 8;
    const barY = y + 55;
    const progress = total > 0 ? completed / total : 0;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 4);

    if (progress > 0) {
      const barFill = this.add.graphics();
      barFill.fillStyle(COLORS.success, 1);
      barFill.fillRoundedRect(barX, barY, barW * progress, barH, 4);
    }

    // 텍스트
    this.add.text(40, y + 15, `완료: ${completed}/${total}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '18px',
      fontStyle: 'bold', color: '#F8FAFC'
    });

    this.add.text(GAME_WIDTH - 40, y + 15, `수령 대기: ${this.claimable.length}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '16px',
      color: this.claimable.length > 0 ? '#F59E0B' : '#64748B'
    }).setOrigin(1, 0);
  }

  createQuestList() {
    // LAYOUT 통일: 퀘스트 목록 시작 y=220 (요약패널 아래)
    const startY = 220;
    const cardH = 100;
    const gap = 10;

    this.quests.forEach((quest, index) => {
      const y = startY + index * (cardH + gap);
      this.createQuestCard(quest, y, cardH);
    });
  }

  createQuestCard(quest, y, cardH) {
    const cardW = GAME_WIDTH - 40;
    const x = 20;

    // 카드 배경
    const card = this.add.graphics();
    const bgColor = quest.claimed ? 0x1a2332 : quest.completed ? 0x1E3A2F : 0x1E293B;
    card.fillStyle(bgColor, 0.95);
    card.fillRoundedRect(x, y, cardW, cardH, 12);

    if (quest.completed && !quest.claimed) {
      card.lineStyle(2, COLORS.success, 0.6);
      card.strokeRoundedRect(x, y, cardW, cardH, 12);
    }

    // 퀘스트 이름
    const nameColor = quest.claimed ? '#64748B' : '#F8FAFC';
    this.add.text(x + 15, y + 12, quest.name, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '17px',
      fontStyle: 'bold', color: nameColor
    });

    // 설명
    this.add.text(x + 15, y + 38, quest.description, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '13px',
      color: '#94A3B8'
    });

    // 진행도 바
    const barX = x + 15;
    const barY = y + 65;
    const barW = cardW - 150;
    const barH = 10;
    const progressPercent = quest.progressPercent / 100;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 5);

    if (progressPercent > 0) {
      const barFill = this.add.graphics();
      const fillColor = quest.completed ? COLORS.success : COLORS.primary;
      barFill.fillStyle(fillColor, 1);
      barFill.fillRoundedRect(barX, barY, barW * Math.min(progressPercent, 1), barH, 5);
    }

    // 진행도 텍스트
    this.add.text(barX + barW + 8, barY - 2, `${quest.progress}/${quest.target}`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '13px',
      color: quest.completed ? '#10B981' : '#94A3B8'
    });

    // 보상 표시
    const rewardParts = [];
    if (quest.rewards.gold) rewardParts.push(`💰${quest.rewards.gold}`);
    if (quest.rewards.gems) rewardParts.push(`💎${quest.rewards.gems}`);
    if (quest.rewards.summonTickets) rewardParts.push(`🎫${quest.rewards.summonTickets}`);
    if (quest.rewards.skillBooks) rewardParts.push(`📕${quest.rewards.skillBooks}`);

    this.add.text(x + 15, y + cardH - 22, rewardParts.join('  '), {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '12px', color: '#F59E0B'
    });

    // 수령 버튼 (완료 & 미수령)
    if (quest.completed && !quest.claimed) {
      const btnX = x + cardW - 80;
      const btnY = y + cardH / 2;

      const btnBg = this.add.graphics();
      btnBg.fillStyle(COLORS.success, 1);
      btnBg.fillRoundedRect(btnX, btnY - 18, 65, 36, 8);

      this.add.text(btnX + 32, btnY, '수령', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '15px',
        fontStyle: 'bold', color: '#FFFFFF'
      }).setOrigin(0.5);

      const btnHit = this.add.rectangle(btnX + 32, btnY, 65, 36)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      btnHit.on('pointerdown', () => {
        const result = QuestSystem.claimReward(quest.id);
        if (result.success) {
          this.showRewardToast(result.rewards);
          this.scene.restart();
        }
      });
    } else if (quest.claimed) {
      this.add.text(x + cardW - 55, y + cardH / 2, '✅ 완료', {
        fontFamily: '"Noto Sans KR", sans-serif', fontSize: '14px', color: '#64748B'
      }).setOrigin(0.5);
    }
  }

  createClaimAllButton() {
    if (this.claimable.length === 0) return;

    const btnY = 1090; // BottomNav(y=1160) 겹침 방지: 1090+55=1145 < 1160
    const btnW = 280;
    const btnH = 55;

    const btn = this.add.graphics();
    btn.fillStyle(COLORS.accent, 1);
    btn.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY, btnW, btnH, 14);

    this.add.text(GAME_WIDTH / 2, btnY + btnH / 2, `🎁 전체 수령 (${this.claimable.length}개)`, {
      fontFamily: '"Noto Sans KR", sans-serif', fontSize: '18px',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const hitArea = this.add.rectangle(GAME_WIDTH / 2, btnY + btnH / 2, btnW, btnH)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', () => {
      const result = QuestSystem.claimAllRewards();
      if (result.success) {
        this.showRewardToast(result.totalRewards);
        this.scene.restart();
      }
    });
  }

  showRewardToast(rewards) {
    const parts = [];
    if (rewards.gold) parts.push(`💰 ${rewards.gold}`);
    if (rewards.gems) parts.push(`💎 ${rewards.gems}`);
    if (rewards.summonTickets) parts.push(`🎫 ${rewards.summonTickets}`);
    const message = `보상 수령: ${parts.join('  ')}`;

    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 200, message, {
      fontSize: '18px', fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#10B981', padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setDepth(2000);

    this.tweens.add({
      targets: toast, y: toast.y - 50, alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }
}
