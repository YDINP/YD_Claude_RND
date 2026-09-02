/**
 * RaidPopup - RAID-01/02 주간 레이드 팝업 UI
 * 2탭 구조: 레이드 현황 (보스 HP바 + 내 누적 데미지) / 보상 (기여도 구간별 수령)
 * PopupBase 상속, RaidSystem 사용
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf, MOODS } from '../../config/gameConfig.js';
import { RaidSystem } from '../../systems/RaidSystem.js';

const TAB = { STATUS: 0, REWARDS: 1 };

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
      title: '⚔ 주간 레이드',
      width: s(680),
      height: s(1100),
      ...options
    });
    this._activeTab = TAB.STATUS;
    this._isLoading = false;
    this._tabObjects = [];
  }

  buildContent() {
    this._renderTabs();
    this._loadAndRenderTab(TAB.STATUS);
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
      const ty = b.top + s(20);

      const isActive = idx === this._activeTab;
      const bg = this.scene.add.rectangle(tx, ty, tabW - s(4), s(36),
        isActive ? COLORS.primary : COLORS.bgLight, 1);
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
        color: isActive ? '#FFFFFF' : '#94A3B8'
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
    const contentTop = b.top + s(60);
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

    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    if (!status.success) {
      this._add(this.scene.add.text(cx, y + s(60), '레이드 데이터를 불러올 수 없습니다', {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8'
      }).setOrigin(0.5));
      return;
    }

    const boss = status.boss;
    const moodInfo = MOODS[boss.weakMood];
    const moodColor = moodInfo
      ? '#' + moodInfo.color.toString(16).padStart(6, '0')
      : '#F8FAFC';

    // 보스 이름
    this._add(this.scene.add.text(cx, y + s(30), boss.name, {
      fontSize: sf(30),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5));

    // 교단 + 약점 무드
    const cultLabel = CULT_LABELS[boss.cultId] || boss.cultId;
    const weaknessName = moodInfo ? moodInfo.name : boss.weakMood;
    this._add(this.scene.add.text(cx - s(40), y + s(70),
      cultLabel + '  |  약점 무드:', {
        fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8'
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
      fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: '#64748B'
    }).setOrigin(0, 0.5));
    const barBg = this.scene.add.rectangle(cx, barY, barW, s(22), 0x0F172A, 1);
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
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8'
      }).setOrigin(0.5));

    // 내 누적 데미지
    const dmgBox = this.scene.add.rectangle(cx, y + s(230), b.width - s(40), s(70), COLORS.bgLight, 0.9);
    dmgBox.setStrokeStyle(s(1), COLORS.primary, 0.4);
    this._add(dmgBox);
    this._add(this.scene.add.text(cx - s(10), y + s(212),
      '내 누적 데미지', {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif', color: '#64748B'
      }).setOrigin(0.5));
    this._add(this.scene.add.text(cx - s(10), y + s(240),
      status.myDamage.toLocaleString()
      + '  (' + status.damagePct.toFixed(2) + '%)', {
        fontSize: sf(18),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold', color: '#F59E0B'
      }).setOrigin(0.5));

    // 기여도 구간 표시
    const tierLabel = status.tierRank
      ? '현재 구간: ' + status.tierRank
      : '다음 구간까지 ' + ((status.nextThresholdPct || 0).toFixed(2)) + '%';
    this._add(this.scene.add.text(cx, y + s(285), tierLabel, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold',
      color: status.tierRank ? '#10B981' : '#94A3B8'
    }).setOrigin(0.5));

    // 입장 버튼
    this._addButton(cx, y + s(345), s(220), s(50), '레이드 입장', COLORS.primary,
      () => this._onEnterPressed(boss.id));
  }

  async _onEnterPressed(bossId) {
    if (this._isLoading) return;
    this._isLoading = true;
    const result = await RaidSystem.enterRaid(bossId);
    this._isLoading = false;
    this._showFeedback(
      result.success
        ? result.boss.name + ' 전장에 입장했습니다!'
        : (result.error || '입장 실패'),
      result.success ? '#10B981' : '#EF4444'
    );
  }

  // ─────────────────────────────────────────
  // Tab 2: 보상
  // ─────────────────────────────────────────

  _renderRewardsTab(contentTop) {
    const weekly = RaidSystem.getWeeklyRaid();
    const status = RaidSystem.getRaidStatus(weekly.boss.id);
    this._isLoading = false;

    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    if (!status.success) {
      this._add(this.scene.add.text(cx, y + s(60), '보상 정보를 불러올 수 없습니다', {
        fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8'
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

    // 전체 수령 버튼
    const btnY = y + s(20) + status.rewards.length * (itemH + s(6)) + s(16);
    this._addButton(cx, btnY, s(220), s(50), '보상 수령', COLORS.success,
      () => this._onClaimPressed(status.boss.id));
  }

  _renderRewardRow(reward, cx, cy, w, h, damagePct, claimed) {
    const reached = damagePct >= reward.minDamagePct;
    const rowColor = claimed ? COLORS.bgPanel : (reached ? COLORS.bgLight : COLORS.bgDark);
    const bg = this.scene.add.rectangle(cx, cy, w, h, rowColor, 0.9);
    bg.setStrokeStyle(s(1), claimed ? COLORS.success : (reached ? COLORS.primary : 0x334155), 0.5);
    this._add(bg);

    // 좌측: 구간명 + 필요 기여도
    this._add(this.scene.add.text(cx - w / 2 + s(14), cy - s(14),
      reward.rank + (claimed ? ' (수령 완료)' : ''), {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: 'bold',
        color: claimed ? '#10B981' : (reached ? '#FFFFFF' : '#64748B')
      }).setOrigin(0, 0.5));
    this._add(this.scene.add.text(cx - w / 2 + s(14), cy + s(12),
      '필요 기여도 ' + reward.minDamagePct + '% 이상', {
        fontSize: sf(11), fontFamily: '"Noto Sans KR", sans-serif', color: '#64748B'
      }).setOrigin(0, 0.5));

    // 우측: 보상 요약
    const parts = [];
    parts.push('G ' + reward.gold.toLocaleString());
    parts.push('💎 ' + reward.gems);
    parts.push('조각 x' + reward.equipmentFragment);
    if (reward.ssrTicket > 0) parts.push('SSR권 x' + reward.ssrTicket);
    this._add(this.scene.add.text(cx + w / 2 - s(14), cy, parts.join('   '), {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: reached && !claimed ? '#F59E0B' : '#94A3B8'
    }).setOrigin(1, 0.5));
  }

  async _onClaimPressed(bossId) {
    if (this._isLoading) return;
    this._isLoading = true;
    const result = await RaidSystem.claimRewards(bossId);
    this._isLoading = false;

    if (result.success) {
      const r = result.rewards;
      this._showFeedback(
        '보상 수령! G ' + r.gold.toLocaleString() + ' / 💎 ' + r.gems
        + ' / 조각 x' + r.equipmentFragment
        + (r.ssrTicket > 0 ? ' / SSR권 x' + r.ssrTicket : ''),
        '#10B981');
      this._loadAndRenderTab(TAB.REWARDS);
    } else {
      this._showFeedback(result.error === 'No claimable rewards'
        ? '수령 가능한 보상이 없습니다'
        : (result.error || '수령 실패'), '#EF4444');
    }
  }

  // ─────────────────────────────────────────
  // 공통 유틸
  // ─────────────────────────────────────────

  _addButton(x, y, w, h, label, color, callback) {
    const bg = this.scene.add.rectangle(x, y, w, h, color, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setAlpha(0.85));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', callback);
    this._add(bg);

    const txt = this.scene.add.text(x, y, label, {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this._add(txt);
    return { bg, txt };
  }

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
