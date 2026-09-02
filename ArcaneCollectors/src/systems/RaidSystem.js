/**
 * RaidSystem - RAID-01/02 주간 레이드 시스템
 * Singleton static pattern (GuildSystem 스타일)
 * Supabase(raid_damage) 시도 → 실패/오프라인 시 localStorage 폴백
 */

import { SaveManager } from './SaveManager.js';
import { supabase, isOnline } from '../api/supabaseClient.js';
import raidsData from '../data/raids.json';
import enemiesData from '../data/enemies.json';
import GameLogger from '../utils/GameLogger.js';

const STORAGE_KEY = 'arcane_collectors_raid_progress';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_HP_UNIT = 1000000;

export class RaidSystem {
  static WEAKNESS_MULTIPLIER = raidsData.config.weaknessMultiplier || 1.5;

  // ─────────────────────────────────────────
  // 보스 데이터 조회
  // ─────────────────────────────────────────

  static getAllBosses() {
    return raidsData.bosses;
  }

  static getBoss(bossId) {
    return raidsData.bosses.find(function(b) { return b.id === bossId; }) || null;
  }

  static getBossMaxHp(bossId) {
    const boss = typeof bossId === 'string' ? RaidSystem.getBoss(bossId) : bossId;
    if (!boss) return 0;
    return boss.baseHp * BASE_HP_UNIT;
  }

  /**
   * enemies.json에서 보스 visual/battle 데이터 폴백 조회
   */
  static getBossVisual(bossId) {
    const boss = RaidSystem.getBoss(bossId);
    if (!boss || !boss.enemyId) return null;
    return (enemiesData.enemies || []).find(function(e) { return e.id === boss.enemyId; }) || null;
  }

  // ─────────────────────────────────────────
  // 주차 순환 로직
  // ─────────────────────────────────────────

  /**
   * 날짜가 속한 주의 월요일(UTC 자정) 반환
   */
  static _getMonday(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    return d;
  }

  static getWeekKey(now = new Date()) {
    return RaidSystem._getMonday(now).toISOString().slice(0, 10);
  }

  /**
   * 이번 주 활성 보스 반환 (주차 인덱스 해시로 5종 순환)
   * @returns {{success: boolean, boss: Object, weekKey: string, weekIndex: number, maxHp: number}}
   */
  static getWeeklyRaid(now = new Date()) {
    const monday = RaidSystem._getMonday(now);
    const weekIndex = Math.floor(monday.getTime() / WEEK_MS);
    const bosses = raidsData.bosses;
    if (!bosses.length) return { success: false, boss: null, error: 'No raid bosses' };
    const boss = bosses[((weekIndex % bosses.length) + bosses.length) % bosses.length];
    return {
      success: true,
      boss,
      weekKey: monday.toISOString().slice(0, 10),
      weekIndex,
      maxHp: boss.baseHp * BASE_HP_UNIT
    };
  }

  // ─────────────────────────────────────────
  // 진행도 저장 (localStorage)
  // ─────────────────────────────────────────

  static _loadProgress() {
    const weekly = RaidSystem.getWeeklyRaid();
    let progress = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      progress = raw ? JSON.parse(raw) : null;
    } catch (e) { progress = null; }
    if (!progress || progress.weekKey !== weekly.weekKey) {
      progress = { weekKey: weekly.weekKey, bosses: {} };
      RaidSystem._saveProgress(progress);
    }
    return progress;
  }

  static _saveProgress(progress) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
    catch (e) { GameLogger.warn('[RaidSystem] progress save failed'); }
  }

  static _getEntry(progress, bossId, create) {
    if (!progress.bosses[bossId]) {
      if (!create) return { damage: 0, claimedTiers: [] };
      progress.bosses[bossId] = { damage: 0, claimedTiers: [] };
    }
    return progress.bosses[bossId];
  }

  // ─────────────────────────────────────────
  // 입장 / 상태 조회
  // ─────────────────────────────────────────

  static async enterRaid(bossId, now = new Date()) {
    const boss = RaidSystem.getBoss(bossId);
    if (!boss) return { success: false, error: 'Unknown raid boss' };
    const weekly = RaidSystem.getWeeklyRaid(now);
    if (weekly.boss.id !== bossId) {
      return { success: false, error: 'Not this week\'s raid boss', activeBossId: weekly.boss.id };
    }
    RaidSystem.resetWeekly(now);
    const status = RaidSystem.getRaidStatus(bossId, now);
    return Object.assign({ success: true }, status);
  }

  static getRaidStatus(bossId, now = new Date()) {
    const boss = RaidSystem.getBoss(bossId);
    if (!boss) return { success: false, error: 'Unknown raid boss' };
    const weekly = RaidSystem.getWeeklyRaid(now);
    RaidSystem.resetWeekly(now);
    const progress = RaidSystem._loadProgress();
    const entry = RaidSystem._getEntry(progress, bossId, false);
    const maxHp = boss.baseHp * BASE_HP_UNIT;
    const damagePct = (entry.damage / maxHp) * 100;
    const tierInfo = RaidSystem._resolveTier(boss.rewards, damagePct);
    return {
      success: true,
      boss,
      weekKey: weekly.weekKey,
      isActive: weekly.boss.id === bossId,
      myDamage: entry.damage,
      maxHp,
      damagePct,
      remainingRatio: Math.max(0, 1 - entry.damage / maxHp),
      tierIndex: tierInfo ? tierInfo.tier : null,
      tierRank: tierInfo ? tierInfo.rank : null,
      nextThresholdPct: RaidSystem._nextThreshold(boss.rewards, damagePct),
      claimedTiers: entry.claimedTiers.slice(),
      rewards: boss.rewards
    };
  }

  // ─────────────────────────────────────────
  // 데미지 기록
  // ─────────────────────────────────────────

  /**
   * 데미지 누적. Supabase raid_damage upsert 시도 → 실패 시 localStorage 폴백.
   * options.mood 가 보스 약점 무드면 WEAKNESS_MULTIPLIER 적용.
   */
  static async recordDamage(bossId, damage, options = {}) {
    const amount = Math.floor(Number(damage));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Invalid damage amount' };
    }
    const boss = RaidSystem.getBoss(bossId);
    if (!boss) return { success: false, error: 'Unknown raid boss' };

    let applied = amount;
    if (options.mood && options.mood === boss.weakMood) {
      applied = Math.round(amount * RaidSystem.WEAKNESS_MULTIPLIER);
    }

    const weekly = RaidSystem.getWeeklyRaid();
    const userId = SaveManager._userId;

    // 오프라인/온라인 공통: localStorage 캐시에 누적
    const progress = RaidSystem._loadProgress();
    const entry = RaidSystem._getEntry(progress, bossId, true);
    entry.damage += applied;
    RaidSystem._saveProgress(progress);

    // Supabase 동기화 시도 (실패해도 로컬 성공 처리)
    if (isOnline() && supabase && userId) {
      try {
        const sel = await supabase.from('raid_damage').select('damage')
          .eq('user_id', userId).eq('boss_id', bossId).eq('week_key', weekly.weekKey).single();
        const current = (sel.data && sel.data.damage) ? Number(sel.data.damage) : 0;
        const upd = await supabase.from('raid_damage').upsert(
          { user_id: userId, boss_id: bossId, week_key: weekly.weekKey, damage: current + applied },
          { onConflict: 'user_id,boss_id,week_key' }
        );
        if (!upd.error) {
          return { success: true, totalDamage: entry.damage, serverDamage: current + applied, applied, weakness: applied !== amount };
        }
        GameLogger.warn('[RaidSystem] raid_damage sync failed: ' + upd.error.message);
      } catch (err) {
        GameLogger.warn('[RaidSystem] raid_damage sync error: ' + err.message);
      }
    }
    return { success: true, offline: true, totalDamage: entry.damage, applied, weakness: applied !== amount };
  }

  // ─────────────────────────────────────────
  // 기여도 구간 계산
  // ─────────────────────────────────────────

  static _sortedRewards(rewards) {
    return rewards.slice().sort(function(a, b) { return a.minDamagePct - b.minDamagePct; });
  }

  static _resolveTier(rewards, damagePct) {
    let result = null;
    RaidSystem._sortedRewards(rewards).forEach(function(t) {
      if (damagePct >= t.minDamagePct) result = t;
    });
    return result;
  }

  static _nextThreshold(rewards, damagePct) {
    const next = RaidSystem._sortedRewards(rewards).find(function(t) { return damagePct < t.minDamagePct; });
    return next ? next.minDamagePct : null;
  }

  static getContributionInfo(bossId, damageOverride = null) {
    const boss = RaidSystem.getBoss(bossId);
    if (!boss) return { success: false, error: 'Unknown raid boss' };
    const damage = damageOverride !== null ? damageOverride : RaidSystem._getEntry(RaidSystem._loadProgress(), bossId, false).damage;
    const maxHp = boss.baseHp * BASE_HP_UNIT;
    const pct = (Number(damage) / maxHp) * 100;
    const tier = RaidSystem._resolveTier(boss.rewards, pct);
    return {
      success: true,
      myDamage: Number(damage),
      damagePct: pct,
      tierIndex: tier ? tier.tier : null,
      tierRank: tier ? tier.rank : null,
      nextThresholdPct: RaidSystem._nextThreshold(boss.rewards, pct)
    };
  }

  // ─────────────────────────────────────────
  // 보상 수령 (이중 수령 방지)
  // ─────────────────────────────────────────

  static async claimRewards(bossId) {
    const boss = RaidSystem.getBoss(bossId);
    if (!boss) return { success: false, error: 'Unknown raid boss' };

    const weekly = RaidSystem.getWeeklyRaid();
    const progress = RaidSystem._loadProgress();
    const entry = RaidSystem._getEntry(progress, bossId, true);

    const maxHp = boss.baseHp * BASE_HP_UNIT;
    const damagePct = (entry.damage / maxHp) * 100;
    const sorted = RaidSystem._sortedRewards(boss.rewards);
    const claimable = sorted.filter(function(t) {
      return damagePct >= t.minDamagePct && entry.claimedTiers.indexOf(t.tier) === -1;
    });
    if (entry.damage <= 0 || claimable.length === 0) {
      return {
        success: false,
        error: 'No claimable rewards',
        damagePct,
        claimedTiers: entry.claimedTiers.slice()
      };
    }

    // 누적 구간 보상 합산
    const totals = claimable.reduce(function(acc, t) {
      acc.gold += t.gold || 0;
      acc.gems += t.gems || 0;
      acc.equipmentFragment += t.equipmentFragment || 0;
      acc.ssrTicket += t.ssrTicket || 0;
      return acc;
    }, { gold: 0, gems: 0, equipmentFragment: 0, ssrTicket: 0 });

    // 재화 지급 (SaveManager 읽기/저장 — GuildSystem.donate 패턴)
    try {
      const saveData = SaveManager.load();
      if (saveData.player) {
        saveData.player.gold = (saveData.player.gold || 0) + totals.gold;
        saveData.player.gems = (saveData.player.gems || 0) + totals.gems;
        SaveManager.save(saveData);
      }
    } catch (e) { GameLogger.warn('[RaidSystem] reward apply failed: ' + e.message); }

    // 이중 수령 방지 마킹
    const claimedNow = claimable.map(function(t) { return t.tier; });
    entry.claimedTiers = entry.claimedTiers.concat(claimedNow);
    RaidSystem._saveProgress(progress);

    // 수령 이력 서버 동기화 (best-effort)
    const userId = SaveManager._userId;
    if (isOnline() && supabase && userId) {
      try {
        await supabase.from('raid_rewards_claimed').upsert(
          claimedNow.map(function(tier) {
            return { user_id: userId, boss_id: bossId, week_key: weekly.weekKey, tier };
          }),
          { onConflict: 'user_id,boss_id,week_key,tier', ignoreDuplicates: true }
        );
      } catch (err) { GameLogger.warn('[RaidSystem] claim sync failed: ' + err.message); }
    }

    return {
      success: true,
      claimedTiers: claimedNow,
      rewards: totals,
      damagePct
    };
  }

  // ─────────────────────────────────────────
  // 주간 리셋
  // ─────────────────────────────────────────

  static resetWeekly(now = new Date()) {
    const weekly = RaidSystem.getWeeklyRaid(now);
    let progress = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      progress = raw ? JSON.parse(raw) : null;
    } catch (e) { progress = null; }
    if (!progress || progress.weekKey !== weekly.weekKey) {
      const previousWeekKey = progress ? progress.weekKey : null;
      RaidSystem._saveProgress({ weekKey: weekly.weekKey, bosses: {} });
      return { success: true, reset: true, previousWeekKey };
    }
    return { success: true, reset: false, weekKey: weekly.weekKey };
  }
}

export const raidSystem = RaidSystem;
export default RaidSystem;
