/**
 * PvPSystem - 비동기 PvP 전투 및 리더보드 시스템 (GP-1)
 *
 * 기능:
 * - 플레이어 파티 스냅샷 저장 (Supabase pvp_snapshots)
 * - 비슷한 전투력 상대 매칭 (±30% 범위 쿼리)
 * - 비동기 자동전투 시뮬레이션 (BattleSystem 활용)
 * - 리더보드 점수 저장/조회 (Supabase pvp_leaderboard)
 * - 오프라인 폴백: localStorage pvp_cache
 *
 * Singleton export 패턴
 */

import { BattleUnit, BattleSystem } from './BattleSystem.js';
import { SaveManager } from './SaveManager.js';
import { supabase, isSupabaseConfigured, isOnline } from '../api/supabaseClient.js';
import GameLogger from '../utils/GameLogger.js';

// =====================================================
// 상수
// =====================================================

/** PvP 시즌 번호 (시즌 1부터 시작) */
const CURRENT_SEASON = 1;

/** 점수 변동 기준 */
const SCORE_CONFIG = {
  WIN_BASE: 30,       // 승리 기본 점수
  LOSE_BASE: -20,     // 패배 기본 점수
  DRAW_BASE: 5,       // 무승부 기본 점수
  INITIAL_SCORE: 1000 // 초기 점수
};

/** 랭크 티어 점수 기준 */
const RANK_TIERS = [
  { name: 'master',   minScore: 2000 },
  { name: 'diamond',  minScore: 1600 },
  { name: 'platinum', minScore: 1300 },
  { name: 'gold',     minScore: 1100 },
  { name: 'silver',   minScore: 900  },
  { name: 'bronze',   minScore: 0    }
];

/** localStorage 캐시 키 */
const PVP_CACHE_KEY = 'arcane_collectors_pvp_cache';

/** 매칭 전투력 오차 범위 (30%) */
const MATCHING_POWER_RANGE = 0.30;

/** 매칭 상대 최대 수 */
const MAX_OPPONENTS = 5;

/** 자동전투 최대 턴 수 (PvP용 단축) */
const PVP_MAX_TURNS = 20;

// =====================================================
// 헬퍼 함수
// =====================================================

/**
 * 캐릭터 데이터를 BattleUnit으로 변환
 * @param {Object} charData - 캐릭터 저장 데이터
 * @returns {BattleUnit}
 */
function createBattleUnitFromChar(charData) {
  const level = charData.level || 1;
  const unitData = {
    id: charData.id,
    name: charData.name || charData.id,
    mood: charData.mood || 'neutral',
    rarity: charData.rarity || 'N',
    class: charData.class || charData.role || 'warrior',
    role: charData.role || 'warrior',
    stats: charData.stats || { hp: 1000, atk: 100, def: 50, spd: 100 },
    growth: charData.growth || { hp: 100, atk: 10, def: 5, spd: 2 },
    skills: charData.skills || [
      { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
    ],
    critRate: charData.critRate || 0.05,
    critDmg: charData.critDmg || 1.5
  };
  return new BattleUnit(unitData, level);
}

/**
 * 파티 스냅샷 배열에서 전투력 합산 계산
 * @param {Array<Object>} party - 캐릭터 데이터 배열
 * @returns {number} 총 전투력
 */
function calcPartyPower(party) {
  if (!Array.isArray(party) || party.length === 0) return 0;
  return party.reduce((sum, char) => {
    const unit = createBattleUnitFromChar(char);
    return sum + unit.getPower();
  }, 0);
}

/**
 * 점수에 해당하는 랭크 티어 반환
 * @param {number} score
 * @returns {string}
 */
function calcRankTier(score) {
  for (const tier of RANK_TIERS) {
    if (score >= tier.minScore) return tier.name;
  }
  return 'bronze';
}

// =====================================================
// PvPSystem 클래스
// =====================================================

export class PvPSystem {
  /**
   * 현재 플레이어 파티 스냅샷을 Supabase에 저장
   * Supabase 비활성 시 localStorage에 캐시
   *
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async savePartySnapshot() {
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;

    // 현재 활성 파티(슬롯 0) 캐릭터 데이터 수집
    const activePartyIds = saveData.parties?.[0] || [];
    const partyCharacters = activePartyIds
      .map(id => saveData.characters?.find(c => c.id === id))
      .filter(Boolean);

    if (partyCharacters.length === 0) {
      return { success: false, error: '파티에 캐릭터가 없습니다' };
    }

    const combatPower = calcPartyPower(partyCharacters);
    const playerName = saveData.player?.name || '모험가';

    const snapshot = {
      party_snapshot: partyCharacters,
      combat_power: combatPower,
      player_name: playerName,
      updated_at: new Date().toISOString()
    };

    // 로컬 캐시 저장
    const cache = PvPSystem._loadCache();
    cache.mySnapshot = { ...snapshot, user_id: userId };
    PvPSystem._saveCache(cache);

    if (!isOnline() || !supabase) {
      GameLogger.log('PVP', '오프라인 — 스냅샷 로컬 저장', { combatPower });
      return { success: true, offline: true };
    }

    try {
      const { error } = await supabase
        .from('pvp_snapshots')
        .upsert({
          user_id: userId,
          player_name: playerName,
          party_snapshot: partyCharacters,
          combat_power: combatPower
        }, { onConflict: 'user_id' });

      if (error) {
        GameLogger.warn('PVP', '스냅샷 저장 실패', error);
        return { success: false, error: error.message };
      }

      GameLogger.log('PVP', '스냅샷 저장 완료', { combatPower, partySize: partyCharacters.length });
      return { success: true };
    } catch (err) {
      GameLogger.warn('PVP', '스냅샷 저장 예외', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * 비슷한 전투력의 상대 목록 조회 (매칭)
   * 오프라인 시 로컬 캐시 사용
   *
   * @returns {Promise<{success: boolean, opponents: Array, error?: string}>}
   */
  static async findOpponents() {
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;

    const activePartyIds = saveData.parties?.[0] || [];
    const partyCharacters = activePartyIds
      .map(id => saveData.characters?.find(c => c.id === id))
      .filter(Boolean);
    const myPower = calcPartyPower(partyCharacters);

    if (!isOnline() || !supabase) {
      GameLogger.log('PVP', '오프라인 — 캐시 상대 반환', { myPower });
      const cache = PvPSystem._loadCache();
      return { success: true, opponents: cache.opponents || [], offline: true };
    }

    try {
      const minPower = Math.floor(myPower * (1 - MATCHING_POWER_RANGE));
      const maxPower = Math.ceil(myPower * (1 + MATCHING_POWER_RANGE));

      const { data, error } = await supabase
        .from('pvp_snapshots')
        .select('user_id, player_name, party_snapshot, combat_power')
        .gte('combat_power', minPower)
        .lte('combat_power', maxPower)
        .neq('user_id', userId)
        .limit(MAX_OPPONENTS);

      if (error) {
        GameLogger.warn('PVP', '상대 조회 실패', error);
        return { success: false, opponents: [], error: error.message };
      }

      const opponents = data || [];

      // 캐시 업데이트
      const cache = PvPSystem._loadCache();
      cache.opponents = opponents;
      PvPSystem._saveCache(cache);

      GameLogger.log('PVP', '상대 조회 완료', { count: opponents.length, myPower });
      return { success: true, opponents };
    } catch (err) {
      GameLogger.warn('PVP', '상대 조회 예외', err);
      return { success: false, opponents: [], error: err.message };
    }
  }

  /**
   * 비동기 PvP 전투 시뮬레이션
   * BattleSystem을 사용하여 자동전투 결과 계산
   *
   * @param {Array<Object>} attackerParty - 공격자 파티 캐릭터 배열
   * @param {Array<Object>} defenderParty - 방어자 파티 캐릭터 배열
   * @returns {{result: 'win'|'lose'|'draw', log: Array<string>, attackerPower: number, defenderPower: number}}
   */
  static simulateBattle(attackerParty, defenderParty) {
    if (!Array.isArray(attackerParty) || attackerParty.length === 0) {
      return { result: 'lose', log: ['공격자 파티 없음'], attackerPower: 0, defenderPower: 0 };
    }
    if (!Array.isArray(defenderParty) || defenderParty.length === 0) {
      return { result: 'win', log: ['방어자 파티 없음'], attackerPower: 0, defenderPower: 0 };
    }

    const attackerUnits = attackerParty.map(c => createBattleUnitFromChar(c));
    const defenderUnits = defenderParty.map(c => {
      const unit = createBattleUnitFromChar(c);
      unit.isEnemy = true;
      return unit;
    });

    const attackerPower = attackerUnits.reduce((s, u) => s + u.getPower(), 0);
    const defenderPower = defenderUnits.reduce((s, u) => s + u.getPower(), 0);

    const battle = new BattleSystem(attackerUnits, defenderUnits);
    battle.maxTurns = PVP_MAX_TURNS;
    battle.initialize();

    const battleLog = [];
    let turnCount = 0;

    while (!battle.isFinished && turnCount < PVP_MAX_TURNS) {
      const turnResult = battle.processTurn();
      if (turnResult.finished) break;
      if (battle.battleLog.length > 0) {
        const lastLog = battle.battleLog[battle.battleLog.length - 1];
        if (lastLog) battleLog.push(lastLog);
      }
      turnCount++;
    }

    let result;
    if (battle.result === 'victory') {
      result = 'win';
    } else if (battle.result === 'defeat') {
      result = 'lose';
    } else {
      // 타임아웃: 남은 HP 비율 비교
      const attackerHpRatio = attackerUnits.reduce((s, u) => s + (u.isAlive ? u.currentHp / u.maxHp : 0), 0);
      const defenderHpRatio = defenderUnits.reduce((s, u) => s + (u.isAlive ? u.currentHp / u.maxHp : 0), 0);
      if (attackerHpRatio > defenderHpRatio + 0.1) result = 'win';
      else if (defenderHpRatio > attackerHpRatio + 0.1) result = 'lose';
      else result = 'draw';
    }

    return { result, log: battleLog.slice(-10), attackerPower, defenderPower };
  }

  /**
   * PvP 전투 실행 및 결과 저장
   * 공격 → 시뮬레이션 → 점수 업데이트 → 기록 저장
   *
   * @param {Object} opponent - findOpponents()가 반환한 상대 객체
   * @returns {Promise<{success: boolean, result: string, scoreChange: number, newScore: number, log: Array, error?: string}>}
   */
  static async executePvPBattle(opponent) {
    const saveData = SaveManager.load();
    const userId = SaveManager._userId;

    const activePartyIds = saveData.parties?.[0] || [];
    const attackerParty = activePartyIds
      .map(id => saveData.characters?.find(c => c.id === id))
      .filter(Boolean);

    if (attackerParty.length === 0) {
      return { success: false, error: '공격자 파티가 비어 있습니다' };
    }

    const defenderParty = opponent.party_snapshot || [];
    const playerName = saveData.player?.name || '모험가';

    // 자동전투 시뮬레이션
    const { result, log, attackerPower, defenderPower } = PvPSystem.simulateBattle(
      attackerParty,
      defenderParty
    );

    // 점수 변동 계산
    let scoreChange;
    if (result === 'win') scoreChange = SCORE_CONFIG.WIN_BASE;
    else if (result === 'lose') scoreChange = SCORE_CONFIG.LOSE_BASE;
    else scoreChange = SCORE_CONFIG.DRAW_BASE;

    // 로컬 캐시 업데이트
    const cache = PvPSystem._loadCache();
    const prevScore = cache.myScore || SCORE_CONFIG.INITIAL_SCORE;
    const newScore = Math.max(0, prevScore + scoreChange);
    cache.myScore = newScore;
    cache.battles = [
      { result, scoreChange, opponent: opponent.player_name, ts: Date.now() },
      ...(cache.battles || [])
    ].slice(0, 20); // 최근 20전 유지
    PvPSystem._saveCache(cache);

    GameLogger.log('PVP', '전투 결과', { result, scoreChange, newScore });

    if (!isOnline() || !supabase) {
      return { success: true, result, scoreChange, newScore, log, offline: true };
    }

    try {
      // pvp_battles 기록 삽입
      await supabase.from('pvp_battles').insert({
        attacker_id: userId,
        defender_id: opponent.user_id || null,
        attacker_name: playerName,
        defender_name: opponent.player_name || '???',
        attacker_power: attackerPower,
        defender_power: defenderPower,
        result,
        battle_log: log,
        attacker_score_change: scoreChange,
        defender_score_change: result === 'win' ? -10 : result === 'lose' ? 10 : 0
      });

      // 리더보드 점수 업데이트 (upsert)
      const rankTier = calcRankTier(newScore);
      const winDelta = result === 'win' ? 1 : 0;
      const loseDelta = result === 'lose' ? 1 : 0;
      const drawDelta = result === 'draw' ? 1 : 0;

      const { data: existing } = await supabase
        .from('pvp_leaderboard')
        .select('wins, losses, draws, win_streak, best_streak')
        .eq('user_id', userId)
        .eq('season', CURRENT_SEASON)
        .single();

      const prevWins = existing?.wins || 0;
      const prevLosses = existing?.losses || 0;
      const prevDraws = existing?.draws || 0;
      const prevStreak = result === 'win' ? (existing?.win_streak || 0) : 0;
      const newStreak = result === 'win' ? prevStreak + 1 : 0;
      const bestStreak = Math.max(existing?.best_streak || 0, newStreak);

      await supabase.from('pvp_leaderboard').upsert({
        user_id: userId,
        player_name: playerName,
        score: newScore,
        wins: prevWins + winDelta,
        losses: prevLosses + loseDelta,
        draws: prevDraws + drawDelta,
        win_streak: newStreak,
        best_streak: bestStreak,
        season: CURRENT_SEASON,
        rank_tier: rankTier
      }, { onConflict: 'user_id,season' });

      return { success: true, result, scoreChange, newScore, log };
    } catch (err) {
      GameLogger.warn('PVP', '결과 저장 예외', err);
      return { success: true, result, scoreChange, newScore, log, saveError: err.message };
    }
  }

  /**
   * 리더보드 상위 랭킹 조회
   *
   * @param {number} [limit=20] - 조회할 랭킹 수
   * @returns {Promise<{success: boolean, rankings: Array, myRank: number|null, error?: string}>}
   */
  static async getLeaderboard(limit = 20) {
    if (!isOnline() || !supabase) {
      const cache = PvPSystem._loadCache();
      return { success: true, rankings: cache.leaderboard || [], myRank: null, offline: true };
    }

    try {
      const userId = SaveManager._userId;

      const { data, error } = await supabase
        .from('pvp_leaderboard')
        .select('user_id, player_name, score, wins, losses, draws, win_streak, rank_tier')
        .eq('season', CURRENT_SEASON)
        .order('score', { ascending: false })
        .limit(limit);

      if (error) {
        GameLogger.warn('PVP', '리더보드 조회 실패', error);
        return { success: false, rankings: [], myRank: null, error: error.message };
      }

      const rankings = (data || []).map((row, idx) => ({ ...row, rank: idx + 1 }));
      const myRankEntry = rankings.find(r => r.user_id === userId);
      const myRank = myRankEntry ? myRankEntry.rank : null;

      // 캐시 업데이트
      const cache = PvPSystem._loadCache();
      cache.leaderboard = rankings;
      PvPSystem._saveCache(cache);

      GameLogger.log('PVP', '리더보드 조회 완료', { count: rankings.length, myRank });
      return { success: true, rankings, myRank };
    } catch (err) {
      GameLogger.warn('PVP', '리더보드 조회 예외', err);
      return { success: false, rankings: [], myRank: null, error: err.message };
    }
  }

  /**
   * 내 PvP 전적 조회
   *
   * @returns {Promise<{success: boolean, record: Object, recentBattles: Array, error?: string}>}
   */
  static async getMyRecord() {
    const userId = SaveManager._userId;
    const cache = PvPSystem._loadCache();
    const myScore = cache.myScore || SCORE_CONFIG.INITIAL_SCORE;
    const rankTier = calcRankTier(myScore);

    if (!isOnline() || !supabase) {
      return {
        success: true,
        record: { score: myScore, rank_tier: rankTier, wins: 0, losses: 0, draws: 0 },
        recentBattles: cache.battles || [],
        offline: true
      };
    }

    try {
      const [leaderboardRes, battlesRes] = await Promise.all([
        supabase
          .from('pvp_leaderboard')
          .select('score, wins, losses, draws, win_streak, best_streak, rank_tier')
          .eq('user_id', userId)
          .eq('season', CURRENT_SEASON)
          .single(),
        supabase
          .from('pvp_battles')
          .select('result, attacker_score_change, defender_name, created_at')
          .eq('attacker_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      const record = leaderboardRes.data || {
        score: myScore, rank_tier: rankTier, wins: 0, losses: 0, draws: 0
      };
      const recentBattles = battlesRes.data || [];

      return { success: true, record, recentBattles };
    } catch (err) {
      GameLogger.warn('PVP', '전적 조회 예외', err);
      return { success: false, record: {}, recentBattles: [], error: err.message };
    }
  }

  /**
   * localStorage PvP 캐시 로드
   * @private
   * @returns {Object}
   */
  static _loadCache() {
    try {
      const raw = localStorage.getItem(PVP_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * localStorage PvP 캐시 저장
   * @private
   * @param {Object} cache
   */
  static _saveCache(cache) {
    try {
      localStorage.setItem(PVP_CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
      GameLogger.warn('PVP', '캐시 저장 실패', err);
    }
  }
}

/** Singleton export (인스턴스 불필요, static 메서드만 사용) */
export const pvpSystem = PvPSystem;
export default PvPSystem;
