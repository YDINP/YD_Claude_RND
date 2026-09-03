import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../../config/gameConfig.js';
import { TowerSystem } from '../../systems/TowerSystem.js';
import { SaveManager } from '../../systems/SaveManager.js';
import energySystem from '../../systems/EnergySystem.js';
import transitionManager from '../../utils/TransitionManager.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { ensureMinTouchTarget } from '../../utils/touchTarget.js';

/** 헤더 타이틀 */
const TITLE = '무한의 탑';

/** 보스 층 도전 에너지 / 일반 층 에너지 */
const ENERGY_COST_BOSS = 20;
const ENERGY_COST_NORMAL = 12;

/** 탭 인덱스 (TOWER-03) */
const TAB = { CHALLENGE: 0, SEASON: 1 };

/** 탭 스트립 높이 / 탭 아래 여백 (기획 px) */
const TAB_STRIP_HEIGHT = 44;
const TAB_STRIP_GAP = 8;

/** 시즌 순위 표시 개수 · 행 높이 (기획 px) */
const SEASON_RANK_LIMIT = 20;
const SEASON_ROW_HEIGHT = 27;

/**
 * TowerPopup - 무한의 탑 팝업
 * PopupBase를 상속하여 탑 UI를 팝업 형태로 제공
 */
export class TowerPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.cult.tartarus,
      ...options
    });

    this.progress = null;
    this.currentFloorInfo = null;

    // TOWER-03 시즌 탭 상태
    this._activeTab = TAB.CHALLENGE;
    this._tabObjects = [];
    this._seasonStatus = null;
    this._seasonRankings = [];
    this._myRank = null;
    this._seasonOffline = false;
    this._isLoading = false;
  }

  buildContent() {
    this.loadTowerData();
    this.setTitle(TITLE);
    this.renderTab(TAB.CHALLENGE);
  }

  /** 탭 전환 — 슬롯 2/4 와 콘텐츠를 함께 다시 그린다 (PopupBase 4슬롯 규격 유지) */
  renderTab(tabIdx) {
    this._activeTab = tabIdx;
    this.clearTabContent();
    this.createTabStrip();

    if (tabIdx === TAB.SEASON) {
      this.applySeasonSummary();
      this.applySeasonActions();
      this.renderSeasonTab();
      return;
    }

    this.applySummary();
    this.applyActions();
    this.createFloorDisplay();
    this.createFloorInfo();
    this.createProgressBar();
  }

  /** 탭 콘텐츠 상단 y (탭 스트립 아래) */
  contentTop() {
    return this.contentBounds.top + s(TAB_STRIP_HEIGHT + TAB_STRIP_GAP);
  }

  /** 탭 전환 시 파기할 오브젝트 등록 */
  track(obj) {
    if (obj) this._tabObjects.push(obj);
    return obj;
  }

  clearTabContent() {
    this._tabObjects.forEach(obj => {
      if (obj && obj.scene) obj.destroy();
    });
    this._tabObjects = [];
  }

  /** 슬롯 3 상단 — 도전 / 시즌 탭 스트립 */
  createTabStrip() {
    const b = this.contentBounds;
    const labels = ['도전', '시즌'];
    const tabW = b.width / labels.length;

    labels.forEach((label, idx) => {
      const tx = b.left + tabW * idx + tabW / 2;
      const ty = b.top + s(TAB_STRIP_HEIGHT) / 2;
      const isActive = idx === this._activeTab;

      const bg = this.scene.add.rectangle(
        tx, ty, tabW - s(4), s(TAB_STRIP_HEIGHT - 8),
        isActive ? DESIGN.colors.cult.tartarus : DESIGN.colors.bg.surface,
        isActive ? 0.9 : 0.6
      );
      // 탭 스트립 시각 높이는 36 이지만 손가락이 닿는 영역은 48 이어야 한다 (QA P2-1)
      ensureMinTouchTarget(bg);
      bg.on('pointerdown', () => {
        if (this._isLoading || idx === this._activeTab) return;
        this.scene.time.delayedCall(0, () => this.renderTab(idx));
      });
      this.contentContainer.add(bg);
      this.track(bg);

      const txt = this.scene.add.text(tx, ty, label, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(15),
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary
      }).setOrigin(0.5);
      this.contentContainer.add(txt);
      this.track(txt);
    });
  }

  /** 슬롯 2 — 현재 층 · 최고 기록 · 총 클리어 */
  applySummary() {
    this.setSummary([
      { label: '현재 층', value: `${this.progress.currentFloor}층` },
      { label: '최고 기록', value: `${this.progress.highestFloor}층` },
      { label: '총 클리어', value: `${this.progress.totalClears}회` }
    ]);
  }

  /** 슬롯 4 — 도전 / 리셋. 정복 완료면 도전이 비활성으로 남는다 */
  applyActions() {
    const canChallenge = this.currentFloorInfo !== null;
    const actions = [{
      label: canChallenge ? `${this.progress.currentFloor}층 도전` : '정복 완료',
      variant: 'primary',
      disabled: !canChallenge,
      onClick: () => this.startTowerBattle()
    }];

    if (this.progress.currentFloor > 1) {
      actions.push({
        label: '탑 리셋',
        variant: 'ghost',
        onClick: () => this.scene.time.delayedCall(0, () => this.confirmReset())
      });
    }

    this.setActions(actions);
  }

  loadTowerData() {
    this.progress = TowerSystem.getProgress();
    this.currentFloorInfo = TowerSystem.getFloorInfo(this.progress.currentFloor);
  }

  createFloorDisplay() {
    const cx = this.contentBounds.centerX;
    const top = this.contentTop();

    // 현재 층 표시 (큰 원)
    const circleY = top + s(96);
    const isBoss = this.currentFloorInfo?.isBoss;
    const circleColor = isBoss ? 0xEF4444 : COLORS.primary;

    const circle = this.scene.add.graphics();
    circle.fillStyle(circleColor, 0.2);
    circle.fillCircle(cx, circleY, s(80));
    circle.lineStyle(s(3), circleColor, 0.8);
    circle.strokeCircle(cx, circleY, s(80));
    this.contentContainer.add(circle);
    this.track(circle);

    // 층 번호
    this.track(this.addText(cx, circleY - s(15), `${this.progress.currentFloor}`, {
      fontSize: sf(48),
      fontStyle: 'bold',
      color: isBoss ? hexToCSS(DESIGN.colors.status.error) : DESIGN.colors.text.primary
    }).setOrigin(0.5));

    this.track(this.addText(cx, circleY + s(25), isBoss ? 'BOSS FLOOR' : 'FLOOR', {
      fontSize: sf(14),
      color: isBoss ? '#FCA5A5' : DESIGN.colors.text.secondary
    }).setOrigin(0.5));
  }

  createFloorInfo() {
    const cx = this.contentBounds.centerX;
    const left = this.contentBounds.left;
    const panelY = this.contentTop() + s(216);
    const panelW = this.contentBounds.width;
    const panelH = s(220);

    // 패널 배경
    const panel = this.scene.add.graphics();
    panel.fillStyle(DESIGN.colors.bg.secondary, 0.9);
    panel.fillRoundedRect(left, panelY, panelW, panelH, s(16));
    panel.lineStyle(s(2), COLORS.primary, 0.3);
    panel.strokeRoundedRect(left, panelY, panelW, panelH, s(16));
    this.contentContainer.add(panel);
    this.track(panel);

    this.track(this.addText(left + s(20), panelY + s(15), '층 정보', {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    }));

    if (!this.currentFloorInfo) {
      this.track(this.addText(cx, panelY + panelH / 2, '탑 정복 완료!', {
        fontSize: sf(20),
        color: hexToCSS(DESIGN.colors.status.warning),
        fontStyle: 'bold'
      }).setOrigin(0.5));
      return;
    }

    // 난이도
    const diff = this.currentFloorInfo.difficulty;
    const diffLabel = diff < 1.5 ? '쉬움' : diff < 2.5 ? '보통' : diff < 4 ? '어려움' : '극한';
    const diffColor = diff < 1.5 ? hexToCSS(DESIGN.colors.status.success) : diff < 2.5 ? hexToCSS(DESIGN.colors.status.warning) : diff < 4 ? hexToCSS(DESIGN.colors.status.error) : '#DC2626';

    this.track(this.addText(left + s(20), panelY + s(50), '난이도:', {
      fontSize: sf(15),
      color: DESIGN.colors.text.secondary
    }));
    this.track(this.addText(left + s(100), panelY + s(50), `${diffLabel} (x${diff.toFixed(2)})`, {
      fontSize: sf(15),
      fontStyle: 'bold',
      color: diffColor
    }));

    // 적 구성
    const enemies = this.currentFloorInfo.enemies || [];
    this.track(this.addText(left + s(20), panelY + s(80), '적:', {
      fontSize: sf(15),
      color: DESIGN.colors.text.secondary
    }));
    const enemyText = enemies.map(e => `${e.id.replace('enemy_', '')} x${e.count}`).join(', ');
    this.track(this.addText(left + s(100), panelY + s(80), enemyText || '알 수 없음', {
      fontSize: sf(15),
      color: DESIGN.colors.text.primary
    }));

    // 보상 미리보기
    const rewards = this.currentFloorInfo.rewards;
    this.track(this.addText(left + s(20), panelY + s(115), '보상:', {
      fontSize: sf(15),
      color: DESIGN.colors.text.secondary
    }));
    if (rewards) {
      const rewardParts = [];
      if (rewards.gold) rewardParts.push(`골드 ${rewards.gold}`);
      if (rewards.exp) rewardParts.push(`경험치 ${rewards.exp}`);
      this.track(this.addText(left + s(100), panelY + s(115), rewardParts.join('  '), {
        fontSize: sf(15),
        color: DESIGN.colors.text.primary
      }));
    }

    // 보스 보상
    if (this.currentFloorInfo.bossReward) {
      const br = this.currentFloorInfo.bossReward;
      const bossRewardParts = [];
      if (br.gems) bossRewardParts.push(`젬 ${br.gems}`);
      if (br.srTicket) bossRewardParts.push(`SR 티켓 x${br.srTicket}`);
      if (br.ssrTicket) bossRewardParts.push(`SSR 티켓 x${br.ssrTicket}`);

      this.track(this.addText(left + s(20), panelY + s(150), '보스 보너스:', {
        fontSize: sf(15),
        color: hexToCSS(DESIGN.colors.status.error)
      }));
      this.track(this.addText(left + s(140), panelY + s(150), bossRewardParts.join('  '), {
        fontSize: sf(15),
        color: '#FCA5A5'
      }));
    }

    // 다음 보스 층
    if (this.progress.nextBossFloor) {
      this.track(this.addText(left + s(20), panelY + s(185), `다음 보스: ${this.progress.nextBossFloor}층`, {
        fontSize: sf(14),
        color: DESIGN.colors.text.muted
      }));
    }
  }

  createProgressBar() {
    const left = this.contentBounds.left;
    const barY = this.contentTop() + s(480);
    const barW = this.contentBounds.width;
    const barH = s(12);
    const progress = Math.min(this.progress.currentFloor / TowerSystem.MAX_FLOOR, 1);

    this.track(this.addText(left, barY - s(20), '탑 진행도', {
      fontSize: sf(14),
      color: DESIGN.colors.text.muted
    }));

    this.track(this.addText(left + barW, barY - s(20),
      `${this.progress.currentFloor - 1} / ${TowerSystem.MAX_FLOOR}`, {
        fontSize: sf(14),
        color: DESIGN.colors.text.secondary
      }).setOrigin(1, 0));

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(DESIGN.colors.bg.secondary, 1);
    barBg.fillRoundedRect(left, barY, barW, barH, s(6));
    this.contentContainer.add(barBg);
    this.track(barBg);

    const barFill = this.scene.add.graphics();
    barFill.fillStyle(COLORS.primary, 1);
    barFill.fillRoundedRect(left, barY, barW * progress, barH, s(6));
    this.contentContainer.add(barFill);
    this.track(barFill);

    // 보스 층 마커
    TowerSystem.BOSS_FLOORS.forEach(bossFloor => {
      if (bossFloor <= TowerSystem.MAX_FLOOR) {
        const markerX = left + (bossFloor / TowerSystem.MAX_FLOOR) * barW;
        const marker = this.scene.add.graphics();
        const cleared = this.progress.currentFloor > bossFloor;
        marker.fillStyle(cleared ? 0x10B981 : 0xEF4444, 0.8);
        marker.fillCircle(markerX, barY + barH / 2, s(5));
        this.contentContainer.add(marker);
        this.track(marker);
      }
    });
  }


  // ═══════════════════════════════════════════════════════════
  // TOWER-03: 시즌 탭 — 남은 일수 · 내 순위 · 상위 20
  // ═══════════════════════════════════════════════════════════

  /** 슬롯 2 — 시즌 · 남은 기간 · 내 순위 */
  applySeasonSummary() {
    const status = this._seasonStatus;
    const rankLabel = this._myRank ? `${this._myRank}위` : '-';

    this.setSummary([
      { label: '시즌', value: status ? status.seasonId : '-' },
      { label: '남은 기간', value: status ? `${status.daysRemaining}일` : '-' },
      { label: '내 순위', value: rankLabel }
    ]);
  }

  /** 슬롯 4 — 기록 제출 / 순위 새로고침 */
  applySeasonActions() {
    const defer = (fn) => this.scene.time.delayedCall(0, fn);

    this.setActions([
      {
        label: '기록 제출',
        variant: 'primary',
        disabled: this._isLoading,
        onClick: () => defer(() => this.submitSeasonRecord())
      },
      {
        label: '순위 새로고침',
        variant: 'ghost',
        disabled: this._isLoading,
        onClick: () => defer(() => this.renderTab(TAB.SEASON))
      }
    ]);
  }

  /** 시즌 탭 본문 — 동기 요약을 먼저 그리고 순위는 비동기로 채운다 */
  renderSeasonTab() {
    this._seasonStatus = TowerSystem.getSeasonStatus();
    this.applySeasonSummary();

    const b = this.contentBounds;
    const top = this.contentTop();
    const left = b.left;
    const status = this._seasonStatus;

    this.track(this.addText(left, top, `${status.seasonId} 시즌`, {
      fontSize: sf(20),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    }));

    this.track(this.addText(left + b.width, top + s(4),
      `종료까지 ${status.daysRemaining}일`, {
        fontSize: sf(14),
        color: hexToCSS(DESIGN.colors.status.warning)
      }).setOrigin(1, 0));

    // 내 시즌 기록 패널
    const panelY = top + s(38);
    const panelH = s(96);
    const panel = this.scene.add.graphics();
    panel.fillStyle(DESIGN.colors.bg.secondary, 0.9);
    panel.fillRoundedRect(left, panelY, b.width, panelH, s(16));
    panel.lineStyle(s(2), DESIGN.colors.cult.tartarus, 0.35);
    panel.strokeRoundedRect(left, panelY, b.width, panelH, s(16));
    this.contentContainer.add(panel);
    this.track(panel);

    const cells = [
      { label: '시즌 최고층', value: `${status.bestFloor}층` },
      { label: '역대 최고층', value: `${status.bestFloorAllTime}층` },
      {
        label: '지난 시즌',
        value: status.previousSeason ? `${status.previousSeason.bestFloor}층` : '기록 없음'
      }
    ];

    cells.forEach((cell, idx) => {
      const cellX = left + (b.width / cells.length) * (idx + 0.5);
      this.track(this.addText(cellX, panelY + s(24), cell.label, {
        fontSize: sf(13),
        color: DESIGN.colors.text.muted
      }).setOrigin(0.5));
      this.track(this.addText(cellX, panelY + s(58), cell.value, {
        fontSize: sf(19),
        fontStyle: 'bold',
        color: DESIGN.colors.text.primary
      }).setOrigin(0.5));
    });

    // 순위 헤더
    const listTop = panelY + panelH + s(22);
    this.track(this.addText(left, listTop, `시즌 순위 TOP ${SEASON_RANK_LIMIT}`, {
      fontSize: sf(16),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
    }));

    this._seasonListTop = listTop + s(30);
    this.loadSeasonRankings();
  }

  /** 순위 비동기 로드 후 목록 렌더 */
  async loadSeasonRankings() {
    const b = this.contentBounds;
    const listTop = this._seasonListTop;
    const seasonId = this._seasonStatus?.seasonId;

    this._isLoading = true;
    const loading = this.addText(b.centerX, listTop + s(40), '순위 불러오는 중...', {
      fontSize: sf(15),
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    this.track(loading);

    const result = await TowerSystem.getSeasonLeaderboard(seasonId, SEASON_RANK_LIMIT);
    const myRank = await TowerSystem.getMyRank(seasonId);

    this._isLoading = false;
    if (!this.contentContainer || !this.contentContainer.scene) return;
    if (this._activeTab !== TAB.SEASON) return;
    if (loading && loading.scene) loading.destroy();

    this._seasonRankings = result.rankings || [];
    this._seasonOffline = Boolean(result.offline || result.fallback);
    this._myRank = myRank.rank ?? null;

    this.applySeasonSummary();
    this.applySeasonActions();
    this.renderSeasonRankingList(listTop);
  }

  /** 순위 목록 렌더 (내 기록은 강조) */
  renderSeasonRankingList(listTop) {
    const b = this.contentBounds;
    const left = b.left;
    let y = listTop;

    if (this._seasonOffline) {
      this.track(this.addText(left + b.width, listTop - s(26), '오프라인 — 로컬 기록', {
        fontSize: sf(12),
        color: hexToCSS(DESIGN.colors.status.warning)
      }).setOrigin(1, 0));
    }

    if (this._seasonRankings.length === 0) {
      this.track(this.addText(b.centerX, listTop + s(40),
        '아직 시즌 기록이 없습니다\n층을 클리어하고 기록을 제출해 보세요', {
          fontSize: sf(15),
          color: DESIGN.colors.text.secondary,
          align: 'center'
        }).setOrigin(0.5));
      return;
    }

    this._seasonRankings.slice(0, SEASON_RANK_LIMIT).forEach(row => {
      const isMine = this._myRank !== null && row.rank === this._myRank;
      const color = isMine ? hexToCSS(DESIGN.colors.status.warning) : DESIGN.colors.text.primary;

      this.track(this.addText(left + s(6), y, `${row.rank}`, {
        fontSize: sf(14),
        fontStyle: 'bold',
        color: row.rank <= 3 ? hexToCSS(DESIGN.colors.brand.accent) : DESIGN.colors.text.secondary
      }));

      this.track(this.addText(left + s(52), y, row.player_name || '모험가', {
        fontSize: sf(14),
        color
      }));

      this.track(this.addText(left + b.width - s(96), y, `${row.best_floor || 0}층`, {
        fontSize: sf(14),
        fontStyle: 'bold',
        color
      }).setOrigin(1, 0));

      this.track(this.addText(left + b.width - s(6), y, `${row.power || 0}`, {
        fontSize: sf(13),
        color: DESIGN.colors.text.muted
      }).setOrigin(1, 0));

      y += s(SEASON_ROW_HEIGHT);
    });
  }

  /** 현재 시즌 기록 제출 */
  async submitSeasonRecord() {
    if (this._isLoading) return;
    this._isLoading = true;
    this.applySeasonActions();

    const result = await TowerSystem.submitSeasonRecord();
    this._isLoading = false;

    if (!this.contentContainer || !this.contentContainer.scene) return;

    this.showToast(result.offline || result.fallback
      ? '오프라인 — 기록을 로컬에 저장했습니다'
      : `${result.record.best_floor}층 기록을 제출했습니다`);

    this.renderTab(TAB.SEASON);
  }

  startTowerBattle() {
    if (!this.currentFloorInfo) return;
    const energyCost = this.currentFloorInfo.isBoss ? ENERGY_COST_BOSS : ENERGY_COST_NORMAL;
    const currentEnergy = energySystem.getCurrentEnergy();

    if (currentEnergy < energyCost) {
      this.showToast(`에너지 부족! (필요: ${energyCost}, 보유: ${currentEnergy})`);
      return;
    }

    energySystem.consumeEnergy(energyCost);

    // TOWER_AUDIT B-6: BattleScene은 data.stage만 소비하므로
    // TowerScene과 동일하게 TowerSystem.buildStageForFloor로 stage.enemies({id,level}) 배열을 구성해 전달
    const floor = this.progress.currentFloor;
    const stage = TowerSystem.buildStageForFloor(floor, this.currentFloorInfo);

    // 팝업을 먼저 닫고, 완전히 닫힌 후 전투 시작
    this.hide();

    this.scene.time.delayedCall(200, () => {
      transitionManager.battleEntryTransition(this.scene, {
        mode: 'tower',
        towerFloor: floor,
        stage,
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
    dialog.fillStyle(DESIGN.colors.bg.secondary, 1);
    dialog.fillRoundedRect(this.contentBounds.centerX - s(160), this.contentBounds.top + s(300), s(320), s(160), s(16));
    dialog.lineStyle(s(2), 0xEF4444, 0.5);
    dialog.strokeRoundedRect(this.contentBounds.centerX - s(160), this.contentBounds.top + s(300), s(320), s(160), s(16));

    const msg = this.scene.add.text(this.contentBounds.centerX, this.contentBounds.top + s(340),
      '탑을 리셋하시겠습니까?\n진행도가 1층으로 돌아갑니다.', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(16),
        color: DESIGN.colors.text.primary,
        align: 'center'
      }).setOrigin(0.5).setDepth(2102);

    // 확인 버튼
    const confirmBg = this.scene.add.rectangle(this.contentBounds.centerX - s(75), this.contentBounds.top + s(400), s(120), s(40), 0xEF4444)
      .setDepth(2102);
    ensureMinTouchTarget(confirmBg);
    const confirmLabel = this.scene.add.text(this.contentBounds.centerX - s(75), this.contentBounds.top + s(400), '리셋', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(16),
      fontStyle: 'bold',
      color: DESIGN.colors.text.primary
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
    const cancelBg = this.scene.add.rectangle(this.contentBounds.centerX + s(75), this.contentBounds.top + s(400), s(120), s(40), DESIGN.colors.bg.surface)
      .setDepth(2102);
    ensureMinTouchTarget(cancelBg);
    const cancelLabel = this.scene.add.text(this.contentBounds.centerX + s(75), this.contentBounds.top + s(400), '취소', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(16),
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5).setDepth(2103);

    cancelBg.on('pointerdown', () => {
      [overlay, dialog, msg, confirmBg, confirmLabel, cancelBg, cancelLabel].forEach(e => e.destroy());
    });
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
