/**
 * RaidPopup - RAID-01/02 주간 레이드 팝업 UI
 * 2탭 구조: 레이드 현황 (보스 HP바 + 내 누적 데미지) / 보상 (기여도 구간별 수령)
 * PopupBase 상속, RaidSystem 사용
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf, MOODS } from '../../config/gameConfig.js';
import { RaidSystem } from '../../systems/RaidSystem.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';

const TAB = { STATUS: 0, REWARDS: 1 };

/** 헤더 타이틀 — 이모지는 헤더 언더라인 교단색이 대신한다 */
const TITLE = '주간 레이드';

/** 탭 스트립 높이 (기획 px) */
const TAB_STRIP_HEIGHT = 44;

const CULT_LABELS = {
  valhalla: '발할라',
  takamagahara: '타카마가하라',
  olympus: '올림푸스',
  asgard: '아스가르드',
  yomi: '요미'
};

export class RaidPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.cult.olympus,
      ...options
    });
    this._activeTab = TAB.STATUS;
    this._isLoading = false;
    this._tabObjects = [];
  }

  buildContent() {
    this.setTitle(TITLE);
    this._applySummary(null);
    this._applyActions(TAB.STATUS, null);
    this._renderTabs();
    this._loadAndRenderTab(TAB.STATUS);
  }

  /** 슬롯 2 — 보스 잔여 HP · 내 기여도 */
  _applySummary(status) {
    if (!status || !status.success) {
      this.setSummary([
        { label: '보스 HP', value: '-' },
        { label: '내 기여도', value: '-' }
      ]);
      return;
    }
    const ratio = Math.max(0, Math.min(1, status.remainingRatio));
    this.setSummary([
      { label: '보스 HP', value: `${Math.ceil(ratio * 100)}%` },
      { label: '내 기여도', value: `${status.damagePct.toFixed(2)}%` },
      { label: '구간', value: status.tierRank || '미달' }
    ]);
  }

  /** 슬롯 4 — 탭별 주 행동. 콜백이 자기 액션 바를 지우지 않도록 한 프레임 미룬다 */
  _applyActions(tabIdx, status) {
    const bossId = status && status.boss ? status.boss.id : null;
    const defer = (fn) => this.scene.time.delayedCall(0, fn);
    if (tabIdx === TAB.REWARDS) {
      this.setActions([
        {
          label: '보상 수령',
          variant: 'primary',
          disabled: !bossId,
          onClick: () => defer(() => this._onClaimPressed(bossId))
        },
        { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
      ]);
      return;
    }
    this.setActions([
      {
        label: '레이드 입장',
        variant: 'primary',
        disabled: !bossId,
        onClick: () => defer(() => this._onEnterPressed(bossId))
      },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);
  }

  // ─────────────────────────────────────────
  // 탭 렌더링
  // ─────────────────────────────────────────

  _renderTabs() {
    const b = this.contentBounds;
    const tabLabels = ['레이드 현황', '보상'];
    const tabW = b.width / 2;

    tabLabels.forEach((label, idx) => {
      const tx = b.left + tabW * idx + tabW / 2;
      const ty = b.top + s(TAB_STRIP_HEIGHT) / 2;

      const isActive = idx === this._activeTab;
      const bg = this.scene.add.rectangle(tx, ty, tabW - s(4), s(TAB_STRIP_HEIGHT - 8),
        isActive ? DESIGN.colors.cult.olympus : DESIGN.colors.bg.surface, isActive ? 0.9 : 0.6);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        if (!this._isLoading) this._loadAndRenderTab(idx);
      });
      this.contentContainer.add(bg);
      this._tabObjects.push(bg);

      const txt = this.scene.add.text(tx, ty, label, {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary
      }).setOrigin(0.5);
      this.contentContainer.add(txt);
      this._tabObjects.push(txt);
    });
  }

  _loadAndRenderTab(tabIdx) {
    this._activeTab = tabIdx;
    this._clearTabContent();
    this._renderTabs();

    const b = this.contentBounds;
    const contentTop = b.top + s(TAB_STRIP_HEIGHT + 12);
    this._isLoading = true;

    if (tabIdx === TAB.STATUS) {
      this._renderStatusTab(contentTop);
    } else {
      this._renderRewardsTab(contentTop);
    }
  }

  _clearTabContent() {
    this._tabObjects.forEach(obj => {
      if (obj && obj.scene) obj.destroy();
    });
    this._tabObjects = [];
  }

  _add(obj) {
    this.contentContainer.add(obj);
    this._tabObjects.push(obj);
    return obj;
  }

  // ─────────────────────────────────────────
  // Tab 1: 레이드 현황
  // ─────────────────────────────────────────

  _renderStatusTab(contentTop) {
    const weekly = RaidSystem.getWeeklyRaid();
    const status = RaidSystem.getRaidStatus(weekly.boss.id);
    this._isLoading = false;
    this._applySummary(status);
    this._applyActions(TAB.STATUS, status);

    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    if (!status.success) {
      this._add(this.scene.add.text(cx, y + s(60), '레이드 데이터를 불러올 수 없습니다', {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary
      }).setOrigin(0.5));
      return;
    }

    const boss = status.boss;
    const moodInfo = MOODS[boss.weakMood];
    const moodColor = moodInfo
      ? '#' + moodInfo.color.toString(16).padStart(6, '0')
      : DESIGN.colors.text.primary;

    // 보스 이름
    this._add(this.scene.add.text(cx, y + s(30), boss.name, {
      fontSize: sf(30),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5));

    // 교단 + 약점 무드
    const cultLabel = CULT_LABELS[boss.cultId] || boss.cultId;
    const weaknessName = moodInfo ? moodInfo.name : boss.weakMood;
    this._add(this.scene.add.text(cx - s(40), y + s(70),
      cultLabel + '  |  약점 무드:', {
        fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary
      }).setOrigin(0.5));
    this._add(this.scene.add.text(cx + s(120), y + s(70), weaknessName, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: moodColor
    }).setOrigin(0.5));

    // HP 바
    const barW = b.width - s(60);
    const barY = y + s(130);
    this._add(this.scene.add.text(b.left + s(10), barY - s(24), 'BOSS HP', {
      fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.muted
    }).setOrigin(0, 0.5));
    const barBg = this.scene.add.rectangle(cx, barY, barW, s(22), DESIGN.colors.bg.primary, 1);
    barBg.setStrokeStyle(s(1), COLORS.bgPanel, 1);
    this._add(barBg);
    const ratio = Math.max(0, Math.min(1, status.remainingRatio));
    const fillW = Math.max(ratio > 0 ? s(2) : 0, barW * ratio);
    const fillColor = ratio > 0.5 ? COLORS.danger : COLORS.accent;
    this._add(this.scene.add.rectangle(
      cx - barW / 2 + fillW / 2, barY, fillW, s(22) - s(4), fillColor, 1));

    this._add(this.scene.add.text(cx, barY + s(26),
      Math.floor(status.maxHp * ratio).toLocaleString() + ' / ' + status.maxHp.toLocaleString()
      + '  (' + Math.ceil(ratio * 100) + '%)', {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary
      }).setOrigin(0.5));

    // 내 누적 데미지
    const dmgBox = this.scene.add.rectangle(cx, y + s(230), b.width - s(40), s(70), COLORS.bgLight, 0.9);
    dmgBox.setStrokeStyle(s(1), COLORS.primary, 0.4);
    this._add(dmgBox);
    this._add(this.scene.add.text(cx - s(10), y + s(212),
      '내 누적 데미지', {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.muted
      }).setOrigin(0.5));
    this._add(this.scene.add.text(cx - s(10), y + s(240),
      status.myDamage.toLocaleString()
      + '  (' + status.damagePct.toFixed(2) + '%)', {
        fontSize: sf(18),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold', color: hexToCSS(DESIGN.colors.status.warning)
      }).setOrigin(0.5));

    // 기여도 구간 표시
    const tierLabel = status.tierRank
      ? '현재 구간: ' + status.tierRank
      : '다음 구간까지 ' + ((status.nextThresholdPct || 0).toFixed(2)) + '%';
    this._add(this.scene.add.text(cx, y + s(285), tierLabel, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      color: status.tierRank ? hexToCSS(DESIGN.colors.status.success) : DESIGN.colors.text.secondary
    }).setOrigin(0.5));

  }

  async _onEnterPressed(bossId) {
    if (this._isLoading || !bossId) return;
    this._isLoading = true;
    const result = await RaidSystem.enterRaid(bossId);
    this._isLoading = false;
    this._showFeedback(
      result.success
        ? result.boss.name + ' 전장에 입장했습니다!'
        : (result.error || '입장 실패'),
      result.success ? hexToCSS(DESIGN.colors.status.success) : hexToCSS(DESIGN.colors.status.error)
    );
  }

  // ─────────────────────────────────────────
  // Tab 2: 보상
  // ─────────────────────────────────────────

  _renderRewardsTab(contentTop) {
    const weekly = RaidSystem.getWeeklyRaid();
    const status = RaidSystem.getRaidStatus(weekly.boss.id);
    this._isLoading = false;
    this._applySummary(status);
    this._applyActions(TAB.REWARDS, status);

    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    if (!status.success) {
      this._add(this.scene.add.text(cx, y + s(60), '보상 정보를 불러올 수 없습니다', {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary
      }).setOrigin(0.5));
      return;
    }

    const claimedSet = new Set(status.claimedTiers);
    const itemH = s(78);
    status.rewards.forEach((reward, idx) => {
      const iy = y + s(20) + idx * (itemH + s(6));
      this._renderRewardRow(reward, cx, iy, b.width - s(30), itemH, status.damagePct,
        claimedSet.has(reward.tier));
    });
  }

  _renderRewardRow(reward, cx, cy, w, h, damagePct, claimed) {
    const reached = damagePct >= reward.minDamagePct;
    const rowColor = claimed ? COLORS.bgPanel : (reached ? COLORS.bgLight : COLORS.bgDark);
    const bg = this.scene.add.rectangle(cx, cy, w, h, rowColor, 0.9);
    bg.setStrokeStyle(s(1), claimed ? COLORS.success : (reached ? COLORS.primary : DESIGN.colors.bg.surface), 0.5);
    this._add(bg);

    // 좌측: 구간명 + 필요 기여도
    this._add(this.scene.add.text(cx - w / 2 + s(14), cy - s(14),
      reward.rank + (claimed ? ' (수령 완료)' : ''), {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: claimed ? hexToCSS(DESIGN.colors.status.success) : (reached ? DESIGN.colors.text.primary : DESIGN.colors.text.muted)
      }).setOrigin(0, 0.5));
    this._add(this.scene.add.text(cx - w / 2 + s(14), cy + s(12),
      '필요 기여도 ' + reward.minDamagePct + '% 이상', {
        fontSize: sf(11), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.muted
      }).setOrigin(0, 0.5));

    // 우측: 보상 요약
    const parts = [];
    parts.push('골드 ' + reward.gold.toLocaleString());
    parts.push('젬 ' + reward.gems);
    parts.push('조각 x' + reward.equipmentFragment);
    if (reward.ssrTicket > 0) parts.push('SSR권 x' + reward.ssrTicket);
    this._add(this.scene.add.text(cx + w / 2 - s(14), cy, parts.join('   '), {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: reached && !claimed ? hexToCSS(DESIGN.colors.status.warning) : DESIGN.colors.text.secondary
    }).setOrigin(1, 0.5));
  }

  async _onClaimPressed(bossId) {
    if (this._isLoading || !bossId) return;
    this._isLoading = true;
    const result = await RaidSystem.claimRewards(bossId);
    this._isLoading = false;

    if (result.success) {
      const r = result.rewards;
      this._showFeedback(
        '보상 수령! 골드 ' + r.gold.toLocaleString() + ' / 젬 ' + r.gems
        + ' / 조각 x' + r.equipmentFragment
        + (r.ssrTicket > 0 ? ' / SSR권 x' + r.ssrTicket : ''),
        hexToCSS(DESIGN.colors.status.success));
      this._loadAndRenderTab(TAB.REWARDS);
    } else {
      this._showFeedback(result.error === 'No claimable rewards'
        ? '수령 가능한 보상이 없습니다'
        : (result.error || '수령 실패'), hexToCSS(DESIGN.colors.status.error));
    }
  }

  // ─────────────────────────────────────────
  // 공통 유틸
  // ─────────────────────────────────────────

  _showFeedback(message, color) {
    const b = this.contentBounds;
    const feedbackTxt = this.scene.add.text(b.centerX, b.bottom - s(60), message, {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      color,
      wordWrap: { width: b.width - s(40) },
      align: 'center'
    }).setOrigin(0.5);
    this.contentContainer.add(feedbackTxt);
    this.scene.time.delayedCall(2000, () => {
      if (feedbackTxt && feedbackTxt.scene) feedbackTxt.destroy();
    });
  }
}

export default RaidPopup;
