/**
 * QuestPopup - 퀘스트 시스템 팝업
 * QuestScene 로직을 팝업 형태로 변환
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/gameConfig.js';
import { QuestSystem } from '../../systems/QuestSystem.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { IconFactory } from '../../utils/IconFactory.js';
import { ScrollContainer } from '../ScrollContainer.js';
import { computeGridScroll } from '../../utils/touchLayout.js';
import { ensureMinTouchTarget } from '../../utils/touchTarget.js';

/** 헤더 타이틀 (§3-6 헤더 슬롯) */
const TITLE = '일일 퀘스트';

/** 진행 바 높이 (기획 px) */
const PROGRESS_BAR_HEIGHT = 8;

/**
 * 퀘스트 카드 크기 (기획 px) — `docs/design-specs/secondary-scenes.md` §1.3 원안 규격으로 복원.
 * 콘텐츠 슬롯(888)에 맞추려 88/4로 줄여 넣었던 값이었다.
 * 지금은 `ScrollContainer` 가 넘치는 만큼 스크롤로 받아준다.
 */
const CARD_HEIGHT = 100;
const CARD_GAP = 10;

export class QuestPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.status.warning,
      ...options
    });

    this.quests = [];
    this.claimable = [];
    this._scroll = null; // 퀘스트 카드 목록을 담는 ScrollContainer
  }

  /**
   * 팝업 자체가 닫힐 때도 ScrollContainer 의 scene.input 리스너를 반드시 해제한다.
   * PopupBase.js 는 수정하지 않으므로 서브클래스에서 훅을 잡아 처리한다.
   */
  destroy() {
    if (this._scroll) {
      this._scroll.destroy();
      this._scroll = null;
    }
    super.destroy();
  }

  buildContent() {
    // 데이터 → 요약/액션 슬롯 → 콘텐츠 순서. 요약·액션이 콘텐츠 높이를 줄이므로 먼저 확정한다.
    this.loadQuests();
    this.setTitle(TITLE);
    this.applySummary();
    this.applyActions();

    this.createProgressBar();
    this.createQuestList();
  }

  /** 슬롯 2 — 완료/수령 대기 요약 */
  applySummary() {
    const total = this.quests.length;
    const completed = this.quests.filter(q => q.completed).length;
    this.setSummary([
      { label: '완료', value: `${completed} / ${total}` },
      { label: '수령 대기', value: `${this.claimable.length}` }
    ]);
  }

  /** 슬롯 4 — 전체 수령. 수령할 것이 없으면 비활성으로 남겨 자리를 지킨다 */
  applyActions() {
    const count = this.claimable.length;
    this.setActions([{
      label: count > 0 ? `전체 수령 (${count})` : '수령할 보상 없음',
      variant: 'primary',
      disabled: count === 0,
      onClick: () => this.claimAll()
    }]);
  }

  claimAll() {
    const result = QuestSystem.claimAllRewards();
    if (!result.success) return;
    this.showRewardToast(result.totalRewards);
    // 액션 바를 그린 핸들러 안에서 그 액션 바를 지우지 않도록 한 프레임 미룬다
    this.scene.time.delayedCall(0, () => this.refresh());
  }

  loadQuests() {
    this.quests = QuestSystem.getDailyQuests();
    this.claimable = QuestSystem.getClaimableQuests();
  }

  /** 콘텐츠 상단 진행 바. 수치는 요약 슬롯이 맡고 여기는 비율만 보여준다 */
  createProgressBar() {
    const { left, top, width } = this.contentBounds;
    const total = this.quests.length;
    const completed = this.quests.filter(q => q.completed).length;
    const progress = total > 0 ? completed / total : 0;
    const barH = s(PROGRESS_BAR_HEIGHT);
    const radius = s(DESIGN.radius.sm);

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(DESIGN.colors.bg.surface, 1);
    barBg.fillRoundedRect(left, top + s(6), width, barH, radius);
    this.contentContainer.add(barBg);

    if (progress > 0) {
      const barFill = this.scene.add.graphics();
      barFill.fillStyle(DESIGN.colors.status.success, 1);
      barFill.fillRoundedRect(left, top + s(6), width * progress, barH, radius);
      this.contentContainer.add(barFill);
    }
  }

  createQuestList() {
    const { left, top, width, bottom } = this.contentBounds;
    const startY = top + s(28);
    const cardH = s(CARD_HEIGHT);
    const gap = s(CARD_GAP);

    // 그래픽 카드는 top-left 원점이라(Rectangle GameObject 와 달리 center 가 아니다)
    // 뷰포트를 startY 에 그대로 맞춰도 잘리지 않는다.
    this._scroll = new ScrollContainer(this.scene, {
      x: left, y: startY, width, height: bottom - startY,
      fadeColor: 0x0F172A,
      parent: this.contentContainer
    });

    // QA P2-5: `ScrollContainer` 의 콘텐츠 자식은 **절대 화면 좌표**를 쓴다(모듈 주석 §좌표 규약).
    // 예전 코드는 y=0 부터 쌓아서 첫 카드들이 뷰포트(startY≈396 렌더px) 위로 완전히 밀려
    // 보이지 않았고, 그만큼이 그대로 바닥 빈 공간이 됐다. 뷰포트 top 에서 시작한다.
    this.quests.forEach((quest, index) => {
      const y = startY + index * (cardH + gap);
      this.createQuestCard(quest, left, y, width, cardH);
    });

    const { contentHeight } = computeGridScroll({
      itemCount: this.quests.length,
      itemHeight: cardH,
      gap,
      viewportHeight: bottom - startY,
      padBottom: gap
    });
    this._scroll.setContentHeight(contentHeight);
  }

  createQuestCard(quest, x, y, cardW, cardH) {
    // Card background
    const card = this.scene.add.graphics();
    const bgColor = quest.claimed ? DESIGN.colors.bg.primary : DESIGN.colors.bg.secondary;
    card.fillStyle(bgColor, 0.95);
    card.fillRoundedRect(x, y, cardW, cardH, s(12));

    if (quest.completed && !quest.claimed) {
      card.lineStyle(s(2), COLORS.success, 0.6);
      card.strokeRoundedRect(x, y, cardW, cardH, s(12));
    }
    this._scroll.add(card);

    // Quest name
    const nameColor = quest.claimed ? DESIGN.colors.text.muted : DESIGN.colors.text.primary;
    this._scroll.addText(x + s(15), y + s(8), quest.name, {
      fontSize: sf(17),
      fontStyle: 'bold',
      color: nameColor
    });

    // Description
    this._scroll.addText(x + s(15), y + s(30), quest.description, {
      fontSize: sf(13),
      color: DESIGN.colors.text.secondary
    });

    // Progress bar
    const barX = x + s(15);
    const barY = y + s(54);
    const barW = cardW - s(150);
    const barH = s(10);
    const progressPercent = quest.progressPercent / 100;

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(DESIGN.colors.bg.surface, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, s(5));
    this._scroll.add(barBg);

    if (progressPercent > 0) {
      const barFill = this.scene.add.graphics();
      const fillColor = quest.completed ? COLORS.success : COLORS.primary;
      barFill.fillStyle(fillColor, 1);
      barFill.fillRoundedRect(barX, barY, barW * Math.min(progressPercent, 1), barH, s(5));
      this._scroll.add(barFill);
    }

    // Progress text
    this._scroll.addText(barX + barW + s(8), barY - s(2), `${quest.progress}/${quest.target}`, {
      fontSize: sf(13),
      color: quest.completed ? hexToCSS(DESIGN.colors.status.success) : DESIGN.colors.text.secondary
    });

    // 보상 — 이모지 대신 벡터 아이콘(IconFactory)을 앞에 세우고 텍스트는 수치만 남긴다
    const rewardParts = [];
    if (quest.rewards.gold) rewardParts.push(`골드 ${quest.rewards.gold}`);
    if (quest.rewards.gems) rewardParts.push(`젬 ${quest.rewards.gems}`);
    if (quest.rewards.summonTickets) rewardParts.push(`소환권 ${quest.rewards.summonTickets}`);
    if (quest.rewards.skillBooks) rewardParts.push(`스킬북 ${quest.rewards.skillBooks}`);

    const rewardIcon = IconFactory.createImage(
      this.scene, x + s(22), y + cardH - s(13), 'quest', 'xs',
      { tint: DESIGN.colors.brand.accent }
    );
    if (rewardIcon) this._scroll.add(rewardIcon);

    this._scroll.addText(x + s(36), y + cardH - s(20), rewardParts.join('  '), {
      fontSize: sf(12),
      color: hexToCSS(DESIGN.colors.status.warning)
    });

    // Claim button (completed & not claimed)
    if (quest.completed && !quest.claimed) {
      const btnX = x + cardW - s(80);
      const btnY = y + cardH / 2;

      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(COLORS.success, 1);
      btnBg.fillRoundedRect(btnX, btnY - s(18), s(65), s(36), s(8));
      this._scroll.add(btnBg);

      this._scroll.addText(btnX + s(32), btnY, '수령', {
        fontSize: sf(15),
        fontStyle: 'bold',
        color: DESIGN.colors.text.primary
      }).setOrigin(0.5);

      // 시각은 65×36 그대로 두고 히트만 터치 하한까지 넓힌다 (QA P2-1)
      const btnHit = this.scene.add.rectangle(btnX + s(32), btnY, s(65), s(36)).setAlpha(0.001);
      ensureMinTouchTarget(btnHit);
      this._scroll.add(btnHit);

      // attachTap: 스크롤 드래그(threshold 8px 초과) 중이면 수령 탭을 무시한다.
      this._scroll.attachTap(btnHit, () => {
        const result = QuestSystem.claimReward(quest.id);
        if (result.success) {
          this.showRewardToast(result.rewards);
          this.refresh();
        }
      });
    } else if (quest.claimed) {
      this._scroll.addText(x + cardW - s(55), y + cardH / 2, '수령 완료', {
        fontSize: sf(14),
        color: DESIGN.colors.text.muted
      }).setOrigin(0.5);
    }
  }

  showRewardToast(rewards) {
    const parts = [];
    if (rewards.gold) parts.push(`골드 ${rewards.gold}`);
    if (rewards.gems) parts.push(`젬 ${rewards.gems}`);
    if (rewards.summonTickets) parts.push(`소환권 ${rewards.summonTickets}`);
    const message = `보상 수령: ${parts.join('  ')}`;

    const toast = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + s(200), message, {
      fontSize: sf(18), fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.primary, backgroundColor: hexToCSS(DESIGN.colors.status.success), padding: { x: s(24), y: s(14) }
    }).setOrigin(0.5).setDepth(3000);

    this.scene.tweens.add({
      targets: toast, y: toast.y - s(50), alpha: 0,
      duration: 1500, delay: 800, onComplete: () => toast.destroy()
    });
  }

  refresh() {
    // ScrollContainer 는 scene.input 전역 리스너를 갖고 있어 먼저 명시적으로 정리한다.
    // contentContainer.removeAll(true) 만으로는 그 리스너가 해제되지 않는다.
    if (this._scroll) {
      this._scroll.destroy();
      this._scroll = null;
    }
    // Clear current content
    this.contentContainer.removeAll(true);

    // Rebuild content
    this.buildContent();
  }
}
