/**
 * MigrationService - LocalStorage → Supabase 마이그레이션 유틸리티
 * W1-1.4: 로컬 세이브 데이터를 정규화된 Supabase 테이블로 변환
 */

import { supabase, isSupabaseConfigured, isOnline } from '../api/supabaseClient.js';
import SaveManager from '../systems/SaveManager.js';

const MIGRATION_VERSION = 1;

class MigrationService {

  /**
   * 마이그레이션 필요 여부 확인
   */
  static async needsMigration(userId) {
    if (!isSupabaseConfigured || !supabase) return false;

    const { data, error } = await supabase
      .from('migration_status')
      .select('migration_completed, migration_version')
      .eq('user_id', userId)
      .single();

    if (error || !data) return true;
    return !data.migration_completed || data.migration_version < MIGRATION_VERSION;
  }

  /**
   * 전체 마이그레이션 실행
   * LocalStorage → Supabase 정규화 테이블
   */
  static async migrateAll(userId, onProgress = null) {
    if (!isOnline()) {
      return { success: false, error: 'OFFLINE', message: '오프라인 상태에서는 마이그레이션할 수 없습니다' };
    }

    const localSave = SaveManager.load();
    if (!localSave) {
      return { success: false, error: 'NO_DATA', message: '로컬 저장 데이터가 없습니다' };
    }

    const steps = [
      { name: 'player_data', fn: () => this.migratePlayerData(userId, localSave) },
      { name: 'heroes', fn: () => this.migrateHeroes(userId, localSave.characters || []) },
      { name: 'inventory', fn: () => this.migrateInventory(userId, localSave.inventory || []) },
      { name: 'stage_progress', fn: () => this.migrateStageProgress(userId, localSave.progress || {}) },
      { name: 'gacha_data', fn: () => this.migrateGachaData(userId, localSave.gacha || {}) },
      { name: 'quest_data', fn: () => this.migrateQuestData(userId, localSave.quests || {}) },
      { name: 'user_settings', fn: () => this.migrateSettings(userId, localSave.settings || {}) },
      { name: 'user_statistics', fn: () => this.migrateStatistics(userId, localSave.statistics || {}) }
    ];

    const errors = [];
    let completed = 0;

    for (const step of steps) {
      try {
        const result = await step.fn();
        if (result.error) {
          errors.push({ step: step.name, error: result.error });
        }
        completed++;
        if (onProgress) {
          onProgress({ step: step.name, completed, total: steps.length });
        }
      } catch (err) {
        errors.push({ step: step.name, error: err.message });
      }
    }

    // 마이그레이션 상태 기록
    await this._updateMigrationStatus(userId, errors.length === 0, errors);

    return {
      success: errors.length === 0,
      completed,
      total: steps.length,
      errors
    };
  }

  /**
   * player + resources → player_data 테이블
   */
  static async migratePlayerData(userId, localSave) {
    const playerData = {
      user_id: userId,
      gold: localSave.resources?.gold || 0,
      gems: localSave.resources?.gems || 0,
      energy: 50, // 기본값
      player_level: localSave.player?.level || 1,
      exp: localSave.player?.exp || 0,
      summon_tickets: localSave.resources?.summonTickets || 0,
      skill_books: localSave.resources?.skillBooks || 0,
      character_shards: localSave.resources?.characterShards || {}
    };

    return await supabase
      .from('player_data')
      .upsert(playerData, { onConflict: 'user_id' });
  }

  /**
   * characters[] → heroes 테이블 (다중 row)
   */
  static async migrateHeroes(userId, characters) {
    if (!characters.length) return { data: null, error: null };

    const heroRows = characters.map(char => ({
      user_id: userId,
      hero_id: char.characterId,
      instance_id: char.instanceId,
      level: char.level || 1,
      exp: char.exp || 0,
      stars: char.stars || 1,
      skill_levels: char.skillLevels || [1, 1, 1],
      equipment: char.equipped || null
    }));

    // 기존 데이터 삭제 후 재삽입 (upsert 대신 clean insert)
    await supabase.from('heroes').delete().eq('user_id', userId);
    return await supabase.from('heroes').insert(heroRows);
  }

  /**
   * inventory[] → inventory 테이블
   */
  static async migrateInventory(userId, inventory) {
    if (!inventory.length) return { data: null, error: null };

    const itemRows = inventory.map(item => ({
      user_id: userId,
      item_id: item.id || item.itemId,
      quantity: item.quantity || 1,
      metadata: item.metadata || {}
    }));

    await supabase.from('inventory').delete().eq('user_id', userId);
    return await supabase.from('inventory').insert(itemRows);
  }

  /**
   * progress.clearedStages → stage_progress 테이블
   */
  static async migrateStageProgress(userId, progress) {
    const clearedStages = progress.clearedStages || {};
    const stageEntries = Object.entries(clearedStages);
    if (!stageEntries.length) return { data: null, error: null };

    const stageRows = stageEntries.map(([stageId, stars]) => ({
      user_id: userId,
      stage_id: stageId,
      stars: typeof stars === 'number' ? stars : stars.stars || 0,
      clear_count: typeof stars === 'object' ? (stars.clearCount || 1) : 1
    }));

    await supabase.from('stage_progress').delete().eq('user_id', userId);
    return await supabase.from('stage_progress').insert(stageRows);
  }

  /**
   * gacha → gacha_data 테이블
   */
  static async migrateGachaData(userId, gacha) {
    return await supabase
      .from('gacha_data')
      .upsert({
        user_id: userId,
        pity_counter: gacha.pityCounter || 0,
        total_pulls: gacha.totalPulls || 0,
        last_ssr_pull: gacha.lastSSRPull || 0,
        banner_pulls: gacha.bannerPulls || {}
      }, { onConflict: 'user_id' });
  }

  /**
   * quests → quest_data 테이블
   */
  static async migrateQuestData(userId, quests) {
    return await supabase
      .from('quest_data')
      .upsert({
        user_id: userId,
        daily_quests: quests.daily || {},
        daily_progress: quests.dailyProgress || {},
        last_reset: quests.lastReset || null
      }, { onConflict: 'user_id' });
  }

  /**
   * settings → user_settings 테이블
   */
  static async migrateSettings(userId, settings) {
    return await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        bgm_volume: settings.bgmVolume ?? 1,
        sfx_volume: settings.sfxVolume ?? 1,
        auto_skip: settings.autoSkip ?? false,
        battle_speed: settings.battleSpeed ?? 1
      }, { onConflict: 'user_id' });
  }

  /**
   * statistics → user_statistics 테이블
   */
  static async migrateStatistics(userId, statistics) {
    return await supabase
      .from('user_statistics')
      .upsert({
        user_id: userId,
        total_gold_earned: statistics.totalGoldEarned || 0,
        total_gems_spent: statistics.totalGemsSpent || 0,
        characters_collected: statistics.charactersCollected || 0,
        highest_damage: statistics.highestDamage || 0,
        total_battles: statistics.totalBattles || 0,
        total_wins: statistics.totalWins || 0
      }, { onConflict: 'user_id' });
  }

  /**
   * 역변환: Supabase → LocalStorage 형식
   */
  static async loadFromCloud(userId) {
    if (!isOnline()) return null;

    try {
      const [playerRes, heroesRes, inventoryRes, stagesRes, gachaRes, questsRes, settingsRes, statsRes] =
        await Promise.all([
          supabase.from('player_data').select('*').eq('user_id', userId).single(),
          supabase.from('heroes').select('*').eq('user_id', userId),
          supabase.from('inventory').select('*').eq('user_id', userId),
          supabase.from('stage_progress').select('*').eq('user_id', userId),
          supabase.from('gacha_data').select('*').eq('user_id', userId).single(),
          supabase.from('quest_data').select('*').eq('user_id', userId).single(),
          supabase.from('user_settings').select('*').eq('user_id', userId).single(),
          supabase.from('user_statistics').select('*').eq('user_id', userId).single()
        ]);

      const player = playerRes.data;
      const heroes = heroesRes.data || [];
      const inventory = inventoryRes.data || [];
      const stages = stagesRes.data || [];
      const gacha = gachaRes.data;
      const quests = questsRes.data;
      const settings = settingsRes.data;
      const stats = statsRes.data;

      // Supabase → LocalStorage 형식으로 재조립
      return {
        version: 1,
        player: {
          name: '모험가',
          level: player?.player_level || 1,
          exp: player?.exp || 0
        },
        resources: {
          gold: player?.gold || 0,
          gems: player?.gems || 0,
          summonTickets: player?.summon_tickets || 0,
          skillBooks: player?.skill_books || 0,
          characterShards: player?.character_shards || {}
        },
        characters: heroes.map(h => ({
          instanceId: h.instance_id,
          characterId: h.hero_id,
          level: h.level,
          exp: h.exp,
          stars: h.stars,
          skillLevels: h.skill_levels,
          equipped: h.equipment
        })),
        inventory: inventory.map(i => ({
          id: i.item_id,
          quantity: i.quantity,
          metadata: i.metadata
        })),
        progress: {
          currentChapter: player?.current_chapter || 'chapter_1',
          clearedStages: stages.reduce((acc, s) => {
            acc[s.stage_id] = s.stars;
            return acc;
          }, {}),
          towerFloor: player?.tower_floor || 1,
          totalBattles: stats?.total_battles || 0
        },
        gacha: {
          pityCounter: gacha?.pity_counter || 0,
          totalPulls: gacha?.total_pulls || 0
        },
        quests: {
          daily: quests?.daily_quests || {},
          dailyProgress: quests?.daily_progress || {},
          lastReset: quests?.last_reset || null
        },
        settings: {
          bgmVolume: settings?.bgm_volume ?? 1,
          sfxVolume: settings?.sfx_volume ?? 1,
          autoSkip: settings?.auto_skip ?? false,
          battleSpeed: settings?.battle_speed ?? 1
        },
        statistics: {
          totalGoldEarned: stats?.total_gold_earned || 0,
          totalGemsSpent: stats?.total_gems_spent || 0,
          charactersCollected: stats?.characters_collected || 0,
          highestDamage: stats?.highest_damage || 0
        },
        lastOnline: Date.now(),
        createdAt: player?.created_at ? new Date(player.created_at).getTime() : Date.now()
      };
    } catch (error) {
      console.error('[MigrationService] Failed to load from cloud:', error);
      return null;
    }
  }

  /**
   * 마이그레이션 검증 - 로컬과 클라우드 데이터 비교
   */
  static async verifyMigration(userId) {
    const localSave = SaveManager.load();
    const cloudSave = await this.loadFromCloud(userId);

    if (!localSave || !cloudSave) {
      return { verified: false, reason: 'Missing data' };
    }

    const checks = [
      {
        name: 'gold',
        local: localSave.resources?.gold,
        cloud: cloudSave.resources?.gold
      },
      {
        name: 'gems',
        local: localSave.resources?.gems,
        cloud: cloudSave.resources?.gems
      },
      {
        name: 'characters_count',
        local: localSave.characters?.length || 0,
        cloud: cloudSave.characters?.length || 0
      },
      {
        name: 'player_level',
        local: localSave.player?.level,
        cloud: cloudSave.player?.level
      },
      {
        name: 'pity_counter',
        local: localSave.gacha?.pityCounter,
        cloud: cloudSave.gacha?.pityCounter
      }
    ];

    const failures = checks.filter(c => c.local !== c.cloud);
    return {
      verified: failures.length === 0,
      checks: checks.length,
      passed: checks.length - failures.length,
      failures
    };
  }

  /**
   * 마이그레이션 상태 업데이트
   */
  static async _updateMigrationStatus(userId, success, errors) {
    const localSave = SaveManager.load();
    const dataHash = localSave ? this._hashData(localSave) : null;

    return await supabase
      .from('migration_status')
      .upsert({
        user_id: userId,
        migration_completed: success,
        migration_version: success ? MIGRATION_VERSION : 0,
        local_data_hash: dataHash,
        migrated_at: success ? new Date().toISOString() : null,
        error_log: errors.length > 0 ? errors : []
      }, { onConflict: 'user_id' });
  }

  /**
   * 간단한 해시 생성 (데이터 변경 감지용)
   */
  static _hashData(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit integer
    }
    return hash.toString(16);
  }
}

export default MigrationService;
