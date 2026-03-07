import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../../config/gameConfig.js';
import { EventDungeonSystem } from '../../systems/EventDungeonSystem.js';
import energySystem from '../../systems/EnergySystem.js';
import transitionManager from '../../utils/TransitionManager.js';

// [MED-1] eventCurrency key -> Korean display name mapping
const EVENT_CURRENCY_NAMES = {
  dragon_scale: '용의 비늘',
  shadow_fragment: '어둠 조각',
  treasure_key: '보물 열쇠',
};
function getCurrencyName(key) {
  return EVENT_CURRENCY_NAMES[key] || key;
}

/**
 * EventDungeonPopup - 이벤트 던전 팝업
 * PopupBase를 상속하여 이벤트 던전 UI를 팝업 형태로 제공
 */
export class EventDungeonPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '🎉 이벤트 던전',
      width: s(680),
      height: s(1100),
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
    let currentY = this.contentBounds.top + s(20);

    // 활성 이벤트가 없는 경우
    if (this.eventsSummary.totalActive === 0) {
      this.addText(cx, currentY + s(100), '현재 진행 중인 이벤트가 없습니다.', {
        fontSize: sf(18),
        color: '#94A3B8'
      }).setOrigin(0.5);

      // 예정 이벤트 표시
      if (this.eventsSummary.totalUpcoming > 0) {
        currentY += s(180);
        this.addText(left + s(20), currentY, '📅 예정된 이벤트', {
          fontSize: sf(16),
          fontStyle: 'bold',
          color: '#F8FAFC'
        });

        currentY += s(40);
        this.eventsSummary.upcoming.slice(0, 3).forEach(event => {
          this.createUpcomingEventCard(left + s(20), currentY, event);
          currentY += s(90);
        });
      }

      return;
    }

    // 활성 이벤트 헤더
    this.addText(left + s(20), currentY, '🔥 진행 중인 이벤트', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    currentY += s(50);

    // 활성 이벤트 카드들
    this.eventsSummary.active.forEach(eventSummary => {
      this.createEventCard(left + s(20), currentY, eventSummary);
      currentY += s(160);
    });

    // 예정 이벤트 (있는 경우)
    if (this.eventsSummary.totalUpcoming > 0 && currentY < this.contentBounds.bottom - s(200)) {
      currentY += s(30);
      this.addText(left + s(20), currentY, '📅 예정된 이벤트', {
        fontSize: sf(16),
        fontStyle: 'bold',
        color: '#F8FAFC'
      });

      currentY += s(40);
      this.eventsSummary.upcoming.slice(0, 2).forEach(event => {
        this.createUpcomingEventCard(left + s(20), currentY, event);
        currentY += s(90);
      });
    }
  }

  createEventCard(x, y, eventSummary) {
    const cardW = this.contentBounds.width - s(40);
    const cardH = s(140);
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
    card.fillRoundedRect(x, y, cardW, cardH, s(12));
    card.lineStyle(s(2), borderColor, 0.6);
    card.strokeRoundedRect(x, y, cardW, cardH, s(12));
    this.contentContainer.add(card);

    // 이벤트 타입 배지
    const badgeX = x + s(15);
    const badgeY = y + s(15);
    const badge = this.scene.add.graphics();
    badge.fillStyle(borderColor, 0.9);
    badge.fillRoundedRect(badgeX, badgeY, s(70), s(24), s(8));
    this.contentContainer.add(badge);

    const typeLabels = { raid: '레이드', tower: '타워', collection: '수집' };
    this.addText(badgeX + s(35), badgeY + s(12), typeLabels[event.type] || '이벤트', {
      fontSize: sf(12),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    // 이벤트 이름
    this.addText(x + s(15), y + s(50), event.name, {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 설명
    this.addText(x + s(15), y + s(78), event.description, {
      fontSize: sf(12),
      color: '#94A3B8',
      wordWrap: { width: cardW - s(150) }
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

    this.addText(x + cardW - s(15), y + s(15), timeText, {
      fontSize: sf(12),
      color: timeRemaining.days > 7 ? '#10B981' : timeRemaining.days > 1 ? '#F59E0B' : '#EF4444',
      fontStyle: 'bold'
    }).setOrigin(1, 0);

    // 진행도 정보
    const progress = eventSummary.progress;
    this.addText(x + s(15), y + s(105), `일일: ${progress.dailyEntries}/${progress.dailyLimit}`, {
      fontSize: sf(13),
      color: '#64748B'
    });

    this.addText(x + s(120), y + s(105), `클리어: ${progress.clearedStages}/${event.stages.length}`, {
      fontSize: sf(13),
      color: '#64748B'
    });

    this.addText(x + s(250), y + s(105), `${getCurrencyName(event.eventCurrency)}: ${progress.eventCurrency}`, {
      fontSize: sf(13),
      color: '#F59E0B'
    });

    // 도전 버튼
    const btnX = x + cardW - s(90);
    const btnY = y + s(95);
    const canEnter = eventSummary.canEnter;

    this.addButton(btnX, btnY, s(80), s(35), '도전', canEnter ? COLORS.primary : 0x475569, () => {
      if (canEnter) {
        this.showEventDetail(event.id);
      } else {
        this.showToast(eventSummary.reason || '입장할 수 없습니다.');
      }
    }, canEnter ? '#FFFFFF' : '#64748B');
  }

  createUpcomingEventCard(x, y, event) {
    const cardW = this.contentBounds.width - s(40);
    const cardH = s(70);

    // 카드 배경
    const card = this.scene.add.graphics();
    card.fillStyle(0x1E293B, 0.7);
    card.fillRoundedRect(x, y, cardW, cardH, s(10));
    card.lineStyle(s(1), 0x475569, 0.4);
    card.strokeRoundedRect(x, y, cardW, cardH, s(10));
    this.contentContainer.add(card);

    // 이벤트 이름
    this.addText(x + s(15), y + s(15), event.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#94A3B8'
    });

    // 설명
    this.addText(x + s(15), y + s(40), event.description.substring(0, 50) + '...', {
      fontSize: sf(11),
      color: '#64748B'
    });

    // 시작일
    this.addText(x + cardW - s(15), y + s(25), `시작: ${event.startDate}`, {
      fontSize: sf(11),
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
    let currentY = this.contentBounds.top + s(20);

    // 뒤로 가기 버튼
    this.addButton(left + s(20), currentY, s(80), s(35), '← 목록', 0x334155, () => {
      this.showEventList();
    });

    // 상점 버튼
    if (event.shop && event.shop.length > 0) {
      this.addButton(this.contentBounds.right - s(100), currentY, s(80), s(35), '🛒 상점', 0xF59E0B, () => {
        this.showEventShop(eventId);
      });
    }

    currentY += s(60);

    // 이벤트 타이틀
    this.addText(cx, currentY, event.name, {
      fontSize: sf(24),
      fontStyle: 'bold',
      color: '#F8FAFC'
    }).setOrigin(0.5);

    currentY += s(35);

    // 설명
    this.addText(cx, currentY, event.description, {
      fontSize: sf(14),
      color: '#94A3B8',
      align: 'center',
      wordWrap: { width: this.contentBounds.width - s(60) }
    }).setOrigin(0.5);

    currentY += s(50);

    // 진행도 패널
    this.createProgressPanel(left + s(20), currentY, eventSummary);
    currentY += s(120);

    // 스테이지 목록
    this.addText(left + s(20), currentY, '던전 목록', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    currentY += s(45);

    event.stages.forEach(stage => {
      this.createStageCard(left + s(20), currentY, eventId, stage, eventSummary.progress);
      currentY += s(110);
    });
  }

  createProgressPanel(x, y, eventSummary) {
    const panelW = this.contentBounds.width - s(40);
    const panelH = s(100);
    const progress = eventSummary.progress;
    const event = eventSummary.event;

    // 패널 배경
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(x, y, panelW, panelH, s(12));
    panel.lineStyle(s(2), COLORS.primary, 0.3);
    panel.strokeRoundedRect(x, y, panelW, panelH, s(12));
    this.contentContainer.add(panel);

    // 일일 진행도
    this.addText(x + s(20), y + s(20), '오늘의 도전', {
      fontSize: sf(14),
      color: '#94A3B8'
    });

    const dailyPercent = Math.min((progress.dailyEntries / progress.dailyLimit) * 100, 100);
    const barW = panelW - s(160);
    const barH = s(12);
    const barX = x + s(130);
    const barY = y + s(18);

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(0x334155, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, s(6));
    this.contentContainer.add(barBg);

    const barFill = this.scene.add.graphics();
    const barColor = progress.dailyEntries >= progress.dailyLimit ? 0xEF4444 : COLORS.primary;
    barFill.fillStyle(barColor, 1);
    barFill.fillRoundedRect(barX, barY, barW * (dailyPercent / 100), barH, s(6));
    this.contentContainer.add(barFill);

    this.addText(barX + barW + s(15), barY + s(6), `${progress.dailyEntries}/${progress.dailyLimit}`, {
      fontSize: sf(12),
      color: '#F8FAFC'
    }).setOrigin(0, 0.5);

    // 이벤트 화폐
    this.addText(x + s(20), y + s(55), `${getCurrencyName(event.eventCurrency)}:`, {
      fontSize: sf(14),
      color: '#94A3B8'
    });

    this.addText(x + s(150), y + s(55), `${progress.eventCurrency}`, {
      fontSize: sf(18),
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

    this.addText(x + panelW - s(20), y + s(70), timeText, {
      fontSize: sf(12),
      color: timeRemaining.days > 3 ? '#10B981' : '#EF4444'
    }).setOrigin(1, 0);
  }

  createStageCard(x, y, eventId, stage, progress) {
    const cardW = this.contentBounds.width - s(40);
    const cardH = s(90);

    // 카드 배경
    const card = this.scene.add.graphics();
    const diffColors = {
      easy: 0x10B981,
      normal: 0x3B82F6,
      hard: 0xEF4444
    };
    const borderColor = diffColors[stage.difficulty] || 0x475569;

    card.fillStyle(0x1E293B, 0.9);
    card.fillRoundedRect(x, y, cardW, cardH, s(10));
    card.lineStyle(s(2), borderColor, 0.5);
    card.strokeRoundedRect(x, y, cardW, cardH, s(10));
    this.contentContainer.add(card);

    // 난이도 배지
    const diffLabels = { easy: '쉬움', normal: '보통', hard: '어려움' };
    const badge = this.scene.add.graphics();
    badge.fillStyle(borderColor, 0.9);
    badge.fillRoundedRect(x + s(10), y + s(10), s(60), s(22), s(8));
    this.contentContainer.add(badge);

    this.addText(x + s(40), y + s(21), diffLabels[stage.difficulty] || stage.difficulty, {
      fontSize: sf(11),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    // 스테이지 이름
    this.addText(x + s(80), y + s(15), stage.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 권장 전투력
    this.addText(x + s(15), y + s(45), `⚔️ 권장: ${stage.recommendedPower}`, {
      fontSize: sf(12),
      color: '#94A3B8'
    });

    // 보상 미리보기
    const rewards = stage.rewards;
    const rewardParts = [];
    if (rewards.gold) rewardParts.push(`💰${rewards.gold}`);
    if (rewards.exp) rewardParts.push(`✨${rewards.exp}`);
    if (rewards.gems) rewardParts.push(`💎${rewards.gems}`);

    this.addText(x + s(15), y + s(67), `보상: ${rewardParts.join(' ')}`, {
      fontSize: sf(11),
      color: '#F59E0B'
    });

    // 클리어 횟수
    const stageProgress = progress.clearedStages[stage.id];
    if (stageProgress) {
      this.addText(x + cardW - s(150), y + s(67), `클리어: ${stageProgress.clearCount}회`, {
        fontSize: sf(11),
        color: '#10B981'
      });
    }

    // 도전 버튼
    const canEnter = EventDungeonSystem.canEnterEvent(eventId).canEnter;
    this.addButton(x + cardW - s(90), y + s(55), s(80), s(30), '도전', canEnter ? borderColor : 0x475569, () => {
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
    let currentY = this.contentBounds.top + s(20);

    // 뒤로 가기 버튼
    this.addButton(left + s(20), currentY, s(80), s(35), '← 뒤로', 0x334155, () => {
      this.showEventDetail(eventId);
    });

    currentY += s(60);

    // 상점 타이틀
    this.addText(cx, currentY, `🛒 ${event.name} 상점`, {
      fontSize: sf(22),
      fontStyle: 'bold',
      color: '#F8FAFC'
    }).setOrigin(0.5);

    currentY += s(40);

    // 보유 화폐 표시
    this.addText(cx, currentY, `보유: ${progress.eventCurrency} ${getCurrencyName(event.eventCurrency)}`, {
      fontSize: sf(16),
      color: '#F59E0B',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    currentY += s(60);

    // 상품 목록
    event.shop.forEach(item => {
      this.createShopItemCard(left + s(20), currentY, eventId, item, progress);
      currentY += s(90);
    });
  }

  createShopItemCard(x, y, eventId, item, progress) {
    const cardW = this.contentBounds.width - s(40);
    const cardH = s(70);

    // 카드 배경
    const card = this.scene.add.graphics();
    card.fillStyle(0x1E293B, 0.9);
    card.fillRoundedRect(x, y, cardW, cardH, s(10));
    card.lineStyle(s(1), COLORS.primary, 0.3);
    card.strokeRoundedRect(x, y, cardW, cardH, s(10));
    this.contentContainer.add(card);

    // 상품 이름
    this.addText(x + s(15), y + s(15), item.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 보상 내용
    const reward = item.reward;
    const rewardParts = [];
    if (reward.gold) rewardParts.push(`💰${reward.gold}`);
    if (reward.gems) rewardParts.push(`💎${reward.gems}`);
    if (reward.summonTickets) rewardParts.push(`🎫x${reward.summonTickets}`);

    this.addText(x + s(15), y + s(42), rewardParts.join(' '), {
      fontSize: sf(13),
      color: '#10B981'
    });

    // 가격
    this.addText(x + cardW - s(180), y + s(30), `${item.cost}`, {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#F59E0B'
    }).setOrigin(1, 0.5);

    // 구매 제한
    if (item.limit) {
      const purchased = progress.shopPurchases[item.id] || 0;
      this.addText(x + cardW - s(180), y + s(52), `(${purchased}/${item.limit})`, {
        fontSize: sf(11),
        color: '#64748B'
      }).setOrigin(1, 0.5);
    }

    // 구매 버튼
    const purchased = progress.shopPurchases[item.id] || 0;
    const canPurchase = (!item.limit || purchased < item.limit) && progress.eventCurrency >= item.cost;

    this.addButton(x + cardW - s(80), y + s(35), s(70), s(30), '구매', canPurchase ? 0x10B981 : 0x475569, () => {
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
    const toast = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + s(50), message, {
      fontSize: sf(18),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      backgroundColor: '#334155',
      padding: { x: s(24), y: s(14) }
    }).setOrigin(0.5).setDepth(2100);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - s(50),
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }
}
