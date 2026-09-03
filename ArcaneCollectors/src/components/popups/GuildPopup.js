/**
 * GuildPopup - GP-2 Guild System Popup UI
 * 3-tab: Guild Info / Members / Donate
 * Extends PopupBase
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { GuildSystem } from '../../systems/GuildSystem.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { ensureMinTouchTarget } from '../../utils/touchTarget.js';

const TAB = { INFO: 0, MEMBERS: 1, DONATE: 2 };

/** 헤더 타이틀 */
const TITLE = '길드';

/** 탭 라벨 — 한국어 통일 (헤더/액션바와 서체가 같아야 팝업이 한 벌로 읽힌다) */
const TAB_LABELS = ['길드 정보', '길드원', '기부'];

/** 탭 스트립 높이 (기획 px) */
const TAB_STRIP_HEIGHT = 44;

export class GuildPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.status.info,
      ...options
    });
    this._activeTab = TAB.INFO;
    this._myGuild = null;
    this._members = [];
    this._isLoading = false;
    this._tabObjects = [];
    this._donateInput = null;
  }

  buildContent() {
    this.setTitle(TITLE);
    this._applySummary();
    this._applyActions(TAB.INFO);
    this._renderTabs();
    this._loadAndRenderTab(TAB.INFO);
  }

  /** 슬롯 2 — 길드 요약. 미가입이면 자리만 지킨다 */
  _applySummary() {
    const guild = this._myGuild;
    this.setSummary([
      { label: '길드', value: guild ? guild.name : '미가입' },
      { label: '길드원', value: guild ? `${guild.member_count} / ${guild.max_members}` : '-' },
      { label: '길드 포인트', value: guild ? `${guild.guild_points}` : '-' }
    ]);
  }

  /**
   * 슬롯 4 — 탭별 주 행동.
   * 액션 바를 다시 그리는 콜백이 자기 자신을 지우지 않도록 전환은 한 프레임 미룬다.
   */
  _applyActions(tabIdx) {
    const defer = (fn) => this.scene.time.delayedCall(0, fn);
    if (tabIdx === TAB.INFO && !this._myGuild) {
      this.setActions([
        { label: '길드 생성', variant: 'primary', onClick: () => defer(() => this._showCreateGuildForm()) },
        { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
      ]);
      return;
    }
    if (tabIdx === TAB.MEMBERS) {
      this.setActions([
        { label: '새로고침', variant: 'secondary', onClick: () => defer(() => this._loadAndRenderTab(TAB.MEMBERS)) },
        { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
      ]);
      return;
    }
    this.setActions([{ label: '닫기', variant: 'ghost', onClick: () => this.hide() }]);
  }

  _renderTabs() {
    const b2 = this.contentBounds;
    const tabLabels = TAB_LABELS;
    const tabW = b2.width / 3;
    tabLabels.forEach(function(label, idx) {
      const tx = b2.left + tabW * idx + tabW / 2;
      const ty = b2.top + s(TAB_STRIP_HEIGHT) / 2;
      const isActive = idx === this._activeTab;
      const bg = this.scene.add.rectangle(tx, ty, tabW - s(4), s(TAB_STRIP_HEIGHT - 8),
        isActive ? DESIGN.colors.status.info : DESIGN.colors.bg.surface, isActive ? 0.9 : 0.6);
      // 탭 스트립 시각 높이는 36 이지만 손가락이 닿는 영역은 48 이어야 한다 (QA P2-1)
      ensureMinTouchTarget(bg);
      bg.on('pointerdown', function() {
        if (!this._isLoading) this._loadAndRenderTab(idx);
      }.bind(this));
      this.contentContainer.add(bg);
      // 탭 스트립도 _tabObjects 에 넣어야 _clearTabContent() 가 회수한다.
      // 빠뜨리면 탭을 바꿀 때마다 스트립이 한 벌씩 쌓인다 (QA P1-2, RaidPopup 패턴).
      this._tabObjects.push(bg);
      const txt = this.scene.add.text(tx, ty, label, {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary
      }).setOrigin(0.5);
      this.contentContainer.add(txt);
      this._tabObjects.push(txt);
    }.bind(this));
  }

  _loadAndRenderTab(tabIdx) {
    this._activeTab = tabIdx;
    this._clearTabContent();
    this._applyActions(tabIdx);
    this._renderTabs();
    const b2 = this.contentBounds;
    const contentTop = b2.top + s(TAB_STRIP_HEIGHT + 12);
    this._isLoading = true;
    const loadingText = this.scene.add.text(b2.centerX, contentTop + s(60), '불러오는 중…', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    this.contentContainer.add(loadingText);
    this._tabObjects.push(loadingText);
    if (tabIdx === TAB.INFO) this._loadInfoTab(contentTop, loadingText);
    else if (tabIdx === TAB.MEMBERS) this._loadMembersTab(contentTop, loadingText);
    else this._renderDonateTab(contentTop, loadingText);
  }

  _clearTabContent() {
    this._tabObjects.forEach(function(obj) { if (obj && obj.scene) obj.destroy(); });
    this._tabObjects = [];
  }
  async _loadInfoTab(contentTop, loadingText) {
    const result = await GuildSystem.getMyGuildInfo();
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    const y = contentTop;
    if (!result.success || !result.guild) {
      this._myGuild = null;
      this._applySummary();
      this._applyActions(TAB.INFO);
      this._renderNoGuild(cx, y, b2.width);
      return;
    }
    const guild = result.guild;
    this._myGuild = guild;
    this._applySummary();
    this._applyActions(TAB.INFO);
    const nameText = this.scene.add.text(cx, y + s(30), guild.name, {
      fontSize: sf(28),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);
    this.contentContainer.add(nameText); this._tabObjects.push(nameText);
    if (guild.description) {
      const descText = this.scene.add.text(cx, y + s(70), guild.description, {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: DESIGN.colors.text.secondary,
        wordWrap: { width: b2.width - s(40) },
        align: 'center'
      }).setOrigin(0.5);
      this.contentContainer.add(descText); this._tabObjects.push(descText);
    }
    const statsStr = '길드장 ' + guild.master_name
      + '  |  길드원 ' + guild.member_count + '/' + guild.max_members
      + '  |  포인트 ' + guild.guild_points;
    const statsText = this.scene.add.text(cx, y + s(120), statsStr, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#6366F1'
    }).setOrigin(0.5);
    this.contentContainer.add(statsText); this._tabObjects.push(statsText);
  }

  /** 미가입 안내. '길드 생성' 버튼은 액션 바(슬롯 4)로 옮겼다 */
  _renderNoGuild(cx, y, w) {
    const msg = this.scene.add.text(cx, y + s(80), '아직 길드가 없습니다.\n아래에서 길드를 만들어 보세요.', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.secondary, align: 'center',
      wordWrap: { width: w - s(40) }
    }).setOrigin(0.5);
    this.contentContainer.add(msg); this._tabObjects.push(msg);
  }

  async _loadMembersTab(contentTop, loadingText) {
    const result = await GuildSystem.getGuildMembers();
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    let y = contentTop;
    if (!result.success || result.members.length === 0) {
      const emptyTxt = this.scene.add.text(cx, y + s(60), '길드원이 없습니다', {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: DESIGN.colors.text.secondary
      }).setOrigin(0.5);
      this.contentContainer.add(emptyTxt); this._tabObjects.push(emptyTxt);
      return;
    }
    this._members = result.members;
    const countTxt = this.scene.add.text(cx, y + s(10), '길드원 ' + result.members.length, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    this.contentContainer.add(countTxt); this._tabObjects.push(countTxt);
    const itemH = s(60);
    result.members.forEach(function(member, idx) {
      const iy = y + s(36) + idx * (itemH + s(4));
      this._renderMemberRow(member, cx, iy, b2.width - s(20), itemH);
    }.bind(this));
  }

  _renderMemberRow(member, cx, cy, w, h) {
    const isMaster = member.role === 'master';
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.8);
    bg.setStrokeStyle(s(1), isMaster ? COLORS.primary : DESIGN.colors.bg.surface, 0.4);
    this.contentContainer.add(bg); this._tabObjects.push(bg);
    const nameTxt = this.scene.add.text(cx - w / 2 + s(12), cy - s(10),
      member.player_name + (isMaster ? ' [길드장]' : ''), {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: isMaster ? 'bold' : 'normal',
      color: isMaster ? '#6366F1' : DESIGN.colors.text.primary
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameTxt); this._tabObjects.push(nameTxt);
    const pwrTxt = this.scene.add.text(cx - w / 2 + s(12), cy + s(12),
      '전투력 ' + (member.combat_power || 0).toLocaleString() + '  기부 ' + (member.total_donation || 0).toLocaleString(), {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.muted
    }).setOrigin(0, 0.5);
    this.contentContainer.add(pwrTxt); this._tabObjects.push(pwrTxt);
  }
  _renderDonateTab(contentTop, loadingText) {
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    const y = contentTop;
    const titleTxt = this.scene.add.text(cx, y + s(20), '길드에 골드 기부', {
      fontSize: sf(20),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);
    this.contentContainer.add(titleTxt); this._tabObjects.push(titleTxt);
    const infoTxt = this.scene.add.text(cx, y + s(60),
      '골드 1 = 길드 포인트 1', {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    this.contentContainer.add(infoTxt); this._tabObjects.push(infoTxt);
    const amountOptions = [100, 500, 1000, 5000, 10000];
    amountOptions.forEach(function(amount, idx) {
      const bx = cx - s(200) + idx * s(100);
      const by = y + s(110);
      const btnBg = this.scene.add.rectangle(bx, by, s(90), s(40), COLORS.bgLight, 1);
      btnBg.setStrokeStyle(s(1), COLORS.primary, 0.5);
      btnBg.setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', function() { this._executeDonate(amount); }.bind(this));
      this.contentContainer.add(btnBg); this._tabObjects.push(btnBg);
      const btnTxt = this.scene.add.text(bx, by, amount.toLocaleString(), {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: DESIGN.colors.text.primary
      }).setOrigin(0.5);
      this.contentContainer.add(btnTxt); this._tabObjects.push(btnTxt);
    }.bind(this));
  }

  async _executeDonate(amount) {
    if (this._isLoading) return;
    this._isLoading = true;
    const result = await GuildSystem.donate(amount);
    this._isLoading = false;
    const b2 = this.contentBounds;
    const msg = result.success
      ? '기부 완료 ' + amount + ' 골드 · +' + result.pointsEarned + ' 포인트'
      : (result.error || '오류');
    const color = result.success ? hexToCSS(DESIGN.colors.status.success) : hexToCSS(DESIGN.colors.status.error);
    const feedbackTxt = this.scene.add.text(b2.centerX, b2.top + s(200), msg, {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: color
    }).setOrigin(0.5);
    this.contentContainer.add(feedbackTxt);
    this._tabObjects.push(feedbackTxt);
    this.scene.time.delayedCall(2000, function() {
      if (feedbackTxt && feedbackTxt.scene) feedbackTxt.destroy();
    });
  }

  _showCreateGuildForm() {
    this._clearTabContent();
    this._renderTabs();
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    let y = b2.top + s(60);
    const titleTxt = this.scene.add.text(cx, y + s(20), '새 길드 만들기', {
      fontSize: sf(22),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);
    this.contentContainer.add(titleTxt); this._tabObjects.push(titleTxt);
    const nameLbl = this.scene.add.text(cx - b2.width / 2 + s(20), y + s(70), '길드 이름 (2~20자)', {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameLbl); this._tabObjects.push(nameLbl);
    const maxBtnBg = this.scene.add.rectangle(cx, y + s(140), s(200), s(44), COLORS.primary, 1);
    maxBtnBg.setInteractive({ useHandCursor: true });
    maxBtnBg.on('pointerdown', function() {
      GuildSystem.createGuild({ name: 'MyGuild', description: '', maxMembers: 30 })
        .then(function(r) {
          if (r.success) this._loadAndRenderTab(TAB.INFO);
        }.bind(this));
    }.bind(this));
    this.contentContainer.add(maxBtnBg); this._tabObjects.push(maxBtnBg);
    const maxBtnTxt = this.scene.add.text(cx, y + s(140), '기본값으로 생성', {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: DESIGN.colors.text.primary
    }).setOrigin(0.5);
    this.contentContainer.add(maxBtnTxt); this._tabObjects.push(maxBtnTxt);
  }
}