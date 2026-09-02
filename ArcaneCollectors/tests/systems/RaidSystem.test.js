/**
 * RaidSystem.test.js
 * Unit tests for RaidSystem -- RAID-01/02 Weekly Raid System
 * 주차 순환 / 데미지 누적 / 보상 구간 / 이중 수령 방지 / 오프라인 폴백
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =====================================================
// Mock: SaveManager
// =====================================================
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    _userId: 'test-user-001',
    load: vi.fn(() => ({ player: { name: 'TestHero', gold: 1000, gems: 100 } })),
    save: vi.fn()
  }
}));

// =====================================================
// Mock: supabaseClient
// =====================================================
export const mockFrom = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
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
const STORAGE_KEY = 'arcane_collectors_raid_progress';
const localStorageMock = (() => {
  let store = {};
  return {
    _store: store,
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// =====================================================
// Import after mocks
// =====================================================
import { RaidSystem } from '../../src/systems/RaidSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { isOnline } from '../../src/api/supabaseClient.js';

// 테스트 기준일: 2026-08-25(화). 이번 주 월요일 = 2026-08-24
const TUE_NOON = '2026-08-25T12:00:00Z';

// 진행도 주입 헬퍼
function seedProgress(bossEntries, weekKeyOverride = null) {
  const weekly = RaidSystem.getWeeklyRaid();
  const progress = {
    weekKey: weekKeyOverride || weekly.weekKey,
    bosses: bossEntries || {}
  };
  localStorageMock._store[STORAGE_KEY] = JSON.stringify(progress);
  return progress;
}

function clearProgressSeed() {
  delete localStorageMock._store[STORAGE_KEY];
}

function thresholdDamage(bossId, pct) {
  return Math.ceil(RaidSystem.getBossMaxHp(bossId) * pct / 100);
}

// =====================================================
// Tests
// =====================================================
describe('RaidSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOnline.mockImplementation(() => true);
    clearProgressSeed();
    mockFrom.select.mockImplementation(() => mockFrom);
    mockFrom.eq.mockImplementation(() => mockFrom);
    mockFrom.single.mockResolvedValue({ data: null, error: null });
    mockFrom.upsert.mockResolvedValue({ data: null, error: null });
    SaveManager.load.mockClear();
    SaveManager.save.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------
  // 데이터 스키마 (RAID-01)
  // -----------------------------------------------
  describe('raids.json 데이터 스키마', () => {
    it('주간 보스 5종이 로드된다', () => {
      const bosses = RaidSystem.getAllBosses();
      expect(bosses.length).toBe(5);
    });

    it('보스 ID 5종이 모두 존재한다', () => {
      const ids = RaidSystem.getAllBosses().map(b => b.id);
      expect(ids).toEqual(expect.arrayContaining([
        'raid_nidhogg', 'raid_yamata_no_orochi', 'raid_typhon', 'raid_fenrir', 'raid_izanami'
      ]));
    });

    it('각 보스는 필수 필드를 가진다', () => {
      RaidSystem.getAllBosses().forEach(boss => {
        expect(boss.id).toBeTruthy();
        expect(boss.name).toBeTruthy();
        expect(boss.cultId).toBeTruthy();
        expect(['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'])
          .toContain(boss.weakMood);
        expect(boss.baseHp).toBeGreaterThan(0);
        expect(boss.weeklyResetDay).toBe('monday');
        expect(typeof boss.enemyId).toBe('string');
      });
    });

    it('보상은 4~5단계 구간표이며 필드가 유효하다', () => {
      RaidSystem.getAllBosses().forEach(boss => {
        expect(boss.rewards.length).toBeGreaterThanOrEqual(4);
        expect(boss.rewards.length).toBeLessThanOrEqual(5);
        let prevPct = -1;
        boss.rewards.forEach(r => {
          expect(r.tier).toBeGreaterThan(0);
          expect(r.rank).toBeTruthy();
          expect(r.minDamagePct).toBeGreaterThan(prevPct);
          prevPct = r.minDamagePct;
          expect(r.gold).toBeGreaterThan(0);
          expect(r.gems).toBeGreaterThan(0);
          expect(r.equipmentFragment).toBeGreaterThan(0);
          expect(typeof r.ssrTicket).toBe('number');
        });
      });
    });

    it('getBossMaxHp는 백만 단위 스케일을 확장한다', () => {
      const boss = RaidSystem.getBoss('raid_nidhogg');
      expect(RaidSystem.getBossMaxHp('raid_nidhogg')).toBe(boss.baseHp * 1000000);
    });

    it('존재하지 않는 보스 조회 시 null 반환', () => {
      expect(RaidSystem.getBoss('raid_not_exist')).toBeNull();
    });
  });

  // -----------------------------------------------
  // getWeeklyRaid — 주차 순환 로직
  // -----------------------------------------------
  describe('getWeeklyRaid() 주차 순환', () => {
    it('유효한 활성 보스를 반환한다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TUE_NOON));
      const weekly = RaidSystem.getWeeklyRaid();
      expect(weekly.success).toBe(true);
      expect(RaidSystem.getBoss(weekly.boss.id)).not.toBeNull();
    });

    it('같은 주 내에서는 항상 동일한 보스를 반환한다 (화→목)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TUE_NOON));
      const a = RaidSystem.getWeeklyRaid();
      vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
      const b = RaidSystem.getWeeklyRaid();
      expect(a.boss.id).toBe(b.boss.id);
      expect(a.weekKey).toBe(b.weekKey);
    });

    it('다음 주에는 다른 보스가 활성화된다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TUE_NOON));
      const thisWeek = RaidSystem.getWeeklyRaid();
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      const nextWeek = RaidSystem.getWeeklyRaid();
      expect(nextWeek.boss.id).not.toBe(thisWeek.boss.id);
    });

    it('5주 연속 순환 시 5종 보스가 모두 한 번씩 활성화된다', () => {
      const dates = [
        '2026-08-25T12:00:00Z', '2026-09-01T12:00:00Z', '2026-09-08T12:00:00Z',
        '2026-09-15T12:00:00Z', '2026-09-22T12:00:00Z'
      ];
      const seen = new Set(dates.map(d => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(d));
        return RaidSystem.getWeeklyRaid().boss.id;
      }));
      expect(seen.size).toBe(5);
    });

    it('weekKey는 해당 주 월요일의 YYYY-MM-DD 형식이다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TUE_NOON));
      expect(RaidSystem.getWeeklyRaid().weekKey).toBe('2026-08-24');
      vi.setSystemTime(new Date('2026-08-30T12:00:00Z')); // 일요일
      expect(RaidSystem.getWeeklyRaid().weekKey).toBe('2026-08-24');
    });

    it('월요일이 넘어가면 weekKey와 보스가 바뀐다 (일→월)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));
      const before = RaidSystem.getWeeklyRaid();
      vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
      const after = RaidSystem.getWeeklyRaid();
      expect(before.weekKey).toBe('2026-08-24');
      expect(after.weekKey).toBe('2026-08-31');
      expect(after.boss.id).not.toBe(before.boss.id);
    });

    it('명시적 now 파라미터로도 조회 가능하다', () => {
      const weekly = RaidSystem.getWeeklyRaid(new Date(TUE_NOON));
      expect(weekly.weekKey).toBe('2026-08-24');
    });
  });

  // -----------------------------------------------
  // enterRaid
  // -----------------------------------------------
  describe('enterRaid()', () => {
    it('존재하지 않는 보스 입장은 실패한다', async () => {
      const r = await RaidSystem.enterRaid('raid_ghost');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/unknown/i);
    });

    it('이번 주 활성 보스가 아니면 실패하고 활성 보스를 알려준다', async () => {
      const weekly = RaidSystem.getWeeklyRaid(new Date(TUE_NOON));
      const other = RaidSystem.getAllBosses().find(b => b.id !== weekly.boss.id);
      const r = await RaidSystem.enterRaid(other.id, new Date(TUE_NOON));
      expect(r.success).toBe(false);
      expect(r.activeBossId).toBe(weekly.boss.id);
    });

    it('이번 주 보스 입장은 성공하고 주차 정보를 반환한다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      clearProgressSeed();
      const r = await RaidSystem.enterRaid(weekly.boss.id);
      expect(r.success).toBe(true);
      expect(r.weekKey).toBe(weekly.weekKey);
      expect(r.myDamage).toBe(0);
      expect(r.maxHp).toBe(RaidSystem.getBossMaxHp(weekly.boss.id));
      expect(r.boss.weakMood).toBeTruthy();
    });
  });

  // -----------------------------------------------
  // recordDamage — 데미지 누적
  // -----------------------------------------------
  describe('recordDamage()', () => {
    it('음수 데미지는 거부된다', async () => {
      const r = await RaidSystem.recordDamage('raid_nidhogg', -100);
      expect(r.success).toBe(false);
    });

    it('0 데미지는 거부된다', async () => {
      const r = await RaidSystem.recordDamage('raid_nidhogg', 0);
      expect(r.success).toBe(false);
    });

    it('NaN 데미지는 거부된다', async () => {
      const r = await RaidSystem.recordDamage('raid_nidhogg', NaN);
      expect(r.success).toBe(false);
    });

    it('알 수 없는 보스는 거부된다', async () => {
      const r = await RaidSystem.recordDamage('raid_ghost', 100);
      expect(r.success).toBe(false);
    });

    it('오프라인 시 localStorage에 누적된다', async () => {
      isOnline.mockReturnValue(false);
      clearProgressSeed();
      const weekly = RaidSystem.getWeeklyRaid(new Date());
      const r = await RaidSystem.recordDamage(weekly.boss.id, 10000);
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.totalDamage).toBe(10000);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
      expect(stored.bosses[weekly.boss.id].damage).toBe(10000);
    });

    it('연속 호출 시 데미지가 합산된다', async () => {
      isOnline.mockReturnValue(false);
      clearProgressSeed();
      const weekly = RaidSystem.getWeeklyRaid(new Date());
      await RaidSystem.recordDamage(weekly.boss.id, 5000);
      const r2 = await RaidSystem.recordDamage(weekly.boss.id, 7000);
      expect(r2.totalDamage).toBe(12000);
    });

    it('온라인 시 Supabase raid_damage에 upsert한다', async () => {
      mockFrom.single.mockResolvedValueOnce({ data: { damage: 500 }, error: null });
      const r = await RaidSystem.recordDamage('raid_nidhogg', 1500);
      expect(r.success).toBe(true);
      expect(r.offline).toBeUndefined();
      expect(mockFrom.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ boss_id: 'raid_nidhogg', damage: 2000 }),
        expect.objectContaining({ onConflict: 'user_id,boss_id,week_key' })
      );
    });

    it('Supabase 실패 시 오프라인 폴백으로 성공 처리된다', async () => {
      mockFrom.single.mockResolvedValue({ data: null, error: { message: 'db error' } });
      mockFrom.upsert.mockRejectedValue(new Error('network down'));
      clearProgressSeed();
      const weekly = RaidSystem.getWeeklyRaid(new Date());
      const r = await RaidSystem.recordDamage(weekly.boss.id, 3000);
      expect(r.success).toBe(true);
      expect(r.offline).toBe(true);
      expect(r.totalDamage).toBe(3000);
    });

    it('약점 무드 공격은 배율(1.5x)이 적용된다', async () => {
      isOnline.mockReturnValue(false);
      clearProgressSeed();
      const r = await RaidSystem.recordDamage('raid_nidhogg', 1000, { mood: 'brave' });
      expect(r.applied).toBe(1500);
      expect(r.totalDamage).toBe(1500);
      expect(r.weakness).toBe(true);
    });

    it('비약점 무드 공격은 배율이 적용되지 않는다', async () => {
      isOnline.mockReturnValue(false);
      clearProgressSeed();
      const r = await RaidSystem.recordDamage('raid_nidhogg', 1000, { mood: 'calm' });
      expect(r.applied).toBe(1000);
      expect(r.weakness).toBe(false);
    });
  });

  // -----------------------------------------------
  // 기여도 구간 계산
  // -----------------------------------------------
  describe('기여도 구간 계산', () => {
    it('데미지가 없으면 구간 판정에 실패한다(null)', () => {
      const info = RaidSystem.getContributionInfo('raid_izanami', 0);
      expect(info.tierIndex).toBeNull();
      expect(info.nextThresholdPct).toBe(0.05);
    });

    it('1구간 임계값 경계에서 정확히 판정한다', () => {
      const dmg = thresholdDamage('raid_fenrir', 0.05);
      expect(RaidSystem.getContributionInfo('raid_fenrir', dmg - 1).tierIndex).toBeNull();
      expect(RaidSystem.getContributionInfo('raid_fenrir', dmg).tierIndex).toBe(1);
    });

    it('중간 구간에서 올바른 구간을 반환한다', () => {
      const dmg = thresholdDamage('raid_fenrir', 0.7); // 3구간(0.5%) 초과, 4구간(1.0%) 미만
      const info = RaidSystem.getContributionInfo('raid_fenrir', dmg);
      expect(info.tierIndex).toBe(3);
      expect(info.tierRank).toBe('공헌');
    });

    it('최고 구간 도달 시 다음 임계값은 null이다', () => {
      const dmg = thresholdDamage('raid_fenrir', 5.0);
      const info = RaidSystem.getContributionInfo('raid_fenrir', dmg);
      expect(info.tierIndex).toBe(5);
      expect(info.nextThresholdPct).toBeNull();
    });

    it('누적 데미지 기반 판정도 동일하게 동작한다', async () => {
      isOnline.mockReturnValue(false);
      clearProgressSeed();
      const dmg = thresholdDamage('raid_yamata_no_orochi', 1.2);
      await RaidSystem.recordDamage('raid_yamata_no_orochi', dmg);
      const info = RaidSystem.getContributionInfo('raid_yamata_no_orochi', null);
      expect(info.tierIndex).toBe(4);
    });
  });

  // -----------------------------------------------
  // claimRewards — 보상 수령 / 이중 수령 방지
  // -----------------------------------------------
  describe('claimRewards()', () => {
    function sumRewards(boss, tiers) {
      return boss.rewards.filter(r => tiers.includes(r.tier)).reduce((acc, r) => ({
        gold: acc.gold + r.gold,
        gems: acc.gems + r.gems,
        equipmentFragment: acc.equipmentFragment + r.equipmentFragment,
        ssrTicket: acc.ssrTicket + r.ssrTicket
      }), { gold: 0, gems: 0, equipmentFragment: 0, ssrTicket: 0 });
    }

    it('존재하지 않는 보스는 실패한다', async () => {
      const r = await RaidSystem.claimRewards('raid_ghost');
      expect(r.success).toBe(false);
    });

    it('데미지 기록이 없으면 실패한다', async () => {
      clearProgressSeed();
      const weekly = RaidSystem.getWeeklyRaid(new Date());
      const r = await RaidSystem.claimRewards(weekly.boss.id);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/no claimable/i);
    });

    it('구간 미달이면 실패한다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      seedProgress({ [weekly.boss.id]: { damage: 10, claimedTiers: [] } });
      const r = await RaidSystem.claimRewards(weekly.boss.id);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/no claimable/i);
    });

    it('도달한 누적 구간의 보상을 한 번에 수령한다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      const boss = weekly.boss;
      const dmg = thresholdDamage(boss.id, 0.8); // 1~3구간 도달
      seedProgress({ [boss.id]: { damage: dmg, claimedTiers: [] } });
      const expected = sumRewards(boss, [1, 2, 3]);

      const r = await RaidSystem.claimRewards(boss.id);
      expect(r.success).toBe(true);
      expect(r.claimedTiers).toEqual([1, 2, 3]);
      expect(r.rewards).toEqual(expected);
    });

    it('수령 시 SaveManager.save로 재화가 반영된다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      const boss = weekly.boss;
      seedProgress({ [boss.id]: { damage: thresholdDamage(boss.id, 0.1), claimedTiers: [] } });

      const r = await RaidSystem.claimRewards(boss.id);
      expect(r.success).toBe(true);
      expect(SaveManager.load).toHaveBeenCalled();
      expect(SaveManager.save).toHaveBeenCalled();
      const saved = SaveManager.save.mock.calls[0][0];
      expect(saved.player.gold).toBe(1000 + r.rewards.gold);
      expect(saved.player.gems).toBe(100 + r.rewards.gems);
    });

    it('이중 수령이 방지된다 (재호출 시 실패)', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      const boss = weekly.boss;
      const dmg = thresholdDamage(boss.id, 0.8);
      seedProgress({ [boss.id]: { damage: dmg, claimedTiers: [] } });

      const first = await RaidSystem.claimRewards(boss.id);
      expect(first.success).toBe(true);

      const second = await RaidSystem.claimRewards(boss.id);
      expect(second.success).toBe(false);
      expect(second.error).toMatch(/no claimable/i);
      expect(second.claimedTiers).toEqual([1, 2, 3]);
    });

    it('수령 이력이 localStorage에 저장된다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      const boss = weekly.boss;
      seedProgress({ [boss.id]: { damage: thresholdDamage(boss.id, 0.3), claimedTiers: [] } });

      await RaidSystem.claimRewards(boss.id);
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
      expect(stored.bosses[boss.id].claimedTiers).toEqual([1, 2]);
    });

    it('온라인 수령은 raid_rewards_claimed에 동기화된다', async () => {
      const weekly = RaidSystem.getWeeklyRaid();
      const boss = weekly.boss;
      seedProgress({ [boss.id]: { damage: thresholdDamage(boss.id, 0.1), claimedTiers: [] } });

      await RaidSystem.claimRewards(boss.id);
      expect(mockFrom.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ boss_id: boss.id, tier: 1, week_key: weekly.weekKey })
        ]),
        expect.objectContaining({ onConflict: 'user_id,boss_id,week_key,tier' })
      );
    });
  });

  // -----------------------------------------------
  // resetWeekly — 주간 리셋
  // -----------------------------------------------
  describe('resetWeekly()', () => {
    it('같은 주 진행도는 유지된다', () => {
      const weekly = RaidSystem.getWeeklyRaid();
      seedProgress({
        [weekly.boss.id]: { damage: 9999, claimedTiers: [1] }
      });
      const r = RaidSystem.resetWeekly();
      expect(r.success).toBe(true);
      expect(r.reset).toBe(false);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
      expect(stored.bosses[weekly.boss.id].damage).toBe(9999);
    });

    it('지난 주 진행도는 초기화된다', () => {
      const now = new Date();
      const oldWeekKey = RaidSystem.getWeekKey(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const currentWeekKey = RaidSystem.getWeekKey(now);
      seedProgress({ raid_fenrir: { damage: 55555, claimedTiers: [1, 2] } }, oldWeekKey);

      const r = RaidSystem.resetWeekly();
      expect(r.reset).toBe(true);
      expect(r.previousWeekKey).toBe(oldWeekKey);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY));
      expect(stored.weekKey).toBe(currentWeekKey);
      expect(stored.bosses).toEqual({});
    });

    it('일주일 경과 후 리셋 플래그가 설정된다 (fake time)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(TUE_NOON));
      seedProgress({ raid_typhon: { damage: 12345, claimedTiers: [] } });

      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      const r = RaidSystem.resetWeekly();
      expect(r.reset).toBe(true);
    });

    it('리셋 후 진행도 조회 시 빈 상태로 시작한다', async () => {
      const now = new Date();
      const oldWeekKey = RaidSystem.getWeekKey(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      seedProgress({ raid_typhon: { damage: 12345, claimedTiers: [] } }, oldWeekKey);
      RaidSystem.resetWeekly(now);

      const status = RaidSystem.getRaidStatus(RaidSystem.getWeeklyRaid().boss.id);
      expect(status.myDamage).toBe(0);
      expect(status.claimedTiers).toEqual([]);
    });
  });

  // -----------------------------------------------
  // getRaidStatus / getBossVisual
  // -----------------------------------------------
  describe('getRaidStatus() / getBossVisual()', () => {
    it('상태 조회는 HP 비율과 구간 정보를 반환한다', () => {
      const weekly = RaidSystem.getWeeklyRaid();
      seedProgress({ [weekly.boss.id]: { damage: weekly.maxHp * 0.001, claimedTiers: [] } });

      const status = RaidSystem.getRaidStatus(weekly.boss.id);
      expect(status.success).toBe(true);
      expect(status.isActive).toBe(true);
      expect(status.remainingRatio).toBeCloseTo(0.999, 2);
      expect(status.damagePct).toBeCloseTo(0.1, 3);
      expect(status.tierRank).toBe('참전');
    });

    it('visual 폴백: enemies.json에 등록된 보스는 데이터를 반환한다', () => {
      expect(RaidSystem.getBossVisual('raid_yamata_no_orochi')).toMatchObject({ id: 'enemy_yamata' });
      expect(RaidSystem.getBossVisual('raid_izanami')).toMatchObject({ id: 'enemy_izanami' });
    });

    it('visual 폴백: 미등록 보스는 null을 반환한다 (안전 폴백)', () => {
      expect(RaidSystem.getBossVisual('raid_nidhogg')).toBeNull();
      expect(RaidSystem.getBossVisual('raid_ghost')).toBeNull();
    });
  });
});
