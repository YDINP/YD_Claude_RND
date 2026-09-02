/**
 * FriendSystem.test.js
 * Unit tests for FriendSystem -- FRIEND-01/02 Friend System
 *
 * 커버리지:
 *   - 친구 추가/삭제/조회 (50명 한도)
 *   - 닉네임 검색 (온라인/오프라인 폴백)
 *   - 영웅 대여 (일 3회, 날짜 리셋, vi.setSystemTime)
 *   - 호감도 포인트 송수신 (일 20pt 한도, 이중수령 방지)
 *   - 포인트 상점 5종
 *   - 일일 카운터 자정 리셋
 *
 * ≥22 tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =====================================================
// Mock: SaveManager
// =====================================================
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    _userId: 'test-user-001',
    load: vi.fn(() => ({
      player: {
        name: 'TestHero',
        gold: 10000,
        gems: 200,
        srTicket: 0,
        expPotion: 0,
        equipmentFragment: 0
      }
    })),
    save: vi.fn()
  }
}));

// =====================================================
// Mock: supabaseClient
// =====================================================
const mockFrom = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: null, error: null })
};

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: { from: vi.fn(() => mockFrom) },
  isOnline: vi.fn(() => true)
}));

// =====================================================
// Mock: GameLogger
// =====================================================
vi.mock('../../src/utils/GameLogger.js', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

// =====================================================
// localStorage Mock
// =====================================================
const STORAGE_KEY = 'arcane_collectors_friend_state';
const POOL_KEY = 'arcane_collectors_friend_offline_pool';
const localStorageMock = (() => {
  let store = {};
  return {
    _store: store,
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn(i => Object.keys(store)[i] || null)
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// store에 직접 키 주입 (vi.clearAllMocks 후에도 setItem이 store에 기록)
function putRaw(key, value) {
  localStorageMock._store[key] = String(value);
}

// =====================================================
// Import after mocks
// =====================================================
import { FriendSystem } from '../../src/systems/FriendSystem.js';
import { isOnline } from '../../src/api/supabaseClient.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

// =====================================================
// Helpers
// =====================================================
const DAY1 = '2026-08-25T10:00:00Z';
const DAY2 = '2026-08-26T10:00:00Z';

function seedOfflinePool(users) {
  putRaw(POOL_KEY, JSON.stringify(users));
}

function seedFriendState(state) {
  putRaw(STORAGE_KEY, JSON.stringify(state));
}

function getFriendState() {
  const raw = localStorageMock._store[STORAGE_KEY];
  return raw ? JSON.parse(raw) : null;
}

function clearAllStorage() {
  for (const k of Object.keys(localStorageMock._store)) {
    delete localStorageMock._store[k];
  }
}

// =====================================================
// Tests
// =====================================================
describe('FriendSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOnline.mockImplementation(() => true);
    // setItem/removeItem이 store에 직접 쓰도록 mockImplementation 재설정
    const liveStore = localStorageMock._store;
    localStorageMock.getItem.mockImplementation(key => liveStore[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { liveStore[key] = String(value); });
    localStorageMock.removeItem.mockImplementation(key => { delete liveStore[key]; });
    clearAllStorage();
    mockFrom.select.mockImplementation(() => mockFrom);
    mockFrom.insert.mockResolvedValue({ data: null, error: null });
    mockFrom.update.mockImplementation(() => mockFrom);
    mockFrom.delete.mockImplementation(() => mockFrom);
    mockFrom.eq.mockImplementation(() => mockFrom);
    mockFrom.neq.mockImplementation(() => mockFrom);
    mockFrom.is.mockImplementation(() => mockFrom);
    mockFrom.ilike.mockImplementation(() => mockFrom);
    mockFrom.in.mockImplementation(() => mockFrom);
    mockFrom.order.mockImplementation(() => mockFrom);
    mockFrom.single.mockResolvedValue({ data: null, error: null });
    mockFrom.limit.mockResolvedValue({ data: [], error: null });
    SaveManager.load.mockClear();
    SaveManager.save.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────
  // 상수
  // ─────────────────────────────────────────
  describe('상수/스키마', () => {
    it('MAX_FRIENDS = 50', () => {
      expect(FriendSystem.MAX_FRIENDS).toBe(50);
    });

    it('DAILY_RENT_LIMIT = 3', () => {
      expect(FriendSystem.DAILY_RENT_LIMIT).toBe(3);
    });

    it('DAILY_POINT_LIMIT = 20', () => {
      expect(FriendSystem.DAILY_POINT_LIMIT).toBe(20);
    });

    it('포인트 상점 5종 (골드/보석/SR티켓/경험치물약/장비조각)', () => {
      const items = FriendSystem.getPointShopItems();
      expect(items.length).toBe(5);
      const ids = items.map(i => i.id);
      expect(ids).toEqual(expect.arrayContaining([
        'shop_gold', 'shop_gems', 'shop_sr_ticket', 'shop_exp_potion', 'shop_equip_fragment'
      ]));
    });

    it('상점 아이템은 id/label/cost/reward 필드를 가진다', () => {
      FriendSystem.getPointShopItems().forEach(item => {
        expect(item.id).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.cost).toBeGreaterThan(0);
        expect(item.reward).toBeTruthy();
        expect(Object.keys(item.reward).length).toBeGreaterThan(0);
      });
    });
  });

  // ─────────────────────────────────────────
  // 친구 추가/삭제/조회
  // ─────────────────────────────────────────
  describe('친구 추가/삭제/조회', () => {
    it('친구 추가 성공 (오프라인 폴백)', async () => {
      isOnline.mockReturnValue(false);
      const r = await FriendSystem.addFriend('user-002', 'Alice', 5);
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.friend.friend_id).toBe('user-002');
      expect(r.friend.friend_name).toBe('Alice');
    });

    it('자기 자신은 추가할 수 없다', async () => {
      const r = await FriendSystem.addFriend('test-user-001', 'Me', 10);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/yourself/i);
    });

    it('잘못된 friendId는 거부된다', async () => {
      const r = await FriendSystem.addFriend(null);
      expect(r.success).toBe(false);
    });

    it('50명 한도 초과 시 추가 실패', async () => {
      const friends = [];
      for (let i = 0; i < 50; i++) {
        friends.push({
          friend_id: 'user-' + (100 + i),
          friend_name: 'F' + i,
          friend_level: 1
        });
      }
      seedFriendState({
        friends,
        daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [],
        pointBalance: 0
      });
      const r = await FriendSystem.addFriend('user-999', 'Limit', 1);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/full/i);
    });

    it('중복 친구 추가는 실패한다', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.addFriend('user-002', 'Alice', 5);
      const r2 = await FriendSystem.addFriend('user-002', 'Alice', 5);
      expect(r2.success).toBe(false);
      expect(r2.error).toMatch(/already/i);
    });

    it('온라인 추가 시 Supabase friends.insert를 호출한다', async () => {
      mockFrom.insert.mockResolvedValueOnce({ data: null, error: null });
      const r = await FriendSystem.addFriend('user-002', 'Bob', 7);
      expect(r.success).toBe(true);
      expect(mockFrom.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_id: 'test-user-001',
          friend_id: 'user-002',
          friend_name: 'Bob',
          friend_level: 7
        })
      );
    });

    it('Supabase 23505 (중복) 시 실패를 반환한다', async () => {
      mockFrom.insert.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate' }
      });
      const r = await FriendSystem.addFriend('user-002', 'Bob', 7);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/already/i);
    });

    it('친구 삭제 성공', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.addFriend('user-002', 'Alice', 5);
      const r = await FriendSystem.removeFriend('user-002');
      expect(r.success).toBe(true);
      const state = getFriendState();
      expect(state.friends.length).toBe(0);
    });

    it('없는 친구 삭제는 실패한다', async () => {
      const r = await FriendSystem.removeFriend('user-not-exist');
      expect(r.success).toBe(false);
    });

    it('getFriends는 최대 50명까지 반환한다', async () => {
      isOnline.mockReturnValue(false);
      for (let i = 0; i < 55; i++) {
        await FriendSystem.addFriend('user-' + i, 'Name' + i, i + 1);
      }
      const r = await FriendSystem.getFriends();
      expect(r.success).toBe(true);
      expect(r.friends.length).toBeLessThanOrEqual(50);
    });

    it('오프라인 getFriends는 localStorage 캐시에서 반환한다', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.addFriend('user-002', 'Alice', 5);
      const r = await FriendSystem.getFriends();
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.friends.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────
  // 닉네임 검색
  // ─────────────────────────────────────────
  describe('searchByNickname()', () => {
    it('빈 검색어는 거부된다', async () => {
      const r = await FriendSystem.searchByNickname('');
      expect(r.success).toBe(false);
    });

    it('온라인 검색은 users 테이블 ilike를 사용한다', async () => {
      mockFrom.limit.mockResolvedValueOnce({
        data: [
          { id: 'u1', name: '용사123', level: 12 },
          { id: 'u2', name: '용사대장', level: 30 }
        ],
        error: null
      });
      const r = await FriendSystem.searchByNickname('용사');
      expect(r.success).toBe(true);
      expect(r.offline).toBeUndefined();
      expect(mockFrom.ilike).toHaveBeenCalledWith('name', '%용사%');
      expect(r.results.length).toBe(2);
    });

    it('오프라인 폴백: 정의된 풀에서 부분일치 검색', async () => {
      isOnline.mockReturnValue(false);
      seedOfflinePool([
        { user_id: 'u1', nickname: '용사김', level: 5 },
        { user_id: 'u2', nickname: '마법사', level: 8 },
        { user_id: 'u3', nickname: '전사왕', level: 20 }
      ]);
      const r = await FriendSystem.searchByNickname('전사');
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.results.length).toBe(1);
      expect(r.results[0].nickname).toBe('전사왕');
    });

    it('Supabase 실패 시 오프라인 폴백으로 전환된다', async () => {
      mockFrom.limit.mockRejectedValueOnce(new Error('network'));
      seedOfflinePool([{ user_id: 'u1', nickname: '테스트', level: 1 }]);
      const r = await FriendSystem.searchByNickname('테스트');
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.results.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────
  // 영웅 대여 (일 3회, 날짜 리셋)
  // ─────────────────────────────────────────
  describe('rentHero()', () => {
    beforeEach(async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.addFriend('user-002', 'Alice', 5);
    });

    it('친구가 아닌 사용자는 대여 실패', async () => {
      const r = await FriendSystem.rentHero('user-not-friend');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/friend list/i);
    });

    it('대여 1~3회까지 성공', async () => {
      const r1 = await FriendSystem.rentHero('user-002');
      expect(r1.success).toBe(true);
      expect(r1.rentInfo.todayCount).toBe(1);

      const r2 = await FriendSystem.rentHero('user-002');
      expect(r2.rentInfo.todayCount).toBe(2);

      const r3 = await FriendSystem.rentHero('user-002');
      expect(r3.rentInfo.todayCount).toBe(3);
    });

    it('4회째 대여는 실패한다 (일 3회 한도)', async () => {
      await FriendSystem.rentHero('user-002');
      await FriendSystem.rentHero('user-002');
      await FriendSystem.rentHero('user-002');
      const r4 = await FriendSystem.rentHero('user-002');
      expect(r4.success).toBe(false);
      expect(r4.error).toMatch(/limit/i);
      expect(r4.rentInfo.remainingRents).toBe(0);
    });

    it('날짜가 바뀌면 카운터가 리셋된다 (vi.setSystemTime)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(DAY1));
      await FriendSystem.rentHero('user-002');
      await FriendSystem.rentHero('user-002');
      await FriendSystem.rentHero('user-002');
      const blocked = await FriendSystem.rentHero('user-002');
      expect(blocked.success).toBe(false);

      // 다음 날로 시간 이동
      vi.setSystemTime(new Date(DAY2));
      const r = await FriendSystem.rentHero('user-002');
      expect(r.success).toBe(true);
      expect(r.rentInfo.todayCount).toBe(1);
    });

    it('getDailyRentCount는 남은 횟수를 정확히 반환한다', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(DAY1));
      await FriendSystem.rentHero('user-002');
      const info = FriendSystem.getDailyRentCount();
      expect(info.todayCount).toBe(1);
      expect(info.remainingRents).toBe(2);
      expect(info.limit).toBe(3);
    });
  });

  // ─────────────────────────────────────────
  // 호감도 포인트 송수신
  // ─────────────────────────────────────────
  describe('sendPoints() / receivePoints()', () => {
    beforeEach(async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.addFriend('user-002', 'Alice', 5);
    });

    it('1~20pt 사이의 송신은 성공한다', async () => {
      const r = await FriendSystem.sendPoints('user-002', 10);
      expect(r.success).toBe(true);
      expect(r.sent).toBe(10);
      expect(r.dailySent).toBe(10);
    });

    it('20pt 초과 송신은 거부된다', async () => {
      const r = await FriendSystem.sendPoints('user-002', 25);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/limit/i);
    });

    it('음수/0pt 송신은 거부된다', async () => {
      const r0 = await FriendSystem.sendPoints('user-002', 0);
      expect(r0.success).toBe(false);
      const rNeg = await FriendSystem.sendPoints('user-002', -5);
      expect(rNeg.success).toBe(false);
    });

    it('자기 자신에게는 송신 불가', async () => {
      const r = await FriendSystem.sendPoints('test-user-001', 5);
      expect(r.success).toBe(false);
    });

    it('친구가 아닌 사용자에게 송신 불가', async () => {
      const r = await FriendSystem.sendPoints('user-xxx', 5);
      expect(r.success).toBe(false);
    });

    it('같은 날 일일 20pt 누적 한도를 넘으면 실패', async () => {
      await FriendSystem.sendPoints('user-002', 15);
      const r = await FriendSystem.sendPoints('user-002', 10);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/limit/i);
      expect(r.dailySent).toBe(15);
    });

    it('같은 친구에게 같은 날 두 번 송신 불가 (이중수령 방지)', async () => {
      const r1 = await FriendSystem.sendPoints('user-002', 5);
      expect(r1.success).toBe(true);
      const r2 = await FriendSystem.sendPoints('user-002', 5);
      expect(r2.success).toBe(false);
      expect(r2.error).toMatch(/already sent today/i);
    });

    it('날짜가 바뀌면 송신 한도가 리셋된다 (vi.setSystemTime)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(DAY1));
      await FriendSystem.sendPoints('user-002', 20);
      const blocked = await FriendSystem.sendPoints('user-003', 5);
      expect(blocked.success).toBe(false);

      vi.setSystemTime(new Date(DAY2));
      // 다른 친구에게는 송신 가능
      await FriendSystem.addFriend('user-003', 'Bob', 7);
      const r = await FriendSystem.sendPoints('user-003', 5);
      expect(r.success).toBe(true);
    });

    it('receivePoints는 미수령 inbox의 합산 금액을 잔액에 적립한다', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.sendPoints('user-002', 5);
      await FriendSystem.sendPoints('user-003', 8);
      await FriendSystem.addFriend('user-003', 'Bob', 5);
      // user-002 inbox는 1건이지만 receive는 자신의 inbox 기준
      const r = await FriendSystem.receivePoints();
      expect(r.success).toBe(true);
      expect(r.receivedCount).toBeGreaterThanOrEqual(1);
      expect(r.pointBalance).toBeGreaterThan(0);
    });

    it('receivePoints는 이중수령을 방지한다 (재호출 시 0)', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.sendPoints('user-002', 5);
      const r1 = await FriendSystem.receivePoints();
      expect(r1.success).toBe(true);
      const firstBalance = r1.pointBalance;

      const r2 = await FriendSystem.receivePoints();
      expect(r2.success).toBe(false);
      expect(r2.error).toMatch(/no receivable/i);
      // 잔액 변화 없음
      const finalBalance = FriendSystem.getPointBalance().pointBalance;
      expect(finalBalance).toBe(firstBalance);
    });

    it('getPointBalance는 잔액과 일일 송신량을 반환한다', async () => {
      isOnline.mockReturnValue(false);
      await FriendSystem.sendPoints('user-002', 5);
      const b = FriendSystem.getPointBalance();
      expect(b.pointBalance).toBeGreaterThanOrEqual(0);
      expect(b.dailySent).toBe(5);
      expect(b.dailySendLimit).toBe(20);
      expect(b.remainingSend).toBe(15);
    });
  });

  // ─────────────────────────────────────────
  // 포인트 상점
  // ─────────────────────────────────────────
  describe('buyPointShopItem()', () => {
    it('잔액 부족 시 구매 실패', () => {
      const r = FriendSystem.buyPointShopItem('shop_gold');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/not enough/i);
    });

    it('골드 아이템 구매 성공 시 SaveManager에 골드가 반영된다', () => {
      // pointBalance를 100으로 만들기 위해 inbox 직접 주입
      seedFriendState({
        friends: [],
        daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [],
        pointBalance: 100
      });

      const r = FriendSystem.buyPointShopItem('shop_gold');
      expect(r.success).toBe(true);
      expect(r.itemId).toBe('shop_gold');
      expect(r.cost).toBe(5);
      expect(r.pointBalance).toBe(95);

      expect(SaveManager.load).toHaveBeenCalled();
      expect(SaveManager.save).toHaveBeenCalled();
      const saved = SaveManager.save.mock.calls[0][0];
      expect(saved.player.gold).toBe(10000 + 5000);
    });

    it('보석 아이템 구매 시 gems가 증가한다', () => {
      seedFriendState({
        friends: [],
        daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [],
        pointBalance: 100
      });
      const r = FriendSystem.buyPointShopItem('shop_gems');
      expect(r.success).toBe(true);
      const saved = SaveManager.save.mock.calls[0][0];
      expect(saved.player.gems).toBe(200 + 50);
    });

    it('SR 티켓 구매 시 srTicket이 증가한다', () => {
      seedFriendState({
        friends: [],
        daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [],
        pointBalance: 100
      });
      const r = FriendSystem.buyPointShopItem('shop_sr_ticket');
      expect(r.success).toBe(true);
      const saved = SaveManager.save.mock.calls[0][0];
      expect(saved.player.srTicket).toBe(1);
    });

    it('장비조각 구매 시 equipmentFragment가 증가한다', () => {
      seedFriendState({
        friends: [],
        daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [],
        pointBalance: 100
      });
      const r = FriendSystem.buyPointShopItem('shop_equip_fragment');
      expect(r.success).toBe(true);
      const saved = SaveManager.save.mock.calls[0][0];
      expect(saved.player.equipmentFragment).toBe(20);
    });

    it('존재하지 않는 아이템은 실패한다', () => {
      seedFriendState({
        friends: [], daily: { rent: 0, pointsSent: 0, date: '2026-08-25' },
        inbox: [], pointBalance: 100
      });
      const r = FriendSystem.buyPointShopItem('shop_ghost');
      expect(r.success).toBe(false);
    });
  });
});
