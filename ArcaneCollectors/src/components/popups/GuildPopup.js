/**
 * GuildPopup - GP-2 Guild System Popup UI
 * 3-tab: Guild Info / Members / Donate
 * Extends PopupBase
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { GuildSystem } from '../../systems/GuildSystem.js';

const TAB = { INFO: 0, MEMBERS: 1, DONATE: 2 };

export class GuildPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: 'Guild',
      width: s(680),
      height: s(1100),
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
    this._renderTabs();
    this._loadAndRenderTab(TAB.INFO);
  }
  _renderTabs() {
    const b2 = this.contentBounds;
    const tabLabels = ['Guild Info', 'Members', 'Donate'];
    const tabW = b2.width / 3;
    tabLabels.forEach(function(label, idx) {
      const tx = b2.left + tabW * idx + tabW / 2;
      const ty = b2.top + s(20);
      const isActive = idx === this._activeTab;
      const bg = this.scene.add.rectangle(tx, ty, tabW - s(4), s(36),
        isActive ? COLORS.primary : COLORS.bgLight, 1);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', function() {
        if (!this._isLoading) this._loadAndRenderTab(idx);
      }.bind(this));
      this.contentContainer.add(bg);
      const txt = this.scene.add.text(tx, ty, label, {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        fontStyle: isActive ? 'bold' : 'normal',
        color: isActive ? '#FFFFFF' : '#94A3B8'
      }).setOrigin(0.5);
      this.contentContainer.add(txt);
    }.bind(this));
  }

  _loadAndRenderTab(tabIdx) {
    this._activeTab = tabIdx;
    this._clearTabContent();
    this._renderTabs();
    const b2 = this.contentBounds;
    const contentTop = b2.top + s(60);
    this._isLoading = true;
    const loadingText = this.scene.add.text(b2.centerX, contentTop + s(60), 'Loading...', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
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
      this._renderNoGuild(cx, y, b2.width);
      return;
    }
    const guild = result.guild;
    this._myGuild = guild;
    const nameText = this.scene.add.text(cx, y + s(30), guild.name, {
      fontSize: sf(28),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.contentContainer.add(nameText); this._tabObjects.push(nameText);
    if (guild.description) {
      const descText = this.scene.add.text(cx, y + s(70), guild.description, {
        fontSize: sf(14),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#94A3B8',
        wordWrap: { width: b2.width - s(40) },
        align: 'center'
      }).setOrigin(0.5);
      this.contentContainer.add(descText); this._tabObjects.push(descText);
    }
    const statsStr = 'Master: ' + guild.master_name
      + '  |  Members: ' + guild.member_count + '/' + guild.max_members
      + '  |  Points: ' + guild.guild_points;
    const statsText = this.scene.add.text(cx, y + s(120), statsStr, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#6366F1'
    }).setOrigin(0.5);
    this.contentContainer.add(statsText); this._tabObjects.push(statsText);
  }

  _renderNoGuild(cx, y, w) {
    const msg = this.scene.add.text(cx, y + s(80), 'Not in a guild. Create or join!', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8', align: 'center',
      wordWrap: { width: w - s(40) }
    }).setOrigin(0.5);
    this.contentContainer.add(msg); this._tabObjects.push(msg);
    const btnBg = this.scene.add.rectangle(cx, y + s(160), s(160), s(44), COLORS.primary, 1);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', function() { this._showCreateGuildForm(); }.bind(this));
    this.contentContainer.add(btnBg); this._tabObjects.push(btnBg);
    const btnTxt = this.scene.add.text(cx, y + s(160), 'Create Guild', {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.contentContainer.add(btnTxt); this._tabObjects.push(btnTxt);
  }
  async _loadMembersTab(contentTop, loadingText) {
    const result = await GuildSystem.getGuildMembers();
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    let y = contentTop;
    if (!result.success || result.members.length === 0) {
      const emptyTxt = this.scene.add.text(cx, y + s(60), 'No members found', {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#94A3B8'
      }).setOrigin(0.5);
      this.contentContainer.add(emptyTxt); this._tabObjects.push(emptyTxt);
      return;
    }
    this._members = result.members;
    const countTxt = this.scene.add.text(cx, y + s(10), 'Members: ' + result.members.length, {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
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
    bg.setStrokeStyle(s(1), isMaster ? COLORS.primary : 0x334155, 0.4);
    this.contentContainer.add(bg); this._tabObjects.push(bg);
    const nameTxt = this.scene.add.text(cx - w / 2 + s(12), cy - s(10),
      member.player_name + (isMaster ? ' [Master]' : ''), {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: isMaster ? 'bold' : 'normal',
      color: isMaster ? '#6366F1' : '#F8FAFC'
    }).setOrigin(0, 0.5);
    this.contentContainer.add(nameTxt); this._tabObjects.push(nameTxt);
    const pwrTxt = this.scene.add.text(cx - w / 2 + s(12), cy + s(12),
      'CP: ' + (member.combat_power || 0).toLocaleString() + '  Donated: ' + (member.total_donation || 0).toLocaleString(), {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#64748B'
    }).setOrigin(0, 0.5);
    this.contentContainer.add(pwrTxt); this._tabObjects.push(pwrTxt);
  }
  _renderDonateTab(contentTop, loadingText) {
    if (loadingText && loadingText.scene) loadingText.destroy();
    this._isLoading = false;
    const b2 = this.contentBounds;
    const cx = b2.centerX;
    const y = contentTop;
    const titleTxt = this.scene.add.text(cx, y + s(20), 'Donate Gold to Guild', {
      fontSize: sf(20),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.contentContainer.add(titleTxt); this._tabObjects.push(titleTxt);
    const infoTxt = this.scene.add.text(cx, y + s(60),
      '1 gold = 1 guild point', {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
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
        color: '#F8FAFC'
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
      ? 'Donated ' + amount + ' gold! +' + result.pointsEarned + ' pts'
      : (result.error || 'Error');
    const color = result.success ? '#10B981' : '#EF4444';
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
    const titleTxt = this.scene.add.text(cx, y + s(20), 'Create New Guild', {
      fontSize: sf(22),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.contentContainer.add(titleTxt); this._tabObjects.push(titleTxt);
    const nameLbl = this.scene.add.text(cx - b2.width / 2 + s(20), y + s(70), 'Guild Name (2-20):', {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8'
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
    const maxBtnTxt = this.scene.add.text(cx, y + s(140), 'Create (Default)', {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.contentContainer.add(maxBtnTxt); this._tabObjects.push(maxBtnTxt);
  }
}