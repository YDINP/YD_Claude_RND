/**
 * DebugManager - 개발/테스트용 치트 기능
 * 디버그 모드에서만 활성화
 * G-1~G-10: 전체 시스템 치트 API + 치트코드 25종 + window.debug
 */
import { SaveManager } from './SaveManager.js';
import { getAllCharacters, getAllChapters, getChapterStages } from '../data/index.js';
import { DebugFAB } from '../components/debug/DebugFAB.js';
import { DebugPanel } from '../components/debug/DebugPanel.js';
import energySystem from './EnergySystem.js';
import { GachaSystem } from './GachaSystem.js';
import { EquipmentSystem } from './EquipmentSystem.js';
import { TowerSystem } from './TowerSystem.js';
import sweepSystem from './SweepSystem.js';
import { QuestSystem } from './QuestSystem.js';
import { PartyManager } from './PartyManager.js';
import moodSystem from './MoodSystem.js';
import { SynergySystem } from './SynergySystem.js';
import { normalizeHeroes } from '../data/index.js';

export class DebugManager {
  static isDebugMode = false;
  static invincible = false;
  static oneHitKill = false;
  static battleSpeedMultiplier = 1;
  // G-3: 에너지 치트 상태
  static infiniteEnergy = false;
  static energyRecoveryMultiplier = 1;
  // G-4: 가챠 치트 상태
  static freeGachaMode = false;
  static forceNextRarity = null;
  static forceNextCharacter = null;
  static forcePickupMode = false;
  // G-5: 장비 치트 상태
  static enhanceAlwaysSuccess = false;
  // G-9: 분위기 치트 상태
  static alwaysMoodAdvantage = false;

  // 모바일 디버그 UI
  static currentFAB = null;
  static currentPanel = null;

  /**
   * 디버그 모드 활성화/비활성화
   */
  static setDebugMode(enabled) {
    this.isDebugMode = enabled;
    this.log('System', `Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    if (enabled) {
      window.debug = DebugManager;
      this.log('System', 'window.debug registered — type debug.help() for commands');
    }
  }

  // ========== 리소스 치트 ==========

  static addGold(amount) {
    if (!this.isDebugMode) return false;
    SaveManager.addGold(amount);
    this.log('Cheat', `Added ${amount} gold`);
    return true;
  }

  static addGems(amount) {
    if (!this.isDebugMode) return false;
    SaveManager.addGems(amount);
    this.log('Cheat', `Added ${amount} gems`);
    return true;
  }

  static addSummonTickets(amount) {
    if (!this.isDebugMode) return false;
    SaveManager.addSummonTickets(amount);
    this.log('Cheat', `Added ${amount} summon tickets`);
    return true;
  }

  static maxResources() {
    if (!this.isDebugMode) return false;
    this.addGold(9999999);
    this.addGems(999999);
    this.addSummonTickets(999);
    this.log('Cheat', 'All resources set to maximum');
    return true;
  }

  // ========== 캐릭터 치트 ==========

  static unlockAllCharacters() {
    if (!this.isDebugMode) return false;
    const allCharacters = getAllCharacters();
    allCharacters.forEach(char => {
      SaveManager.addCharacter(char.id, 1);
    });
    // ISSUE-01 FIX: 게임 registry도 갱신
    this._refreshHeroRegistry();
    this.log('Cheat', `All ${allCharacters.length} characters unlocked`);
    return true;
  }

  /**
   * SaveManager의 최신 데이터로 게임 registry 갱신
   */
  static _refreshHeroRegistry() {
    try {
      const game = window.game;
      if (game && game.registry) {
        const saveData = SaveManager.load();
        const normalized = normalizeHeroes(saveData.characters || []);
        game.registry.set('ownedHeroes', normalized);
        console.log(`[DebugManager] Registry 갱신: ${normalized.length}명`);
      }
    } catch (e) {
      console.warn('[DebugManager] Registry 갱신 실패:', e.message);
    }
  }

  static setCharacterLevel(charId, level) {
    if (!this.isDebugMode) return false;
    const character = SaveManager.getCharacter(charId);
    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }
    SaveManager.updateCharacter(charId, { level, exp: 0 });
    this.log('Cheat', `Set ${charId} to level ${level}`);
    return true;
  }

  static maxAllSkills(charId) {
    if (!this.isDebugMode) return false;
    const character = SaveManager.getCharacter(charId);
    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }
    SaveManager.updateCharacter(charId, { skillLevels: [10, 10, 10] });
    this.log('Cheat', `Maxed all skills for ${charId}`);
    return true;
  }

  static setCharacterStars(charId, stars) {
    if (!this.isDebugMode) return false;
    const character = SaveManager.getCharacter(charId);
    if (!character) {
      this.log('Error', `Character ${charId} not found`);
      return false;
    }
    SaveManager.updateCharacter(charId, { stars: Math.min(stars, 6) });
    this.log('Cheat', `Set ${charId} to ${stars} stars`);
    return true;
  }

  // ========== G-2: 진행도 치트 (stages.json 연동) ==========

  static clearAllStages() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.progress) data.progress = {};
    if (!data.progress.clearedStages) data.progress.clearedStages = {};

    const chapters = getAllChapters();
    let count = 0;
    chapters.forEach(chapter => {
      const stages = chapter.stages || [];
      stages.forEach(stage => {
        data.progress.clearedStages[stage.id] = 3;
        count++;
      });
    });

    SaveManager.save(data);
    this.log('Cheat', `All ${count} stages cleared with 3 stars (${chapters.length} chapters)`);
    return true;
  }

  static skipToChapter(chapter) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.progress) data.progress = {};
    if (!data.progress.clearedStages) data.progress.clearedStages = {};

    const chapters = getAllChapters();
    let cleared = 0;
    chapters.forEach(ch => {
      const chapterNum = parseInt(ch.id.replace('chapter_', '')) || 0;
      if (chapterNum < chapter) {
        const stages = ch.stages || [];
        stages.forEach(stage => {
          data.progress.clearedStages[stage.id] = 3;
          cleared++;
        });
      }
    });

    data.progress.currentChapter = `chapter_${chapter}`;
    SaveManager.save(data);
    this.log('Cheat', `Skipped to chapter ${chapter} (${cleared} stages auto-cleared)`);
    return true;
  }

  // ========== 전투 치트 ==========

  static setInvincible(enabled) {
    if (!this.isDebugMode) return false;
    this.invincible = enabled;
    this.log('Cheat', `Invincibility ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static setOneHitKill(enabled) {
    if (!this.isDebugMode) return false;
    this.oneHitKill = enabled;
    this.log('Cheat', `One-hit kill ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static setBattleSpeed(speed) {
    if (!this.isDebugMode) return false;
    this.battleSpeedMultiplier = Math.max(0.5, Math.min(5.0, speed));
    this.log('Cheat', `Battle speed set to ${this.battleSpeedMultiplier}x`);
    return true;
  }

  // ========== G-3: 에너지 시스템 치트 ==========

  static refillEnergy() {
    if (!this.isDebugMode) return false;
    const max = energySystem.getMaxEnergy();
    energySystem.addEnergy(max);
    this.log('Cheat', `Energy refilled to max (${max})`);
    return true;
  }

  static setEnergy(amount) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.energy) data.energy = {};
    data.energy.current = Math.max(0, amount);
    SaveManager.save(data);
    this.log('Cheat', `Energy set to ${amount}`);
    return true;
  }

  static setInfiniteEnergy(enabled) {
    if (!this.isDebugMode) return false;
    this.infiniteEnergy = enabled;
    this.log('Cheat', `Infinite energy ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static setEnergyRecoverySpeed(multiplier) {
    if (!this.isDebugMode) return false;
    this.energyRecoveryMultiplier = Math.max(1, Math.min(100, multiplier));
    this.log('Cheat', `Energy recovery speed set to ${this.energyRecoveryMultiplier}x`);
    return true;
  }

  // ========== G-4: 가챠 시스템 치트 ==========

  static setPityCounter(count) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.gacha) data.gacha = {};
    data.gacha.pityCounter = Math.max(0, count);
    SaveManager.save(data);
    this.log('Gacha', `Pity counter set to ${count}`);
    return true;
  }

  static setNextPullRarity(rarity) {
    if (!this.isDebugMode) return false;
    const valid = ['R', 'SR', 'SSR'];
    if (!valid.includes(rarity)) {
      this.log('Error', `Invalid rarity: ${rarity}. Use: ${valid.join(', ')}`);
      return false;
    }
    this.forceNextRarity = rarity;
    this.log('Gacha', `Next pull forced to ${rarity}`);
    return true;
  }

  static setNextPullCharacter(charId) {
    if (!this.isDebugMode) return false;
    this.forceNextCharacter = charId;
    this.log('Gacha', `Next pull forced to character ${charId}`);
    return true;
  }

  static freeGacha(enabled) {
    if (!this.isDebugMode) return false;
    this.freeGachaMode = enabled;
    this.log('Gacha', `Free gacha mode ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static simulateGacha(count = 100) {
    if (!this.isDebugMode) return false;
    const results = { R: 0, SR: 0, SSR: 0, characters: {} };
    for (let i = 0; i < count; i++) {
      try {
        const pull = GachaSystem.pull(1, 'gems');
        if (pull && pull.results) {
          pull.results.forEach(r => {
            const rarity = r.rarity || 'R';
            results[rarity] = (results[rarity] || 0) + 1;
            const name = r.name || r.id || 'unknown';
            results.characters[name] = (results.characters[name] || 0) + 1;
          });
        }
      } catch {
        results.R++;
      }
    }
    this.log('Gacha', `Simulation ${count} pulls:`, results);
    console.table({
      'R': `${results.R} (${(results.R / count * 100).toFixed(1)}%)`,
      'SR': `${results.SR} (${(results.SR / count * 100).toFixed(1)}%)`,
      'SSR': `${results.SSR} (${(results.SSR / count * 100).toFixed(1)}%)`
    });
    return results;
  }

  static resetPity() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.gacha) data.gacha = {};
    data.gacha.pityCounter = 0;
    data.gacha.isPickupGuaranteed = false;
    SaveManager.save(data);
    this.log('Gacha', 'Pity counter reset to 0');
    return true;
  }

  static forcePickup(enabled) {
    if (!this.isDebugMode) return false;
    this.forcePickupMode = enabled;
    this.log('Gacha', `Force pickup mode ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  // ========== G-5: 장비 시스템 치트 ==========

  static giveEquipment(slotType = 'weapon', rarity = 'SR') {
    if (!this.isDebugMode) return false;
    const equip = EquipmentSystem.createEquipment(slotType, rarity);
    if (equip) {
      const data = SaveManager.load();
      if (!data.inventory) data.inventory = {};
      if (!data.inventory.equipment) data.inventory.equipment = [];
      data.inventory.equipment.push(equip);
      SaveManager.save(data);
      this.log('Cheat', `Given ${rarity} ${slotType}`, equip);
    }
    return true;
  }

  static giveAllEquipment() {
    if (!this.isDebugMode) return false;
    const slots = ['weapon', 'armor', 'accessory', 'relic'];
    const rarities = ['R', 'SR', 'SSR'];
    let count = 0;
    const data = SaveManager.load();
    if (!data.inventory) data.inventory = {};
    if (!data.inventory.equipment) data.inventory.equipment = [];

    slots.forEach(slot => {
      rarities.forEach(rarity => {
        const equip = EquipmentSystem.createEquipment(slot, rarity);
        if (equip) {
          data.inventory.equipment.push(equip);
          count++;
        }
      });
    });

    SaveManager.save(data);
    this.log('Cheat', `Given ${count} equipment items (all slots × rarities)`);
    return true;
  }

  static maxEnhanceEquipment(equipmentId) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    const equipment = data.inventory?.equipment?.find(e => e.id === equipmentId);
    if (!equipment) {
      this.log('Error', `Equipment ${equipmentId} not found`);
      return false;
    }
    equipment.enhanceLevel = 15;
    SaveManager.save(data);
    this.log('Cheat', `Equipment ${equipmentId} enhanced to +15`);
    return true;
  }

  static setEnhanceAlwaysSuccess(enabled) {
    if (!this.isDebugMode) return false;
    this.enhanceAlwaysSuccess = enabled;
    this.log('Cheat', `Enhance always success ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  // ========== G-6: 무한의 탑 치트 ==========

  static setTowerFloor(floor) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.tower) data.tower = {};
    data.tower.currentFloor = Math.max(1, floor);
    SaveManager.save(data);
    this.log('Cheat', `Tower floor set to ${floor}`);
    return true;
  }

  static clearTowerFloors(from, to) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.tower) data.tower = {};
    if (!data.tower.clearedFloors) data.tower.clearedFloors = {};

    let count = 0;
    for (let f = from; f <= to; f++) {
      data.tower.clearedFloors[f] = true;
      count++;
    }
    data.tower.highestFloor = Math.max(data.tower.highestFloor || 0, to);
    data.tower.currentFloor = to + 1;

    SaveManager.save(data);
    this.log('Cheat', `Cleared tower floors ${from}-${to} (${count} floors)`);
    return true;
  }

  static clearAllTowerFloors() {
    if (!this.isDebugMode) return false;
    return this.clearTowerFloors(1, 100);
  }

  static resetTower() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    data.tower = { currentFloor: 1, highestFloor: 0, clearedFloors: {} };
    SaveManager.save(data);
    this.log('Cheat', 'Tower progress reset');
    return true;
  }

  static setTowerDifficulty(multiplier) {
    if (!this.isDebugMode) return false;
    this.towerDifficultyMultiplier = Math.max(0.1, Math.min(10, multiplier));
    this.log('Cheat', `Tower difficulty multiplier set to ${this.towerDifficultyMultiplier}x`);
    return true;
  }

  // ========== G-7: 소탕 & 퀘스트 치트 ==========

  static addSweepTickets(amount) {
    if (!this.isDebugMode) return false;
    sweepSystem.addSweepTickets(amount);
    this.log('Cheat', `Added ${amount} sweep tickets`);
    return true;
  }

  static setInfiniteSweeps(enabled) {
    if (!this.isDebugMode) return false;
    this.infiniteSweeps = enabled;
    this.log('Cheat', `Infinite sweeps ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static resetDailySweepCount() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (!data.sweep) data.sweep = {};
    data.sweep.dailyUsed = 0;
    data.sweep.lastResetDate = null;
    SaveManager.save(data);
    this.log('Cheat', 'Daily sweep count reset');
    return true;
  }

  static completeAllDailyQuests() {
    if (!this.isDebugMode) return false;
    try {
      const quests = QuestSystem.getDailyQuests();
      quests.forEach(q => {
        QuestSystem.updateProgress(q.id, q.target || 999);
      });
      this.log('Cheat', `Completed ${quests.length} daily quests`);
    } catch (e) {
      this.log('Error', 'Failed to complete daily quests', e.message);
    }
    return true;
  }

  static completeAllWeeklyQuests() {
    if (!this.isDebugMode) return false;
    try {
      const quests = QuestSystem.getWeeklyQuests ? QuestSystem.getWeeklyQuests() : [];
      quests.forEach(q => {
        QuestSystem.updateProgress(q.id, q.target || 999);
      });
      this.log('Cheat', `Completed ${quests.length} weekly quests`);
    } catch (e) {
      this.log('Error', 'Failed to complete weekly quests', e.message);
    }
    return true;
  }

  static claimAllQuestRewards() {
    if (!this.isDebugMode) return false;
    try {
      const claimable = QuestSystem.getClaimableQuests();
      let claimed = 0;
      claimable.forEach(q => {
        QuestSystem.claimReward(q.id);
        claimed++;
      });
      this.log('Cheat', `Claimed ${claimed} quest rewards`);
    } catch (e) {
      this.log('Error', 'Failed to claim quest rewards', e.message);
    }
    return true;
  }

  static resetDailyQuests() {
    if (!this.isDebugMode) return false;
    try {
      QuestSystem.resetDailyQuests();
      this.log('Cheat', 'Daily quests reset');
    } catch (e) {
      this.log('Error', 'Failed to reset daily quests', e.message);
    }
    return true;
  }

  // ========== G-8: 세이브 & 시간 치트 ==========

  static exportSave() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arcane_save_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.log('Save', 'Save data exported');
    return true;
  }

  static importSave(jsonString) {
    if (!this.isDebugMode) return false;
    try {
      const data = JSON.parse(jsonString);
      SaveManager.save(data);
      this.log('Save', 'Save data imported successfully');
      return true;
    } catch (e) {
      this.log('Error', `Import failed: ${e.message}`);
      return false;
    }
  }

  static resetAllData() {
    if (!this.isDebugMode) return false;
    localStorage.removeItem('arcane_collectors_save');
    this.log('Save', 'ALL save data cleared');
    return true;
  }

  static createBackup(slotName = 'default') {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    localStorage.setItem(`arcane_backup_${slotName}`, JSON.stringify(data));
    this.log('Save', `Backup created: ${slotName}`);
    return true;
  }

  static loadBackup(slotName = 'default') {
    if (!this.isDebugMode) return false;
    const backup = localStorage.getItem(`arcane_backup_${slotName}`);
    if (!backup) {
      this.log('Error', `Backup not found: ${slotName}`);
      return false;
    }
    SaveManager.save(JSON.parse(backup));
    this.log('Save', `Backup loaded: ${slotName}`);
    return true;
  }

  static fastForwardOffline(hours) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    const msOffset = hours * 60 * 60 * 1000;
    if (!data.lastOnlineTime) data.lastOnlineTime = Date.now();
    data.lastOnlineTime -= msOffset;
    SaveManager.save(data);
    this.log('Cheat', `Fast-forwarded offline time by ${hours} hours`);
    return true;
  }

  static setLastOnlineTime(hoursAgo) {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    data.lastOnlineTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    SaveManager.save(data);
    this.log('Cheat', `Last online time set to ${hoursAgo} hours ago`);
    return true;
  }

  static resetDailyTimers() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (data.dailyReset) data.dailyReset = null;
    if (data.sweep) data.sweep.lastResetDate = null;
    if (data.quest) data.quest.lastDailyReset = null;
    SaveManager.save(data);
    this.log('Cheat', 'All daily timers reset');
    return true;
  }

  // ========== G-9: 분위기 & 시너지 & 파티 치트 ==========

  static setMoodAdvantage(enabled) {
    if (!this.isDebugMode) return false;
    this.alwaysMoodAdvantage = enabled;
    this.log('Cheat', `Always mood advantage ${enabled ? 'ON' : 'OFF'}`);
    return true;
  }

  static viewMoodMatchup(moodA, moodB) {
    if (!this.isDebugMode) return false;
    const multiplier = moodSystem.getMatchupMultiplier(moodA, moodB);
    const result = multiplier > 1 ? 'ADVANTAGE' : multiplier < 1 ? 'DISADVANTAGE' : 'NEUTRAL';
    this.log('Cheat', `${moodA} vs ${moodB}: ${result} (×${multiplier})`);
    return { moodA, moodB, multiplier, result };
  }

  static viewActiveSynergies(partyIds) {
    if (!this.isDebugMode) return false;
    try {
      const allChars = getAllCharacters();
      const heroData = partyIds.map(id => allChars.find(c => c.id === id)).filter(Boolean);
      const synergies = SynergySystem.calculatePartySynergies(partyIds, heroData);
      this.log('Cheat', 'Active synergies:', synergies);
      return synergies;
    } catch (e) {
      this.log('Error', `Synergy calculation failed: ${e.message}`);
      return null;
    }
  }

  static forceSynergyBonus(synergyId) {
    if (!this.isDebugMode) return false;
    if (!this.forcedSynergies) this.forcedSynergies = [];
    this.forcedSynergies.push(synergyId);
    this.log('Cheat', `Forced synergy: ${synergyId}`);
    return true;
  }

  static autoOptimalParty() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    const ownedIds = Object.keys(data.characters || {});
    if (ownedIds.length === 0) {
      this.log('Error', 'No characters owned');
      return false;
    }
    const allChars = getAllCharacters();
    const ownedHeroes = ownedIds
      .map(id => allChars.find(c => c.id === id))
      .filter(Boolean);
    const result = PartyManager.autoFormParty(ownedHeroes);
    this.log('Cheat', 'Optimal party formed:', result);
    return result;
  }

  static clearParty() {
    if (!this.isDebugMode) return false;
    const data = SaveManager.load();
    if (data.parties) {
      Object.keys(data.parties).forEach(key => {
        if (data.parties[key]) data.parties[key].members = [];
      });
    }
    SaveManager.save(data);
    this.log('Cheat', 'All party slots cleared');
    return true;
  }

  // ========== 로그 ==========

  static log(category, message, data) {
    if (!this.isDebugMode) return;
    const colors = {
      'System': '#3498db',
      'Cheat': '#e74c3c',
      'Battle': '#e67e22',
      'Gacha': '#9b59b6',
      'Save': '#27ae60',
      'Energy': '#f39c12',
      'Tower': '#1abc9c',
      'Quest': '#2ecc71',
      'Error': '#c0392b'
    };
    const color = colors[category] || '#95a5a6';
    if (data !== undefined) {
      console.log(`%c[DEBUG:${category}] ${message}`, `color: ${color}; font-weight: bold;`, data);
    } else {
      console.log(`%c[DEBUG:${category}] ${message}`, `color: ${color}; font-weight: bold;`);
    }
  }

  // ========== G-10: 디버그 콘솔 UI ==========

  static showDebugUI(scene) {
    if (!this.isDebugMode) return;
    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;

    const bg = scene.add.rectangle(width / 2, height / 2, width * 0.9, height * 0.85, 0x000000, 0.95);
    bg.setDepth(9000).setInteractive();

    const title = scene.add.text(width / 2, 60, 'DEBUG MENU', {
      fontSize: '28px', fontFamily: 'Arial', color: '#ff0000', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(9001);

    const statusText = scene.add.text(width / 2, 95, this._getStatusLine(), {
      fontSize: '12px', fontFamily: 'monospace', color: '#88ff88'
    }).setOrigin(0.5).setDepth(9001);

    const buttons = [
      // 리소스
      { text: '💰 골드 +100K', action: () => this.addGold(100000) },
      { text: '💎 젬 +10K', action: () => this.addGems(10000) },
      { text: '🎫 티켓 +50', action: () => this.addSummonTickets(50) },
      { text: '📦 모든 리소스 MAX', action: () => this.maxResources() },
      // 캐릭터
      { text: '🦸 모든 캐릭터 해금', action: () => this.unlockAllCharacters() },
      // 진행도
      { text: '⭐ 전체 스테이지 클리어', action: () => this.clearAllStages() },
      { text: '🗼 탑 전층 클리어', action: () => this.clearAllTowerFloors() },
      // 에너지
      { text: '⚡ 에너지 충전', action: () => this.refillEnergy() },
      { text: `♾️ 무한에너지 ${this.infiniteEnergy ? 'OFF' : 'ON'}`, action: () => this.setInfiniteEnergy(!this.infiniteEnergy) },
      // 전투
      { text: `🛡️ 무적 ${this.invincible ? 'OFF' : 'ON'}`, action: () => this.setInvincible(!this.invincible) },
      { text: `⚔️ 원킬 ${this.oneHitKill ? 'OFF' : 'ON'}`, action: () => this.setOneHitKill(!this.oneHitKill) },
      { text: '🚀 3배속', action: () => this.setBattleSpeed(3.0) },
      // 가챠
      { text: `🎲 무료가챠 ${this.freeGachaMode ? 'OFF' : 'ON'}`, action: () => this.freeGacha(!this.freeGachaMode) },
      { text: '🎯 천장→89', action: () => this.setPityCounter(89) },
      // 세이브
      { text: '💾 세이브 내보내기', action: () => this.exportSave() },
      { text: '🔄 전체 초기화', action: () => { this.resetAllData(); location.reload(); } },
      // 닫기
      { text: '❌ 닫기', action: () => { elements.forEach(e => e.destroy()); } }
    ];

    const elements = [bg, title, statusText];
    const cols = 2;
    const btnW = (width * 0.9 - 40) / cols;
    const btnH = 46;
    const startY = 125;
    const startX = width * 0.05 + 20;

    buttons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * btnW + btnW / 2;
      const y = startY + row * (btnH + 6) + btnH / 2;

      const btnBg = scene.add.rectangle(x, y, btnW - 8, btnH, 0x222244)
        .setDepth(9001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          btn.action();
          statusText.setText(this._getStatusLine());
          scene.events.emit('debug-action');
        })
        .on('pointerover', () => btnBg.setFillStyle(0x333366))
        .on('pointerout', () => btnBg.setFillStyle(0x222244));

      const btnText = scene.add.text(x, y, btn.text, {
        fontSize: '14px', fontFamily: '"Noto Sans KR", Arial', color: '#ffffff'
      }).setOrigin(0.5).setDepth(9002);

      elements.push(btnBg, btnText);
    });
  }

  static _getStatusLine() {
    const data = SaveManager.load();
    const gold = data.resources?.gold || 0;
    const gems = data.resources?.gems || 0;
    const energy = energySystem.getCurrentEnergy();
    const flags = [
      this.invincible ? 'GOD' : null,
      this.oneHitKill ? '1HIT' : null,
      this.infiniteEnergy ? '∞EN' : null,
      this.freeGachaMode ? 'FREE' : null,
      this.alwaysMoodAdvantage ? 'MOOD+' : null
    ].filter(Boolean).join(' ');
    return `G:${gold} 💎${gems} ⚡${energy} ${flags ? `[${flags}]` : ''}`;
  }

  // ========== G-10: 치트 코드 25종 ==========

  static processCheatCode(code) {
    if (!this.isDebugMode) return false;

    const cheats = {
      // 기존 8종
      'GOLDRAIN': () => this.addGold(999999),
      'GEMSTORM': () => this.addGems(99999),
      'SUMMONALL': () => this.addSummonTickets(100),
      'GODMODE': () => this.setInvincible(true),
      'ONEPUNCH': () => this.setOneHitKill(true),
      'SPEEDUP': () => this.setBattleSpeed(3.0),
      'UNLOCKALL': () => this.unlockAllCharacters(),
      'CLEARALL': () => this.clearAllStages(),
      // G-3: 에너지
      'FULLCHARGE': () => this.refillEnergy(),
      'INFINERGY': () => this.setInfiniteEnergy(!this.infiniteEnergy),
      'SPEEDREGEN': () => this.setEnergyRecoverySpeed(10),
      // G-4: 가챠
      'FREEPULL': () => this.freeGacha(true),
      'PITY89': () => this.setPityCounter(89),
      'FORCEPICKUP': () => this.forcePickup(true),
      'FORCESSR': () => this.setNextPullRarity('SSR'),
      // G-5: 장비
      'GEARUP': () => this.giveAllEquipment(),
      'ENHANCE100': () => this.setEnhanceAlwaysSuccess(true),
      // G-6: 탑
      'TOWERMAX': () => this.clearAllTowerFloors(),
      'TOWERRESET': () => this.resetTower(),
      // G-7: 소탕 & 퀘스트
      'SWEEPMAX': () => { this.addSweepTickets(999); this.resetDailySweepCount(); },
      'QUESTDONE': () => { this.completeAllDailyQuests(); this.claimAllQuestRewards(); },
      // G-8: 세이브 & 시간
      'SAVEEXPORT': () => this.exportSave(),
      'BACKUP': () => this.createBackup('cheatcode'),
      'RESETALL': () => this.resetAllData(),
      // G-9: 분위기 & 파티
      'MOODPLUS': () => this.setMoodAdvantage(!this.alwaysMoodAdvantage),
      'AUTOPARTY': () => this.autoOptimalParty()
    };

    const cheat = cheats[code.toUpperCase()];
    if (cheat) {
      cheat();
      this.log('Cheat', `Cheat code activated: ${code}`);
      return true;
    }

    return false;
  }

  // ========== 모바일 디버그 UI ==========

  /**
   * 모바일 디버그 UI를 씬에 부착
   * 모든 씬의 create() 끝에서 호출
   */
  static attachToScene(scene) {
    if (!this.isDebugMode) return;

    // 기존 UI 정리
    this.currentFAB?.destroy();
    this.currentPanel?.destroy();

    // FAB 생성
    this.currentFAB = new DebugFAB(scene);
    this.currentPanel = new DebugPanel(scene);

    // FAB 콜백 연결
    this.currentFAB.onToggle = (isOpen) => {
      if (isOpen) {
        this.currentPanel.open();
      } else {
        this.currentPanel.close();
      }
    };

    // 씬 종료 시 정리
    scene.events.once('shutdown', () => {
      this.currentFAB?.destroy();
      this.currentPanel?.destroy();
      this.currentFAB = null;
      this.currentPanel = null;
    });
  }

  /**
   * 프로덕션 환경에서 디버그 모드 숨김 활성화
   * 설정 화면 타이틀 7번 탭으로 호출
   */
  static handleSecretTap() {
    if (!this._secretTapCount) this._secretTapCount = 0;
    if (!this._secretTapTimer) this._secretTapTimer = null;

    this._secretTapCount++;

    clearTimeout(this._secretTapTimer);
    this._secretTapTimer = setTimeout(() => {
      this._secretTapCount = 0;
    }, 3000);

    if (this._secretTapCount >= 7) {
      this._secretTapCount = 0;
      const newState = !this.isDebugMode;
      this.setDebugMode(newState);

      if (newState) {
        localStorage.setItem('arcane_debug_enabled', 'true');
      } else {
        localStorage.removeItem('arcane_debug_enabled');
      }

      return newState; // 호출자에게 상태 반환
    }
    return null; // 아직 7탭 미달
  }

  // ========== ESC 키 치트 패널 ==========

  /**
   * ESC 키 치트 패널 토글 등록 (모든 씬에서 동작)
   */
  static registerEscKeyHandler() {
    if (this._escRegistered) return;
    this._escRegistered = true;
    this._debugPanelVisible = false;
    this._debugPanelElements = [];

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const game = window.game;
        if (!game) return;
        const scene = game.scene.getScenes(true)[0];
        if (!scene) return;

        if (this._debugPanelVisible) {
          this.hideDebugPanel(scene);
        } else {
          this.showDebugPanel(scene);
        }
      }
    });
  }

  /**
   * ESC 디버그 패널 표시
   */
  static showDebugPanel(scene) {
    this._debugPanelVisible = true;
    this._debugPanelElements = [];
    const GAME_WIDTH = 720;
    const GAME_HEIGHT = 1280;

    // 반투명 배경
    const overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85);
    overlay.setDepth(9000);
    overlay.setInteractive(); // 뒤쪽 클릭 차단
    this._debugPanelElements.push(overlay);

    // 제목
    const title = scene.add.text(GAME_WIDTH / 2, 60, 'CHEAT PANEL', {
      fontSize: '28px', fontFamily: 'Arial', color: '#ff6600', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(9001);
    this._debugPanelElements.push(title);

    const subtitle = scene.add.text(GAME_WIDTH / 2, 95, 'ESC를 다시 누르면 닫힙니다', {
      fontSize: '14px', fontFamily: 'Arial', color: '#888888'
    }).setOrigin(0.5).setDepth(9001);
    this._debugPanelElements.push(subtitle);

    // 상태 표시
    let statusLine = '';
    try {
      statusLine = this._getStatusLine();
    } catch (e) {
      statusLine = '(상태 로드 실패)';
    }

    const status = scene.add.text(GAME_WIDTH / 2, 130, statusLine, {
      fontSize: '16px', fontFamily: 'monospace', color: '#88ff88'
    }).setOrigin(0.5).setDepth(9001);
    this._debugPanelElements.push(status);

    // 디버그 모드가 꺼져 있으면 자동 활성화
    if (!this.isDebugMode) {
      this.setDebugMode(true);
    }

    // 버튼 그리드 (3열)
    const buttons = [
      { label: '골드 +100K', action: () => this.addGold(100000) },
      { label: '젬 +10K', action: () => this.addGems(10000) },
      { label: '소환권 +50', action: () => this.addSummonTickets(50) },
      { label: '리소스 MAX', action: () => this.maxResources() },
      { label: '전캐릭 해금', action: () => this.unlockAllCharacters() },
      { label: '전스테이지 클리어', action: () => this.clearAllStages() },
      { label: '탑 전층 클리어', action: () => this.clearAllTowerFloors() },
      { label: '에너지 충전', action: () => this.refillEnergy() },
      { label: `무한에너지 ${this.infiniteEnergy ? 'OFF' : 'ON'}`, action: () => this.setInfiniteEnergy(!this.infiniteEnergy) },
      { label: `무적 ${this.invincible ? 'OFF' : 'ON'}`, action: () => this.setInvincible(!this.invincible) },
      { label: `원킬 ${this.oneHitKill ? 'OFF' : 'ON'}`, action: () => this.setOneHitKill(!this.oneHitKill) },
      { label: '전투 3배속', action: () => this.setBattleSpeed(3) },
      { label: `무료 가챠 ${this.freeGachaMode ? 'OFF' : 'ON'}`, action: () => this.freeGacha(!this.freeGachaMode) },
      { label: '천장 -> 89', action: () => this.setPityCounter(89) },
      { label: '세이브 내보내기', action: () => this.exportSave() },
      { label: '씬 새로고침', action: () => { this.hideDebugPanel(scene); scene.scene.restart(); } },
      { label: '메인으로', action: () => { this.hideDebugPanel(scene); scene.scene.start('MainMenuScene'); } },
      { label: '닫기', action: () => this.hideDebugPanel(scene) },
    ];

    const cols = 3;
    const btnWidth = 200;
    const btnHeight = 55;
    const gapX = 15;
    const gapY = 12;
    const startX = (GAME_WIDTH - (cols * btnWidth + (cols - 1) * gapX)) / 2 + btnWidth / 2;
    const startY = 175;

    buttons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnWidth + gapX);
      const y = startY + row * (btnHeight + gapY);

      const bg = scene.add.rectangle(x, y, btnWidth, btnHeight, 0x222244, 1);
      bg.setStrokeStyle(1, 0x4444aa, 0.5);
      bg.setDepth(9001);
      bg.setInteractive({ useHandCursor: true });

      bg.on('pointerover', () => bg.setFillStyle(0x333366));
      bg.on('pointerout', () => bg.setFillStyle(0x222244));
      bg.on('pointerdown', () => {
        btn.action();
        // 플래시 피드백
        bg.setFillStyle(0x44ff44);
        scene.time.delayedCall(200, () => bg.setFillStyle(0x222244));
        // 상태 업데이트
        try {
          status.setText(this._getStatusLine());
        } catch (e) { /* ignore */ }
      });

      const label = scene.add.text(x, y, btn.label, {
        fontSize: '14px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(9002);

      this._debugPanelElements.push(bg, label);
    });
  }

  /**
   * ESC 디버그 패널 숨김
   */
  static hideDebugPanel(scene) {
    this._debugPanelVisible = false;
    this._debugPanelElements.forEach(el => {
      if (el && el.destroy) el.destroy();
    });
    this._debugPanelElements = [];
  }

  // ========== G-10: 도움말 ==========

  static help() {
    const commands = {
      '=== 리소스 ===': '',
      'addGold(n)': '골드 추가',
      'addGems(n)': '젬 추가',
      'addSummonTickets(n)': '소환 티켓 추가',
      'maxResources()': '모든 리소스 MAX',
      '=== 캐릭터 ===': '',
      'unlockAllCharacters()': '전체 캐릭터 해금',
      'setCharacterLevel(id, lv)': '캐릭터 레벨 설정',
      'maxAllSkills(id)': '캐릭터 스킬 MAX',
      'setCharacterStars(id, n)': '캐릭터 별 등급 설정',
      '=== 진행도 (G-2) ===': '',
      'clearAllStages()': '전체 스테이지 3성 클리어',
      'skipToChapter(n)': 'n챕터로 스킵',
      '=== 전투 ===': '',
      'setInvincible(bool)': '무적 모드',
      'setOneHitKill(bool)': '원킬 모드',
      'setBattleSpeed(n)': '전투 배속 (0.5~5.0)',
      '=== 에너지 (G-3) ===': '',
      'refillEnergy()': '에너지 최대 충전',
      'setEnergy(n)': '에너지 특정 값 설정',
      'setInfiniteEnergy(bool)': '무한 에너지',
      'setEnergyRecoverySpeed(n)': '회복 배속 (1~100)',
      '=== 가챠 (G-4) ===': '',
      'setPityCounter(n)': '천장 카운터 설정',
      'setNextPullRarity(str)': '다음 소환 등급 강제',
      'setNextPullCharacter(id)': '다음 소환 캐릭터 강제',
      'freeGacha(bool)': '무료 소환 모드',
      'simulateGacha(n)': 'N회 소환 시뮬레이션',
      'resetPity()': '천장 리셋',
      'forcePickup(bool)': '픽업 확정 모드',
      '=== 장비 (G-5) ===': '',
      'giveEquipment(slot, rarity)': '장비 지급',
      'giveAllEquipment()': '전 종류 장비 지급',
      'maxEnhanceEquipment(id)': '장비 +15 강화',
      'setEnhanceAlwaysSuccess(bool)': '강화 100% 성공',
      '=== 탑 (G-6) ===': '',
      'setTowerFloor(n)': '탑 현재 층 설정',
      'clearTowerFloors(from, to)': '범위 층 클리어',
      'clearAllTowerFloors()': '전층 클리어',
      'resetTower()': '탑 초기화',
      'setTowerDifficulty(n)': '탑 난이도 배율',
      '=== 소탕 & 퀘스트 (G-7) ===': '',
      'addSweepTickets(n)': '소탕권 추가',
      'setInfiniteSweeps(bool)': '무한 소탕',
      'resetDailySweepCount()': '일일 소탕 리셋',
      'completeAllDailyQuests()': '일일 퀘스트 완료',
      'completeAllWeeklyQuests()': '주간 퀘스트 완료',
      'claimAllQuestRewards()': '보상 전체 수령',
      'resetDailyQuests()': '일일 퀘스트 리셋',
      '=== 세이브 & 시간 (G-8) ===': '',
      'exportSave()': '세이브 JSON 다운로드',
      'importSave(json)': '세이브 JSON 업로드',
      'resetAllData()': '전체 초기화',
      'createBackup(name)': '백업 생성',
      'loadBackup(name)': '백업 불러오기',
      'fastForwardOffline(h)': '오프라인 보상 빨리감기',
      'setLastOnlineTime(h)': '마지막 접속 시간 변경',
      'resetDailyTimers()': '일일 타이머 리셋',
      '=== 분위기 & 시너지 (G-9) ===': '',
      'setMoodAdvantage(bool)': '항상 상성 유리',
      'viewMoodMatchup(a, b)': '두 분위기 상성 확인',
      'viewActiveSynergies(ids)': '파티 시너지 확인',
      'forceSynergyBonus(id)': '시너지 강제 활성화',
      'autoOptimalParty()': '최적 파티 자동 편성',
      'clearParty()': '파티 초기화',
      '=== 치트코드 (processCheatCode) ===': '',
      'GOLDRAIN/GEMSTORM/SUMMONALL': '리소스',
      'GODMODE/ONEPUNCH/SPEEDUP': '전투',
      'UNLOCKALL/CLEARALL': '진행도',
      'FULLCHARGE/INFINERGY/SPEEDREGEN': '에너지',
      'FREEPULL/PITY89/FORCEPICKUP/FORCESSR': '가챠',
      'GEARUP/ENHANCE100': '장비',
      'TOWERMAX/TOWERRESET': '탑',
      'SWEEPMAX/QUESTDONE': '소탕/퀘스트',
      'SAVEEXPORT/BACKUP/RESETALL': '세이브',
      'MOODPLUS/AUTOPARTY': '분위기/파티'
    };

    console.log('%c=== ArcaneCollectors Debug Commands ===', 'color: #ff6600; font-size: 16px; font-weight: bold;');
    console.log('%cUsage: debug.commandName(args)', 'color: #ffcc00;');
    console.table(commands);
    return commands;
  }
}

// DEV 모드 또는 localStorage 저장된 디버그 활성화
if ((typeof import.meta !== 'undefined' && import.meta.env?.DEV) || localStorage.getItem('arcane_debug_enabled') === 'true') {
  DebugManager.setDebugMode(true);
}

// ESC 키 치트 패널 - 항상 등록 (DEV 여부 무관)
DebugManager.registerEscKeyHandler();

// ============================================================================
// TEST API: Playwright MCP 자동화 테스트용 인터페이스
// window.__TEST_API__ 로 접근 가능
// ============================================================================
if (typeof window !== 'undefined') {
  window.__TEST_API__ = {
    /** 현재 활성 씬 가져오기 */
    getActiveScene: () => {
      const game = window.game;
      if (!game) return null;
      const scenes = game.scene.getScenes(true);
      return scenes[0] || null;
    },

    /** 씬 이름으로 씬 전환 */
    navigateTo: (sceneName) => {
      const game = window.game;
      if (!game) return { success: false, error: 'game not found' };
      const active = game.scene.getScenes(true);
      if (active[0]) {
        active[0].scene.start(sceneName);
        return { success: true, from: active[0].scene.key, to: sceneName };
      }
      return { success: false, error: 'no active scene' };
    },

    /** 현재 씬의 모든 인터랙티브 오브젝트 목록 */
    getInteractiveObjects: () => {
      const scene = window.__TEST_API__.getActiveScene();
      if (!scene) return [];
      return scene.children.list
        .filter(c => c.input && c.input.enabled)
        .map(c => ({
          type: c.type || c.constructor.name,
          x: Math.round(c.x),
          y: Math.round(c.y),
          width: c.width || 0,
          height: c.height || 0,
          text: c.text || c.getData?.('label') || '',
          name: c.name || '',
          depth: c.depth || 0
        }));
    },

    /** Registry 데이터 조회 */
    getRegistryData: (key) => {
      const game = window.game;
      if (!game) return null;
      if (key) return game.registry.get(key);
      return {
        gems: game.registry.get('gems'),
        gold: game.registry.get('gold'),
        ownedHeroCount: (game.registry.get('ownedHeroes') || []).length,
        pityCounter: game.registry.get('pityCounter'),
        battleSpeed: game.registry.get('battleSpeed'),
        autoBattle: game.registry.get('autoBattle')
      };
    },

    /** SaveManager 데이터 조회 */
    getSaveData: () => {
      const data = SaveManager.load();
      return {
        playerLevel: data.player?.level || 1,
        gold: data.resources?.gold || 0,
        gems: data.resources?.gems || 0,
        summonTickets: data.resources?.summonTickets || 0,
        characterCount: (data.characters || []).length,
        clearedStages: Object.keys(data.progress?.clearedStages || {}).length,
        pityCounter: data.gacha?.pityCounter || 0,
        settings: data.settings || {}
      };
    },

    /** 영웅 목록 (정규화) */
    getHeroes: () => {
      const game = window.game;
      if (!game) return [];
      const heroes = game.registry.get('ownedHeroes') || [];
      return heroes.map(h => ({
        id: h.id,
        name: h.name,
        rarity: h.rarity,
        rarityKey: h.rarityKey,
        level: h.level,
        cult: h.cult,
        mood: h.mood,
        class: h.class,
        hasEquipment: !!h.equipment,
        constellation: h.constellation || 0,
        acquiredAt: h.acquiredAt || 0
      }));
    },

    /** 에너지 시스템 상태 */
    getEnergyStatus: () => {
      return energySystem.getStatus();
    },

    /** 가챠 시스템 상태 */
    getGachaStatus: () => {
      return {
        pityInfo: GachaSystem.getPityInfo(),
        freeMode: GachaSystem.freeMode || false
      };
    },

    /** 장비 시스템 조회 */
    getEquipmentList: () => {
      const data = SaveManager.load();
      return data.equipment || [];
    },

    /** 퀘스트 시스템 조회 */
    getQuestStatus: () => {
      const quests = QuestSystem.getDailyQuests();
      return {
        total: quests.length,
        completed: quests.filter(q => q.completed).length,
        claimed: quests.filter(q => q.claimed).length,
        claimable: quests.filter(q => q.completed && !q.claimed).length,
        quests: quests.map(q => ({
          id: q.id,
          name: q.name,
          progress: q.progress,
          target: q.target,
          completed: q.completed,
          claimed: q.claimed,
          rewards: q.rewards
        }))
      };
    },

    /** 탑 진행도 조회 */
    getTowerStatus: () => {
      return TowerSystem.getProgress();
    },

    /** 파티 시너지 계산 */
    calculateSynergies: (heroIds) => {
      const heroData = getAllCharacters();
      return SynergySystem.calculatePartySynergies(heroIds, heroData);
    },

    /** Mood 상성 확인 */
    checkMoodMatchup: (attackerMood, defenderMood) => {
      return moodSystem.getMatchupMultiplier(attackerMood, defenderMood);
    },

    /** 파티 데이터 조회 */
    getPartyData: () => {
      const data = SaveManager.load();
      return data.parties || {};
    },

    /** 좌표 기반 클릭 시뮬레이션 */
    clickAt: (x, y) => {
      const scene = window.__TEST_API__.getActiveScene();
      if (!scene) return { success: false, error: 'no scene' };
      const objects = scene.children.list.filter(c => {
        if (!c.input || !c.input.enabled) return false;
        const bounds = c.getBounds();
        return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      });
      if (objects.length > 0) {
        const target = objects[objects.length - 1]; // 최상위 depth
        target.emit('pointerdown', { x, y });
        target.emit('pointerup', { x, y });
        return { success: true, target: target.type || target.constructor.name, text: target.text || '' };
      }
      return { success: false, error: `no interactive at (${x}, ${y})` };
    },

    /** 콘솔 로그 수집기 */
    _logs: [],
    startLogCapture: () => {
      window.__TEST_API__._logs = [];
      const origLog = console.log;
      const origWarn = console.warn;
      const origError = console.error;
      console._origLog = origLog;
      console._origWarn = origWarn;
      console._origError = origError;
      console.log = (...args) => {
        window.__TEST_API__._logs.push({ level: 'log', msg: args.join(' '), ts: Date.now() });
        origLog.apply(console, args);
      };
      console.warn = (...args) => {
        window.__TEST_API__._logs.push({ level: 'warn', msg: args.join(' '), ts: Date.now() });
        origWarn.apply(console, args);
      };
      console.error = (...args) => {
        window.__TEST_API__._logs.push({ level: 'error', msg: args.join(' '), ts: Date.now() });
        origError.apply(console, args);
      };
      return { success: true };
    },
    stopLogCapture: () => {
      if (console._origLog) console.log = console._origLog;
      if (console._origWarn) console.warn = console._origWarn;
      if (console._origError) console.error = console._origError;
      return window.__TEST_API__._logs;
    },

    /** 스크린 비교용 씬 메타데이터 */
    getSceneMetadata: () => {
      const scene = window.__TEST_API__.getActiveScene();
      if (!scene) return null;
      return {
        key: scene.scene.key,
        childCount: scene.children.list.length,
        interactiveCount: scene.children.list.filter(c => c.input?.enabled).length,
        tweenCount: scene.tweens?.getAllTweens?.()?.length || 0,
        timerCount: scene.time?.getEvents?.()?.length || 0
      };
    },

    /** 전체 시스템 헬스 체크 */
    healthCheck: () => {
      const results = {};
      try { results.saveManager = SaveManager.load() !== null; } catch { results.saveManager = false; }
      try { results.energySystem = typeof energySystem.getCurrentEnergy() === 'number'; } catch { results.energySystem = false; }
      try { results.gachaSystem = GachaSystem.getPityInfo() !== null; } catch { results.gachaSystem = false; }
      try { results.questSystem = Array.isArray(QuestSystem.getDailyQuests()); } catch { results.questSystem = false; }
      try { results.towerSystem = TowerSystem.getProgress() !== null; } catch { results.towerSystem = false; }
      try { results.synergySystem = typeof SynergySystem.calculatePartySynergies === 'function'; } catch { results.synergySystem = false; }
      try { results.moodSystem = typeof moodSystem.getMatchupMultiplier === 'function'; } catch { results.moodSystem = false; }
      try { results.equipmentSystem = typeof EquipmentSystem.createEquipment === 'function'; } catch { results.equipmentSystem = false; }
      try { results.partyManager = typeof PartyManager.autoFormParty === 'function'; } catch { results.partyManager = false; }
      results.allHealthy = Object.values(results).every(v => v === true);
      return results;
    }
  };
}
