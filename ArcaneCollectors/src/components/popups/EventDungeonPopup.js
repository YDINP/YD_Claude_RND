import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH } from '../../config/gameConfig.js';
import { EventDungeonSystem } from '../../systems/EventDungeonSystem.js';
import energySystem from '../../systems/EnergySystem.js';
import transitionManager from '../../utils/TransitionManager.js';

/**
 * EventDungeonPopup - 이벤트 던전 팝업
 * PopupBase를 상속하여 이벤트 던전 UI를 팝업 형태로 제공
 */
export class EventDungeonPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '🎉 이벤트 던전',
      width: 680,
      height: 1100,
      ...options
    });

    this.selectedEventId = null;
    this.selectedStageId = null;
    this.viewMode = 'list'; // 'list' or 'detail' or 'shop'
  }

  buildContent() {
    this.loadEventData();
    this.showEventList();
  }

  loadEventData() {
    this.eventsSummary = EventDungeonSystem.getAllEventsSummary();
  }

  showEventList() {
    this.viewMode = 'list';
    this.clearContent();

    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    let currentY = this.contentBounds.top + 20;

    // 활성 이벤트가 없는 경우
    if (this.eventsSummary.totalActive === 0) {
      this.addText(cx, currentY + 100, '현재 진행 중인 이벤트가 없습니다.', {
        fontSize: '18px',
        color: '#94A3B8'
      }).setOrigin(0.5);

      // 예정 이벤트 표시
      if (this.eventsSummary.totalUpcoming > 0) {
        currentY += 180;
        this.addText(left + 20, currentY, '📅 예정된 이벤트', {
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#F8FAFC'
        });

        currentY += 40;
        this.eventsSummary.upcoming.slice(0, 3).forEach(event => {
          this.createUpcomingEventCard(left + 20, currentY, event);
          currentY += 90;
        });
      }

      return;
    }

    // 활성 이벤트 헤더
    this.addText(left + 20, currentY, '🔥 진행 중인 이벤트', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    currentY += 50;

    // 활성 이벤트 카드들
    this.eventsSummary.active.forEach(eventSummary => {
      this.createEventCard(left + 20, currentY, eventSummary);
      currentY += 160;
    });

    // 예정 이벤트 (있는 경우)
    if (this.eventsSummary.totalUpcoming > 0 && currentY < this.contentBounds.bottom - 200) {
      currentY += 30;
      this.addText(left + 20, currentY, '📅 예정된 이벤트', {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#F8FAFC'
      });

      currentY += 40;
      this.eventsSummary.upcoming.slice(0, 2).forEach(event => {
        this.createUpcomingEventCard(left + 20, currentY, event);
        currentY += 90;
      });
    }
  }

  createEventCard(x, y, eventSummary) {
    const cardW = this.contentBounds.width - 40;
    const cardH = 140;
    const event = eventSummary.event;

    // 카드 배경
    const card = this.scene.add.graphics();
    const typeColors = {
      raid: 0xEF4444,
      tower: 0x8B5CF6,
      collection: 0xF59E0B
    };
    const borderColor = typeColors[event.type] || COLORS.primary;

    card.fillStyle(0x1E293B, 0.95);
    card.fillRoundedRect(x, y, cardW, cardH, 12);
    card.lineStyle(2, borderColor, 0.6);
    card.strokeRoundedRect(x, y, cardW, cardH, 12);
    this.contentContainer.add(card);

    // 이벤트 타입 배지
    const badgeX = x + 15;
    const badgeY = y + 15;
    const badge = this.scene.add.graphics();
    badge.fillStyle(borderColor, 0.9);
    badge.fillRoundedRect(badgeX, badgeY, 70, 24, 8);
    this.contentContainer.add(badge);

    const typeLabels = { raid: '레이드', tower: '타워', collection: '수집' };
    this.addText(badgeX + 35, badgeY + 12, typeLabels[event.type] || '이벤트', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    // 이벤트 이름
    this.addText(x + 15, y + 50, event.name, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 설명
    this.addText(x + 15, y + 78, event.description, {
      fontSize: '12px',
      color: '#94A3B8',
      wordWrap: { width: cardW - 150 }
    });

    // 남은 시간
    const timeRemaining = eventSummary.timeRemaining;
    let timeText = '';
    if (timeRemaining.expired) {
      timeText = '종료됨';
    } else if (timeRemaining.days > 0) {
      timeText = `${timeRemaining.days}일 남음`;
    } else {
      timeText = `${timeRemaining.hours}시간 ${timeRemaining.minutes}분`;
    }

    this.addText(x + cardW - 15, y + 15, timeText, {
      fontSize: '12px',
      color: timeRemaining.days > 7 ? '#10B981' : timeRemaining.days > 1 ? '#F59E0B' : '#EF4444',
      fontStyle: 'bold'
    }).setOrigin(1, 0);

    // 진행도 정보
    const progress = eventSummary.progress;
    this.addText(x + 15, y + 105, `일일: ${progress.dailyEntries}/${progress.dailyLimit}`, {
      fontSize: '13px',
      color: '#64748B'
    });

    this.addText(x + 120, y + 105, `클리어: ${progress.clearedStages}/${event.stages.length}`, {
      fontSize: '13px',
      color: '#64748B'
    });

    this.addText(x + 250, y + 105, `${event.eventCurrency}: ${progress.eventCurrency}`, {
      fontSize: '13px',
      color: '#F59E0B'
    });

    // 도전 버튼
    const btnX = x + cardW - 90;
    const btnY = y + 95;
    const canEnter = eventSummary.canEnter;

    this.addButton(btnX, btnY, 80, 35, '도전', canEnter ? COLORS.primary : 0x475569, () => {
      if (canEnter) {
        this.showEventDetail(event.id);
      } else {
        this.showToast(eventSummary.reason || '입장할 수 없습니다.');
      }
    }, canEnter ? '#FFFFFF' : '#64748B');
  }

  createUpcomingEventCard(x, y, event) {
    const cardW = this.contentBounds.width - 40;
    const cardH = 70;

    // 카드 배경
    const card = this.scene.add.graphics();
    card.fillStyle(0x1E293B, 0.7);
    card.fillRoundedRect(x, y, cardW, cardH, 10);
    card.lineStyle(1, 0x475569, 0.4);
    card.strokeRoundedRect(x, y, cardW, cardH, 10);
    this.contentContainer.add(card);

    // 이벤트 이름
    this.addText(x + 15, y + 15, event.name, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#94A3B8'
    });

    // 설명
    this.addText(x + 15, y + 40, event.description.substring(0, 50) + '...', {
      fontSize: '11px',
      color: '#64748B'
    });

    // 시작일
    this.addText(x + cardW - 15, y + 25, `시작: ${event.startDate}`, {
      fontSize: '11px',
      color: '#64748B'
    }).setOrigin(1, 0);
  }

  showEventDetail(eventId) {
    this.viewMode = 'detail';
    this.selectedEventId = eventId;
    this.clearContent();

    const eventSummary = EventDungeonSystem.getEventSummary(eventId);
    if (!eventSummary) {
      this.showEventList();
      return;
    }

    const event = eventSummary.event;
    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    let currentY = this.contentBounds.top + 20;

    // 뒤로 가기 버튼
    this.addButton(left + 20, currentY, 80, 35, '← 목록', 0x334155, () => {
      this.showEventList();
    });

    // 상점 버튼
    if (event.shop && event.shop.length > 0) {
      this.addButton(this.contentBounds.right - 100, currentY, 80, 35, '🛒 상점', 0xF59E0B, () => {
        this.showEventShop(eventId);
      });
    }

    currentY += 60;

    // 이벤트 타이틀
    this.addText(cx, currentY, event.name, {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    }).setOrigin(0.5);

    currentY += 35;

    // 설명
    this.addText(cx, currentY, event.description, {
      fontSize: '14px',
      color: '#94A3B8',
      align: 'center',
      wordWrap: { width: this.contentBounds.width - 60 }
    }).setOrigin(0.5);

    currentY += 50;

    // 진행도 패널
    this.createProgressPanel(left + 20, currentY, eventSummary);
    currentY += 120;

    // 스테이지 목록
    this.addText(left + 20, currentY, '던전 목록', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    currentY += 45;

    event.stages.forEach(stage => {
      this.createStageCard(left + 20, currentY, eventId, stage, eventSummary.progress);
      currentY += 110;
    });
  }

  createProgressPanel(x, y, eventSummary) {
    const panelW = this.contentBounds.width - 40;
    const panelH = 100;
    const progress = eventSummary.progress;
    const event = eventSummary.event;

    // 패널 배경
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(x, y, panelW, panelH, 12);
    panel.lineStyle(2, COLORS.primary, 0.3);
    panel.strokeRoundedRect(x, y, panelW, panelH, 12);
    this.contentContainer.add(panel);

    // 일일 진행도
    this.addText(x + 20, y + 20, '오늘의 도전', {
      fontSize: '14px',
      color: '#94A3B8'
    });

    const dailyPercent = Math.min((progress.dailyEntries / progress.dailyLimit) * 100, 100);
    const barW = panelW - 160;
    const barH = 12;
    const barX = x + 130;
    const barY = y + 18;

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 6);
    this.contentContainer.add(barBg);

    const barFill = this.scene.add.graphics();
    const barColor = progress.dailyEntries >= progress.dailyLimit ? 0xEF4444 : COLORS.primary;
    barFill.fillStyle(barColor, 1);
    barFill.fillRoundedRect(barX, barY, barW * (dailyPercent / 100), barH, 6);
    this.contentContainer.add(barFill);

    this.addText(barX + barW + 15, barY + 6, `${progress.dailyEntries}/${progress.dailyLimit}`, {
      fontSize: '12px',
      color: '#F8FAFC'
    }).setOrigin(0, 0.5);

    // 이벤트 화폐
    this.addText(x + 20, y + 55, `${event.eventCurrency || '화폐'}:`, {
      fontSize: '14px',
      color: '#94A3B8'
    });

    this.addText(x + 150, y + 55, `${progress.eventCurrency}`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F59E0B'
    });

    // 남은 시간
    const timeRemaining = eventSummary.timeRemaining;
    let timeText = '';
    if (timeRemaining.expired) {
      timeText = '이벤트 종료';
    } else if (timeRemaining.days > 0) {
      timeText = `남은 시간: ${timeRemaining.days}일 ${timeRemaining.hours}시간`;
    } else {
      timeText = `남은 시간: ${timeRemaining.hours}시간 ${timeRemaining.minutes}분`;
    }

    this.addText(x + panelW - 20, y + 70, timeText, {
      fontSize: '12px',
      color: timeRemaining.days > 3 ? '#10B981' : '#EF4444'
    }).setOrigin(1, 0);
  }

  createStageCard(x, y, eventId, stage, progress) {
    const cardW = this.contentBounds.width - 40;
    const cardH = 90;

    // 카드 배경
    const card = this.scene.add.graphics();
    const diffColors = {
      easy: 0x10B981,
      normal: 0x3B82F6,
      hard: 0xEF4444
    };
    const borderColor = diffColors[stage.difficulty] || 0x475569;

    card.fillStyle(0x1E293B, 0.9);
    card.fillRoundedRect(x, y, cardW, cardH, 10);
    card.lineStyle(2, borderColor, 0.5);
    card.strokeRoundedRect(x, y, cardW, cardH, 10);
    this.contentContainer.add(card);

    // 난이도 배지
    const diffLabels = { easy: '쉬움', normal: '보통', hard: '어려움' };
    const badge = this.scene.add.graphics();
    badge.fillStyle(borderColor, 0.9);
    badge.fillRoundedRect(x + 10, y + 10, 60, 22, 8);
    this.contentContainer.add(badge);

    this.addText(x + 40, y + 21, diffLabels[stage.difficulty] || stage.difficulty, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    // 스테이지 이름
    this.addText(x + 80, y + 15, stage.name, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 권장 전투력
    this.addText(x + 15, y + 45, `⚔️ 권장: ${stage.recommendedPower}`, {
      fontSize: '12px',
      color: '#94A3B8'
    });

    // 보상 미리보기
    const rewards = stage.rewards;
    const rewardParts = [];
    if (rewards.gold) rewardParts.push(`💰${rewards.gold}`);
    if (rewards.exp) rewardParts.push(`✨${rewards.exp}`);
    if (rewards.gems) rewardParts.push(`💎${rewards.gems}`);

    this.addText(x + 15, y + 67, `보상: ${rewardParts.join(' ')}`, {
      fontSize: '11px',
      color: '#F59E0B'
    });

    // 클리어 횟수
    const stageProgress = progress.clearedStages[stage.id];
    if (stageProgress) {
      this.addText(x + cardW - 150, y + 67, `클리어: ${stageProgress.clearCount}회`, {
        fontSize: '11px',
        color: '#10B981'
      });
    }

    // 도전 버튼
    const canEnter = EventDungeonSystem.canEnterEvent(eventId).canEnter;
    this.addButton(x + cardW - 90, y + 55, 80, 30, '도전', canEnter ? borderColor : 0x475569, () => {
      if (canEnter) {
        this.startEventBattle(eventId, stage);
      } else {
        const result = EventDungeonSystem.canEnterEvent(eventId);
        this.showToast(result.reason || '입장할 수 없습니다.');
      }
    }, canEnter ? '#FFFFFF' : '#64748B');
  }

  showEventShop(eventId) {
    this.viewMode = 'shop';
    this.clearContent();

    const event = EventDungeonSystem.getEvent(eventId);
    const progress = EventDungeonSystem.getEventProgress(eventId);

    if (!event || !event.shop) {
      this.showEventDetail(eventId);
      return;
    }

    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    let currentY = this.contentBounds.top + 20;

    // 뒤로 가기 버튼
    this.addButton(left + 20, currentY, 80, 35, '← 뒤로', 0x334155, () => {
      this.showEventDetail(eventId);
    });

    currentY += 60;

    // 상점 타이틀
    this.addText(cx, currentY, `🛒 ${event.name} 상점`, {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    }).setOrigin(0.5);

    currentY += 40;

    // 보유 화폐 표시
    this.addText(cx, currentY, `보유: ${progress.eventCurrency} ${event.eventCurrency}`, {
      fontSize: '16px',
      color: '#F59E0B',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    currentY += 60;

    // 상품 목록
    event.shop.forEach(item => {
      this.createShopItemCard(left + 20, currentY, eventId, item, progress);
      currentY += 90;
    });
  }

  createShopItemCard(x, y, eventId, item, progress) {
    const cardW = this.contentBounds.width - 40;
    const cardH = 70;

    // 카드 배경
    const card = this.scene.add.graphics();
    card.fillStyle(0x1E293B, 0.9);
    card.fillRoundedRect(x, y, cardW, cardH, 10);
    card.lineStyle(1, COLORS.primary, 0.3);
    card.strokeRoundedRect(x, y, cardW, cardH, 10);
    this.contentContainer.add(card);

    // 상품 이름
    this.addText(x + 15, y + 15, item.name, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 보상 내용
    const reward = item.reward;
    const rewardParts = [];
    if (reward.gold) rewardParts.push(`💰${reward.gold}`);
    if (reward.gems) rewardParts.push(`💎${reward.gems}`);
    if (reward.summonTickets) rewardParts.push(`🎫x${reward.summonTickets}`);

    this.addText(x + 15, y + 42, rewardParts.join(' '), {
      fontSize: '13px',
      color: '#10B981'
    });

    // 가격
    this.addText(x + cardW - 180, y + 30, `${item.cost}`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F59E0B'
    }).setOrigin(1, 0.5);

    // 구매 제한
    if (item.limit) {
      const purchased = progress.shopPurchases[item.id] || 0;
      this.addText(x + cardW - 180, y + 52, `(${purchased}/${item.limit})`, {
        fontSize: '11px',
        color: '#64748B'
      }).setOrigin(1, 0.5);
    }

    // 구매 버튼
    const purchased = progress.shopPurchases[item.id] || 0;
    const canPurchase = (!item.limit || purchased < item.limit) && progress.eventCurrency >= item.cost;

    this.addButton(x + cardW - 80, y + 35, 70, 30, '구매', canPurchase ? 0x10B981 : 0x475569, () => {
      if (canPurchase) {
        this.purchaseShopItem(eventId, item.id);
      } else {
        if (item.limit && purchased >= item.limit) {
          this.showToast('구매 한도에 도달했습니다.');
        } else {
          this.showToast('화폐가 부족합니다.');
        }
      }
    }, canPurchase ? '#FFFFFF' : '#64748B');
  }

  purchaseShopItem(eventId, itemId) {
    const result = EventDungeonSystem.purchaseFromEventShop(eventId, itemId);

    if (result.success) {
      this.showToast(`구매 완료! 💰-${result.cost}`);
      // 상점 화면 새로고침
      this.showEventShop(eventId);
    } else {
      this.showToast(result.error || '구매 실패');
    }
  }

  startEventBattle(eventId, stage) {
    const energyCost = 12;
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
        mode: 'event',
        eventId: eventId,
        stage: stage,
        enemies: stage.enemies,
        returnScene: 'MainMenuScene'
      });
    });
  }

  clearContent() {
    // 기존 콘텐츠 제거
    this.contentContainer.removeAll(true);
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
