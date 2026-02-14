/**
 * QuestPopup - 퀘스트 시스템 팝업
 * QuestScene 로직을 팝업 형태로 변환
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS } from '../../config/gameConfig.js';
import { QuestSystem } from '../../systems/QuestSystem.js';

export class QuestPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '일일 퀘스트',
      width: 680,
      height: 1100,
      ...options
    });

    this.quests = [];
    this.claimable = [];
  }

  buildContent() {
    // Load quest data
    this.loadQuests();

    // Summary panel
    this.createQuestSummary();

    // Quest list
    this.createQuestList();

    // Claim all button
    this.createClaimAllButton();
  }

  loadQuests() {
    this.quests = QuestSystem.getDailyQuests();
    this.claimable = QuestSystem.getClaimableQuests();
  }

  createQuestSummary() {
    const { left, top, width, centerX } = this.contentBounds;
    const y = top;

    const total = this.quests.length;
    const completed = this.quests.filter(q => q.completed).length;
    const claimed = this.quests.filter(q => q.claimed).length;

    // Summary panel
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(left, y, width, 80, 12);
    this.contentContainer.add(panel);

    // Progress bar
    const barX = left + 20;
    const barW = width - 40;
    const barH = 8;
    const barY = y + 55;
    const progress = total > 0 ? completed / total : 0;

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 4);
    this.contentContainer.add(barBg);

    if (progress > 0) {
      const barFill = this.scene.add.graphics();
      barFill.fillStyle(COLORS.success, 1);
      barFill.fillRoundedRect(barX, barY, barW * progress, barH, 4);
      this.contentContainer.add(barFill);
    }

    // Text
    this.addText(left + 20, y + 15, `완료: ${completed}/${total}`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    this.addText(left + width - 20, y + 15, `수령 대기: ${this.claimable.length}`, {
      fontSize: '16px',
      color: this.claimable.length > 0 ? '#F59E0B' : '#64748B'
    }).setOrigin(1, 0);
  }

  createQuestList() {
    const { left, top, width } = this.contentBounds;
    const startY = top + 100;
    const cardH = 100;
    const gap = 10;

    this.quests.forEach((quest, index) => {
      const y = startY + index * (cardH + gap);
      this.createQuestCard(quest, left, y, width, cardH);
    });
  }

  createQuestCard(quest, x, y, cardW, cardH) {
    // Card background
    const card = this.scene.add.graphics();
    const bgColor = quest.claimed ? 0x1a2332 : quest.completed ? 0x1E3A2F : 0x1E293B;
    card.fillStyle(bgColor, 0.95);
    card.fillRoundedRect(x, y, cardW, cardH, 12);

    if (quest.completed && !quest.claimed) {
      card.lineStyle(2, COLORS.success, 0.6);
      card.strokeRoundedRect(x, y, cardW, cardH, 12);
    }
    this.contentContainer.add(card);

    // Quest name
    const nameColor = quest.claimed ? '#64748B' : '#F8FAFC';
    this.addText(x + 15, y + 12, quest.name, {
      fontSize: '17px',
      fontStyle: 'bold',
      color: nameColor
    });

    // Description
    this.addText(x + 15, y + 38, quest.description, {
      fontSize: '13px',
      color: '#94A3B8'
    });

    // Progress bar
    const barX = x + 15;
    const barY = y + 65;
    const barW = cardW - 150;
    const barH = 10;
    const progressPercent = quest.progressPercent / 100;

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 5);
    this.contentContainer.add(barBg);

    if (progressPercent > 0) {
      const barFill = this.scene.add.graphics();
      const fillColor = quest.completed ? COLORS.success : COLORS.primary;
      barFill.fillStyle(fillColor, 1);
      barFill.fillRoundedRect(barX, barY, barW * Math.min(progressPercent, 1), barH, 5);
      this.contentContainer.add(barFill);
    }

    // Progress text
    this.addText(barX + barW + 8, barY - 2, `${quest.progress}/${quest.target}`, {
      fontSize: '13px',
      color: quest.completed ? '#10B981' : '#94A3B8'
    });

    // Rewards
    const rewardParts = [];
    if (quest.rewards.gold) rewardParts.push(`💰${quest.rewards.gold}`);
    if (quest.rewards.gems) rewardParts.push(`💎${quest.rewards.gems}`);
    if (quest.rewards.summonTickets) rewardParts.push(`🎫${quest.rewards.summonTickets}`);
    if (quest.rewards.skillBooks) rewardParts.push(`📕${quest.rewards.skillBooks}`);

    this.addText(x + 15, y + cardH - 22, rewardParts.join('  '), {
      fontSize: '12px',
      color: '#F59E0B'
    });

    // Claim button (completed & not claimed)
    if (quest.completed && !quest.claimed) {
      const btnX = x + cardW - 80;
      const btnY = y + cardH / 2;

      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(COLORS.success, 1);
      btnBg.fillRoundedRect(btnX, btnY - 18, 65, 36, 8);
      this.contentContainer.add(btnBg);

      const btnText = this.addText(btnX + 32, btnY, '수령', {
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#FFFFFF'
      }).setOrigin(0.5);

      const btnHit = this.scene.add.rectangle(btnX + 32, btnY, 65, 36)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });
      this.contentContainer.add(btnHit);

      btnHit.on('pointerdown', () => {
        const result = QuestSystem.claimReward(quest.id);
        if (result.success) {
          this.showRewardToast(result.rewards);
          this.refresh();
        }
      });
    } else if (quest.claimed) {
      this.addText(x + cardW - 55, y + cardH / 2, '✅ 완료', {
        fontSize: '14px',
        color: '#64748B'
      }).setOrigin(0.5);
    }
  }

  createClaimAllButton() {
    if (this.claimable.length === 0) return;

    const { bottom, centerX } = this.contentBounds;
    const btnY = bottom - 40;
    const btnW = 280;
    const btnH = 55;

    const btn = this.scene.add.graphics();
    btn.fillStyle(COLORS.accent, 1);
    btn.fillRoundedRect(centerX - btnW / 2, btnY, btnW, btnH, 14);
    this.contentContainer.add(btn);

    this.addText(centerX, btnY + btnH / 2, `🎁 전체 수령 (${this.claimable.length}개)`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    const hitArea = this.scene.add.rectangle(centerX, btnY + btnH / 2, btnW, btnH)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    this.contentContainer.add(hitArea);

    hitArea.on('pointerdown', () => {
      const result = QuestSystem.claimAllRewards();
      if (result.success) {
        this.showRewardToast(result.totalRewards);
        this.refresh();
      }
    });
  }

  showRewardToast(rewards) {
    const parts = [];
    if (rewards.gold) parts.push(`💰 ${rewards.gold}`);
    if (rewards.gems) parts.push(`💎 ${rewards.gems}`);
    if (rewards.summonTickets) parts.push(`🎫 ${rewards.summonTickets}`);
    const message = `보상 수령: ${parts.join('  ')}`;

    const toast = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + 200, message, {
      fontSize: '18px', fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF', backgroundColor: '#10B981', padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setDepth(3000);

    this.scene.tweens.add({
      targets: toast, y: toast.y - 50, alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }

  refresh() {
    // Clear current content
    this.contentContainer.removeAll(true);

    // Rebuild content
    this.buildContent();
  }
}
