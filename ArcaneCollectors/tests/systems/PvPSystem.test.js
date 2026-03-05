/**
 * PvPSystem.test.js
 * Unit tests for PvPSystem — GP-1 PvP/랭킹 시스템
 * 24 tests total
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =====================================================
// Mock: BattleSystem
// =====================================================
vi.mock('../../src/systems/BattleSystem.js', () => {
  class MockBattleUnit {
    constructor(data, level = 1) {
      this.id = data.id;
      this.name = data.name || data.id;
      this.mood = data.mood || 'neutral';
      this.rarity = data.rarity || 'N';
      this.data = data;
      this.level = level;
      this.maxHp = (data.stats?.hp || 1000) + (data.growth?.hp || 100) * level;
      this.currentHp = this.maxHp;
      this.atk = (data.stats?.atk || 100) + (data.growth?.atk || 10) * level;
      this.def = (data.stats?.def || 50) + (data.growth?.def || 5) * level;
      this.spd = (data.stats?.spd || 100) + (data.growth?.spd || 2) * level;
      this.critRate = data.critRate || 0.05;
      this.critDmg = data.critDmg || 1.5;
      this.skillGauge = 0;
      this.maxSkillGauge = 100;
      this.isAlive = true;
      this.isEnemy = false;
      this.skills = data.skills || [
        { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
      ];
    }
    getPower() {
      return Math.floor(this.maxHp / 10 + this.atk + this.def + this.spd);
    }
    takeDamage(amount) {
      const actual = Math.max(0, amount - this.def * 0.1);
      this.currentHp = Math.max(0, this.currentHp - actual);
      if (this.currentHp <= 0) this.isAlive = false;
      return { actualDamage: actual, isDead: !this.isAlive };
    }
  }

  class MockBattleSystem {
    constructor(allies, enemies) {
      this.allies = allies;
      this.enemies = enemies;
      this.isFinished = false;
      this.result = null;
      this.maxTurns = 20;
      this.battleLog = [];
      this._turn = 0;
    }
    initialize() { return []; }
    processTurn() {
      this._turn++;
      // 5턴 후 공격자 승리 시뮬레이션
      if (this._turn >= 5) {
        this.enemies.forEach(e => { e.isAlive = false; e.currentHp = 0; });
        this.result = 'victory';
        this.isFinished = true;
        return { finished: true, result: 'victory' };
      }
      this.battleLog.push(`턴 ${this._turn}: 전투 중`);
      return { finished: false };
    }
  }

  return {
    BattleUnit: MockBattleUnit,
    BattleSystem: MockBattleSystem,
    BattleState: { IDLE: 'idle', RUNNING: 'running' }
  };
});

// =====================================================
// Mock: SaveManager
// =====================================================
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    _userId: 'test-user-001',
    load: vi.fn(() => ({
      player: { name: '테스트용사' },
      parties: [['char_1', 'char_2']],
      characters: [
        {
          id: 'char_1', name: '전사A', level: 10, mood: 'brave', rarity: 'SR',
          stats: { hp: 2000, atk: 200, def: 100, spd: 120 },
          growth: { hp: 100, atk: 10, def: 5, spd: 2 },
          skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }]
        },
        {
          id: 'char_2', name: '마법사B', level: 8, mood: 'mystic', rarity: 'R',
          stats: { hp: 1500, atk: 250, def: 60, spd: 110 },
          growth: { hp: 80, atk: 15, def: 3, spd: 3 },
          skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }]
        }
      ]
    })),
    save: vi.fn(),
    updateHighestDamage: vi.fn()
  }
}));

// =====================================================
// Mock: supabaseClient
// =====================================================
const mockSupabaseFrom = vi.fn();
const mockFrom = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  single: vi.fn().mockResolvedValue({ data: null, error: null })
};

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: { from: vi.fn(() => mockFrom) },
  isSupabaseConfigured: true,
  isOnline: vi.fn(() => true)
}));

// =====================================================
// Mock: GameLogger
// =====================================================
vi.mock('../../src/utils/GameLogger.js', () => ({
  default: { log: vi.fn(), warn: vi.fn() }
}));

// =====================================================
// localStorage Mock
// =====================================================
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn(i => Object.keys(store)[i] || null)
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// =====================================================
// Import after mocks
// =====================================================
import { PvPSystem } from '../../src/systems/PvPSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { isOnline } from '../../src/api/supabaseClient.js';

// =====================================================
// Tests
// =====================================================
describe('PvPSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFrom.limit.mockResolvedValue({ data: [], error: null });
    mockFrom.single.mockResolvedValue({ data: null, error: null });
    mockFrom.insert.mockResolvedValue({ data: null, error: null });
    mockFrom.upsert.mockResolvedValue({ data: null, error: null });
    isOnline.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────
  // simulateBattle 단위 테스트
  // ─────────────────────────────────────────
  describe('simulateBattle()', () => {
    const makeParty = (count = 2) => Array.from({ length: count }, (_, i) => ({
      id: `char_${i}`,
      name: `캐릭터${i}`,
      level: 10,
      mood: 'brave',
      rarity: 'SR',
      stats: { hp: 2000, atk: 200, def: 100, spd: 120 },
      growth: { hp: 100, atk: 10, def: 5, spd: 2 },
      skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }]
    }));

    it('정상적인 두 파티로 전투 시뮬레이션을 실행한다', () => {
      const result = PvPSystem.simulateBattle(makeParty(2), makeParty(2));
      expect(['win', 'lose', 'draw']).toContain(result.result);
      expect(typeof result.attackerPower).toBe('number');
      expect(typeof result.defenderPower).toBe('number');
      expect(Array.isArray(result.log)).toBe(true);
    });

    it('공격자 파티가 비어 있으면 lose를 반환한다', () => {
      const result = PvPSystem.simulateBattle([], makeParty(2));
      expect(result.result).toBe('lose');
    });

    it('방어자 파티가 비어 있으면 win을 반환한다', () => {
      const result = PvPSystem.simulateBattle(makeParty(2), []);
      expect(result.result).toBe('win');
    });

    it('양쪽이 모두 비어 있으면 lose를 반환한다', () => {
      const result = PvPSystem.simulateBattle([], []);
      expect(result.result).toBe('lose');
    });

    it('전투 결과에 attackerPower와 defenderPower가 포함된다', () => {
      const result = PvPSystem.simulateBattle(makeParty(1), makeParty(1));
      expect(result.attackerPower).toBeGreaterThan(0);
      expect(result.defenderPower).toBeGreaterThan(0);
    });

    it('로그 배열이 최대 10개를 초과하지 않는다', () => {
      const result = PvPSystem.simulateBattle(makeParty(4), makeParty(4));
      expect(result.log.length).toBeLessThanOrEqual(10);
    });

    it('공격자 파티 null 입력 시 lose 반환 (방어적 처리)', () => {
      const result = PvPSystem.simulateBattle(null, makeParty(2));
      expect(result.result).toBe('lose');
    });
  });

  // ─────────────────────────────────────────
  // savePartySnapshot 테스트
  // ─────────────────────────────────────────
  describe('savePartySnapshot()', () => {
    it('온라인 상태에서 스냅샷을 Supabase에 저장한다', async () => {
      const result = await PvPSystem.savePartySnapshot();
      expect(result.success).toBe(true);
    });

    it('파티가 비어있으면 실패를 반환한다', async () => {
      SaveManager.load.mockReturnValueOnce({
        player: { name: '테스트' },
        parties: [[]],
        characters: []
      });
      const result = await PvPSystem.savePartySnapshot();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('오프라인 상태에서 로컬에만 저장한다', async () => {
      isOnline.mockReturnValue(false);
      const result = await PvPSystem.savePartySnapshot();
      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);
    });

    it('Supabase 오류 발생 시 실패를 반환한다', async () => {
      mockFrom.upsert.mockResolvedValueOnce({ data: null, error: { message: 'DB 오류' } });
      const result = await PvPSystem.savePartySnapshot();
      expect(result.success).toBe(false);
      expect(result.error).toBe('DB 오류');
    });
  });

  // ─────────────────────────────────────────
  // findOpponents 테스트
  // ─────────────────────────────────────────
  describe('findOpponents()', () => {
    it('온라인 상태에서 상대 목록을 반환한다', async () => {
      const mockOpponents = [
        { user_id: 'opp_1', player_name: '상대A', combat_power: 3000, party_snapshot: [] }
      ];
      mockFrom.limit.mockResolvedValueOnce({ data: mockOpponents, error: null });
      const result = await PvPSystem.findOpponents();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.opponents)).toBe(true);
    });

    it('오프라인 상태에서 캐시된 상대를 반환한다', async () => {
      isOnline.mockReturnValue(false);
      localStorageMock.setItem(
        'arcane_collectors_pvp_cache',
        JSON.stringify({ opponents: [{ player_name: '캐시상대', combat_power: 2000 }] })
      );
      const result = await PvPSystem.findOpponents();
      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);
      expect(result.opponents.length).toBeGreaterThan(0);
    });

    it('Supabase 오류 시 빈 배열을 반환한다', async () => {
      mockFrom.limit.mockResolvedValueOnce({ data: null, error: { message: '연결 오류' } });
      const result = await PvPSystem.findOpponents();
      expect(result.success).toBe(false);
      expect(result.opponents).toEqual([]);
    });
  });

  // ─────────────────────────────────────────
  // executePvPBattle 테스트
  // ─────────────────────────────────────────
  describe('executePvPBattle()', () => {
    const mockOpponent = {
      user_id: 'opp_001',
      player_name: '상대방',
      combat_power: 2500,
      party_snapshot: [
        {
          id: 'enemy_1', name: '적전사', level: 8, mood: 'fierce', rarity: 'R',
          stats: { hp: 1800, atk: 180, def: 90, spd: 100 },
          growth: { hp: 90, atk: 9, def: 4, spd: 2 },
          skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }]
        }
      ]
    };

    it('전투 실행 후 result와 scoreChange를 반환한다', async () => {
      const result = await PvPSystem.executePvPBattle(mockOpponent);
      expect(result.success).toBe(true);
      expect(['win', 'lose', 'draw']).toContain(result.result);
      expect(typeof result.scoreChange).toBe('number');
      expect(typeof result.newScore).toBe('number');
    });

    it('승리 시 점수가 증가한다', async () => {
      // Mock: 공격자 항상 승리
      const { BattleSystem } = await import('../../src/systems/BattleSystem.js');
      const originalProcessTurn = BattleSystem.prototype?.processTurn;

      const result = await PvPSystem.executePvPBattle(mockOpponent);
      // MockBattleSystem은 5턴 후 victory 반환 → win
      expect(result.success).toBe(true);
      if (result.result === 'win') {
        expect(result.scoreChange).toBeGreaterThan(0);
      }
    });

    it('공격자 파티가 없으면 실패를 반환한다', async () => {
      SaveManager.load.mockReturnValueOnce({
        player: { name: '빈파티' },
        parties: [[]],
        characters: []
      });
      const result = await PvPSystem.executePvPBattle(mockOpponent);
      expect(result.success).toBe(false);
    });

    it('newScore는 음수가 되지 않는다', async () => {
      // 캐시 점수를 0으로 초기화
      localStorageMock.setItem('arcane_collectors_pvp_cache', JSON.stringify({ myScore: 10 }));
      const result = await PvPSystem.executePvPBattle(mockOpponent);
      expect(result.newScore).toBeGreaterThanOrEqual(0);
    });

    it('오프라인 상태에서도 전투 결과를 반환한다', async () => {
      isOnline.mockReturnValue(false);
      const result = await PvPSystem.executePvPBattle(mockOpponent);
      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);
    });
  });

  // ─────────────────────────────────────────
  // getLeaderboard 테스트
  // ─────────────────────────────────────────
  describe('getLeaderboard()', () => {
    it('온라인 상태에서 랭킹 목록을 반환한다', async () => {
      const mockRankings = [
        { user_id: 'user_1', player_name: '1위유저', score: 2500, wins: 50, losses: 10, draws: 5, win_streak: 5, rank_tier: 'diamond' },
        { user_id: 'user_2', player_name: '2위유저', score: 2300, wins: 40, losses: 15, draws: 3, win_streak: 2, rank_tier: 'platinum' }
      ];
      mockFrom.limit.mockResolvedValueOnce({ data: mockRankings, error: null });
      const result = await PvPSystem.getLeaderboard(20);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.rankings)).toBe(true);
    });

    it('랭킹에 rank 필드(1부터 시작)가 포함된다', async () => {
      mockFrom.limit.mockResolvedValueOnce({
        data: [
          { user_id: 'u1', player_name: 'A', score: 2000, wins: 10, losses: 2, draws: 0, win_streak: 3, rank_tier: 'gold' }
        ],
        error: null
      });
      const result = await PvPSystem.getLeaderboard(20);
      expect(result.rankings[0].rank).toBe(1);
    });

    it('오프라인 상태에서 캐시된 랭킹을 반환한다', async () => {
      isOnline.mockReturnValue(false);
      localStorageMock.setItem(
        'arcane_collectors_pvp_cache',
        JSON.stringify({ leaderboard: [{ rank: 1, player_name: '캐시1위', score: 9999 }] })
      );
      const result = await PvPSystem.getLeaderboard();
      expect(result.offline).toBe(true);
      expect(result.rankings.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────
  // getMyRecord 테스트
  // ─────────────────────────────────────────
  describe('getMyRecord()', () => {
    it('온라인 상태에서 내 전적을 반환한다', async () => {
      mockFrom.single.mockResolvedValueOnce({
        data: { score: 1200, wins: 10, losses: 3, draws: 1, win_streak: 3, best_streak: 5, rank_tier: 'gold' },
        error: null
      });
      mockFrom.limit.mockResolvedValueOnce({ data: [], error: null });
      const result = await PvPSystem.getMyRecord();
      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();
    });

    it('오프라인 상태에서 로컬 캐시 기반 전적을 반환한다', async () => {
      isOnline.mockReturnValue(false);
      localStorageMock.setItem('arcane_collectors_pvp_cache', JSON.stringify({ myScore: 1500 }));
      const result = await PvPSystem.getMyRecord();
      expect(result.offline).toBe(true);
      expect(result.record.score).toBe(1500);
    });
  });

  // ─────────────────────────────────────────
  // 캐시 유틸리티 테스트
  // ─────────────────────────────────────────
  describe('_loadCache / _saveCache', () => {
    it('캐시 저장 후 로드하면 동일한 데이터를 반환한다', () => {
      const testData = { myScore: 1234, battles: [{ result: 'win' }] };
      PvPSystem._saveCache(testData);
      const loaded = PvPSystem._loadCache();
      expect(loaded.myScore).toBe(1234);
      expect(loaded.battles[0].result).toBe('win');
    });

    it('캐시가 없으면 빈 객체를 반환한다', () => {
      const loaded = PvPSystem._loadCache();
      expect(loaded).toEqual({});
    });
  });
});
