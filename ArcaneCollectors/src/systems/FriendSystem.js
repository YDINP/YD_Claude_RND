/**
 * FriendSystem - FRIEND-01/02 친구 시스템
 *
 * 기능:
 *   - 친구 추가/삭제/조회 (최대 50명)
 *   - 닉네임 검색 (Supabase → 오프라인 폴백)
 *   - 영웅 대여 (일 3회, 날짜 리셋)
 *   - 호감도 포인트 송수신 (일 20pt 한도, 이중수령 방지)
 *   - 포인트 상점 5종 (골드/보석/SR티켓/경험치물약/장비조각)
 *
 * 패턴: Singleton static (RaidSystem/GuildSystem 동일)
 *       Supabase 우선 → 실패 시 localStorage 폴백
 */

import { SaveManager } from './SaveManager.js';
import { supabase, isOnline } from '../api/supabaseClient.js';
import GameLogger from '../utils/GameLogger.js';

const STORAGE_KEY = 'arcane_collectors_friend_state';
const MAX_FRIENDS = 50;
const DAILY_RENT_LIMIT = 3;
const DAILY_POINT_LIMIT = 20;

// 포인트 상점 5종 (id, label, cost(친구pt), reward {재화키, 수량})
const POINT_SHOP_ITEMS = [
  { id: 'shop_gold',          label: '골드 5,000',          cost: 5,  reward: { gold: 5000 } },
  { id: 'shop_gems',          label: '보석 50',              cost: 10, reward: { gems: 50 } },
  { id: 'shop_sr_ticket',     label: 'SR 티켓 1장',          cost: 8,  reward: { srTicket: 1 } },
  { id: 'shop_exp_potion',    label: '경험치 물약 3개',       cost: 6,  reward: { expPotion: 3 } },
  { id: 'shop_equip_fragment',label: '장비 조각 20개',       cost: 12, reward: { equipmentFragment: 20 } }
];

function _dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export class FriendSystem {
  static MAX_FRIENDS = MAX_FRIENDS;
  static DAILY_RENT_LIMIT = DAILY_RENT_LIMIT;
  static DAILY_POINT_LIMIT = DAILY_POINT_LIMIT;
  static POINT_SHOP_ITEMS = POINT_SHOP_ITEMS;

  // ─────────────────────────────────────────
  // localStorage 캐시
  // ─────────────────────────────────────────

  static _loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return FriendSystem._defaultState();
      const parsed = JSON.parse(raw);
      // 누락 필드 보정
      if (!parsed.friends) parsed.friends = [];
      if (!parsed.daily) parsed.daily = { rent: 0, pointsSent: 0, date: _dayKey() };
      if (!parsed.inbox) parsed.inbox = [];
      if (!parsed.pointBalance) parsed.pointBalance = 0;
      // 날짜가 바뀌면 일일 카운터 리셋
      if (parsed.daily.date !== _dayKey()) {
        parsed.daily = { rent: 0, pointsSent: 0, date: _dayKey() };
      }
      return parsed;
    } catch (e) {
      return FriendSystem._defaultState();
    }
  }

  static _defaultState() {
    return {
      friends: [],
      daily: { rent: 0, pointsSent: 0, date: _dayKey() },
      inbox: [],
      pointBalance: 0
    };
  }

  static _saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { GameLogger.warn('[FriendSystem] state save failed'); }
  }

  static _resetIfNewDay(state) {
    const today = _dayKey();
    if (state.daily.date !== today) {
      state.daily = { rent: 0, pointsSent: 0, date: today };
    }
    return state;
  }

  // ─────────────────────────────────────────
  // 친구 추가/삭제/조회
  // ─────────────────────────────────────────

  /**
   * 친구 추가 (owner_id → friendId)
   * Supabase: friends 테이블 insert
   * 오프라인: localStorage 캐시만 갱신
   */
  static async addFriend(friendId, friendName = '모험가', friendLevel = 1) {
    if (!friendId) return { success: false, error: 'Invalid friend ID' };
    const userId = SaveManager._userId;
    if (friendId === userId) return { success: false, error: 'Cannot add yourself' };

    const state = FriendSystem._loadState();
    FriendSystem._resetIfNewDay(state);
    if (state.friends.length >= MAX_FRIENDS) {
      return { success: false, error: 'Friend list is full (max ' + MAX_FRIENDS + ')' };
    }
    if (state.friends.some(function(f) { return f.friend_id === friendId; })) {
      return { success: false, error: 'Already a friend' };
    }

    const friendRow = {
      friend_id: friendId,
      friend_name: friendName,
      friend_level: friendLevel,
      added_at: new Date().toISOString()
    };

    // 오프라인/Supabase 미설정: 로컬만
    if (!isOnline() || !supabase) {
      state.friends.push(friendRow);
      FriendSystem._saveState(state);
      return { success: true, friend: friendRow, offline: true };
    }

    // 온라인: friends 테이블 insert 시도
    try {
      const res = await supabase.from('friends').insert({
        owner_id: userId,
        friend_id: friendId,
        friend_name: friendName,
        friend_level: friendLevel
      });
      if (res.error) {
        if (res.error.code === '23505') return { success: false, error: 'Already a friend' };
        // 실패 시에도 로컬에는 추가 (오프라인 폴백)
        state.friends.push(friendRow);
        FriendSystem._saveState(state);
        return { success: true, friend: friendRow, offline: true, serverError: res.error.message };
      }
      state.friends.push(friendRow);
      FriendSystem._saveState(state);
      return { success: true, friend: friendRow };
    } catch (err) {
      state.friends.push(friendRow);
      FriendSystem._saveState(state);
      return { success: true, friend: friendRow, offline: true, serverError: err.message };
    }
  }

  /**
   * 친구 삭제
   */
  static async removeFriend(friendId) {
    if (!friendId) return { success: false, error: 'Invalid friend ID' };
    const state = FriendSystem._loadState();
    const idx = state.friends.findIndex(function(f) { return f.friend_id === friendId; });
    if (idx === -1) return { success: false, error: 'Friend not found' };

    state.friends.splice(idx, 1);
    FriendSystem._saveState(state);

    if (isOnline() && supabase) {
      const userId = SaveManager._userId;
      try {
        await supabase.from('friends').delete()
          .eq('owner_id', userId).eq('friend_id', friendId);
      } catch (err) {
        GameLogger.warn('[FriendSystem] removeFriend sync failed: ' + err.message);
      }
    }
    return { success: true };
  }

  /**
   * 친구 목록 조회 (최대 50명)
   * Supabase 우선, 실패 시 localStorage 캐시 사용
   */
  static async getFriends() {
    const state = FriendSystem._loadState();
    if (!isOnline() || !supabase) {
      return { success: true, friends: state.friends.slice(0, MAX_FRIENDS), offline: true };
    }
    const userId = SaveManager._userId;
    try {
      const res = await supabase.from('friends')
        .select('friend_id, friend_name, friend_level, added_at')
        .eq('owner_id', userId)
        .order('added_at', { ascending: false })
        .limit(MAX_FRIENDS);
      if (res.error) {
        return { success: true, friends: state.friends.slice(0, MAX_FRIENDS), offline: true };
      }
      const friends = (res.data || []).map(function(r) {
        return {
          friend_id: r.friend_id,
          friend_name: r.friend_name,
          friend_level: r.friend_level,
          added_at: r.added_at
        };
      });
      // Supabase 결과로 캐시 갱신
      state.friends = friends;
      FriendSystem._saveState(state);
      return { success: true, friends };
    } catch (err) {
      return { success: true, friends: state.friends.slice(0, MAX_FRIENDS), offline: true };
    }
  }

  // ─────────────────────────────────────────
  // 닉네임 검색
  // ─────────────────────────────────────────

  /**
   * 닉네임 부분일치 검색 (Supabase → 오프라인 폴백)
   * 오프라인 폴백: players 사전 정의된 닉네임 풀에서 검색 (테스트/시연용)
   */
  static async searchByNickname(nickname) {
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return { success: false, error: 'Empty nickname', results: [] };
    }
    const q = nickname.trim();

    if (!isOnline() || !supabase) {
      return { success: true, results: FriendSystem._offlineSearch(q), offline: true };
    }

    try {
      const res = await supabase.from('users')
        .select('id, name, level')
        .ilike('name', '%' + q + '%')
        .limit(20);
      if (res.error) {
        return { success: true, results: FriendSystem._offlineSearch(q), offline: true };
      }
      const results = (res.data || []).map(function(u) {
        return { user_id: u.id, nickname: u.name, level: u.level || 1 };
      });
      return { success: true, results };
    } catch (err) {
      return { success: true, results: FriendSystem._offlineSearch(q), offline: true };
    }
  }

  /**
   * 오프라인 닉네임 검색 풀 (테스트/시연용)
   * localStorage 'arcane_collectors_friend_offline_pool' 에서 로드
   */
  static _offlineSearch(query) {
    try {
      const raw = localStorage.getItem('arcane_collectors_friend_offline_pool');
      const pool = raw ? JSON.parse(raw) : [];
      const q = query.toLowerCase();
      return pool.filter(function(u) {
        return u.nickname && u.nickname.toLowerCase().indexOf(q) !== -1;
      }).slice(0, 20);
    } catch (e) {
      return [];
    }
  }

  // ─────────────────────────────────────────
  // 영웅 대여 (일 3회, 날짜 리셋)
  // ─────────────────────────────────────────

  /**
   * 친구의 영웅을 대여 (일 3회 제한, 날짜별 리셋)
   * 반환: { success, rentInfo: { todayCount, remainingRents, expiresAt } }
   */
  static async rentHero(friendId) {
    if (!friendId) return { success: false, error: 'Invalid friend ID' };
    const state = FriendSystem._loadState();
    FriendSystem._resetIfNewDay(state);

    const isFriend = state.friends.some(function(f) { return f.friend_id === friendId; });
    if (!isFriend) return { success: false, error: 'Not in your friend list' };

    if (state.daily.rent >= DAILY_RENT_LIMIT) {
      return {
        success: false,
        error: 'Daily rent limit reached (' + DAILY_RENT_LIMIT + '/day)',
        rentInfo: {
          todayCount: state.daily.rent,
          remainingRents: 0,
          limit: DAILY_RENT_LIMIT
        }
      };
    }

    state.daily.rent += 1;
    FriendSystem._saveState(state);

    // Supabase 동기화 (best-effort)
    if (isOnline() && supabase) {
      const userId = SaveManager._userId;
      try {
        await supabase.from('friend_rent_log').insert({
          owner_id: userId, friend_id: friendId, day_key: state.daily.date
        });
      } catch (err) {
        GameLogger.warn('[FriendSystem] rentHero sync failed: ' + err.message);
      }
    }

    return {
      success: true,
      rentInfo: {
        friendId: friendId,
        todayCount: state.daily.rent,
        remainingRents: DAILY_RENT_LIMIT - state.daily.rent,
        limit: DAILY_RENT_LIMIT,
        date: state.daily.date
      }
    };
  }

  /**
   * 오늘의 대여 횟수 조회
   */
  static getDailyRentCount() {
    const state = FriendSystem._loadState();
    FriendSystem._resetIfNewDay(state);
    FriendSystem._saveState(state);
    return {
      todayCount: state.daily.rent,
      remainingRents: Math.max(0, DAILY_RENT_LIMIT - state.daily.rent),
      limit: DAILY_RENT_LIMIT,
      date: state.daily.date
    };
  }

  // ─────────────────────────────────────────
  // 호감도 포인트 송수신 (일 20pt 한도, 이중수령 방지)
  // ─────────────────────────────────────────

  /**
   * 친구에게 호감도 포인트 전송 (1~20pt, 일일 한도 20pt)
   */
  static async sendPoints(friendId, amount) {
    const parsedAmount = parseInt(amount, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return { success: false, error: 'Invalid amount (1-20)' };
    }
    if (parsedAmount > DAILY_POINT_LIMIT) {
      return { success: false, error: 'Exceeds daily limit (' + DAILY_POINT_LIMIT + 'pt)' };
    }
    if (!friendId) return { success: false, error: 'Invalid friend ID' };
    const userId = SaveManager._userId;
    if (friendId === userId) return { success: false, error: 'Cannot send to yourself' };

    const state = FriendSystem._loadState();
    FriendSystem._resetIfNewDay(state);

    const isFriend = state.friends.some(function(f) { return f.friend_id === friendId; });
    if (!isFriend) return { success: false, error: 'Not in your friend list' };

    if (state.daily.pointsSent + parsedAmount > DAILY_POINT_LIMIT) {
      return {
        success: false,
        error: 'Daily send limit exceeded (sent: ' + state.daily.pointsSent + '/' + DAILY_POINT_LIMIT + 'pt)',
        dailySent: state.daily.pointsSent
      };
    }

    // 같은 친구에게 같은 날 두 번 보낼 수 없음 (이중수령 방지 차원)
    const dayKey = state.daily.date;
    const alreadySentKey = state.daily.sentTo || {};
    if (alreadySentKey[friendId + ':' + dayKey]) {
      return { success: false, error: 'Already sent today to this friend' };
    }

    state.daily.pointsSent += parsedAmount;
    state.daily.sentTo = alreadySentKey;
    state.daily.sentTo[friendId + ':' + dayKey] = true;
    FriendSystem._saveState(state);

    // 수신자 inbox 기록 (오프라인에서도 사용 가능하도록)
    state.inbox.push({
      from: userId,
      amount: parsedAmount,
      dayKey: dayKey,
      sentAt: new Date().toISOString(),
      received: false
    });
    FriendSystem._saveState(state);

    // Supabase 동기화
    if (isOnline() && supabase) {
      try {
        const res = await supabase.from('friend_points').insert({
          sender_id: userId,
          receiver_id: friendId,
          day_key: dayKey,
          amount: parsedAmount
        });
        if (res.error) {
          if (res.error.code === '23505') {
            // 서버측 이중 송신 감지
            return { success: false, error: 'Already sent today to this friend' };
          }
          GameLogger.warn('[FriendSystem] sendPoints sync failed: ' + res.error.message);
        }
      } catch (err) {
        GameLogger.warn('[FriendSystem] sendPoints sync error: ' + err.message);
      }
    }

    return {
      success: true,
      sent: parsedAmount,
      dailySent: state.daily.pointsSent,
      remainingSend: DAILY_POINT_LIMIT - state.daily.pointsSent,
      date: dayKey
    };
  }

  /**
   * 호감도 포인트 수령 (자신에게 온 inbox를 받아 pointBalance에 적립)
   * 이중수령 방지: inbox 항목의 received 플래그 + friend_points.received_at
   */
  static async receivePoints(pointLogId = null) {
    const userId = SaveManager._userId;
    const state = FriendSystem._loadState();

    let inbox = state.inbox.slice();
    if (isOnline() && supabase) {
      try {
        const res = await supabase.from('friend_points')
          .select('id, sender_id, amount, day_key, sent_at, received_at')
          .eq('receiver_id', userId)
          .is('received_at', null);
        if (!res.error && res.data) {
          // 서버 inbox로 병합
          const serverIds = new Set(res.data.map(function(r) { return r.id; }));
          const localReceived = state.inbox.filter(function(x) { return x.received; });
          inbox = res.data.map(function(r) {
            return {
              id: r.id,
              from: r.sender_id,
              amount: r.amount,
              dayKey: r.day_key,
              sentAt: r.sent_at,
              received: !!r.received_at
            };
          }).concat(localReceived);
        }
      } catch (err) {
        GameLogger.warn('[FriendSystem] receivePoints query failed: ' + err.message);
      }
    }

    const receivable = inbox.filter(function(x) { return !x.received; });
    if (receivable.length === 0) {
      return { success: false, error: 'No receivable points', pointBalance: state.pointBalance };
    }

    let totalReceived = 0;
    receivable.forEach(function(item) {
      totalReceived += item.amount;
      item.received = true;
      item.receivedAt = new Date().toISOString();
    });

    state.pointBalance += totalReceived;
    state.inbox = inbox;
    FriendSystem._saveState(state);

    // Supabase 수령 마킹
    if (isOnline() && supabase) {
      try {
        const ids = receivable.filter(function(x) { return x.id; }).map(function(x) { return x.id; });
        if (ids.length) {
          await supabase.from('friend_points').update({ received_at: new Date().toISOString() })
            .in('id', ids);
        }
      } catch (err) {
        GameLogger.warn('[FriendSystem] receivePoints mark failed: ' + err.message);
      }
    }

    return {
      success: true,
      receivedCount: receivable.length,
      receivedAmount: totalReceived,
      pointBalance: state.pointBalance
    };
  }

  /**
   * 현재 포인트 잔액 조회
   */
  static getPointBalance() {
    const state = FriendSystem._loadState();
    return {
      pointBalance: state.pointBalance,
      dailySent: state.daily.pointsSent,
      dailySendLimit: DAILY_POINT_LIMIT,
      remainingSend: Math.max(0, DAILY_POINT_LIMIT - state.daily.pointsSent)
    };
  }

  // ─────────────────────────────────────────
  // 포인트 상점
  // ─────────────────────────────────────────

  static getPointShopItems() {
    return POINT_SHOP_ITEMS.map(function(item) {
      return Object.assign({}, item);
    });
  }

  /**
   * 포인트 상점 아이템 구매
   * localStorage의 SaveManager 자원에 reward 반영
   */
  static buyPointShopItem(itemId) {
    const item = POINT_SHOP_ITEMS.find(function(x) { return x.id === itemId; });
    if (!item) return { success: false, error: 'Unknown item' };

    const state = FriendSystem._loadState();
    if (state.pointBalance < item.cost) {
      return {
        success: false,
        error: 'Not enough points (have: ' + state.pointBalance + ', need: ' + item.cost + ')',
        pointBalance: state.pointBalance
      };
    }

    state.pointBalance -= item.cost;
    FriendSystem._saveState(state);

    // SaveManager 자원에 반영
    try {
      const saveData = SaveManager.load();
      if (saveData.player) {
        const r = item.reward;
        saveData.player.gold = (saveData.player.gold || 0) + (r.gold || 0);
        saveData.player.gems = (saveData.player.gems || 0) + (r.gems || 0);
        saveData.player.srTicket = (saveData.player.srTicket || 0) + (r.srTicket || 0);
        saveData.player.expPotion = (saveData.player.expPotion || 0) + (r.expPotion || 0);
        saveData.player.equipmentFragment = (saveData.player.equipmentFragment || 0) + (r.equipmentFragment || 0);
        SaveManager.save(saveData);
      }
    } catch (e) {
      GameLogger.warn('[FriendSystem] buyPointShopItem apply failed: ' + e.message);
    }

    return {
      success: true,
      itemId: itemId,
      cost: item.cost,
      reward: item.reward,
      pointBalance: state.pointBalance
    };
  }

  // ─────────────────────────────────────────
  // 디버그/테스트 유틸
  // ─────────────────────────────────────────

  static _resetAll() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch (e) {}
  }
}

export const friendSystem = FriendSystem;
export default FriendSystem;
