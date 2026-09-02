import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../../config/gameConfig.js';
import { EventDungeonSystem } from '../../systems/EventDungeonSystem.js';
import energySystem from '../../systems/EnergySystem.js';
import transitionManager from '../../utils/TransitionManager.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';

/** 헤더 타이틀 */
const TITLE = '이벤트 던전';

/** 이벤트 던전 입장 에너지 */
const ENERGY_COST = 12;

/**
 * EventDungeonPopup - 이벤트 던전 팝업
 * PopupBase를 상속하여 이벤트 던전 UI를 팝업 형태로 제공
 */
export class EventDungeonPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.brand.accent,
      ...options
    });

    this.selectedEventId = null;
    this.selectedStageId = null;
    this.viewMode = 'list'; // 'list' or 'detail' or 'shop'
  }

  buildContent() {
    this.setTitle(TITLE);
    this.loadEventData();
    this.showEventList();
  }

  /** 슬롯 2 — 진행/예정 이벤트 수 (+ 상세 화면에서는 해당 이벤트 진행도) */
  applySummary(eventSummary = null) {
    if (!eventSummary) {
      this.setSummary([
        { label: '진행 중', value: `${this.eventsSummary.totalActive}개` },
        { label: '예정', value: `${this.eventsSummary.totalUpcoming}개` }
      ]);
      return;
    }
    const progress = eventSummary.progress;
    const event = eventSummary.event;
    this.setSummary([
      { label: '오늘의 도전', value: `${progress.dailyEntries} / ${progress.dailyLimit}` },
      { label: '클리어', value: `${progress.clearedStages} / ${event.stages.length}` },
      { label: event.eventCurrency || '화폐', value: `${progress.eventCurrency}` }
    ]);
  }

  /**
   * 슬롯 4 — 화면별 이동.
   * 화면 전환 콜백은 액션 바 자신을 다시 그리므로 한 프레임 미룬다.
   */
  applyActions(mode, eventId = null, hasShop = false) {
    const defer = (fn) => this.scene.time.delayedCall(0, fn);
    if (mode === 'detail') {
      const actions = [
        { label: '이벤트 목록', variant: 'secondary', onClick: () => defer(() => this.showEventList()) }
      ];
      if (hasShop) {
        actions.unshift({ label: '교환소', variant: 'primary', onClick: () => defer(() => this.showEventShop(eventId)) });
      }
      this.setActions(actions);
      return;
    }
    if (mode === 'shop') {
      this.setActions([
        { label: '던전으로', variant: 'secondary', onClick: () => defer(() => this.showEventDetail(eventId)) }
      ]);
      return;
    }
    this.setActions([{ label: '닫기', variant: 'ghost', onClick: () => this.hide() }]);
  }

  loadEventData() {
    this.eventsSummary = EventDungeonSystem.getAllEventsSummary();
  }

  showEventList() {
    this.viewMode = 'list';
    this.clearContent();
    this.applySummary(null);
    this.applyActions('list');

    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    let currentY = this.contentBounds.top + s(20);

    // 활성 이벤트가 없는 경우
    if (this.eventsSummary.totalActive === 0) {
      this.addText(cx, currentY + s(100), '현재 진행 중인 이벤트가 없습니다.', {
        fontSize: sf(18),
        color: DESIGN.colors.text.secondary
      }).setOrigin(0.5);

      // 예정 이벤트 표시
      if (this.eventsSummary.totalUpcoming > 0) {
        currentY += s(180);
        this.addText(left + s(20), currentY, '예정된 이벤트', {
          fontSize: sf(16),
          fontStyle: 'bold',
          color: DESIGN.colors.text.primary
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
    this.addText(left + s(20), currentY, '진행 중인 이벤트', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
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
      this.addText(left + s(20), currentY, '예정된 이벤트', {
        fontSize: sf(16),
        fontStyle: 'bold',
        color: DESIGN.colors.text.primary
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

    card.fillStyle(DESIGN.colors.bg.secondary, 0.95);
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
      color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    // 이벤트 이름
    this.addText(x + s(15), y + s(50), event.name, {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });

    // 설명
    this.addText(x + s(15), y + s(78), event.description, {
      fontSize: sf(12),
      color: DESIGN.colors.text.secondary,
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
      color: timeRemaining.days > 7 ? hexToCSS(DESIGN.colors.status.success) : timeRemaining.days > 1 ? hexToCSS(DESIGN.colors.status.warning) : hexToCSS(DESIGN.colors.status.error),
      fontStyle: 'bold'
    }).setOrigin(1, 0);

    // 진행도 정보
    const progress = eventSummary.progress;
    this.addText(x + s(15), y + s(105), `일일: ${progress.dailyEntries}/${progress.dailyLimit}`, {
      fontSize: sf(13),
      color: DESIGN.colors.text.muted
    });

    this.addText(x + s(120), y + s(105), `클리어: ${progress.clearedStages}/${event.stages.length}`, {
      fontSize: sf(13),
      color: DESIGN.colors.text.muted
    });

    this.addText(x + s(250), y + s(105), `${event.eventCurrency}: ${progress.eventCurrency}`, {
      fontSize: sf(13),
      color: hexToCSS(DESIGN.colors.status.warning)
    });

    // 도전 버튼
    const btnX = x + cardW - s(90);
    const btnY = y + s(95);
    const canEnter = eventSummary.canEnter;

    this.addButton(btnX, btnY, s(80), s(35), '도전', canEnter ? COLORS.primary : DESIGN.colors.bg.surface, () => {
      if (canEnter) {
        this.showEventDetail(event.id);
      } else {
        this.showToast(eventSummary.reason || '입장할 수 없습니다.');
      }
    }, canEnter ? DESIGN.colors.text.primary : DESIGN.colors.text.muted);
  }

  createUpcomingEventCard(x, y, event) {
    const cardW = this.contentBounds.width - s(40);
    const cardH = s(70);

    // 카드 배경
    const card = this.scene.add.graphics();
    card.fillStyle(DESIGN.colors.bg.secondary, 0.7);
    card.fillRoundedRect(x, y, cardW, cardH, s(10));
    card.lineStyle(s(1), DESIGN.colors.bg.surface, 0.4);
    card.strokeRoundedRect(x, y, cardW, cardH, s(10));
    this.contentContainer.add(card);

    // 이벤트 이름
    this.addText(x + s(15), y + s(15), event.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: DESIGN.colors.text.secondary
    });

    // 설명
    this.addText(x + s(15), y + s(40), event.description.substring(0, 50) + '...', {
      fontSize: sf(11),
      color: DESIGN.colors.text.muted
    });

    // 시작일
    this.addText(x + cardW - s(15), y + s(25), `시작: ${event.startDate}`, {
      fontSize: sf(11),
      color: DESIGN.colors.text.muted
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

    // 목록/교환소 이동은 액션 바(슬롯 4)가 맡는다
    this.applySummary(eventSummary);
    this.applyActions('detail', eventId, !!(event.shop && event.shop.length > 0));

    // 이벤트 타이틀
    this.addText(cx, currentY, event.name, {
      fontSize: sf(24),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    currentY += s(35);

    // 설명
    this.addText(cx, currentY, event.description, {
      fontSize: sf(14),
      color: DESIGN.colors.text.secondary,
      align: 'center',
      wordWrap: { width: this.contentBounds.width - s(60) }
    }).setOrigin(0.5);

    currentY += s(50);

    // 스테이지 목록
    this.addText(left + s(20), currentY, '던전 목록', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });

    currentY += s(45);

    event.stages.forEach(stage => {
      this.createStageCard(left + s(20), currentY, eventId, stage, eventSummary.progress);
      currentY += s(110);
    });
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
    const borderColor = diffColors[stage.difficulty] || DESIGN.colors.bg.surface;

    card.fillStyle(DESIGN.colors.bg.secondary, 0.9);
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
      color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    // 스테이지 이름
    this.addText(x + s(80), y + s(15), stage.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });

    // 권장 전투력
    this.addText(x + s(15), y + s(45), `권장 전투력 ${stage.recommendedPower}`, {
      fontSize: sf(12),
      color: DESIGN.colors.text.secondary
    });

    // 보상 미리보기
    const rewards = stage.rewards;
    const rewardParts = [];
    if (rewards.gold) rewardParts.push(`골드 ${rewards.gold}`);
    if (rewards.exp) rewardParts.push(`경험치 ${rewards.exp}`);
    if (rewards.gems) rewardParts.push(`젬 ${rewards.gems}`);

    this.addText(x + s(15), y + s(67), `보상: ${rewardParts.join(' ')}`, {
      fontSize: sf(11),
      color: hexToCSS(DESIGN.colors.status.warning)
    });

    // 클리어 횟수
    const stageProgress = progress.clearedStages[stage.id];
    if (stageProgress) {
      this.addText(x + cardW - s(150), y + s(67), `클리어: ${stageProgress.clearCount}회`, {
        fontSize: sf(11),
        color: hexToCSS(DESIGN.colors.status.success)
      });
    }

    // 도전 버튼
    const canEnter = EventDungeonSystem.canEnterEvent(eventId).canEnter;
    this.addButton(x + cardW - s(90), y + s(55), s(80), s(30), '도전', canEnter ? borderColor : DESIGN.colors.bg.surface, () => {
      if (canEnter) {
        this.startEventBattle(eventId, stage);
      } else {
        const result = EventDungeonSystem.canEnterEvent(eventId);
        this.showToast(result.reason || '입장할 수 없습니다.');
      }
    }, canEnter ? DESIGN.colors.text.primary : DESIGN.colors.text.muted);
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

    // '던전으로' 이동은 액션 바(슬롯 4)가 맡는다
    this.applyActions('shop', eventId);

    // 상점 타이틀
    this.addText(cx, currentY, `${event.name} 교환소`, {
      fontSize: sf(22),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    }).setOrigin(0.5);

    currentY += s(40);

    // 보유 화폐 표시
    this.addText(cx, currentY, `보유 ${event.eventCurrency} ${progress.eventCurrency}`, {
      fontSize: sf(16),
      color: hexToCSS(DESIGN.colors.status.warning),
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
    card.fillStyle(DESIGN.colors.bg.secondary, 0.9);
    card.fillRoundedRect(x, y, cardW, cardH, s(10));
    card.lineStyle(s(1), COLORS.primary, 0.3);
    card.strokeRoundedRect(x, y, cardW, cardH, s(10));
    this.contentContainer.add(card);

    // 상품 이름
    this.addText(x + s(15), y + s(15), item.name, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    });

    // 보상 내용
    const reward = item.reward;
    const rewardParts = [];
    if (reward.gold) rewardParts.push(`골드 ${reward.gold}`);
    if (reward.gems) rewardParts.push(`젬 ${reward.gems}`);
    if (reward.summonTickets) rewardParts.push(`소환권 x${reward.summonTickets}`);

    this.addText(x + s(15), y + s(42), rewardParts.join(' '), {
      fontSize: sf(13),
      color: hexToCSS(DESIGN.colors.status.success)
    });

    // 가격
    this.addText(x + cardW - s(180), y + s(30), `${item.cost}`, {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: hexToCSS(DESIGN.colors.status.warning)
    }).setOrigin(1, 0.5);

    // 구매 제한
    if (item.limit) {
      const purchased = progress.shopPurchases[item.id] || 0;
      this.addText(x + cardW - s(180), y + s(52), `(${purchased}/${item.limit})`, {
        fontSize: sf(11),
        color: DESIGN.colors.text.muted
      }).setOrigin(1, 0.5);
    }

    // 구매 버튼
    const purchased = progress.shopPurchases[item.id] || 0;
    const canPurchase = (!item.limit || purchased < item.limit) && progress.eventCurrency >= item.cost;

    this.addButton(x + cardW - s(80), y + s(35), s(70), s(30), '구매', canPurchase ? 0x10B981 : DESIGN.colors.bg.surface, () => {
      if (canPurchase) {
        this.purchaseShopItem(eventId, item.id);
      } else {
        if (item.limit && purchased >= item.limit) {
          this.showToast('구매 한도에 도달했습니다.');
        } else {
          this.showToast('화폐가 부족합니다.');
        }
      }
    }, canPurchase ? DESIGN.colors.text.primary : DESIGN.colors.text.muted);
  }

  purchaseShopItem(eventId, itemId) {
    const result = EventDungeonSystem.purchaseFromEventShop(eventId, itemId);

    if (result.success) {
      this.showToast(`구매 완료! -${result.cost}`);
      // 상점 화면 새로고침
      this.showEventShop(eventId);
    } else {
      this.showToast(result.error || '구매 실패');
    }
  }

  startEventBattle(eventId, stage) {
    const energyCost = ENERGY_COST;
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
      color: DESIGN.colors.text.primary,
      backgroundColor: hexToCSS(DESIGN.colors.bg.surface),
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
