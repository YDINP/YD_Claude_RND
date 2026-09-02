/**
 * FriendsPopup - FRIEND-01/02 친구 시스템 팝업 UI
 *
 * 3탭 구조:
 *   Tab 1 (친구 목록): 친구 목록 + 대여 버튼 + 포인트 전송
 *   Tab 2 (친구 추가): 닉네임 검색 + 추가
 *   Tab 3 (상점): 포인트로 아이템 구매
 *
 * 진입: openPopup('friends') (MainMenuScene.openPopup 참조)
 * 닫기: PopupBase 기본 X 버튼 또는 오버레이 클릭
 * 패턴: PopupBase 상속 (GuildPopup/RaidPopup 동일)
 */

import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { FriendSystem } from '../../systems/FriendSystem.js';

const TAB = { LIST: 0, ADD: 1, SHOP: 2 };

export class FriendsPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '👥 친구',
      width: s(680),
      height: s(1100),
      ...options
    });
    this._activeTab = TAB.LIST;
    this._isLoading = false;
    this._tabObjects = [];
    this._friends = [];
    this._searchResults = [];
    this._feedbackText = null;
  }

  buildContent() {
    this._renderTabs();
    this._loadAndRenderTab(TAB.LIST);
  }

  // ─────────────────────────────────────────
  // 탭 렌더링
  // ─────────────────────────────────────────

  _renderTabs() {
    const b = this.contentBounds;
    const tabLabels = ['친구 목록', '친구 추가', '상점'];
    const tabW = b.width / 3;

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

    if (tabIdx === TAB.LIST) this._renderListTab(contentTop);
    else if (tabIdx === TAB.ADD) this._renderAddTab(contentTop);
    else this._renderShopTab(contentTop);
  }

  _clearTabContent() {
    this._tabObjects.forEach(obj => {
      if (obj && obj.scene) obj.destroy();
    });
    this._tabObjects = [];
    this._feedbackText = null;
  }

  _add(obj) {
    this.contentContainer.add(obj);
    this._tabObjects.push(obj);
    return obj;
  }

  _addButton(x, y, w, h, label, color, callback) {
    const bg = this.scene.add.rectangle(x, y, w, h, color, 1);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setAlpha(0.85));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', callback);
    this._add(bg);
    const txt = this.scene.add.text(x, y, label, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this._add(txt);
    return { bg, txt };
  }

  _showFeedback(message, color) {
    if (this._feedbackText && this._feedbackText.scene) this._feedbackText.destroy();
    const b = this.contentBounds;
    this._feedbackText = this.scene.add.text(b.centerX, b.bottom - s(50), message, {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: color,
      wordWrap: { width: b.width - s(40) }, align: 'center'
    }).setOrigin(0.5);
    this.contentContainer.add(this._feedbackText);
    this._tabObjects.push(this._feedbackText);
    this.scene.time.delayedCall(2200, () => {
      if (this._feedbackText && this._feedbackText.scene) this._feedbackText.destroy();
    });
  }

  // ─────────────────────────────────────────
  // Tab 1: 친구 목록 (대여 + 포인트 전송)
  // ─────────────────────────────────────────

  async _renderListTab(contentTop) {
    this._isLoading = true;
    const result = await FriendSystem.getFriends();
    this._isLoading = false;
    this._friends = result.friends || [];

    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    // 상단 정보 바
    const balance = FriendSystem.getPointBalance();
    const rentInfo = FriendSystem.getDailyRentCount();

    this._add(this.scene.add.text(cx, y + s(10),
      '친구 ' + this._friends.length + '/' + FriendSystem.MAX_FRIENDS
      + '   |   대여 ' + rentInfo.todayCount + '/' + rentInfo.limit
      + '   |   호감도 ' + balance.pointBalance + 'pt', {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
    }).setOrigin(0.5));

    if (this._friends.length === 0) {
      this._add(this.scene.add.text(cx, y + s(80), '친구가 없습니다.\n친구 추가 탭에서 닉네임으로 검색하세요.', {
        fontSize: sf(15),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#94A3B8', align: 'center',
        wordWrap: { width: b.width - s(40) }
      }).setOrigin(0.5));
      return;
    }

    const itemH = s(78);
    this._friends.slice(0, FriendSystem.MAX_FRIENDS).forEach((friend, idx) => {
      const iy = y + s(40) + idx * (itemH + s(6));
      this._renderFriendRow(friend, cx, iy, b.width - s(30), itemH);
    });
  }

  _renderFriendRow(friend, cx, cy, w, h) {
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.9);
    bg.setStrokeStyle(s(1), COLORS.primary, 0.4);
    this._add(bg);

    // 이름 + 레벨
    this._add(this.scene.add.text(cx - w / 2 + s(12), cy - s(14),
      friend.friend_name || '모험가', {
      fontSize: sf(15),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0, 0.5));

    this._add(this.scene.add.text(cx - w / 2 + s(12), cy + s(12),
      'Lv.' + (friend.friend_level || 1), {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#64748B'
    }).setOrigin(0, 0.5));

    // 대여 버튼
    this._addButton(cx + w / 2 - s(70), cy - s(14), s(60), s(28), '대여', COLORS.primary,
      () => this._onRentPressed(friend.friend_id));

    // 포인트 전송 버튼
    this._addButton(cx + w / 2 - s(70), cy + s(16), s(60), s(28), '전송', COLORS.success,
      () => this._onSendPressed(friend.friend_id));
  }

  async _onRentPressed(friendId) {
    if (this._isLoading) return;
    this._isLoading = true;
    const r = await FriendSystem.rentHero(friendId);
    this._isLoading = false;
    this._showFeedback(
      r.success
        ? '영웅 대여 완료! (오늘 ' + r.rentInfo.todayCount + '/' + r.rentInfo.limit + ')'
        : (r.error || '대여 실패'),
      r.success ? '#10B981' : '#EF4444'
    );
  }

  async _onSendPressed(friendId) {
    if (this._isLoading) return;
    // 데모용: 고정 5pt 전송 (실제 UI는 입력 필드 추가 가능)
    this._isLoading = true;
    const r = await FriendSystem.sendPoints(friendId, 5);
    this._isLoading = false;
    this._showFeedback(
      r.success
        ? '5pt 전송! (오늘 ' + r.dailySent + '/20pt)'
        : (r.error || '전송 실패'),
      r.success ? '#10B981' : '#EF4444'
    );
  }

  // ─────────────────────────────────────────
  // Tab 2: 친구 추가 (닉네임 검색)
  // ─────────────────────────────────────────

  _renderAddTab(contentTop) {
    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    this._add(this.scene.add.text(cx, y + s(10), '닉네임으로 친구를 검색하세요', {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8'
    }).setOrigin(0.5));

    // 검색 박스 (간이 입력 영역 — 클릭 시 토글은 시뮬레이션)
    const searchBox = this.scene.add.rectangle(cx, y + s(50), b.width - s(40), s(40), 0x0F172A, 1);
    searchBox.setStrokeStyle(s(1), COLORS.primary, 0.5);
    this._add(searchBox);

    const searchHint = this.scene.add.text(cx, y + s(50), '닉네임 입력 (2자 이상)', {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#64748B'
    }).setOrigin(0.5);
    this._add(searchHint);

    // 검색 버튼들 (시연용: 미리 정의된 쿼리 4종)
    const demoQueries = ['용사', '마법', '전사', '검사'];
    demoQueries.forEach((q, idx) => {
      const bx = cx - s(120) + (idx % 2) * s(120);
      const by = y + s(100) + Math.floor(idx / 2) * s(50);
      this._addButton(bx, by, s(110), s(36), '"' + q + '" 검색', COLORS.bgLight,
        () => this._doSearch(q));
    });

    // 결과 영역 (탭 전환 전까지 유지)
    if (this._searchResults && this._searchResults.length > 0) {
      const resultsTop = y + s(210);
      this._add(this.scene.add.text(cx, resultsTop, '검색 결과 ' + this._searchResults.length + '명', {
        fontSize: sf(13),
        fontFamily: '"Noto Sans KR", sans-serif',
        color: '#6366F1'
      }).setOrigin(0.5));
      const itemH = s(48);
      this._searchResults.slice(0, 5).forEach((u, idx) => {
        const iy = resultsTop + s(28) + idx * (itemH + s(4));
        this._renderSearchResultRow(u, cx, iy, b.width - s(40), itemH);
      });
    }
  }

  _renderSearchResultRow(user, cx, cy, w, h) {
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.85);
    bg.setStrokeStyle(s(1), 0x334155, 0.4);
    this._add(bg);

    this._add(this.scene.add.text(cx - w / 2 + s(12), cy,
      user.nickname + '  Lv.' + (user.level || 1), {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#F8FAFC'
    }).setOrigin(0, 0.5));

    this._addButton(cx + w / 2 - s(40), cy, s(70), s(30), '추가', COLORS.primary,
      () => this._doAdd(user.user_id, user.nickname, user.level));
  }

  async _doSearch(query) {
    if (this._isLoading) return;
    this._isLoading = true;
    const r = await FriendSystem.searchByNickname(query);
    this._isLoading = false;
    this._searchResults = r.results || [];
    this._showFeedback(
      r.success
        ? '"' + query + '" 검색: ' + this._searchResults.length + '명' + (r.offline ? ' (오프라인)' : '')
        : (r.error || '검색 실패'),
      r.success ? '#10B981' : '#EF4444'
    );
    this._loadAndRenderTab(TAB.ADD);
  }

  async _doAdd(friendId, friendName, friendLevel) {
    if (this._isLoading) return;
    this._isLoading = true;
    const r = await FriendSystem.addFriend(friendId, friendName, friendLevel);
    this._isLoading = false;
    this._showFeedback(
      r.success
        ? friendName + '님을 친구로 추가했습니다!' + (r.offline ? ' (오프라인)' : '')
        : (r.error || '추가 실패'),
      r.success ? '#10B981' : '#EF4444'
    );
    // 검색 결과에서 제거
    this._searchResults = this._searchResults.filter(function(u) { return u.user_id !== friendId; });
    this._loadAndRenderTab(TAB.ADD);
  }

  // ─────────────────────────────────────────
  // Tab 3: 포인트 상점
  // ─────────────────────────────────────────

  _renderShopTab(contentTop) {
    const b = this.contentBounds;
    const cx = b.centerX;
    let y = contentTop;

    const balance = FriendSystem.getPointBalance();
    this._add(this.scene.add.text(cx, y + s(10), '내 호감도: ' + balance.pointBalance + ' pt', {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#F59E0B'
    }).setOrigin(0.5));

    this._add(this.scene.add.text(cx, y + s(40),
      '친구에게 포인트를 받으면 호감도가 쌓입니다.\n상점에서 다양한 보상으로 교환하세요.', {
      fontSize: sf(12),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#94A3B8', align: 'center',
      wordWrap: { width: b.width - s(40) }
    }).setOrigin(0.5));

    // 수령 버튼
    this._addButton(cx, y + s(110), s(180), s(38), '호감도 수령', COLORS.success,
      () => this._onClaimPoints());

    // 상점 아이템
    const items = FriendSystem.getPointShopItems();
    const itemH = s(60);
    items.forEach((item, idx) => {
      const iy = y + s(170) + idx * (itemH + s(6));
      this._renderShopItemRow(item, cx, iy, b.width - s(30), itemH, balance.pointBalance);
    });
  }

  _renderShopItemRow(item, cx, cy, w, h, balance) {
    const canBuy = balance >= item.cost;
    const bg = this.scene.add.rectangle(cx, cy, w, h, COLORS.bgLight, 0.9);
    bg.setStrokeStyle(s(1), canBuy ? COLORS.primary : 0x334155, 0.5);
    this._add(bg);

    this._add(this.scene.add.text(cx - w / 2 + s(12), cy,
      item.label, {
      fontSize: sf(14),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: canBuy ? '#F8FAFC' : '#64748B'
    }).setOrigin(0, 0.5));

    this._addButton(cx + w / 2 - s(40), cy, s(70), s(36), item.cost + 'pt',
      canBuy ? COLORS.primary : 0x334155,
      () => this._onBuyItem(item.id));
  }

  async _onClaimPoints() {
    if (this._isLoading) return;
    this._isLoading = true;
    const r = await FriendSystem.receivePoints();
    this._isLoading = false;
    this._showFeedback(
      r.success
        ? r.receivedCount + '건 수령! +' + r.receivedAmount + 'pt (잔액: ' + r.pointBalance + 'pt)'
        : (r.error === 'No receivable points' ? '받을 호감도가 없습니다' : (r.error || '수령 실패')),
      r.success ? '#10B981' : '#94A3B8'
    );
    if (r.success) this._loadAndRenderTab(TAB.SHOP);
  }

  _onBuyItem(itemId) {
    const r = FriendSystem.buyPointShopItem(itemId);
    this._showFeedback(
      r.success ? '구매 완료! (잔액: ' + r.pointBalance + 'pt)' : (r.error || '구매 실패'),
      r.success ? '#10B981' : '#EF4444'
    );
    if (r.success) this._loadAndRenderTab(TAB.SHOP);
  }
}

export default FriendsPopup;
